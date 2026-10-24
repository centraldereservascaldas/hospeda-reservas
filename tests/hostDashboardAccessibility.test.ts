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
const { render, fireEvent, cleanup } = await import('@testing-library/react');
const { HostDashboardView } = await import('../src/components/owner/HostDashboardView.tsx');
const { OwnerAccessAdminView } = await import('../src/components/owner/OwnerAccessAdminView.tsx');
const { crcnBackendApi } = await import('../src/services/crcnBackendApi.ts');

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

test('owner dashboard exposes the selected section and announces loading', () => {
  const originalGetOwnerDashboard = crcnBackendApi.getOwnerDashboard;
  crcnBackendApi.getOwnerDashboard = async () => new Promise(() => {});
  try {
    const { getByRole } = render(
      React.createElement(HostDashboardView, { accessToken: 'test-token' }),
    );

    const navigation = getByRole('navigation', { name: 'Seções do painel do proprietário' });
    const overview = getByRole('button', { name: 'Visão geral' });
    const calendar = getByRole('button', { name: 'Calendário' });
    const loading = getByRole('status');

    assert.ok(navigation);
    assert.match(navigation.className, /grid-cols-2/);
    assert.match(navigation.className, /sm:flex/);
    assert.match(navigation.className, /sm:overflow-x-auto/);
    assert.match(overview.className, /min-h-11/);
    assert.match(calendar.className, /min-h-11/);
    for (const label of [
      'Visão geral',
      'Minhas propriedades',
      'Minhas reservas',
      'Calendário',
      'Contabilidade',
    ]) {
      const sectionButton = getByRole('button', { name: label });
      assert.match(sectionButton.className, /min-h-14/);
      assert.match(sectionButton.className, /min-w-0/);
      assert.match(sectionButton.className, /sm:min-h-11/);
    }
    assert.equal(overview.getAttribute('aria-current'), 'page');
    assert.equal(loading.textContent, 'Carregando dados da Stays…');
    assert.equal(loading.getAttribute('aria-live'), 'polite');

    fireEvent.click(calendar);
    assert.equal(calendar.getAttribute('aria-current'), 'page');
    assert.equal(overview.hasAttribute('aria-current'), false);
  } finally {
    crcnBackendApi.getOwnerDashboard = originalGetOwnerDashboard;
  }
});

test('calendar reduces mobile cell height and exposes reservation status to assistive technology', async () => {
  const originalGetOwnerDashboard = crcnBackendApi.getOwnerDashboard;
  crcnBackendApi.getOwnerDashboard = async () => ({
    period: { from: '2026-10-01', to: '2026-10-31' },
    ownerName: 'Fixture QA',
    totals: { debit: 0, credit: 1200 },
    properties: [],
    reservations: [
      {
        id: 'reservation-1',
        code: 'QA-001',
        listingId: 'LZ-101',
        propertyTitle: 'Apartamento Lago Azul',
        propertyImage: '',
        guestName: 'Hóspede Fixture',
        checkIn: '2026-10-20',
        checkOut: '2026-10-23',
        status: 'confirmed',
        total: 1200,
        currency: 'BRL',
        nights: 3,
      },
    ],
  });
  try {
    const { getByRole, container } = render(
      React.createElement(HostDashboardView, { accessToken: 'test-token' }),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    fireEvent.click(getByRole('button', { name: 'Calendário' }));

    const calendar = container.querySelector('.grid-cols-7');
    assert.ok(calendar);
    assert.match(calendar.children[7].className, /min-h-16/);
    const reservationIndicator = calendar.querySelector('[role="img"]');
    assert.equal(
      reservationIndicator?.getAttribute('aria-label'),
      'Confirmada · Apartamento Lago Azul',
    );
    const calendarLegend = getByRole('list', { name: 'Legenda do calendário de reservas' });
    assert.match(
      calendarLegend.textContent || '',
      /Confirmada.*Cancelada.*Bloqueio ou outro estado/,
    );
    assert.equal(calendarLegend.querySelectorAll('li').length, 3);
    const desktopReservation = calendar.querySelector('[title^="Apartamento Lago Azul"]');
    assert.ok(desktopReservation);
    assert.match(desktopReservation.className, /text-xs/);
  } finally {
    crcnBackendApi.getOwnerDashboard = originalGetOwnerDashboard;
  }
});

test('accounting uses readable stacked property summaries on narrow screens', async () => {
  const originalGetOwnerDashboard = crcnBackendApi.getOwnerDashboard;
  crcnBackendApi.getOwnerDashboard = async () => ({
    period: { from: '2026-10-01', to: '2026-10-31' },
    ownerName: 'Fixture QA',
    totals: { debit: 250, credit: 1200 },
    properties: [
      {
        staysListingId: 'LZ-101',
        title: 'Apartamento Lago Azul',
        image: '',
        debit: 250,
        credit: 1200,
      },
    ],
    reservations: [],
  });
  try {
    const { getByRole, container } = render(
      React.createElement(HostDashboardView, { accessToken: 'test-token' }),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    fireEvent.click(getByRole('button', { name: 'Contabilidade' }));

    const mobileSummaries = container.querySelector('.sm\\:hidden');
    const desktopTable = container.querySelector('table');
    assert.ok(mobileSummaries?.textContent?.includes('Apartamento Lago Azul'));
    assert.ok(mobileSummaries?.textContent?.includes('R$ 1.200,00'));
    assert.ok(mobileSummaries?.textContent?.includes('R$ 250,00'));
    assert.match(desktopTable?.parentElement?.className || '', /sm:block/);
  } finally {
    crcnBackendApi.getOwnerDashboard = originalGetOwnerDashboard;
  }
});

test('owner admin refresh actions and pagination have mobile touch targets', async () => {
  const originalGetRequests = crcnBackendApi.getOwnerAccessRequests;
  const originalGetOrders = crcnBackendApi.getDirectBookingOperationsOrders;
  crcnBackendApi.getOwnerAccessRequests = async () => [];
  crcnBackendApi.getDirectBookingOperationsOrders = async () => ({
    orders: [],
    unmatchedWebhooks: [],
    unmatchedWebhookTotal: 0,
    unmatchedWebhookCurrentPage: 1,
    unmatchedWebhookLastPage: 1,
    currentPage: 1,
    lastPage: 0,
    total: 0,
  });
  try {
    const { findByRole } = render(
      React.createElement(OwnerAccessAdminView, { accessToken: 'test-token' }),
    );
    const refresh = await findByRole('button', { name: 'Atualizar fila' });
    assert.match(refresh.className, /min-h-11/);
    assert.match(refresh.className, /focus-visible:outline/);
  } finally {
    crcnBackendApi.getOwnerAccessRequests = originalGetRequests;
    crcnBackendApi.getDirectBookingOperationsOrders = originalGetOrders;
  }
});

test('owner admin operations cards wrap long guest and integration identifiers on mobile', async () => {
  const originalGetRequests = crcnBackendApi.getOwnerAccessRequests;
  const originalGetOrders = crcnBackendApi.getDirectBookingOperationsOrders;
  crcnBackendApi.getOwnerAccessRequests = async () => [];
  crcnBackendApi.getDirectBookingOperationsOrders = async () => ({
    orders: [
      {
        id: 'order-fixture',
        publicReference: '0123456789abcdef',
        status: 'atencao_operacional',
        listingId: 'listing-fixture',
        from: '2026-10-20',
        to: '2026-10-22',
        guestName: 'Pessoa de teste',
        guestEmail: 'guest-with-a-very-long-unbroken-address@example.invalid',
        quoteTotal: '850.00',
        currency: 'BRL',
        paymentStatus: null,
        paymentMethod: null,
        gatewayPaymentId: 'payment_identifier_with_a_very_long_unbroken_value_123456789',
        staysReservationId: null,
        paymentApprovedWithoutConfirmedReservation: false,
        latePaymentAfterHold: false,
        staysActionFailed: false,
        confirmationEmail: null,
        staysCancellationConfirmed: false,
        gatewayRefundConfirmed: false,
        manualCancellationReview: null,
        manualGatewayRefundReview: null,
        createdAt: null,
        updatedAt: null,
        lastEvent: {
          event:
            'payment_state_changed_during_reservation_release_with_an_extended_event_identifier',
        },
        issue: null,
      },
    ],
    unmatchedWebhooks: [],
    unmatchedWebhookTotal: 0,
    unmatchedWebhookCurrentPage: 1,
    unmatchedWebhookLastPage: 1,
    currentPage: 1,
    lastPage: 1,
    total: 1,
  });
  try {
    const {
      findByText,
      findByText: findText,
      container,
    } = render(React.createElement(OwnerAccessAdminView, { accessToken: 'test-token' }));
    await findByText('Pessoa de teste');
    const email = await findText('guest-with-a-very-long-unbroken-address@example.invalid');
    const paymentId = await findText(/payment_identifier_with_a_very_long/);
    const eventSummary = container.querySelector('p.break-words');

    assert.match(email.className, /break-all/);
    assert.match(paymentId.closest('p')?.className || '', /break-all/);
    assert.match(eventSummary?.className || '', /overflow-wrap:anywhere/);
  } finally {
    crcnBackendApi.getOwnerAccessRequests = originalGetRequests;
    crcnBackendApi.getDirectBookingOperationsOrders = originalGetOrders;
  }
});

test('owner access search exposes touch-sized, announced selections without approving them', async () => {
  const originalGetRequests = crcnBackendApi.getOwnerAccessRequests;
  const originalGetOrders = crcnBackendApi.getDirectBookingOperationsOrders;
  const originalSearchOwners = crcnBackendApi.searchStaysOwners;
  crcnBackendApi.getOwnerAccessRequests = async () => [
    {
      userId: 'user-fixture',
      fullName: 'Pessoa de teste',
      email: 'qa@example.invalid',
      requestedAt: '2026-10-19T12:00:00Z',
    },
  ];
  crcnBackendApi.getDirectBookingOperationsOrders = async () => ({
    orders: [],
    unmatchedWebhooks: [],
    unmatchedWebhookTotal: 0,
    unmatchedWebhookCurrentPage: 1,
    unmatchedWebhookLastPage: 1,
    currentPage: 1,
    lastPage: 0,
    total: 0,
  });
  crcnBackendApi.searchStaysOwners = async () => [
    { id: 'stays-owner-fixture', name: 'Proprietário de teste', propertyCount: 2 },
  ];
  try {
    const { findByLabelText, findByRole, getByRole } = render(
      React.createElement(OwnerAccessAdminView, { accessToken: 'test-token' }),
    );
    const search = await findByLabelText('Localizar cadastro na Stays');
    assert.match(search.className, /min-h-11/);
    fireEvent.change(search, { target: { value: 'qa' } });

    const ownerOption = await findByRole('button', { name: /Proprietário de teste/ });
    assert.equal(ownerOption.getAttribute('aria-pressed'), 'false');
    assert.match(ownerOption.className, /min-h-11/);
    assert.match(ownerOption.className, /focus-visible:outline/);
    assert.ok(ownerOption.textContent?.includes('2 imóvel(is)'));

    fireEvent.click(ownerOption);
    assert.equal(ownerOption.getAttribute('aria-pressed'), 'true');

    const identityConfirmation = getByRole('checkbox');
    assert.match(identityConfirmation.className, /h-5 w-5/);
    assert.match(identityConfirmation.parentElement?.className || '', /min-h-11/);

    const approve = getByRole('button', { name: 'Aprovar acesso' });
    assert.equal((approve as HTMLButtonElement).disabled, true);
    assert.match(approve.className, /min-h-11/);
    assert.match(approve.className, /focus-visible:outline/);
  } finally {
    crcnBackendApi.getOwnerAccessRequests = originalGetRequests;
    crcnBackendApi.getDirectBookingOperationsOrders = originalGetOrders;
    crcnBackendApi.searchStaysOwners = originalSearchOwners;
  }
});
