import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
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
const { render, cleanup, screen } = await import('@testing-library/react');
const { AvailabilitySearchState } =
  await import('../src/components/search/AvailabilitySearchState.tsx');

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

test('does not describe a catalogue refresh without dates as availability confirmation', () => {
  render(
    React.createElement(AvailabilitySearchState, {
      state: 'loading',
      checkIn: '',
      checkOut: '',
      hasResults: false,
      hasAvailableResults: false,
      onRetry: () => {},
    }),
  );

  const status = screen.getByRole('status');
  assert.match(status.textContent || '', /Buscando acomodações/);
  assert.match(status.textContent || '', /Disponibilidade e preço dependem do período escolhido/);
  assert.doesNotMatch(status.textContent || '', /disponibilidade real/);
});

test('can omit the idle date reminder when the search form already explains date requirements', () => {
  const { container } = render(
    React.createElement(AvailabilitySearchState, {
      state: 'idle',
      checkIn: '',
      checkOut: '',
      hasResults: true,
      hasAvailableResults: false,
      showIdleNotice: false,
      onRetry: () => {},
    }),
  );

  assert.equal(container.firstChild, null);
});

test('uses a general search error when the failed search has no date range', () => {
  render(
    React.createElement(AvailabilitySearchState, {
      state: 'error',
      checkIn: '',
      checkOut: '',
      hasResults: false,
      hasAvailableResults: false,
      onRetry: () => {},
    }),
  );

  assert.ok(screen.getByRole('heading', { name: 'Não foi possível concluir a busca' }));
  assert.match(screen.getByRole('alert').textContent || '', /Não conseguimos concluir a busca/);
});

test('announces a successful empty date search as a status update', () => {
  render(
    React.createElement(AvailabilitySearchState, {
      state: 'success',
      checkIn: '2027-05-01',
      checkOut: '2027-05-04',
      hasResults: false,
      hasAvailableResults: false,
      onRetry: () => {},
    }),
  );

  const status = screen.getByRole('status');
  assert.equal(status.getAttribute('aria-live'), 'polite');
  assert.ok(
    screen.getByRole('heading', { name: 'Nenhuma acomodação disponível para esse período' }),
  );
});

test('explains when confirmed availability is hidden only by the selected filters', () => {
  const { container } = render(
    React.createElement(AvailabilitySearchState, {
      state: 'success',
      checkIn: '2027-05-01',
      checkOut: '2027-05-04',
      hasResults: false,
      hasAvailableResults: true,
      onRetry: () => {},
    }),
  );

  assert.ok(screen.getByRole('heading', { name: 'Nenhum imóvel corresponde a esses filtros' }));
  assert.match(screen.getByRole('status').textContent || '', /Remova alguns filtros/);
  assert.match(container.querySelector('[role="status"]')?.className || '', /max-\[400px\]:py-0/);
  assert.match(
    container.querySelector('[role="status"]')?.className || '',
    /\[@media\(max-height:400px\)\]:py-0/,
  );
  assert.match(
    container.querySelector('[role="status"] svg')?.getAttribute('class') || '',
    /\[@media\(max-height:400px\)\]:h-5/,
  );
});

test('retry control invokes the last availability search callback', () => {
  let retryCount = 0;
  render(
    React.createElement(AvailabilitySearchState, {
      state: 'error',
      checkIn: '2027-05-01',
      checkOut: '2027-05-04',
      hasResults: false,
      hasAvailableResults: false,
      onRetry: () => {
        retryCount += 1;
      },
    }),
  );

  screen.getByRole('button', { name: 'Tentar novamente' }).click();
  assert.equal(retryCount, 1);
});

test('invalid dates offer a correction action instead of retrying the invalid request', () => {
  let retryCount = 0;
  let openSearchCount = 0;
  render(
    React.createElement(AvailabilitySearchState, {
      state: 'invalid-dates',
      checkIn: '2027-05-01',
      checkOut: '',
      hasResults: false,
      hasAvailableResults: false,
      onRetry: () => {
        retryCount += 1;
      },
      onOpenSearch: () => {
        openSearchCount += 1;
      },
    }),
  );

  assert.ok(screen.getByRole('heading', { name: 'Confira as datas da estadia' }));
  assert.equal(screen.queryByRole('button', { name: 'Tentar novamente' }), null);
  screen.getByRole('button', { name: 'Alterar datas e hóspedes' }).click();
  assert.equal(openSearchCount, 1);
  assert.equal(retryCount, 0);
});

test('partial results explain the quote failure and offer a retry without claiming no availability', () => {
  let retries = 0;
  render(
    React.createElement(AvailabilitySearchState, {
      state: 'partial',
      checkIn: '2027-01-10',
      checkOut: '2027-01-13',
      hasResults: true,
      hasAvailableResults: true,
      onRetry: () => {
        retries += 1;
      },
    }),
  );
  assert.match(screen.getByRole('status').textContent || '', /apenas as opções verificadas/);
  assert.doesNotMatch(
    screen.getByRole('status').textContent || '',
    /Nenhuma acomodação disponível/,
  );
  screen.getByRole('button', { name: 'Tentar consultar novamente' }).click();
  assert.equal(retries, 1);
});

test('offers revalidation for expired results instead of announcing no availability', () => {
  render(
    React.createElement(AvailabilitySearchState, {
      state: 'expired',
      checkIn: '2027-01-10',
      checkOut: '2027-01-13',
      hasResults: true,
      hasAvailableResults: true,
      onRetry: () => {},
    }),
  );
  assert.ok(screen.getByRole('button', { name: 'Atualizar disponibilidade' }));
  assert.match(screen.getByRole('status').textContent || '', /perdeu a validade/);
  assert.doesNotMatch(document.body.textContent || '', /Nenhuma acomodação/);
});
