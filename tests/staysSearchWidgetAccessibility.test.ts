import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
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

afterEach(() => {
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
    const { getByRole, getByText, queryByRole } = render(
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

    const checkIn = getByRole('button', { name: /Entrada \(Check-in\) 11\/11\/2026/ });
    fireEvent.click(checkIn);

    const calendar = getByRole('dialog', { name: /Calendário de entrada/ });
    const adjacentDate = calendar.querySelector<HTMLButtonElement>(
      'button[data-calendar-day][disabled]',
    );
    assert.ok(adjacentDate);
    assert.match(adjacentDate.className, /text-neutral-600/);
    const selectedDate = getByRole('button', { name: /11 de novembro de 2026/ });
    assert.equal(selectedDate.getAttribute('aria-pressed'), 'true');
    assert.match(selectedDate.className, /min-h-11/);

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => assert.equal(document.activeElement, checkIn));
    assert.equal(queryByRole('dialog', { name: /Calendário de entrada/ }), null);

    fireEvent.click(checkIn);
    fireEvent.click(getByRole('button', { name: /12 de novembro de 2026/ }));
    assert.equal(queryByRole('dialog', { name: /Calendário de entrada/ }), null);
    assert.equal(checkIn.textContent?.includes('12/11/2026'), true);
    assert.equal(document.activeElement, checkIn);
    assert.ok(getByText('12/11/2026'));
  } finally {
    crcnBackendApi.getResorts = originalGetResorts;
  }
});

test('touch drag selects a check-in to check-out range in the search calendar', async () => {
  const originalGetResorts = crcnBackendApi.getResorts;
  const originalElementFromPoint = document.elementFromPoint;
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

    fireEvent.click(getByRole('button', { name: /Entrada \(Check-in\)/ }));
    const calendar = getByRole('dialog', { name: /Calendário de entrada/ });
    const grid = getByRole('grid', { name: 'Calendário de novembro de 2026' });
    const checkInCell = grid.querySelector<HTMLElement>(
      '[data-calendar-day="2026-11-12"][data-calendar-selectable="true"]',
    );
    const checkOutButton = grid.querySelector<HTMLButtonElement>(
      'button[data-calendar-day="2026-11-15"]',
    );
    assert.ok(checkInCell);
    assert.ok(checkOutButton);
    document.elementFromPoint = () => checkOutButton;

    fireEvent.pointerDown(checkInCell, { pointerId: 7, pointerType: 'touch' });
    fireEvent.pointerMove(calendar, {
      pointerId: 7,
      pointerType: 'touch',
      clientX: 10,
      clientY: 10,
    });
    assert.match(checkOutButton.className, /bg-orange-100/);
    fireEvent.pointerUp(calendar, { pointerId: 7, pointerType: 'touch', clientX: 10, clientY: 10 });

    assert.match(
      getByRole('button', { name: /Entrada \(Check-in\).*12\/11\/2026/ }).textContent || '',
      /12\/11\/2026/,
    );
    assert.match(
      getByRole('button', { name: /Saída \(Checkout\).*15\/11\/2026/ }).textContent || '',
      /15\/11\/2026/,
    );
    assert.equal(queryByRole('dialog', { name: /Calendário de entrada/ }), null);
  } finally {
    crcnBackendApi.getResorts = originalGetResorts;
    if (originalElementFromPoint) {
      document.elementFromPoint = originalElementFromPoint;
    } else {
      Object.defineProperty(document, 'elementFromPoint', {
        configurable: true,
        value: undefined,
      });
    }
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

    fireEvent.click(getByRole('button', { name: /Entrada \(Check-in\) 11\/11\/2026/ }));
    fireEvent.click(getByRole('button', { name: /12 de novembro de 2026/ }));
    assert.ok(getByRole('button', { name: /Entrada \(Check-in\) 12\/11\/2026/ }));

    rerender(
      React.createElement(StaysSearchWidget, {
        onSearchInApp: () => {},
        currentFilters: { ...initialFilters, category: 'pools_24h' },
      }),
    );

    assert.ok(getByRole('button', { name: /Entrada \(Check-in\) 12\/11\/2026/ }));
    assert.ok(getByRole('button', { name: /Saída \(Checkout\) 15\/11\/2026/ }));
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

    const checkIn = getByRole('button', { name: /Entrada \(Check-in\) 11\/11\/2026/ });
    const checkOut = getByRole('button', { name: /Saída \(Checkout\) 15\/11\/2026/ });
    fireEvent.click(checkIn);
    const dialog = getByRole('dialog', { name: /Calendário de entrada/ });
    const lastControl = within(dialog).getByRole('button', { name: 'Hoje' });

    lastControl.focus();
    fireEvent.keyDown(lastControl, { key: 'Tab' });
    await waitFor(() =>
      assert.equal(queryByRole('dialog', { name: /Calendário de entrada/ }), null),
    );
    assert.equal(document.activeElement, checkOut);
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
    const menu = getByRole('group', { name: 'Opções de filtro' });
    const listbox = getByRole('listbox', { name: 'Opções disponíveis' });

    await waitFor(() => assert.equal(menu.style.maxHeight, '142px'));
    assert.equal(listbox.style.maxHeight, '74px');
    assert.ok(
      Number.parseFloat(listbox.style.maxHeight) <= Number.parseFloat(menu.style.maxHeight),
    );
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

    fireEvent.click(getByRole('button', { name: /Entrada \(Check-in\) 11\/11\/2026/ }));
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

    fireEvent.click(getByRole('button', { name: /Entrada \(Check-in\) 11\/11\/2026/ }));
    await waitFor(() => {
      const dialog = getByRole('dialog', { name: /Calendário de entrada/ });
      assert.equal(dialog.style.maxHeight, '304px');
      assert.match(dialog.className, /overflow-y-auto/);
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

    getByRole('button', { name: /Entrada \(Check-in\) Selecione a data/ });
    getByRole('button', { name: /Saída \(Checkout\) Selecione a data/ });
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
      persons: 2,
      guests: undefined,
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

test('preserves infants and pets when the guest total is changed in the compact search', async () => {
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

    fireEvent.click(getByRole('button', { name: /Hóspedes/ }));
    const guestOptions = await findByRole('listbox', { name: 'Opções disponíveis' });
    fireEvent.click(within(guestOptions).getByRole('option', { name: '4 Pessoas' }));
    fireEvent.submit(getByRole('search'));

    assert.deepEqual(submitted, {
      checkIn: '2026-11-11',
      checkOut: '2026-11-15',
      persons: 5,
      guests: { adults: 4, children: 0, infants: 1, pets: 1 },
      destination: '',
      propertyId: '',
      surpriseMe: false,
    });
  } finally {
    crcnBackendApi.getResorts = originalGetResorts;
  }
});
