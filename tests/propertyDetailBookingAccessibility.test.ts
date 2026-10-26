import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { JSDOM } from 'jsdom';
import { STAYS_NET_APARTMENTS } from '../src/data/staysApartments.ts';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' });
Object.assign(dom.window, {
  requestAnimationFrame: (callback: (timestamp: number) => void) =>
    setTimeout(() => callback(Date.now()), 0),
  cancelAnimationFrame: (handle: number) => clearTimeout(handle),
});
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  Element: dom.window.Element,
  Node: dom.window.Node,
  getComputedStyle: dom.window.getComputedStyle,
});

const React = (await import('react')).default;
const { render, fireEvent, cleanup, waitFor } = await import('@testing-library/react');
const { PropertyDetailModal } = await import('../src/components/property/PropertyDetailModal.tsx');
const { PropertyDetailPage } = await import('../src/components/property/PropertyDetailModal.tsx');
const { PropertyDatePickerDialog } =
  await import('../src/components/property/PropertyDatePickerDialog.tsx');
const { formatPropertyDescription, PropertyOverviewSection } =
  await import('../src/components/property/PropertyOverviewSection.tsx');
const { crcnBackendApi } = await import('../src/services/crcnBackendApi.ts');
const { checkoutApi } = await import('../src/services/checkoutApi.ts');
const { CheckoutModal } = await import('../src/components/booking/CheckoutModal.tsx');
const { CheckoutResumePage } = await import('../src/components/booking/CheckoutResumePage.tsx');
const { PropertyHostSection } = await import('../src/components/property/PropertyHostSection.tsx');
const { clearCheckoutResumeToken, saveCheckoutResumeToken } =
  await import('../src/utils/checkoutResumeStorage.ts');

test('property description formatter separates Stays sections and amenity bullets', () => {
  const formatted = formatPropertyDescription(
    'Descrição inicial.Quarto:- Cama de casal- Ar CondicionadoSala:- Sofá solteiro↓ Itens não Inclusos:✗ Refeições✗ Transfer. Este condomínio tem regras. Localização:- CentroEste é um exemplo.Suíte 1 com: • Cama de casal • VentiladorSuíte 2 com: • Cama de solteiroRestrições: • Proibido fumar.',
  );

  assert.match(formatted, /Descrição inicial\.\n\nQuarto:\n• Cama de casal\n• Ar Condicionado/);
  assert.match(formatted, /Sala:\n• Sofá solteiro/);
  assert.match(formatted, /Itens não Inclusos\n+• ✗ Refeições\n• ✗ Transfer/);
  assert.match(formatted, /Transfer\.\n\nEste condomínio tem regras\./);
  assert.match(formatted, /Centro\n\nEste é um exemplo\./);
  assert.match(formatted, /Suíte 1 com:\n• Cama de casal\n• Ventilador/);
  assert.match(formatted, /Suíte 2 com:\n• Cama de solteiro/);
  assert.match(formatted, /Restrições\n• Proibido fumar\./);
});

test('detail overview omits the highlights spacing wrapper when live data has no highlights', () => {
  const property = { ...STAYS_NET_APARTMENTS[0]!, highlights: [] };
  const { container, getByRole } = render(
    React.createElement(PropertyOverviewSection, { property }),
  );

  assert.ok(getByRole('heading', { name: 'Sobre este espaço' }));
  assert.equal(container.querySelector('.pt-6.pb-2.space-y-4'), null);
});

test('property detail hides repetitive Central host promotion but keeps partner profiles', () => {
  const centralHost = STAYS_NET_APARTMENTS[0]!.host;
  const central = render(React.createElement(PropertyHostSection, { host: centralHost }));
  assert.equal(central.container.querySelector('section'), null);
  central.unmount();

  const partner = render(
    React.createElement(PropertyHostSection, {
      host: { ...centralHost, name: 'Parceiro da Serra' },
    }),
  );
  assert.ok(partner.getByRole('heading', { name: 'Hospedado por Parceiro da Serra' }));
});

test('detail close control keeps its minimum touch target in narrow layouts', () => {
  const { getByRole } = render(
    React.createElement(PropertyDetailModal, {
      property: STAYS_NET_APARTMENTS[0]!,
      initialCheckIn: '2026-11-11',
      initialCheckOut: '2026-11-15',
      initialGuests: { adults: 2, children: 0, infants: 0, pets: 0 },
      onClose: () => {},
      currency: 'BRL',
      isSaved: false,
      onToggleSave: () => {},
      onStartBooking: () => {},
    }),
  );

  const closeButton = getByRole('button', {
    name: 'Fechar detalhes da acomodação',
  });
  assert.equal(document.activeElement, document.getElementById('property-detail-title'));
  assert.match(closeButton.className, /h-11/);
  assert.match(closeButton.className, /w-11/);
  assert.match(closeButton.className, /shrink-0/);
});

test('detail does not imply dates are selected or request a quote before the guest chooses them', async () => {
  const originalGetCalendar = crcnBackendApi.getAccommodationCalendar;
  const originalCalculatePrice = crcnBackendApi.calculatePrice;
  let quoteRequests = 0;
  const today = new Date();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  crcnBackendApi.getAccommodationCalendar = async () =>
    Array.from({ length: 90 }, (_, index) => {
      const date = new Date(`${todayIso}T12:00:00`);
      date.setDate(date.getDate() + index);
      return {
        date: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
        avail: 1,
      };
    });
  crcnBackendApi.calculatePrice = async () => {
    quoteRequests += 1;
    return null;
  };
  try {
    const { container, getByRole } = render(
      React.createElement(PropertyDetailModal, {
        property: STAYS_NET_APARTMENTS[0]!,
        initialCheckIn: '',
        initialCheckOut: '',
        initialGuests: { adults: 1, children: 0, infants: 0, pets: 0 },
        onClose: () => {},
        currency: 'BRL',
        isSaved: false,
        onToggleSave: () => {},
        onStartBooking: () => {},
      }),
    );

    await waitFor(() => {
      const mobileBookingButton = document.querySelector<HTMLButtonElement>(
        '#property-detail-mobile-booking-action > button',
      );
      assert.equal(mobileBookingButton?.textContent, 'Confirme as datas');
      assert.equal(mobileBookingButton?.disabled, true);
    });
    assert.equal(
      container.querySelector<HTMLButtonElement>('.property-booking-panel > button:last-child')
        ?.textContent,
      'Confirme as datas',
    );
    assert.ok(getByRole('button', { name: /Check-in\s*Selecionar/i }));
    assert.ok(getByRole('button', { name: /Check-out\s*Selecionar/i }));
    assert.equal(quoteRequests, 0);
  } finally {
    crcnBackendApi.getAccommodationCalendar = originalGetCalendar;
    crcnBackendApi.calculatePrice = originalCalculatePrice;
  }
});

test('date picker announces invalid selection feedback inside its modal', () => {
  const { getByRole } = render(
    React.createElement(PropertyDatePickerDialog, {
      isOpen: true,
      activeDateField: 'checkOut',
      checkIn: '2026-11-11',
      checkOut: '',
      displayedMonth: new Date(2026, 10, 1),
      today: new Date(2026, 9, 1),
      todayIso: '2026-10-01',
      calendarDays: [],
      isExtendingCalendar: false,
      calendarExtensionMessage: '',
      calendarAvailable: true,
      isLoadingCalendar: false,
      availabilityMessage: '',
      interactionMessage:
        'Esse período inclui uma data indisponível ou não atende à estadia mínima.',
      onRetryCalendar: () => {},
      onRetryCalendarExtension: () => {},
      onActiveDateFieldChange: () => {},
      onDisplayedMonthChange: () => {},
      onChooseDate: () => {},
      onChooseDateRange: () => {},
      onClose: () => {},
    }),
  );

  const feedback = getByRole('status');
  assert.match(feedback.textContent || '', /não atende à estadia mínima/);
  assert.equal(feedback.getAttribute('aria-live'), 'polite');
});

test('calendar retry actions keep a 44px minimum touch height', () => {
  const props = {
    isOpen: true,
    activeDateField: 'checkIn' as const,
    checkIn: '',
    checkOut: '',
    displayedMonth: new Date(2026, 10, 1),
    today: new Date(2026, 9, 1),
    todayIso: '2026-10-01',
    calendarDays: [],
    isExtendingCalendar: false,
    calendarExtensionMessage: '',
    calendarAvailable: false,
    isLoadingCalendar: false,
    availabilityMessage: 'Não foi possível confirmar a disponibilidade.',
    interactionMessage: '',
    onRetryCalendar: () => {},
    onRetryCalendarExtension: () => {},
    onActiveDateFieldChange: () => {},
    onDisplayedMonthChange: () => {},
    onChooseDate: () => {},
    onChooseDateRange: () => {},
    onClose: () => {},
  };
  const unavailableCalendar = render(React.createElement(PropertyDatePickerDialog, props));

  assert.match(
    unavailableCalendar.getByRole('button', { name: 'Tentar novamente' }).className,
    /min-h-11/,
  );
  unavailableCalendar.unmount();

  const extensionError = render(
    React.createElement(PropertyDatePickerDialog, {
      ...props,
      calendarAvailable: true,
      calendarExtensionMessage: 'Não foi possível carregar mais datas.',
    }),
  );

  assert.match(
    extensionError.getByRole('button', { name: 'Tentar novamente' }).className,
    /min-h-11/,
  );
});

test('calendar day buttons keep a 44px minimum touch height', () => {
  const { getByRole } = render(
    React.createElement(PropertyDatePickerDialog, {
      isOpen: true,
      activeDateField: 'checkIn',
      checkIn: '',
      checkOut: '',
      displayedMonth: new Date(2026, 10, 1),
      today: new Date(2026, 9, 1),
      todayIso: '2026-10-01',
      calendarDays: Array.from({ length: 30 }, (_, index) => ({
        date: `2026-11-${String(index + 1).padStart(2, '0')}`,
        avail: 1,
      })),
      isExtendingCalendar: false,
      calendarExtensionMessage: '',
      calendarAvailable: true,
      isLoadingCalendar: false,
      availabilityMessage: '',
      interactionMessage: '',
      onRetryCalendar: () => {},
      onRetryCalendarExtension: () => {},
      onActiveDateFieldChange: () => {},
      onDisplayedMonthChange: () => {},
      onChooseDate: () => {},
      onChooseDateRange: () => {},
      onClose: () => {},
    }),
  );

  const dayButtons = document.querySelectorAll<HTMLButtonElement>('[data-calendar-date] button');
  assert.ok(dayButtons.length > 0);
  const calendarDialog = getByRole('dialog', { name: 'Escolha as datas' });
  assert.match(calendarDialog.className, /p-0/);
  assert.match(calendarDialog.querySelector('.max-w-sm')?.className || '', /p-3/);
  assert.match(calendarDialog.querySelector('[role="grid"]')?.className || '', /-mx-3/);
  for (const button of dayButtons) {
    assert.match(button.className, /h-11/);
  }
  for (const week of calendarDialog.querySelectorAll<HTMLElement>(
    '[role="row"]:has([data-calendar-date])',
  )) {
    assert.match(week.className, /gap-0(?:\s|$)/);
  }
  for (const dateField of ['Check-in', 'Check-out']) {
    assert.match(getByRole('button', { name: new RegExp(dateField) }).className, /min-h-11/);
  }
  assert.match(getByRole('button', { name: 'Mês anterior' }).className, /h-11/);
  assert.match(getByRole('button', { name: 'Próximo mês' }).className, /h-11/);
});

test('touch drag previews and commits an available check-in to check-out range once', () => {
  const originalElementFromPoint = document.elementFromPoint;
  const selectedRanges: Array<[Date, Date]> = [];
  let clickSelections = 0;
  const calendar = Array.from({ length: 30 }, (_, index) => ({
    date: `2026-11-${String(index + 1).padStart(2, '0')}`,
    avail: 1,
  }));
  const { getByRole } = render(
    React.createElement(PropertyDatePickerDialog, {
      isOpen: true,
      activeDateField: 'checkIn',
      checkIn: '',
      checkOut: '',
      displayedMonth: new Date(2026, 10, 1),
      today: new Date(2026, 10, 1),
      todayIso: '2026-11-01',
      calendarDays: calendar,
      isExtendingCalendar: false,
      calendarExtensionMessage: '',
      calendarAvailable: true,
      isLoadingCalendar: false,
      availabilityMessage: '',
      interactionMessage: '',
      onRetryCalendar: () => {},
      onRetryCalendarExtension: () => {},
      onActiveDateFieldChange: () => {},
      onDisplayedMonthChange: () => {},
      onChooseDate: () => {
        clickSelections += 1;
      },
      onChooseDateRange: (checkIn: Date, checkOut: Date) => {
        selectedRanges.push([checkIn, checkOut]);
      },
      onClose: () => {},
    }),
  );

  const calendarGrid = getByRole('grid', { name: 'Calendário de novembro de 2026' });
  const checkInCell = calendarGrid.querySelector<HTMLElement>('[data-calendar-date="2026-11-12"]');
  const checkOutCell = calendarGrid.querySelector<HTMLElement>('[data-calendar-date="2026-11-15"]');
  assert.ok(checkInCell);
  assert.ok(checkOutCell);
  const checkInButton = checkInCell.querySelector('button');
  const checkOutButton = checkOutCell.querySelector('button');
  assert.ok(checkInButton);
  assert.ok(checkOutButton);
  document.elementFromPoint = () => checkOutCell;
  fireEvent.pointerDown(checkInCell, { pointerId: 7, pointerType: 'touch' });
  fireEvent.pointerEnter(checkOutCell, { pointerId: 7, pointerType: 'touch' });
  assert.match(checkOutButton.className, /bg-orange-100/);
  fireEvent.pointerUp(checkOutCell, { pointerId: 7, pointerType: 'touch' });
  fireEvent.click(checkInButton);

  assert.equal(selectedRanges.length, 1);
  assert.equal(selectedRanges[0]?.[0].toISOString().slice(0, 10), '2026-11-12');
  assert.equal(selectedRanges[0]?.[1].toISOString().slice(0, 10), '2026-11-15');
  assert.equal(clickSelections, 0);
  if (originalElementFromPoint) {
    document.elementFromPoint = originalElementFromPoint;
  } else {
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: undefined,
    });
  }
});

test('property detail page uses normal page semantics and labels unconfirmed prices', async () => {
  const originalGetCalendar = crcnBackendApi.getAccommodationCalendar;
  const originalCalculatePrice = crcnBackendApi.calculatePrice;
  crcnBackendApi.getAccommodationCalendar = async () => [];
  crcnBackendApi.calculatePrice = async () => null;

  try {
    const { container, getByRole, queryByRole } = render(
      React.createElement(PropertyDetailPage, {
        property: STAYS_NET_APARTMENTS[0]!,
        initialCheckIn: '2026-11-11',
        initialCheckOut: '2026-11-15',
        initialGuests: { adults: 2, children: 0, infants: 0, pets: 0 },
        onClose: () => {},
        currency: 'BRL',
        isSaved: false,
        onToggleSave: () => {},
        onStartBooking: () => {},
      }),
    );

    const page = container.querySelector<HTMLElement>(
      '[role="region"][aria-labelledby="property-detail-title"]',
    );
    assert.ok(page);
    assert.equal(document.activeElement, document.getElementById('property-detail-title'));
    assert.match(page.querySelector('h1')?.className ?? '', /w-fit max-w-full/);
    assert.match(page.querySelector('h1')?.className ?? '', /focus:outline-orange-600/);
    assert.match(page.className, /max-w-7xl/);
    const pageSurface = page.firstElementChild?.firstElementChild as HTMLElement | null;
    assert.ok(pageSurface);
    assert.doesNotMatch(pageSurface.className, /rounded-3xl|shadow-xl|border-neutral-200/);
    assert.ok(getByRole('button', { name: 'Voltar para resultados' }));
    await waitFor(() => assert.match(container.textContent || '', /Preço não confirmado/));
    await waitFor(() =>
      assert.match(container.textContent || '', /Disponibilidade não confirmada para estas datas/),
    );
    assert.equal(queryByRole('dialog'), null);
  } finally {
    crcnBackendApi.getAccommodationCalendar = originalGetCalendar;
    crcnBackendApi.calculatePrice = originalCalculatePrice;
  }
});

test('does not calculate a zero estimate when no reference rate or live quote exists', async () => {
  const originalGetCalendar = crcnBackendApi.getAccommodationCalendar;
  const originalCalculatePrice = crcnBackendApi.calculatePrice;
  crcnBackendApi.getAccommodationCalendar = async () => [];
  crcnBackendApi.calculatePrice = async () => null;

  try {
    const { getByText, queryByText } = render(
      React.createElement(PropertyDetailPage, {
        property: { ...STAYS_NET_APARTMENTS[0]!, pricePerNight: 0, cleaningFee: 0 },
        initialCheckIn: '2026-11-11',
        initialCheckOut: '2026-11-15',
        initialGuests: { adults: 2, children: 0, infants: 0, pets: 0 },
        onClose: () => {},
        currency: 'BRL',
        isSaved: false,
        onToggleSave: () => {},
        onStartBooking: () => {},
      }),
    );

    await waitFor(() => assert.ok(getByText('Preço não confirmado')));
    assert.equal(queryByText('Estimativa'), null);
    assert.equal(queryByText(/R\$\s?0,00/), null);
  } finally {
    crcnBackendApi.getAccommodationCalendar = originalGetCalendar;
    crcnBackendApi.calculatePrice = originalCalculatePrice;
  }
});

test('property page keeps one adult by default without turning suggested dates into URL filters', async () => {
  const originalGetCalendar = crcnBackendApi.getAccommodationCalendar;
  const originalCalculatePrice = crcnBackendApi.calculatePrice;
  crcnBackendApi.getAccommodationCalendar = async () => [];
  crcnBackendApi.calculatePrice = async () => null;
  window.history.replaceState(null, '', '/apartamento/JQ08G?utm_source=direct');

  try {
    const { getByRole } = render(
      React.createElement(PropertyDetailPage, {
        property: STAYS_NET_APARTMENTS[0]!,
        initialCheckIn: '',
        initialCheckOut: '',
        initialGuests: { adults: 1, children: 0, infants: 0, pets: 0 },
        onClose: () => {},
        currency: 'BRL',
        isSaved: false,
        onToggleSave: () => {},
        onStartBooking: () => {},
      }),
    );

    assert.ok(getByRole('button', { name: /1 pessoa/ }));
    assert.equal(window.location.search, '?utm_source=direct');
  } finally {
    crcnBackendApi.getAccommodationCalendar = originalGetCalendar;
    crcnBackendApi.calculatePrice = originalCalculatePrice;
    window.history.replaceState(null, '', '/');
  }
});

test('shares the current stay dates and guest count while preserving tracking parameters', async () => {
  const originalGetCalendar = crcnBackendApi.getAccommodationCalendar;
  const originalCalculatePrice = crcnBackendApi.calculatePrice;
  const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
  let copiedText = '';
  crcnBackendApi.getAccommodationCalendar = async () =>
    Array.from({ length: 30 }, (_, index) => ({
      date: `2026-11-${String(index + 1).padStart(2, '0')}`,
      avail: 1,
    }));
  crcnBackendApi.calculatePrice = async () => null;
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: async (value: string) => (copiedText = value) },
  });
  window.history.replaceState(
    null,
    '',
    '/apartamento/JQ08G?utm_source=share&from=2026-11-11&to=2026-11-15&guests=1',
  );

  try {
    const { container, getByRole } = render(
      React.createElement(PropertyDetailPage, {
        property: STAYS_NET_APARTMENTS[0]!,
        initialCheckIn: '2026-11-11',
        initialCheckOut: '2026-11-15',
        initialGuests: { adults: 2, children: 1, infants: 0, pets: 0 },
        onClose: () => {},
        currency: 'BRL',
        isSaved: false,
        onToggleSave: () => {},
        onStartBooking: () => {},
      }),
    );

    const dateTrigger = container.querySelector<HTMLButtonElement>(
      'button[aria-controls="stay-dates-dialog"]',
    );
    assert.ok(dateTrigger);
    fireEvent.click(dateTrigger);
    const calendar = getByRole('dialog', { name: 'Escolha as datas' });
    const checkInDate = calendar.querySelector<HTMLButtonElement>(
      'button[aria-label*="12 de novembro de 2026"]',
    );
    assert.ok(checkInDate);
    await waitFor(() => assert.equal(checkInDate.disabled, false));
    fireEvent.click(checkInDate);

    const checkOutDate = calendar.querySelector<HTMLButtonElement>(
      'button[aria-label*="18 de novembro de 2026"]',
    );
    assert.ok(checkOutDate);
    await waitFor(() => assert.equal(checkOutDate.disabled, false));
    fireEvent.click(checkOutDate);

    const guestTrigger = container.querySelector<HTMLButtonElement>(
      'button[aria-controls="property-guest-selector-dialog"]',
    );
    assert.ok(guestTrigger);
    fireEvent.click(guestTrigger);
    assert.ok(getByRole('dialog', { name: 'Hóspedes' }));
    fireEvent.click(getByRole('button', { name: 'Adicionar: Adultos' }));
    fireEvent.click(getByRole('button', { name: 'Aplicar' }));

    await waitFor(() => {
      const currentUrl = new URL(window.location.href);
      assert.equal(currentUrl.searchParams.get('from'), '2026-11-12');
      assert.equal(currentUrl.searchParams.get('to'), '2026-11-18');
      assert.equal(currentUrl.searchParams.get('guests'), '4');
      assert.equal(currentUrl.searchParams.get('adults'), '3');
      assert.equal(currentUrl.searchParams.get('children'), '1');
    });

    fireEvent.click(
      getByRole('button', { name: `Compartilhar ${STAYS_NET_APARTMENTS[0]!.title}` }),
    );
    await waitFor(() => assert.match(container.textContent || '', /Link copiado!/));

    const sharedUrl = new URL(copiedText);
    assert.equal(sharedUrl.pathname, '/apartamento/JQ08G');
    assert.equal(sharedUrl.searchParams.get('utm_source'), 'share');
    assert.equal(sharedUrl.searchParams.get('from'), '2026-11-12');
    assert.equal(sharedUrl.searchParams.get('to'), '2026-11-18');
    assert.equal(sharedUrl.searchParams.get('guests'), '4');
    assert.equal(sharedUrl.searchParams.get('adults'), '3');
    assert.equal(sharedUrl.searchParams.get('children'), '1');

    window.history.pushState(
      { __crcnPropertyDetailReturnScroll: 320 },
      '',
      '/?utm_source=share&from=2026-11-11&to=2026-11-15&guests=1',
    );
    window.dispatchEvent(new window.PopStateEvent('popstate'));

    await waitFor(() => {
      const returnedUrl = new URL(window.location.href);
      assert.equal(returnedUrl.searchParams.get('from'), '2026-11-12');
      assert.equal(returnedUrl.searchParams.get('to'), '2026-11-18');
      assert.equal(returnedUrl.searchParams.get('guests'), '4');
      assert.equal(returnedUrl.searchParams.get('utm_source'), 'share');
    });
  } finally {
    crcnBackendApi.getAccommodationCalendar = originalGetCalendar;
    crcnBackendApi.calculatePrice = originalCalculatePrice;
    if (originalClipboard) {
      Object.defineProperty(navigator, 'clipboard', originalClipboard);
    } else {
      Reflect.deleteProperty(navigator, 'clipboard');
    }
    window.history.replaceState(null, '', '/');
  }
});

test('announces when the browser cannot copy a property link', async () => {
  const originalGetCalendar = crcnBackendApi.getAccommodationCalendar;
  const originalCalculatePrice = crcnBackendApi.calculatePrice;
  const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
  crcnBackendApi.getAccommodationCalendar = async () => [];
  crcnBackendApi.calculatePrice = async () => null;
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: async () => Promise.reject(new Error('clipboard denied')) },
  });

  try {
    const { getByRole } = render(
      React.createElement(PropertyDetailPage, {
        property: STAYS_NET_APARTMENTS[0]!,
        initialCheckIn: '2026-11-11',
        initialCheckOut: '2026-11-15',
        initialGuests: { adults: 2, children: 0, infants: 0, pets: 0 },
        onClose: () => {},
        currency: 'BRL',
        isSaved: false,
        onToggleSave: () => {},
        onStartBooking: () => {},
      }),
    );

    fireEvent.click(
      getByRole('button', { name: `Compartilhar ${STAYS_NET_APARTMENTS[0]!.title}` }),
    );
    await waitFor(() => {
      const shareButton = getByRole('button', {
        name: `Compartilhar ${STAYS_NET_APARTMENTS[0]!.title}`,
      });
      assert.match(shareButton.textContent || '', /Não foi possível copiar/);
    });
  } finally {
    crcnBackendApi.getAccommodationCalendar = originalGetCalendar;
    crcnBackendApi.calculatePrice = originalCalculatePrice;
    if (originalClipboard) {
      Object.defineProperty(navigator, 'clipboard', originalClipboard);
    } else {
      Reflect.deleteProperty(navigator, 'clipboard');
    }
  }
});

const liveQuote = {
  success: true,
  listingId: 'JQ08G',
  staysListingId: 'JQ08G',
  nights: 2,
  dailyRate: 350,
  baseTotal: 700,
  cleaningFee: 150,
  serviceFee: 0,
  discount: 0,
  total: 850,
  currency: 'BRL',
  feesIncluded: false,
  cleaningIncluded: false,
  fees: [],
  source: 'stays-live',
  breakdown: {
    dailyRateText: 'R$ 350,00 x 2 noites',
    cleaningFeeText: 'Taxa de limpeza',
    serviceFeeText: 'Taxa de serviço',
    totalText: 'R$ 850,00',
  },
};

test('shows checkout retry when terms or readiness requests reject unexpectedly', async () => {
  const originalGetCheckoutTerms = checkoutApi.getCheckoutTerms;
  const originalGetCheckoutReadiness = checkoutApi.getCheckoutReadiness;
  checkoutApi.getCheckoutTerms = async () => {
    throw new Error('terms request rejected');
  };
  checkoutApi.getCheckoutReadiness = async () => {
    throw new Error('readiness request rejected');
  };

  try {
    const { getByRole, getByText } = render(
      React.createElement(CheckoutModal, {
        isOpen: true,
        onClose: () => {},
        currency: 'BRL',
        bookingData: {
          property: STAYS_NET_APARTMENTS[0]!,
          checkIn: '2026-11-11',
          checkOut: '2026-11-13',
          guests: { adults: 2, children: 0, infants: 0, pets: 0 },
          nights: 2,
          totalAmount: 850,
          cleaningFee: 150,
          serviceFee: 0,
          discount: 0,
          quote: liveQuote,
        },
      }),
    );

    await waitFor(() => {
      assert.ok(getByRole('button', { name: 'Tentar novamente' }));
    });
    assert.match(getByRole('button', { name: 'Tentar novamente' }).className, /\btext-sm\b/);
    assert.ok(
      getByText('Não foi possível carregar as condições desta estadia. Tente consultar novamente.'),
    );
  } finally {
    checkoutApi.getCheckoutTerms = originalGetCheckoutTerms;
    checkoutApi.getCheckoutReadiness = originalGetCheckoutReadiness;
  }
});

test('checkout does not show internal approval identifiers to guests', async () => {
  const originalGetCheckoutTerms = checkoutApi.getCheckoutTerms;
  const originalGetCheckoutReadiness = checkoutApi.getCheckoutReadiness;
  checkoutApi.getCheckoutTerms = async () => ({
    kind: 'ready',
    data: {
      success: true,
      terms: {
        version: 'fixture-mobile-review',
        snapshot: {
          version: 'fixture-mobile-review',
          'Preço e taxas': 'Valor confirmado no momento da reserva.',
        },
      },
    },
  });
  checkoutApi.getCheckoutReadiness = async () => ({
    kind: 'ready',
    data: {
      success: true,
      ready: false,
      termsAvailable: true,
      checkoutEnabled: false,
      payment: { enabled: false, methods: [], publicKey: null },
    },
  });

  try {
    const { getByRole, getByText, getByLabelText, queryByText } = render(
      React.createElement(CheckoutModal, {
        isOpen: true,
        onClose: () => {},
        currency: 'BRL',
        bookingData: {
          property: STAYS_NET_APARTMENTS[0]!,
          checkIn: '2026-11-11',
          checkOut: '2026-11-13',
          guests: { adults: 2, children: 0, infants: 0, pets: 0 },
          nights: 2,
          totalAmount: 850,
          cleaningFee: 150,
          serviceFee: 0,
          discount: 0,
          quote: liveQuote,
        },
      }),
    );

    await waitFor(() => getByRole('heading', { name: 'Condições desta hospedagem' }));
    assert.equal(queryByText('fixture-mobile-review'), null);
    const termsHeading = getByRole('heading', { name: 'Condições desta hospedagem' });
    const priceBreakdownHeading = getByRole('heading', { name: 'Detalhamento da Estadia' });
    const propertyHeading = getByRole('heading', { name: 'Lacqua DiRoma IV' });
    const accompanimentHeading = getByText('Acompanhamento CRCN');
    const checkoutDialog = getByRole('dialog', { name: /Resumo da estadia/ });
    const checkoutViewport = checkoutDialog.parentElement;
    const termsAcceptance = getByLabelText(/Li e aceito as condições desta acomodação/);
    const checkoutSubmit = getByRole('button', { name: 'Compra no site em preparação' });
    assert.match(termsHeading.closest('section')?.className ?? '', /\btext-sm\b/);
    assert.match(priceBreakdownHeading.nextElementSibling?.className ?? '', /\btext-sm\b/);
    assert.match(propertyHeading.className, /\btext-sm\b/);
    assert.match(accompanimentHeading.parentElement?.parentElement?.className ?? '', /\btext-sm\b/);
    assert.match(checkoutViewport?.className ?? '', /min-h-\[100dvh\]/);
    assert.match(checkoutViewport?.className ?? '', /safe-area-inset-left/);
    assert.match(checkoutViewport?.getAttribute('style') ?? '', /safe-area-inset-top/);
    assert.match(checkoutViewport?.getAttribute('style') ?? '', /safe-area-inset-bottom/);
    assert.match(
      checkoutDialog.querySelector('.sticky')?.className ?? '',
      /top-\[env\(safe-area-inset-top/,
    );
    assert.match(termsAcceptance.parentElement?.className ?? '', /min-h-11/);
    assert.equal((checkoutSubmit as HTMLButtonElement).disabled, true);
  } finally {
    checkoutApi.getCheckoutTerms = originalGetCheckoutTerms;
    checkoutApi.getCheckoutReadiness = originalGetCheckoutReadiness;
  }
});

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

test('retries a failed price quote when availability is confirmed', async () => {
  const originalGetCalendar = crcnBackendApi.getAccommodationCalendar;
  const originalCalculatePrice = crcnBackendApi.calculatePrice;
  const property = STAYS_NET_APARTMENTS[0]!;
  const calendar = Array.from({ length: 5 }, (_, index) => ({
    date: `2026-11-${String(11 + index).padStart(2, '0')}`,
    avail: 1,
  }));
  let quoteAttempts = 0;
  crcnBackendApi.getAccommodationCalendar = async () => calendar;
  crcnBackendApi.calculatePrice = async () => {
    quoteAttempts += 1;
    if (quoteAttempts === 1) throw new Error('price service unavailable');
    return liveQuote;
  };

  try {
    const { getByRole, getByText } = render(
      React.createElement(PropertyDetailModal, {
        property,
        initialCheckIn: '2026-11-11',
        initialCheckOut: '2026-11-13',
        initialGuests: { adults: 2, children: 0, infants: 0, pets: 0 },
        onClose: () => {},
        currency: 'BRL',
        isSaved: false,
        onToggleSave: () => {},
        onStartBooking: () => {},
      }),
    );

    const retryButton = await waitFor(() =>
      getByRole('button', { name: 'Tentar cotação novamente' }),
    );
    assert.ok(getByText('Não foi possível consultar o preço. Tente novamente.'));
    assert.match(retryButton.className, /min-h-11/);
    assert.match(getByRole('button', { name: /Hóspedes/ }).className, /min-h-11/);
    fireEvent.click(retryButton);

    await waitFor(() => {
      assert.equal(quoteAttempts, 2);
      assert.equal(
        document.querySelector<HTMLButtonElement>('#property-detail-mobile-booking-action > button')
          ?.disabled,
        false,
      );
    });
  } finally {
    crcnBackendApi.getAccommodationCalendar = originalGetCalendar;
    crcnBackendApi.calculatePrice = originalCalculatePrice;
  }
});

test('mobile booking action stays visible and disabled while availability is loading', () => {
  const originalGetCalendar = crcnBackendApi.getAccommodationCalendar;
  const originalCalculatePrice = crcnBackendApi.calculatePrice;
  crcnBackendApi.getAccommodationCalendar = async () => await new Promise(() => {});
  crcnBackendApi.calculatePrice = async () => null;

  try {
    render(
      React.createElement(PropertyDetailModal, {
        property: STAYS_NET_APARTMENTS[0]!,
        initialCheckIn: '2026-11-11',
        initialCheckOut: '2026-11-13',
        initialGuests: { adults: 2, children: 0, infants: 0, pets: 0 },
        onClose: () => {},
        currency: 'BRL',
        isSaved: false,
        onToggleSave: () => {},
        onStartBooking: () => {},
      }),
    );

    const mobileBookingButton = document.querySelector<HTMLButtonElement>(
      '#property-detail-mobile-booking-action > button',
    );
    assert.equal(mobileBookingButton?.textContent, 'Consultando disponibilidade...');
    assert.equal(mobileBookingButton?.disabled, true);
  } finally {
    crcnBackendApi.getAccommodationCalendar = originalGetCalendar;
    crcnBackendApi.calculatePrice = originalCalculatePrice;
  }
});

test('booking panel lets guests retry failed availability without opening the calendar', async () => {
  const originalGetCalendar = crcnBackendApi.getAccommodationCalendar;
  const originalCalculatePrice = crcnBackendApi.calculatePrice;
  const property = STAYS_NET_APARTMENTS[0]!;
  const calendar = Array.from({ length: 5 }, (_, index) => ({
    date: `2026-11-${String(11 + index).padStart(2, '0')}`,
    avail: 1,
  }));
  let calendarAttempts = 0;
  crcnBackendApi.getAccommodationCalendar = async () => {
    calendarAttempts += 1;
    return calendarAttempts === 1 ? [] : calendar;
  };
  crcnBackendApi.calculatePrice = async () => null;

  try {
    const { getByRole, queryByRole } = render(
      React.createElement(PropertyDetailModal, {
        property,
        initialCheckIn: '2026-11-11',
        initialCheckOut: '2026-11-13',
        initialGuests: { adults: 2, children: 0, infants: 0, pets: 0 },
        onClose: () => {},
        currency: 'BRL',
        isSaved: false,
        onToggleSave: () => {},
        onStartBooking: () => {},
      }),
    );

    const retryButton = await waitFor(() =>
      getByRole('button', { name: 'Verificar disponibilidade novamente' }),
    );
    assert.match(retryButton.className, /min-h-11/);
    assert.equal(
      document.querySelector<HTMLButtonElement>('#property-detail-mobile-booking-action > button')
        ?.disabled,
      true,
    );

    fireEvent.click(retryButton);
    await waitFor(() => assert.equal(calendarAttempts, 2));
    await waitFor(() => {
      assert.equal(queryByRole('button', { name: 'Verificar disponibilidade novamente' }), null);
      assert.match(document.body.textContent || '', /Disponibilidade confirmada/);
    });
  } finally {
    crcnBackendApi.getAccommodationCalendar = originalGetCalendar;
    crcnBackendApi.calculatePrice = originalCalculatePrice;
  }
});

test('booking callback requires live price and an available selected range', async () => {
  const originalGetCalendar = crcnBackendApi.getAccommodationCalendar;
  const originalCalculatePrice = crcnBackendApi.calculatePrice;
  const property = STAYS_NET_APARTMENTS[0]!;
  const onStartBooking = (bookingData: unknown) => submittedBookings.push(bookingData);
  const submittedBookings: unknown[] = [];
  const calendar = Array.from({ length: 5 }, (_, index) => ({
    date: `2026-11-${String(11 + index).padStart(2, '0')}`,
    avail: 1,
  }));
  crcnBackendApi.getAccommodationCalendar = async () => calendar;
  crcnBackendApi.calculatePrice = async () => liveQuote;

  try {
    const { container, getByText } = render(
      React.createElement(PropertyDetailModal, {
        property,
        initialCheckIn: '2026-11-11',
        initialCheckOut: '2026-11-13',
        initialGuests: { adults: 2, children: 1, infants: 0, pets: 0 },
        onClose: () => {},
        currency: 'BRL',
        isSaved: false,
        onToggleSave: () => {},
        onStartBooking,
      }),
    );

    await waitFor(() => {
      assert.equal(
        document.querySelector('#property-detail-mobile-booking-action > button')?.textContent,
        'Continuar para reserva',
      );
    });
    assert.ok(getByText('Total da estadia'));

    const continueButton = document.querySelector<HTMLButtonElement>(
      '#property-detail-mobile-booking-action > button',
    );
    const inlineContinueButton = container.querySelector<HTMLButtonElement>(
      '.property-booking-panel > button:last-child',
    );
    assert.ok(continueButton);
    assert.ok(inlineContinueButton);
    assert.equal(continueButton.disabled, false);
    assert.equal(inlineContinueButton.disabled, false);
    assert.match(inlineContinueButton.className, /hidden/);
    assert.match(inlineContinueButton.className, /sm:flex/);
    assert.match(continueButton.parentElement?.className || '', /sm:hidden/);
    assert.ok(
      getByText('Total da estadia').compareDocumentPosition(continueButton) &
        Node.DOCUMENT_POSITION_FOLLOWING,
      'The confirmed stay total should appear before the booking action.',
    );
    fireEvent.click(continueButton);
    assert.equal(submittedBookings.length, 1);
    assert.deepEqual(submittedBookings[0], {
      property,
      checkIn: '2026-11-11',
      checkOut: '2026-11-13',
      guests: { adults: 2, children: 1, infants: 0, pets: 0 },
      nights: 2,
      totalAmount: 850,
      cleaningFee: 150,
      serviceFee: 0,
      discount: 0,
      quote: liveQuote,
    });

    crcnBackendApi.calculatePrice = async () => ({ ...liveQuote, success: false });
    cleanup();
    const failedQuote = render(
      React.createElement(PropertyDetailModal, {
        property,
        initialCheckIn: '2026-11-11',
        initialCheckOut: '2026-11-13',
        initialGuests: { adults: 2, children: 1, infants: 0, pets: 0 },
        onClose: () => {},
        currency: 'BRL',
        isSaved: false,
        onToggleSave: () => {},
        onStartBooking,
      }),
    );
    await waitFor(() => {
      const button = failedQuote.container.querySelector<HTMLButtonElement>(
        '.property-booking-panel > button:last-child',
      );
      assert.equal(
        document.querySelector<HTMLButtonElement>('#property-detail-mobile-booking-action > button')
          ?.disabled,
        true,
      );
      assert.equal(button?.disabled, true);
    });
    assert.equal(failedQuote.queryByText('Estimativa'), null);
    assert.ok(failedQuote.getByRole('button', { name: 'Tentar cotação novamente' }));
    fireEvent.click(
      document.querySelector<HTMLButtonElement>('#property-detail-mobile-booking-action > button')!,
    );
    assert.equal(submittedBookings.length, 1);

    crcnBackendApi.getAccommodationCalendar = async () => [];
    crcnBackendApi.calculatePrice = async () => null;
    // The live range is no longer backed by authoritative availability or a live quote.
    // Re-rendering a fresh modal verifies that its disabled CTA cannot submit a booking.
    cleanup();
    const unavailable = render(
      React.createElement(PropertyDetailModal, {
        property,
        initialCheckIn: '2026-11-11',
        initialCheckOut: '2026-11-13',
        initialGuests: { adults: 2, children: 1, infants: 0, pets: 0 },
        onClose: () => {},
        currency: 'BRL',
        isSaved: false,
        onToggleSave: () => {},
        onStartBooking,
      }),
    );
    await waitFor(() => {
      assert.equal(
        document.querySelector<HTMLButtonElement>('#property-detail-mobile-booking-action > button')
          ?.disabled,
        true,
      );
    });
    assert.equal(
      document.querySelector<HTMLButtonElement>('#property-detail-mobile-booking-action > button')
        ?.textContent,
      'Disponibilidade não confirmada',
    );
    fireEvent.click(
      document.querySelector<HTMLButtonElement>('#property-detail-mobile-booking-action > button')!,
    );
    assert.equal(submittedBookings.length, 1);
    unavailable.unmount();
  } finally {
    crcnBackendApi.getAccommodationCalendar = originalGetCalendar;
    crcnBackendApi.calculatePrice = originalCalculatePrice;
  }
});

test('simulated quote is visible but cannot start a reservation', async () => {
  const originalGetCalendar = crcnBackendApi.getAccommodationCalendar;
  const originalCalculatePrice = crcnBackendApi.calculatePrice;
  const property = { ...STAYS_NET_APARTMENTS[0]!, simulatedData: true as const };
  const onStartBooking = (bookingData: unknown) => submittedBookings.push(bookingData);
  const submittedBookings: unknown[] = [];
  crcnBackendApi.getAccommodationCalendar = async () =>
    Array.from({ length: 5 }, (_, index) => ({
      date: `2026-11-${String(11 + index).padStart(2, '0')}`,
      avail: 1,
    }));
  crcnBackendApi.calculatePrice = async () => ({
    ...liveQuote,
    source: 'stays-simulated',
    total: 851,
  });

  try {
    const { getByText } = render(
      React.createElement(PropertyDetailModal, {
        property,
        initialCheckIn: '2026-11-11',
        initialCheckOut: '2026-11-13',
        initialGuests: { adults: 2, children: 0, infants: 0, pets: 0 },
        onClose: () => {},
        currency: 'BRL',
        isSaved: false,
        onToggleSave: () => {},
        onStartBooking,
      }),
    );

    let disabledButton: HTMLButtonElement;
    await waitFor(() => {
      disabledButton = document.querySelector<HTMLButtonElement>(
        '#property-detail-mobile-booking-action > button',
      )!;
      assert.equal(disabledButton.textContent, 'Simulação: reserva desativada');
      assert.equal(disabledButton.disabled, true);
    });
    assert.ok(
      getByText(
        'Ambiente de simulação: preços e disponibilidade são fictícios. Reservas e pagamentos não são realizados.',
      ),
    );
    assert.ok(
      getByText('Valores e disponibilidade simulados; não é possível reservar neste ambiente.'),
    );
    assert.equal(submittedBookings.length, 0);
  } finally {
    crcnBackendApi.getAccommodationCalendar = originalGetCalendar;
    crcnBackendApi.calculatePrice = originalCalculatePrice;
    cleanup();
  }
});

test('booking calendar names full dates and exposes the active date field', async () => {
  const originalGetCalendar = crcnBackendApi.getAccommodationCalendar;
  const originalCalculatePrice = crcnBackendApi.calculatePrice;
  crcnBackendApi.getAccommodationCalendar = async () =>
    Array.from({ length: 30 }, (_, index) => ({
      date: `2026-11-${String(index + 1).padStart(2, '0')}`,
      avail: 1,
    }));
  crcnBackendApi.calculatePrice = async () => null;
  try {
    const { container, getByRole, queryByRole } = render(
      React.createElement(PropertyDetailModal, {
        property: STAYS_NET_APARTMENTS[0]!,
        initialCheckIn: '2026-11-11',
        initialCheckOut: '2026-11-15',
        initialGuests: { adults: 2, children: 0, infants: 0, pets: 0 },
        onClose: () => {},
        currency: 'BRL',
        isSaved: false,
        onToggleSave: () => {},
        onStartBooking: () => {},
      }),
    );

    await waitFor(() => {
      const unavailableBooking = Array.from(
        container.querySelectorAll<HTMLButtonElement>('button'),
      ).find((button) => button.textContent?.includes('Cotação indisponível'));
      assert.ok(unavailableBooking);
      assert.equal(unavailableBooking.disabled, true);
      assert.match(unavailableBooking.className, /disabled:text-neutral-700/);
      assert.match(unavailableBooking.className, /disabled:from-neutral-200/);
    });
    assert.match(
      container.textContent || '',
      /Disponibilidade confirmada; cotação ainda não confirmada/,
    );
    assert.ok(getByRole('button', { name: 'Tentar cotação novamente' }));

    const [checkIn, checkOut] = Array.from(
      container.querySelectorAll<HTMLButtonElement>('button[aria-controls="stay-dates-dialog"]'),
    );
    assert.ok(checkIn);
    assert.ok(checkOut);
    assert.equal(checkIn.getAttribute('aria-haspopup'), 'dialog');
    document.body.style.overflow = 'auto';
    checkIn.focus();
    fireEvent.click(checkIn);

    const calendar = getByRole('dialog', { name: 'Escolha as datas' });
    assert.equal(document.activeElement, getByRole('button', { name: 'Fechar calendário' }));
    assert.equal(document.body.style.overflow, 'hidden');
    assert.match(
      getByRole('button', { name: 'Fechar calendário' }).parentElement?.className || '',
      /sticky top-4/,
    );
    const dateGrid = calendar.querySelector<HTMLElement>('[role="grid"]');
    assert.ok(dateGrid);
    assert.equal(dateGrid.getAttribute('aria-label'), 'Calendário de novembro de 2026');
    assert.ok(dateGrid.querySelectorAll('[role="row"]').length >= 5);
    assert.equal(dateGrid.querySelectorAll('[role="columnheader"]').length, 7);
    const dateFieldButtons = Array.from(
      calendar.querySelectorAll<HTMLButtonElement>('button'),
    ).filter(
      (button) =>
        button.textContent?.includes('Check-in') || button.textContent?.includes('Check-out'),
    );
    const checkInTab = dateFieldButtons.find((button) => button.textContent?.includes('Check-in'))!;
    const checkOutTab = dateFieldButtons.find((button) =>
      button.textContent?.includes('Check-out'),
    )!;
    assert.equal(checkIn.getAttribute('aria-expanded'), 'true');
    assert.equal(checkOut.getAttribute('aria-expanded'), 'false');
    assert.equal(checkIn.getAttribute('aria-controls'), calendar.id);
    assert.equal(checkInTab.getAttribute('aria-pressed'), 'true');
    assert.equal(checkOutTab.getAttribute('aria-pressed'), 'false');
    const dateEleven = calendar.querySelector<HTMLButtonElement>(
      'button[aria-label*="11 de novembro de 2026"]',
    );
    const dateTwelve = calendar.querySelector<HTMLButtonElement>(
      'button[aria-label*="12 de novembro de 2026"]',
    );
    const dateNineteen = calendar.querySelector<HTMLButtonElement>(
      'button[aria-label*="19 de novembro de 2026"]',
    );
    assert.ok(dateEleven);
    assert.ok(dateTwelve);
    assert.ok(dateNineteen);
    assert.equal(dateEleven.style.touchAction, 'pan-y pinch-zoom');
    const calendarDates = Array.from(dateGrid.querySelectorAll<HTMLButtonElement>('button'));
    assert.equal(calendarDates.filter((button) => button.tabIndex === 0).length, 1);
    assert.equal(dateEleven.tabIndex, 0);
    dateEleven.focus();
    fireEvent.keyDown(dateEleven, { key: 'ArrowRight' });
    assert.equal(document.activeElement, dateTwelve);
    assert.equal(dateTwelve.tabIndex, 0);
    assert.equal(dateEleven.tabIndex, -1);
    fireEvent.keyDown(dateTwelve, { key: 'ArrowDown' });
    assert.equal(document.activeElement, dateNineteen);

    fireEvent.click(checkOutTab);
    assert.equal(checkIn.getAttribute('aria-expanded'), 'false');
    assert.equal(checkOut.getAttribute('aria-expanded'), 'true');
    assert.equal(checkInTab.getAttribute('aria-pressed'), 'false');
    assert.equal(checkOutTab.getAttribute('aria-pressed'), 'true');

    const checkoutDate = calendar.querySelector<HTMLButtonElement>(
      'button[aria-label*="16 de novembro de 2026"]',
    );
    assert.ok(checkoutDate);
    fireEvent.click(checkoutDate);
    assert.equal(queryByRole('dialog', { name: 'Escolha as datas' }), null);
    assert.equal(document.activeElement, checkIn);
    assert.equal(document.body.style.overflow, 'auto');
  } finally {
    crcnBackendApi.getAccommodationCalendar = originalGetCalendar;
    crcnBackendApi.calculatePrice = originalCalculatePrice;
  }
});

test('booking calendar visibly blocks unavailable arrival dates and invalid checkout ranges', async () => {
  const originalGetCalendar = crcnBackendApi.getAccommodationCalendar;
  const originalCalculatePrice = crcnBackendApi.calculatePrice;
  crcnBackendApi.getAccommodationCalendar = async () =>
    Array.from({ length: 20 }, (_, index) => {
      const date = `2026-11-${String(index + 1).padStart(2, '0')}`;
      return {
        date,
        avail: date === '2026-11-13' ? 0 : 1,
        closedToArrival: date === '2026-11-16',
      };
    });
  crcnBackendApi.calculatePrice = async () => null;

  try {
    const { container, getByRole } = render(
      React.createElement(PropertyDetailModal, {
        property: STAYS_NET_APARTMENTS[0]!,
        initialCheckIn: '2026-11-11',
        initialCheckOut: '2026-11-15',
        initialGuests: { adults: 2, children: 0, infants: 0, pets: 0 },
        onClose: () => {},
        currency: 'BRL',
        isSaved: false,
        onToggleSave: () => {},
        onStartBooking: () => {},
      }),
    );

    const dateTrigger = container.querySelector<HTMLButtonElement>(
      'button[aria-controls="stay-dates-dialog"]',
    );
    assert.ok(dateTrigger);
    fireEvent.click(dateTrigger);

    const calendar = getByRole('dialog', { name: 'Escolha as datas' });
    await waitFor(() => {
      const blockedArrival = calendar.querySelector<HTMLButtonElement>(
        'button[aria-label*="13 de novembro de 2026"]',
      );
      assert.match(
        blockedArrival?.getAttribute('aria-label') || '',
        /indisponível para esta seleção/,
      );
    });
    const blockedArrival = calendar.querySelector<HTMLButtonElement>(
      'button[aria-label*="13 de novembro de 2026"]',
    );
    assert.ok(blockedArrival);
    assert.equal(blockedArrival.disabled, true);
    assert.match(blockedArrival.getAttribute('aria-label') || '', /indisponível para esta seleção/);
    assert.match(blockedArrival.className, /bg-rose-50/);
    assert.match(blockedArrival.className, /text-rose-700/);
    assert.ok(blockedArrival.querySelector('[aria-hidden="true"]'));

    const dateBeforeBlocked = calendar.querySelector<HTMLButtonElement>(
      'button[aria-label*="12 de novembro de 2026"]',
    );
    const dateWithoutCalendarData = calendar.querySelector<HTMLButtonElement>(
      'button[aria-label*="21 de novembro de 2026"]',
    );
    const dateAfterBlocked = calendar.querySelector<HTMLButtonElement>(
      'button[aria-label*="14 de novembro de 2026"]',
    );
    assert.ok(dateBeforeBlocked);
    assert.ok(dateWithoutCalendarData);
    assert.ok(dateAfterBlocked);
    assert.match(dateWithoutCalendarData.className, /text-neutral-600/);
    dateBeforeBlocked.focus();
    fireEvent.keyDown(dateBeforeBlocked, { key: 'ArrowRight' });
    assert.equal(document.activeElement, dateAfterBlocked);

    const checkOutTab = Array.from(calendar.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent?.includes('Check-out'),
    );
    assert.ok(checkOutTab);
    fireEvent.click(checkOutTab);

    const blockedRangeCheckout = calendar.querySelector<HTMLButtonElement>(
      'button[aria-label*="15 de novembro de 2026"]',
    );
    assert.ok(blockedRangeCheckout);
    assert.equal(blockedRangeCheckout.disabled, true);
    assert.match(
      blockedRangeCheckout.getAttribute('aria-label') || '',
      /indisponível para esta seleção/,
    );
    assert.match(blockedRangeCheckout.className, /bg-rose-50/);

    const blockedArrivalCheckout = calendar.querySelector<HTMLButtonElement>(
      'button[aria-label*="16 de novembro de 2026"]',
    );
    assert.ok(blockedArrivalCheckout);
    assert.equal(blockedArrivalCheckout.disabled, true);
    assert.match(
      blockedArrivalCheckout.getAttribute('aria-label') || '',
      /indisponível para esta seleção/,
    );
  } finally {
    crcnBackendApi.getAccommodationCalendar = originalGetCalendar;
    crcnBackendApi.calculatePrice = originalCalculatePrice;
  }
});

test('booking calendar marks an unavailable arrival date when it is a valid checkout', async () => {
  const originalGetCalendar = crcnBackendApi.getAccommodationCalendar;
  const originalCalculatePrice = crcnBackendApi.calculatePrice;
  crcnBackendApi.getAccommodationCalendar = async () =>
    Array.from({ length: 20 }, (_, index) => {
      const date = `2026-11-${String(index + 1).padStart(2, '0')}`;
      return {
        date,
        avail: date === '2026-11-13' ? 0 : 1,
      };
    });
  crcnBackendApi.calculatePrice = async () => null;

  try {
    const { container, getByRole } = render(
      React.createElement(PropertyDetailModal, {
        property: STAYS_NET_APARTMENTS[0]!,
        initialCheckIn: '2026-11-11',
        initialCheckOut: '2026-11-13',
        initialGuests: { adults: 2, children: 0, infants: 0, pets: 0 },
        onClose: () => {},
        currency: 'BRL',
        isSaved: false,
        onToggleSave: () => {},
        onStartBooking: () => {},
      }),
    );

    const dateTrigger = container.querySelector<HTMLButtonElement>(
      'button[aria-controls="stay-dates-dialog"]',
    );
    assert.ok(dateTrigger);
    fireEvent.click(dateTrigger);

    const calendar = getByRole('dialog', { name: 'Escolha as datas' });
    const checkOutTab = Array.from(calendar.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent?.includes('Check-out'),
    );
    assert.ok(checkOutTab);
    fireEvent.click(checkOutTab);

    await waitFor(() => {
      const unavailableCheckout = calendar.querySelector<HTMLButtonElement>(
        'button[aria-label*="13 de novembro de 2026"]',
      );
      assert.match(
        unavailableCheckout?.getAttribute('aria-label') || '',
        /indisponível para check-in; checkout permitido/,
      );
    });
    const unavailableCheckout = calendar.querySelector<HTMLButtonElement>(
      'button[aria-label*="13 de novembro de 2026"]',
    );
    assert.ok(unavailableCheckout);
    assert.equal(unavailableCheckout.disabled, false);
    assert.match(
      unavailableCheckout.getAttribute('aria-label') || '',
      /indisponível para check-in; checkout permitido/,
    );
    assert.ok(unavailableCheckout.querySelector('[aria-hidden="true"]'));
    assert.match(calendar.textContent || '', /Sem disponibilidade para check-in/);
  } finally {
    crcnBackendApi.getAccommodationCalendar = originalGetCalendar;
    crcnBackendApi.calculatePrice = originalCalculatePrice;
  }
});

test('property detail header exposes its title and sends review activation to the reviews section', async () => {
  const originalGetCalendar = crcnBackendApi.getAccommodationCalendar;
  const originalCalculatePrice = crcnBackendApi.calculatePrice;
  crcnBackendApi.getAccommodationCalendar = async () => [];
  crcnBackendApi.calculatePrice = async () => null;
  try {
    let didScroll = false;
    const { getByRole } = render(
      React.createElement(PropertyDetailModal, {
        property: STAYS_NET_APARTMENTS[0]!,
        initialCheckIn: '2026-11-11',
        initialCheckOut: '2026-11-15',
        initialGuests: { adults: 2, children: 0, infants: 0, pets: 0 },
        onClose: () => {},
        currency: 'BRL',
        isSaved: false,
        onToggleSave: () => {},
        onStartBooking: () => {},
      }),
    );
    const reviews = document.getElementById('property-reviews');
    assert.ok(reviews);
    reviews.scrollIntoView = () => {
      didScroll = true;
    };
    const title = getByRole('heading', { level: 1, name: STAYS_NET_APARTMENTS[0]!.title });
    assert.ok(title);
    const reviewsButton = getByRole('button', { name: /avaliações dos hóspedes/i });
    assert.match(reviewsButton.className, /min-h-11/);
    fireEvent.click(reviewsButton);
    assert.equal(didScroll, true);
  } finally {
    crcnBackendApi.getAccommodationCalendar = originalGetCalendar;
    crcnBackendApi.calculatePrice = originalCalculatePrice;
  }
});

test('property detail save action reports its property id and pressed state', async () => {
  const originalGetCalendar = crcnBackendApi.getAccommodationCalendar;
  const originalCalculatePrice = crcnBackendApi.calculatePrice;
  crcnBackendApi.getAccommodationCalendar = async () => [];
  crcnBackendApi.calculatePrice = async () => null;
  try {
    const property = STAYS_NET_APARTMENTS[0]!;
    const savedIds: string[] = [];
    const { getByRole } = render(
      React.createElement(PropertyDetailModal, {
        property,
        initialCheckIn: '2026-11-11',
        initialCheckOut: '2026-11-15',
        initialGuests: { adults: 2, children: 0, infants: 0, pets: 0 },
        onClose: () => {},
        currency: 'BRL',
        isSaved: false,
        onToggleSave: (id: string) => savedIds.push(id),
        onStartBooking: () => {},
      }),
    );
    const saveButton = getByRole('button', {
      name: `Salvar ${property.title} nos favoritos`,
    });
    assert.equal(saveButton.getAttribute('aria-pressed'), 'false');
    fireEvent.click(saveButton);
    assert.deepEqual(savedIds, [property.id]);
  } finally {
    crcnBackendApi.getAccommodationCalendar = originalGetCalendar;
    crcnBackendApi.calculatePrice = originalCalculatePrice;
  }
});

test('photo gallery supports keyboard navigation and returns focus to its opener', async () => {
  const originalGetCalendar = crcnBackendApi.getAccommodationCalendar;
  const originalCalculatePrice = crcnBackendApi.calculatePrice;
  crcnBackendApi.getAccommodationCalendar = async () => [];
  crcnBackendApi.calculatePrice = async () => null;
  try {
    const property = STAYS_NET_APARTMENTS[0]!;
    const { container, getByRole } = render(
      React.createElement(PropertyDetailModal, {
        property,
        initialCheckIn: '2026-11-11',
        initialCheckOut: '2026-11-15',
        initialGuests: { adults: 2, children: 0, infants: 0, pets: 0 },
        onClose: () => {},
        currency: 'BRL',
        isSaved: false,
        onToggleSave: () => {},
        onStartBooking: () => {},
      }),
    );
    const galleryTrigger = getByRole('button', {
      name: `Mostrar todas as ${property.images.length} fotos`,
    });
    assert.ok(property.images.length > 1);
    const secondPhotoTrigger = getByRole('button', {
      name: `Ampliar foto 2 de ${property.title}`,
    });
    secondPhotoTrigger.focus();
    fireEvent.click(secondPhotoTrigger);
    const secondPhotoDialog = container.ownerDocument.querySelector<HTMLElement>(
      '[aria-labelledby="property-gallery-title"]',
    );
    assert.match(secondPhotoDialog?.textContent || '', /2 de \d+ fotos/);
    fireEvent.keyDown(getByRole('button', { name: 'Fechar galeria' }), { key: 'Escape' });
    assert.equal(document.activeElement, secondPhotoTrigger);

    galleryTrigger.focus();
    fireEvent.click(galleryTrigger);

    const galleryDialog = container.ownerDocument.querySelector<HTMLElement>(
      '[aria-labelledby="property-gallery-title"]',
    );
    assert.ok(galleryDialog);
    assert.equal(galleryDialog.getAttribute('role'), 'dialog');
    assert.match(galleryDialog.textContent || '', /1 de \d+ fotos/);
    fireEvent.click(getByRole('button', { name: 'Próxima foto' }));
    assert.match(galleryDialog.textContent || '', /2 de \d+ fotos/);

    fireEvent.keyDown(getByRole('button', { name: 'Fechar galeria' }), { key: 'Escape' });
    assert.equal(
      container.ownerDocument.querySelector('[aria-labelledby="property-gallery-title"]'),
      null,
    );
    assert.equal(document.activeElement, galleryTrigger);
  } finally {
    crcnBackendApi.getAccommodationCalendar = originalGetCalendar;
    crcnBackendApi.calculatePrice = originalCalculatePrice;
  }
});

test('guest selector enforces occupancy limits and returns focus to its opener', async () => {
  const originalGetCalendar = crcnBackendApi.getAccommodationCalendar;
  const originalCalculatePrice = crcnBackendApi.calculatePrice;
  crcnBackendApi.getAccommodationCalendar = async () => [];
  crcnBackendApi.calculatePrice = async () => null;
  try {
    const { container, getByRole, queryByRole } = render(
      React.createElement(PropertyDetailModal, {
        property: STAYS_NET_APARTMENTS[0]!,
        initialCheckIn: '2026-11-11',
        initialCheckOut: '2026-11-15',
        initialGuests: { adults: 2, children: 0, infants: 0, pets: 0 },
        onClose: () => {},
        currency: 'BRL',
        isSaved: false,
        onToggleSave: () => {},
        onStartBooking: () => {},
      }),
    );
    const guestTrigger = getByRole('button', { name: /Hóspedes/ });
    assert.ok(document.getElementById('property-detail-mobile-booking-action'));
    guestTrigger.focus();
    fireEvent.click(guestTrigger);

    const guestDialog = getByRole('dialog', { name: 'Hóspedes' });
    assert.equal(document.getElementById('property-detail-mobile-booking-action'), null);
    assert.match(guestDialog.className, /flex flex-col/);
    assert.match(
      guestDialog.querySelector('.property-guest-selector-list')?.className || '',
      /overflow-y-auto/,
    );
    assert.match(
      getByRole('button', { name: 'Fechar seletor de hóspedes' }).parentElement?.className || '',
      /shrink-0/,
    );
    const addAdults = getByRole('button', { name: 'Adicionar: Adultos' }) as HTMLButtonElement;
    assert.match(getByRole('button', { name: 'Aplicar' }).className, /min-h-11/);
    assert.equal(
      document.activeElement,
      getByRole('button', { name: 'Fechar seletor de hóspedes' }),
    );
    assert.equal(addAdults.disabled, false);
    fireEvent.click(addAdults);
    assert.equal(guestDialog.querySelector('[aria-live="polite"]')?.textContent, '3');
    assert.equal(
      guestDialog.querySelector('[aria-live="polite"]')?.getAttribute('aria-label'),
      'Adultos: 3',
    );

    fireEvent.keyDown(getByRole('button', { name: 'Fechar seletor de hóspedes' }), {
      key: 'Escape',
    });
    assert.equal(queryByRole('dialog', { name: 'Hóspedes' }), null);
    assert.ok(document.getElementById('property-detail-mobile-booking-action'));
    assert.equal(document.activeElement, guestTrigger);
    assert.equal(
      container.querySelector('[aria-labelledby="property-detail-title"]')?.getAttribute('role'),
      'dialog',
    );
  } finally {
    crcnBackendApi.getAccommodationCalendar = originalGetCalendar;
    crcnBackendApi.calculatePrice = originalCalculatePrice;
  }
});

test('guest selector uses a wider compact layout in landscape viewports', () => {
  const originalGetCalendar = crcnBackendApi.getAccommodationCalendar;
  const originalCalculatePrice = crcnBackendApi.calculatePrice;
  const originalInnerWidth = Object.getOwnPropertyDescriptor(window, 'innerWidth');
  const originalInnerHeight = Object.getOwnPropertyDescriptor(window, 'innerHeight');
  crcnBackendApi.getAccommodationCalendar = async () => [];
  crcnBackendApi.calculatePrice = async () => null;
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 568 });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 320 });

  try {
    const { getByRole } = render(
      React.createElement(PropertyDetailModal, {
        property: STAYS_NET_APARTMENTS[0]!,
        initialCheckIn: '',
        initialCheckOut: '',
        initialGuests: { adults: 1, children: 0, infants: 0, pets: 0 },
        onClose: () => {},
        currency: 'BRL',
        isSaved: false,
        onToggleSave: () => {},
        onStartBooking: () => {},
      }),
    );
    const guestTrigger = getByRole('button', { name: /Hóspedes/ });
    Object.defineProperty(guestTrigger, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        top: 120,
        right: 500,
        bottom: 150,
        left: 40,
        width: 460,
        height: 30,
        x: 40,
        y: 120,
        toJSON: () => ({}),
      }),
    });
    fireEvent.click(guestTrigger);

    const guestDialog = getByRole('dialog', { name: 'Hóspedes' });
    assert.equal(guestDialog.style.width, '360px');
    assert.equal(guestDialog.style.top, '8px');
    assert.equal(guestDialog.style.maxHeight, 'calc(100dvh - 16px)');
    assert.match(
      getByRole('button', { name: 'Adicionar: Bebês (até 2 anos)' }).className,
      /h-11 w-11/,
    );
  } finally {
    crcnBackendApi.getAccommodationCalendar = originalGetCalendar;
    crcnBackendApi.calculatePrice = originalCalculatePrice;
    if (originalInnerWidth) {
      Object.defineProperty(window, 'innerWidth', originalInnerWidth);
    } else {
      Reflect.deleteProperty(window, 'innerWidth');
    }
    if (originalInnerHeight) {
      Object.defineProperty(window, 'innerHeight', originalInnerHeight);
    } else {
      Reflect.deleteProperty(window, 'innerHeight');
    }
  }
});

test('checkout resume not-found state keeps its return link touch-sized', async () => {
  const reference = 'R'.repeat(40);
  const originalResumeCheckout = checkoutApi.resumeCheckout;
  saveCheckoutResumeToken(reference, 'T'.repeat(64), new Date(Date.now() + 60_000).toISOString());
  checkoutApi.resumeCheckout = async () => ({ kind: 'not-found' });

  try {
    const { getByRole } = render(React.createElement(CheckoutResumePage, { reference }));

    await waitFor(() => {
      assert.ok(getByRole('heading', { name: 'Não foi possível acessar o pedido' }));
    });

    const page = getByRole('main');
    const homeLink = getByRole('link', { name: /CRCN.*Central de Reservas/ });
    const returnLink = getByRole('link', { name: 'Voltar aos imóveis' });
    assert.match(page.className, /min-h-\[100dvh\]/);
    assert.match(page.className, /safe-area-inset-left/);
    assert.match(page.style.paddingTop, /100dvh/);
    assert.match(page.style.paddingTop, /safe-area-inset-top/);
    assert.match(page.style.paddingBottom, /safe-area-inset-bottom/);
    assert.match(homeLink.className, /min-h-11/);
    assert.match(
      getByRole('heading', { name: 'Sua estadia, com cada etapa no lugar.' }).className,
      /text-3xl/,
    );
    assert.match(returnLink.className, /min-h-11/);
  } finally {
    checkoutApi.resumeCheckout = originalResumeCheckout;
    clearCheckoutResumeToken(reference);
  }
});

test('checkout resume retry remains touch-sized when the order service is unavailable', async () => {
  const reference = 'U'.repeat(40);
  const originalResumeCheckout = checkoutApi.resumeCheckout;
  let checks = 0;
  saveCheckoutResumeToken(reference, 'V'.repeat(64), new Date(Date.now() + 60_000).toISOString());
  checkoutApi.resumeCheckout = async () => {
    checks += 1;
    return { kind: 'unavailable' };
  };

  try {
    const { getByRole } = render(React.createElement(CheckoutResumePage, { reference }));

    await waitFor(() => {
      assert.ok(getByRole('heading', { name: 'Não foi possível consultar agora' }));
    });
    const retryButton = getByRole('button', { name: 'Tentar novamente' });
    assert.match(retryButton.className, /min-h-11/);
    fireEvent.click(retryButton);
    await waitFor(() => assert.equal(checks, 2));
    assert.ok(getByRole('heading', { name: 'Não foi possível consultar agora' }));
  } finally {
    checkoutApi.resumeCheckout = originalResumeCheckout;
    clearCheckoutResumeToken(reference);
  }
});
