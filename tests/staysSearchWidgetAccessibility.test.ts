import assert from 'node:assert/strict';
import test, { afterEach, beforeEach, mock } from 'node:test';
import { JSDOM } from 'jsdom';
import type { SearchFilters } from '../src/types';

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
const { render, fireEvent, cleanup, waitFor, within } = await import('@testing-library/react');
const { StaysSearchWidget } = await import('../src/components/search/StaysSearchWidget.tsx');
const { crcnBackendApi } = await import('../src/services/crcnBackendApi.ts');

beforeEach(() => {
  mock.timers.enable({ apis: ['Date'], now: Date.UTC(2026, 10, 3, 12) });
});

afterEach(() => {
  mock.timers.reset();
  cleanup();
  document.body.innerHTML = '';
});

test('mobile search heading uses readable compact copy while desktop keeps the location detail', () => {
  const { getByText } = render(
    React.createElement(StaysSearchWidget, {
      onSearchInApp: () => {},
    }),
  );
  const mobileHeading = getByText('Busque por datas e condomínio');
  const desktopHeading = getByText('Encontre sua hospedagem em Caldas Novas por data e condomínio');
  const heading = mobileHeading.closest('div.flex.flex-1.items-center.gap-2');

  assert.ok(heading);
  assert.match(heading.className, /text-sm/);
  assert.match(mobileHeading.className, /sm:hidden/);
  assert.match(desktopHeading.className, /hidden sm:inline/);
});

test('date picker announces full dates and restores focus on Escape and selection', async () => {
  const originalGetResorts = crcnBackendApi.getResorts;
  crcnBackendApi.getResorts = async () => [];
  try {
    const { getByRole, queryByRole } = render(
      React.createElement(StaysSearchWidget, {
        onSearchInApp: () => {},
        currentFilters: {
          destination: '',
          checkIn: '2026-11-11',
          checkOut: '2026-11-15',
          guests: { adults: 2, children: 0, infants: 0, pets: 0 },
          category: 'all',
          minPrice: 0,
          maxPrice: 100000,
          propertyTypes: [],
          amenities: [],
          minBedrooms: 0,
          minBaths: 0,
          superhostOnly: false,
          instantBookOnly: false,
        },
      }),
    );

    const checkIn = getByRole('button', { name: /Quando 11 de nov./ });
    fireEvent.click(checkIn);

    const calendar = getByRole('dialog', { name: /Calendário de entrada/ });
    const adjacentDate = calendar.querySelector<HTMLButtonElement>(
      'button[data-calendar-day][disabled]',
    );
    assert.ok(adjacentDate);
    assert.match(adjacentDate.className, /text-calendar-muted-foreground/);
    assert.equal(
      calendar
        .querySelector('section[aria-label="novembro de 2026"]')
        ?.querySelector('[data-calendar-day="2026-12-01"]'),
      null,
      'the November calendar should not repeat December dates in its final row',
    );
    const selectedDate = getByRole('button', { name: /11 de novembro de 2026/ });
    assert.equal(selectedDate.getAttribute('aria-pressed'), 'true');
    assert.match(selectedDate.className, /min-h-\[var\(--search-calendar-day-size\)\]/);

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => assert.equal(document.activeElement, checkIn));
    assert.equal(queryByRole('dialog', { name: /Calendário de entrada/ }), null);

    fireEvent.click(checkIn);
    fireEvent.click(getByRole('button', { name: /12 de novembro de 2026/ }));
    fireEvent.click(getByRole('button', { name: /16 de novembro de 2026/ }));
    assert.equal(queryByRole('dialog', { name: /Calendário de entrada/ }), null);
    assert.match(checkIn.getAttribute('aria-label') ?? '', /12 de nov\. - 16 de nov\./);
    assert.equal(document.activeElement, checkIn);
  } finally {
    crcnBackendApi.getResorts = originalGetResorts;
  }
});

test('calendar advances to guest controls after selecting a range on desktop', async () => {
  const originalGetResorts = crcnBackendApi.getResorts;
  crcnBackendApi.getResorts = async () => [];

  try {
    const { getByRole, queryByRole } = render(
      React.createElement(StaysSearchWidget, {
        onSearchInApp: () => {},
        currentFilters: {
          destination: '',
          checkIn: '2026-11-11',
          checkOut: '2026-11-15',
          guests: { adults: 2, children: 0, infants: 0, pets: 0 },
          category: 'all',
          minPrice: 0,
          maxPrice: 100000,
          propertyTypes: [],
          amenities: [],
          minBedrooms: 0,
          minBaths: 0,
          superhostOnly: false,
          instantBookOnly: false,
        },
      }),
    );

    fireEvent.click(getByRole('button', { name: /Quando/ }));
    const grid = getByRole('grid', { name: 'Calendário de novembro de 2026' });
    fireEvent.click(
      grid.querySelector<HTMLButtonElement>('button[data-calendar-day="2026-11-12"]')!,
    );
    fireEvent.click(
      grid.querySelector<HTMLButtonElement>('button[data-calendar-day="2026-11-15"]')!,
    );

    assert.ok(getByRole('button', { name: /Quando 12 de nov\. - 15 de nov\./ }));
    assert.equal(queryByRole('dialog', { name: /Calendário de entrada/ }), null);
    const guestsDialog = getByRole('dialog', { name: 'Selecionar hóspedes' });
    await waitFor(() => {
      assert.ok(guestsDialog.contains(document.activeElement));
      assert.equal(document.activeElement?.getAttribute('aria-label'), 'Diminuir adultos');
    });
    assert.equal(
      (document.querySelector('input[name="checkIn"]') as HTMLInputElement).value,
      '2026-11-12',
    );
    assert.equal(
      (document.querySelector('input[name="checkOut"]') as HTMLInputElement).value,
      '2026-11-15',
    );
  } finally {
    crcnBackendApi.getResorts = originalGetResorts;
  }
});

test('mobile date selection does not automatically open guest controls', async () => {
  const originalGetResorts = crcnBackendApi.getResorts;
  const originalInnerWidth = window.innerWidth;
  crcnBackendApi.getResorts = async () => [];
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });

  try {
    const { getByRole, queryByRole } = render(
      React.createElement(StaysSearchWidget, {
        onSearchInApp: () => {},
      }),
    );

    fireEvent.click(getByRole('button', { name: /Quando/ }));
    const calendar = getByRole('dialog', { name: /Calendário de entrada/ });
    fireEvent.click(
      calendar.querySelector<HTMLButtonElement>('button[data-calendar-day="2026-11-05"]')!,
    );
    fireEvent.click(
      calendar.querySelector<HTMLButtonElement>('button[data-calendar-day="2026-11-07"]')!,
    );

    assert.equal(queryByRole('dialog', { name: /Calendário de entrada/ }), null);
    assert.equal(queryByRole('dialog', { name: 'Selecionar hóspedes' }), null);
    assert.ok(getByRole('button', { name: /Quando 5 de nov\. - 7 de nov\./ }));
  } finally {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: originalInnerWidth,
    });
    crcnBackendApi.getResorts = originalGetResorts;
  }
});

test('shared search panels move focus into condominium, date, and guest controls', async () => {
  const originalGetResorts = crcnBackendApi.getResorts;
  crcnBackendApi.getResorts = async () => [];

  try {
    const { getByRole, getByLabelText } = render(
      React.createElement(StaysSearchWidget, {
        onSearchInApp: () => {},
      }),
    );

    const destinationTrigger = getByRole('button', { name: /Todos os condomínios/ });
    fireEvent.click(destinationTrigger);
    const resortInput = getByLabelText('Buscar condomínio');
    await waitFor(() => assert.equal(document.activeElement, resortInput));

    fireEvent.click(getByRole('option', { name: 'Todos os condomínios' }));
    const dateDialog = getByRole('dialog', { name: /Calendário de entrada/ });
    await waitFor(() => assert.ok(dateDialog.contains(document.activeElement)));
    assert.equal(
      document.activeElement?.hasAttribute('data-calendar-day'),
      true,
      'moving from condominium selection to dates should focus an available date',
    );

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() =>
      assert.equal(document.activeElement, getByRole('button', { name: /Quando/ })),
    );

    const guestTrigger = getByRole('button', { name: /Quem:/ });
    fireEvent.click(guestTrigger);
    const guestDialog = getByRole('dialog', { name: 'Selecionar hóspedes' });
    const increaseAdults = getByRole('button', { name: 'Aumentar adultos' });
    await waitFor(() => {
      assert.equal(document.activeElement, increaseAdults);
      assert.ok(guestDialog.contains(document.activeElement));
    });
  } finally {
    crcnBackendApi.getResorts = originalGetResorts;
  }
});

test('closes a shared search panel when its segment scrolls out of view', async () => {
  const originalGetResorts = crcnBackendApi.getResorts;
  crcnBackendApi.getResorts = async () => [];

  try {
    const { getByRole, queryByRole } = render(
      React.createElement(StaysSearchWidget, {
        onSearchInApp: () => {},
      }),
    );
    const guestSegment = document.querySelector<HTMLElement>('[data-search-segment="guests"]');
    assert.ok(guestSegment);
    guestSegment.getBoundingClientRect = () =>
      ({ top: 40, bottom: 100, left: 0, right: 300, width: 300, height: 60 }) as DOMRect;

    fireEvent.click(getByRole('button', { name: /Quem:/ }));
    await waitFor(() =>
      assert.equal(document.activeElement?.getAttribute('aria-label'), 'Aumentar adultos'),
    );
    assert.ok(getByRole('dialog', { name: 'Selecionar hóspedes' }));

    guestSegment.getBoundingClientRect = () =>
      ({ top: -70, bottom: -10, left: 0, right: 300, width: 300, height: 60 }) as DOMRect;
    fireEvent.scroll(window);

    await waitFor(() => assert.equal(queryByRole('dialog', { name: 'Selecionar hóspedes' }), null));
  } finally {
    crcnBackendApi.getResorts = originalGetResorts;
  }
});

test('closes the shared search panel after a valid search is submitted', async () => {
  const originalGetResorts = crcnBackendApi.getResorts;
  crcnBackendApi.getResorts = async () => [];
  let searches = 0;

  try {
    const filters: SearchFilters = {
      destination: '',
      checkIn: '2026-11-11',
      checkOut: '2026-11-15',
      guests: { adults: 2, children: 0, infants: 0, pets: 0 },
      category: 'all',
      minPrice: 0,
      maxPrice: 100000,
      propertyTypes: [],
      amenities: [],
      minBedrooms: 0,
      minBaths: 0,
      superhostOnly: false,
      instantBookOnly: false,
    };
    const { getByRole, queryByRole } = render(
      React.createElement(StaysSearchWidget, {
        currentFilters: filters,
        onSearchInApp: () => {
          searches += 1;
        },
      }),
    );

    fireEvent.click(getByRole('button', { name: /Quem:/ }));
    assert.ok(getByRole('dialog', { name: 'Selecionar hóspedes' }));
    fireEvent.submit(document.getElementById('widgetStaysSearchForm')!);

    assert.equal(searches, 1);
    await waitFor(() => assert.equal(queryByRole('dialog', { name: 'Selecionar hóspedes' }), null));
  } finally {
    crcnBackendApi.getResorts = originalGetResorts;
  }
});

test('preserves an unsubmitted date edit when an unrelated active filter changes', async () => {
  const originalGetResorts = crcnBackendApi.getResorts;
  crcnBackendApi.getResorts = async () => [];
  const initialFilters: SearchFilters = {
    destination: '',
    checkIn: '2026-11-11',
    checkOut: '2026-11-15',
    guests: { adults: 2, children: 0, infants: 0, pets: 0 },
    category: 'all',
    minPrice: 0,
    maxPrice: 100000,
    propertyTypes: [],
    amenities: [],
    minBedrooms: 0,
    minBaths: 0,
    superhostOnly: false,
    instantBookOnly: false,
  };

  try {
    const { getByRole, rerender } = render(
      React.createElement(StaysSearchWidget, {
        onSearchInApp: () => {},
        currentFilters: initialFilters,
      }),
    );

    fireEvent.click(getByRole('button', { name: /Quando 11 de nov./ }));
    fireEvent.click(getByRole('button', { name: /12 de novembro de 2026/ }));
    fireEvent.click(getByRole('button', { name: /16 de novembro de 2026/ }));
    assert.ok(getByRole('button', { name: /Quando 12 de nov\. - 16 de nov\./ }));

    rerender(
      React.createElement(StaysSearchWidget, {
        onSearchInApp: () => {},
        currentFilters: { ...initialFilters, category: 'pools_24h' },
      }),
    );

    assert.ok(getByRole('button', { name: /Quando 12 de nov\. - 16 de nov\./ }));
  } finally {
    crcnBackendApi.getResorts = originalGetResorts;
  }
});

test('date picker closes when keyboard focus moves out without pulling focus back', async () => {
  const originalGetResorts = crcnBackendApi.getResorts;
  crcnBackendApi.getResorts = async () => [];
  try {
    const { getByRole, queryByRole } = render(
      React.createElement(StaysSearchWidget, {
        onSearchInApp: () => {},
        currentFilters: {
          destination: '',
          checkIn: '2026-11-11',
          checkOut: '2026-11-15',
          guests: { adults: 2, children: 0, infants: 0, pets: 0 },
          category: 'all',
          minPrice: 0,
          maxPrice: 100000,
          propertyTypes: [],
          amenities: [],
          minBedrooms: 0,
          minBaths: 0,
          superhostOnly: false,
          instantBookOnly: false,
        },
      }),
    );

    const checkIn = getByRole('button', { name: /Quando 11 de nov./ });
    fireEvent.click(checkIn);
    const dialog = getByRole('dialog', { name: /Calendário de entrada/ });
    const lastControl = within(dialog).getByRole('button', { name: '± 2 dias' });

    lastControl.focus();
    fireEvent.keyDown(lastControl, { key: 'Tab' });
    await waitFor(() =>
      assert.equal(queryByRole('dialog', { name: /Calendário de entrada/ }), null),
    );
    assert.equal(document.activeElement, getByRole('button', { name: 'Buscar hospedagens' }));
  } finally {
    crcnBackendApi.getResorts = originalGetResorts;
  }
});

test('searchable guest and resort menus keep their list within short landscape space', async () => {
  const originalGetResorts = crcnBackendApi.getResorts;
  const originalInnerHeight = Object.getOwnPropertyDescriptor(window, 'innerHeight');
  const originalInnerWidth = Object.getOwnPropertyDescriptor(window, 'innerWidth');
  crcnBackendApi.getResorts = async () => [];
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 320 });
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 320 });

  try {
    const { getByRole } = render(
      React.createElement(StaysSearchWidget, {
        onSearchInApp: () => {},
      }),
    );
    const resortTrigger = getByRole('button', { name: /Todos os condomínios/ });
    resortTrigger.getBoundingClientRect = () =>
      ({
        left: 16,
        right: 304,
        top: 150,
        bottom: 194,
        width: 288,
        height: 44,
        x: 16,
        y: 150,
        toJSON: () => ({}),
      }) as DOMRect;

    fireEvent.click(resortTrigger);
    const menu = getByRole('dialog', { name: 'Escolher condomínio' });
    const listbox = getByRole('listbox', { name: 'Opções disponíveis' });

    await waitFor(() => assert.equal(menu.style.height, '296px'));
    assert.match(listbox.className, /overflow-y-auto/);
    assert.equal(menu.className.includes('overflow-hidden'), true);
  } finally {
    crcnBackendApi.getResorts = originalGetResorts;
    if (originalInnerHeight) {
      Object.defineProperty(window, 'innerHeight', originalInnerHeight);
    } else {
      Reflect.deleteProperty(window, 'innerHeight');
    }
    if (originalInnerWidth) {
      Object.defineProperty(window, 'innerWidth', originalInnerWidth);
    } else {
      Reflect.deleteProperty(window, 'innerWidth');
    }
  }
});

test('date picker uses one tab stop and arrow keys move across dates and months', async () => {
  const originalGetResorts = crcnBackendApi.getResorts;
  crcnBackendApi.getResorts = async () => [];
  try {
    const { getByRole } = render(
      React.createElement(StaysSearchWidget, {
        onSearchInApp: () => {},
        currentFilters: {
          destination: '',
          checkIn: '2026-11-11',
          checkOut: '2026-11-15',
          guests: { adults: 2, children: 0, infants: 0, pets: 0 },
          category: 'all',
          minPrice: 0,
          maxPrice: 100000,
          propertyTypes: [],
          amenities: [],
          minBedrooms: 0,
          minBaths: 0,
          superhostOnly: false,
          instantBookOnly: false,
        },
      }),
    );

    fireEvent.click(getByRole('button', { name: /Quando 11 de nov./ }));
    const grid = getByRole('grid', { name: 'Calendário de novembro de 2026' });
    assert.equal(
      within(grid.parentElement!).getByRole('heading').getAttribute('aria-live'),
      'polite',
    );
    const dateEleven = within(grid).getByRole('button', { name: /11 de novembro de 2026/ });
    const dateTwelve = within(grid).getByRole('button', { name: /12 de novembro de 2026/ });
    assert.equal(
      Array.from(grid.querySelectorAll<HTMLButtonElement>('[data-calendar-day]')).filter(
        (button) => button.tabIndex === 0,
      ).length,
      1,
    );
    assert.equal(dateEleven.tabIndex, 0);

    fireEvent.keyDown(dateEleven, { key: 'ArrowRight' });
    assert.equal(document.activeElement, dateTwelve);
    assert.equal(dateTwelve.tabIndex, 0);
    assert.equal(dateEleven.tabIndex, -1);

    const dateThirty = within(grid).getByRole('button', { name: /30 de novembro de 2026/ });
    dateThirty.focus();
    fireEvent.keyDown(dateThirty, { key: 'ArrowRight' });
    await waitFor(() =>
      assert.equal(
        getByRole('grid', { name: 'Calendário de dezembro de 2026' })
          .querySelector('[data-calendar-day][tabindex="0"]')
          ?.getAttribute('aria-label'),
        'terça-feira, 1 de dezembro de 2026',
      ),
    );
    const dateOne = getByRole('grid', { name: 'Calendário de dezembro de 2026' }).querySelector(
      '[data-calendar-day][tabindex="0"]',
    );
    assert.equal(document.activeElement, dateOne);
  } finally {
    crcnBackendApi.getResorts = originalGetResorts;
  }
});

test('date picker stays within short viewports and scrolls its own content', async () => {
  const originalGetResorts = crcnBackendApi.getResorts;
  const originalInnerHeight = Object.getOwnPropertyDescriptor(window, 'innerHeight');
  crcnBackendApi.getResorts = async () => [];
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 320 });

  try {
    const { getByRole } = render(
      React.createElement(StaysSearchWidget, {
        onSearchInApp: () => {},
        currentFilters: {
          destination: '',
          checkIn: '2026-11-11',
          checkOut: '2026-11-15',
          guests: { adults: 2, children: 0, infants: 0, pets: 0 },
          category: 'all',
          minPrice: 0,
          maxPrice: 100000,
          propertyTypes: [],
          amenities: [],
          minBedrooms: 0,
          minBaths: 0,
          superhostOnly: false,
          instantBookOnly: false,
        },
      }),
    );

    fireEvent.click(getByRole('button', { name: /Quando 11 de nov./ }));
    await waitFor(() => {
      const dialog = getByRole('dialog', { name: /Calendário de entrada/ });
      assert.equal(dialog.style.height, '296px');
      assert.match(dialog.className, /overflow-hidden/);
      assert.ok(dialog.querySelector('.overflow-y-auto'));
    });
  } finally {
    crcnBackendApi.getResorts = originalGetResorts;
    if (originalInnerHeight) {
      Object.defineProperty(window, 'innerHeight', originalInnerHeight);
    }
  }
});

test('exposes the Sofia assistant shortcut in the mobile search heading', async () => {
  const originalGetResorts = crcnBackendApi.getResorts;
  crcnBackendApi.getResorts = async () => [];
  let opened = 0;
  try {
    const { getByRole } = render(
      React.createElement(StaysSearchWidget, {
        onSearchInApp: () => {},
        onOpenAssistant: () => {
          opened += 1;
        },
      }),
    );

    const shortcut = getByRole('button', { name: 'Falar com Sofia, assistente virtual' });
    assert.match(shortcut.className, /sm:hidden/);
    assert.match(shortcut.className, /min-h-11/);
    assert.match(shortcut.className, /text-sm/);
    assert.match(shortcut.className, /max-\[400px\]:gap-1/);
    assert.match(shortcut.className, /\[@media\(max-height:400px\)\]:hidden/);
    assert.doesNotMatch(shortcut.className, /max-\[400px\]:hidden/);
    fireEvent.click(shortcut);
    assert.equal(opened, 1);
  } finally {
    crcnBackendApi.getResorts = originalGetResorts;
  }
});

test('starts without implying selected dates and explains when a date search is required', async () => {
  const originalGetResorts = crcnBackendApi.getResorts;
  crcnBackendApi.getResorts = async () => [];
  let searches = 0;
  try {
    const { getByRole, queryByRole } = render(
      React.createElement(StaysSearchWidget, {
        onSearchInApp: () => {
          searches += 1;
        },
      }),
    );

    getByRole('button', { name: /Quando Insira as datas/ });
    fireEvent.submit(getByRole('search'));

    getByRole('alert');
    assert.equal(searches, 0);
    assert.equal(queryByRole('dialog'), null);
  } finally {
    crcnBackendApi.getResorts = originalGetResorts;
  }
});

test('keeps surprise search available without asking guests to choose dates first', async () => {
  const originalGetResorts = crcnBackendApi.getResorts;
  crcnBackendApi.getResorts = async () => [];
  let submitted: unknown = null;
  try {
    const { getByRole, queryByRole } = render(
      React.createElement(StaysSearchWidget, {
        surpriseMe: true,
        onSearchInApp: (params) => {
          submitted = params;
        },
      }),
    );

    fireEvent.submit(getByRole('search'));

    assert.equal(queryByRole('alert'), null);
    assert.deepEqual(submitted, {
      checkIn: '',
      checkOut: '',
      dateFlexibility: 0,
      persons: 1,
      guests: { adults: 1, children: 0, infants: 0, pets: 0 },
      destination: '',
      propertyId: '',
      surpriseMe: true,
    });
  } finally {
    crcnBackendApi.getResorts = originalGetResorts;
  }
});

test('preserves the guest breakdown when the compact guest total is unchanged', async () => {
  const originalGetResorts = crcnBackendApi.getResorts;
  crcnBackendApi.getResorts = async () => [];
  const guests = { adults: 2, children: 1, infants: 1, pets: 1 };
  let submitted: unknown = null;

  try {
    const { getByRole } = render(
      React.createElement(StaysSearchWidget, {
        currentFilters: {
          destination: '',
          checkIn: '2026-11-11',
          checkOut: '2026-11-15',
          guests,
          category: 'all',
          minPrice: 0,
          maxPrice: 5000,
          propertyTypes: [],
          amenities: [],
          minBedrooms: 0,
          minBaths: 0,
          superhostOnly: false,
          instantBookOnly: false,
        },
        onSearchInApp: (params) => {
          submitted = params;
        },
      }),
    );

    fireEvent.submit(getByRole('search'));

    assert.deepEqual(submitted, {
      checkIn: '2026-11-11',
      checkOut: '2026-11-15',
      dateFlexibility: 0,
      persons: 4,
      guests,
      destination: '',
      propertyId: '',
      surpriseMe: false,
    });
  } finally {
    crcnBackendApi.getResorts = originalGetResorts;
  }
});

test('preserves infants and pets when the adult count changes in the compact search', async () => {
  const originalGetResorts = crcnBackendApi.getResorts;
  crcnBackendApi.getResorts = async () => [];
  const currentGuests = { adults: 2, children: 1, infants: 1, pets: 1 };
  let submitted: unknown = null;

  try {
    const { getByRole, findByRole } = render(
      React.createElement(StaysSearchWidget, {
        currentFilters: {
          destination: '',
          checkIn: '2026-11-11',
          checkOut: '2026-11-15',
          guests: currentGuests,
          category: 'all',
          minPrice: 0,
          maxPrice: 5000,
          propertyTypes: [],
          amenities: [],
          minBedrooms: 0,
          minBaths: 0,
          superhostOnly: false,
          instantBookOnly: false,
        },
        onSearchInApp: (params) => {
          submitted = params;
        },
      }),
    );

    fireEvent.click(getByRole('button', { name: /Quem:/ }));
    const guestDialog = await findByRole('dialog', { name: 'Selecionar hóspedes' });
    fireEvent.click(within(guestDialog).getByRole('button', { name: 'Aumentar adultos' }));
    fireEvent.submit(getByRole('search'));

    assert.deepEqual(submitted, {
      checkIn: '2026-11-11',
      checkOut: '2026-11-15',
      dateFlexibility: 0,
      persons: 5,
      guests: { adults: 3, children: 1, infants: 1, pets: 1 },
      destination: '',
      propertyId: '',
      surpriseMe: false,
    });
  } finally {
    crcnBackendApi.getResorts = originalGetResorts;
  }
});
