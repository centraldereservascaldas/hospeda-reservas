import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import type { OwnerAccountingDetails, OwnerDashboardData } from '../src/services/crcnBackendApi.ts';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' });
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  Element: dom.window.Element,
  Node: dom.window.Node,
  getComputedStyle: dom.window.getComputedStyle,
});

const React = (await import('react')).default;
const { act, render, fireEvent, cleanup, waitFor } = await import('@testing-library/react');
const { OwnerAccountingTransactions } =
  await import('../src/components/owner/OwnerAccountingTransactions.tsx');
const { crcnBackendApi } = await import('../src/services/crcnBackendApi.ts');

type Entry = OwnerDashboardData['entries'][number];

const entries: Entry[] = [
  {
    id: 'entry-a',
    date: '2026-10-20',
    listingId: 'listing-1',
    propertyTitle: 'Apartamento 1',
    reservationId: 'reservation-a',
    reservationCode: 'R-A',
    description: 'Lançamento A',
    publicNote: null,
    type: 'credit',
    status: 'confirmed',
    amount: 100,
  },
  {
    id: 'entry-b',
    date: '2026-10-21',
    listingId: 'listing-1',
    propertyTitle: 'Apartamento 1',
    reservationId: 'reservation-b',
    reservationCode: 'R-B',
    description: 'Lançamento B',
    publicNote: null,
    type: 'credit',
    status: 'confirmed',
    amount: 200,
  },
];

const properties: OwnerDashboardData['properties'] = [
  { staysListingId: 'listing-1', title: 'Apartamento 1', image: '', debit: 0, credit: 300 },
];

const period = { from: '2026-10-01', to: '2026-10-31' };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function accountingDetails(guestName: string): OwnerAccountingDetails {
  return {
    reservationCode: 'R-B',
    guestName,
    checkIn: '2026-10-20',
    checkOut: '2026-10-22',
    nights: 2,
    fees: [{ label: 'Taxa de limpeza', amount: 25 }],
    payout: 175,
    ledgerEntry: {
      date: '2026-10-21',
      type: 'credit',
      status: 'confirmed',
      description: 'Lançamento',
      amount: 200,
    },
  };
}

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

test('a late accounting detail response cannot replace the newer selected entry', async () => {
  const originalGetDetails = crcnBackendApi.getOwnerAccountingDetails;
  const requestA = deferred<OwnerAccountingDetails>();
  const requestB = deferred<OwnerAccountingDetails>();
  crcnBackendApi.getOwnerAccountingDetails = async (_token, entryId) =>
    entryId === 'entry-a' ? requestA.promise : requestB.promise;

  try {
    const { getAllByRole, getByRole, getByText, queryByText } = render(
      React.createElement(OwnerAccountingTransactions, {
        accessToken: 'token-a',
        entries,
        properties,
        period,
      }),
    );
    const detailButtons = getAllByRole('button', { name: 'Detalhes' });
    fireEvent.click(detailButtons[0]!);
    fireEvent.click(detailButtons[1]!);

    await act(async () => {
      requestB.resolve(accountingDetails('Hóspede da reserva B'));
      await requestB.promise;
    });
    assert.ok(getByRole('dialog'));
    assert.ok(getByText('Hóspede da reserva B'));
    assert.ok(getByText('Taxa de limpeza'));

    await act(async () => {
      requestA.resolve(accountingDetails('Hóspede da reserva A'));
      await requestA.promise;
    });
    assert.ok(getByText('Hóspede da reserva B'));
    assert.equal(queryByText('Hóspede da reserva A'), null);
  } finally {
    crcnBackendApi.getOwnerAccountingDetails = originalGetDetails;
  }
});

test('changing the account or period invalidates an open accounting detail request', async () => {
  const originalGetDetails = crcnBackendApi.getOwnerAccountingDetails;
  const accountRequest = deferred<OwnerAccountingDetails>();
  const periodRequest = deferred<OwnerAccountingDetails>();
  const observedTokens: string[] = [];
  crcnBackendApi.getOwnerAccountingDetails = async (token) => {
    observedTokens.push(token);
    return token === 'token-a' ? accountRequest.promise : periodRequest.promise;
  };

  try {
    const initialProps = {
      accessToken: 'token-a',
      entries,
      properties,
      period,
    };
    const { getAllByRole, queryByRole, rerender } = render(
      React.createElement(OwnerAccountingTransactions, initialProps),
    );
    fireEvent.click(getAllByRole('button', { name: 'Detalhes' })[0]!);
    assert.deepEqual(observedTokens, ['token-a']);
    assert.ok(queryByRole('dialog'));

    rerender(
      React.createElement(OwnerAccountingTransactions, {
        ...initialProps,
        accessToken: 'token-b',
      }),
    );
    assert.equal(queryByRole('dialog'), null);
    await waitFor(() => assert.equal(queryByRole('dialog'), null));

    await act(async () => {
      accountRequest.resolve(accountingDetails('Hóspede da conta anterior'));
      await accountRequest.promise;
    });
    assert.equal(queryByRole('dialog'), null);
    assert.equal(document.body.textContent?.includes('Hóspede da conta anterior'), false);

    fireEvent.click(getAllByRole('button', { name: 'Detalhes' })[0]!);
    assert.deepEqual(observedTokens, ['token-a', 'token-b']);
    assert.ok(queryByRole('dialog'));

    rerender(
      React.createElement(OwnerAccountingTransactions, {
        ...initialProps,
        accessToken: 'token-b',
        period: { from: '2026-11-01', to: '2026-11-30' },
      }),
    );
    assert.equal(queryByRole('dialog'), null);
    await act(async () => {
      periodRequest.resolve(accountingDetails('Hóspede do período anterior'));
      await periodRequest.promise;
    });
    assert.equal(document.body.textContent?.includes('Hóspede do período anterior'), false);
  } finally {
    crcnBackendApi.getOwnerAccountingDetails = originalGetDetails;
  }
});
