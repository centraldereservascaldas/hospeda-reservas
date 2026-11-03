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
const { render, cleanup, fireEvent } = await import('@testing-library/react');
const { PropertyAvailabilityStrip } =
  await import('../src/components/property/PropertyAvailabilityStrip.tsx');

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

test('provides full accessible dates and selected state for availability days', () => {
  render(
    React.createElement(PropertyAvailabilityStrip, {
      calendarDays: [
        { date: '2026-11-11', avail: 1, prices: [{ _mcval: { BRL: 1200 } }] },
        { date: '2026-11-12', avail: 0 },
        { date: '2026-11-13', avail: 1 },
      ],
      calendarAvailable: true,
      isLoading: false,
      calendarMessage: '',
      checkIn: '2026-11-11',
      checkOut: '2026-11-13',
      onSelectDay: () => {},
      onRetryCalendar: () => {},
    }),
  );

  const dayButtons = Array.from(document.querySelectorAll('button'));
  const selectedDay = dayButtons.find((button) => button.getAttribute('aria-pressed') === 'true');
  const unavailableDay = dayButtons.find((button) =>
    button.getAttribute('aria-label')?.includes('12 de novembro'),
  );
  const expectedAccessibleDate = new Date('2026-11-11T12:00:00').toLocaleDateString('pt-BR', {
    dateStyle: 'full',
  });

  assert.ok(selectedDay);
  assert.equal(selectedDay?.getAttribute('aria-label')?.includes(expectedAccessibleDate), true);
  assert.equal(selectedDay?.getAttribute('aria-label')?.includes('1.200'), true);
  assert.equal(unavailableDay?.hasAttribute('disabled'), true);
  assert.match(unavailableDay?.className || '', /text-neutral-600/);
});

test('delegates a chosen available day to the reservation flow', () => {
  const selectedDays: string[] = [];
  render(
    React.createElement(PropertyAvailabilityStrip, {
      calendarDays: [{ date: '2026-11-11', avail: 1 }],
      calendarAvailable: true,
      isLoading: false,
      calendarMessage: '',
      checkIn: '',
      checkOut: '',
      onSelectDay: (day) => selectedDays.push(day.date),
      onRetryCalendar: () => {},
    }),
  );

  const dayButton = document.querySelector('button[aria-label*="11 de novembro"]');
  assert.ok(dayButton);
  fireEvent.click(dayButton!);
  assert.deepEqual(selectedDays, ['2026-11-11']);
});

test('announces calendar loading and names the availability region', () => {
  const { getByRole } = render(
    React.createElement(PropertyAvailabilityStrip, {
      calendarDays: [],
      calendarAvailable: false,
      isLoading: true,
      calendarMessage: 'Atualizando disponibilidade...',
      checkIn: '',
      checkOut: '',
      onSelectDay: () => {},
      onRetryCalendar: () => {},
    }),
  );

  assert.equal(
    getByRole('region', { name: 'Calendário de disponibilidade' }).getAttribute('aria-busy'),
    'true',
  );
  assert.ok(getByRole('status', { name: '' }));
});

test('does not highlight a selected range while calendar data is refreshing', () => {
  render(
    React.createElement(PropertyAvailabilityStrip, {
      calendarDays: [
        { date: '2026-11-11', avail: 1 },
        { date: '2026-11-12', avail: 1 },
        { date: '2026-11-13', avail: 1 },
      ],
      calendarAvailable: true,
      isLoading: true,
      calendarMessage: 'Atualizando disponibilidade...',
      checkIn: '2026-11-11',
      checkOut: '2026-11-13',
      onSelectDay: () => {},
      onRetryCalendar: () => {},
    }),
  );

  const inRangeDate = document.querySelector<HTMLButtonElement>(
    'button[aria-label*="12 de novembro"]',
  );
  assert.ok(inRangeDate);
  assert.equal(inRangeDate.disabled, true);
  assert.doesNotMatch(inRangeDate.className, /bg-calendar-range/);
  assert.match(inRangeDate.className, /text-calendar-muted-foreground/);
});

test('missing tariff states stay neutral and still allow departure after available nights', () => {
  let explanation = '';
  let selected = 0;
  const { getByRole, rerender } = render(
    React.createElement(PropertyAvailabilityStrip, {
      calendarDays: [
        { date: '2026-11-11', avail: 1, availabilityStatus: 'available' },
        { date: '2026-11-12', avail: 1, availabilityStatus: 'unpriced' },
        { date: '2026-11-13', avail: 0, availabilityStatus: 'unconfirmed' },
      ],
      calendarAvailable: true,
      isLoading: false,
      calendarMessage: '',
      checkIn: '',
      checkOut: '',
      onSelectDay: () => {
        selected += 1;
      },
      onExplainDate: (message: string) => {
        explanation = message;
      },
      onRetryCalendar: () => {},
    }),
  );
  const unpriced = getByRole('button', {
    name: /Tarifa não disponível para esta data/,
  }) as HTMLButtonElement;
  const unconfirmed = getByRole('button', { name: /motivo não confirmado/ }) as HTMLButtonElement;
  assert.equal(unpriced.getAttribute('aria-disabled'), 'true');
  assert.equal(unconfirmed.getAttribute('aria-disabled'), 'true');
  fireEvent.click(unpriced);
  assert.equal(explanation, 'Tarifa não disponível para esta data');
  fireEvent.click(unconfirmed);
  assert.equal(explanation, 'Data não disponível para reserva; motivo não confirmado');
  assert.equal(selected, 0);
  assert.doesNotMatch(unpriced.className, /line-through/);
  assert.doesNotMatch(unconfirmed.className, /line-through/);
  rerender(
    React.createElement(PropertyAvailabilityStrip, {
      calendarDays: [
        { date: '2026-11-11', avail: 1 },
        { date: '2026-11-12', avail: 0, availabilityStatus: 'unpriced' },
      ],
      calendarAvailable: true,
      isLoading: false,
      calendarMessage: '',
      checkIn: '2026-11-11',
      checkOut: '',
      onSelectDay: () => {},
      onRetryCalendar: () => {},
    }),
  );
  assert.equal(
    (getByRole('button', { name: /checkout|check-out/ }) as HTMLButtonElement).disabled,
    false,
  );
});

test('background refresh preserves the displayed range while blocking unconfirmed selection', () => {
  render(
    React.createElement(PropertyAvailabilityStrip, {
      calendarDays: [
        { date: '2026-11-11', avail: 1 },
        { date: '2026-11-12', avail: 1 },
        { date: '2026-11-13', avail: 1 },
      ],
      calendarAvailable: false,
      isLoading: false,
      isRefreshingCalendar: true,
      calendarMessage: 'Atualizando disponibilidade...',
      checkIn: '2026-11-11',
      checkOut: '2026-11-13',
      onSelectDay: () => {},
      onRetryCalendar: () => {},
    }),
  );
  const middle = document.querySelector<HTMLButtonElement>('button[aria-label*="12 de novembro"]');
  const departure = document.querySelector<HTMLButtonElement>(
    'button[aria-label*="13 de novembro"]',
  );
  assert.ok(middle);
  assert.ok(departure);
  assert.match(middle.className, /bg-calendar-range/);
  assert.equal(departure.getAttribute('aria-pressed'), 'true');
  assert.equal(middle.disabled, true);
});

test('expired background refresh preserves blocked-day marks', () => {
  render(
    React.createElement(PropertyAvailabilityStrip, {
      calendarDays: [{ date: '2026-11-11', avail: 0 }],
      calendarAvailable: false,
      isLoading: false,
      isRefreshingCalendar: true,
      calendarMessage: 'Atualizando disponibilidade...',
      checkIn: '',
      checkOut: '',
      onSelectDay: () => {},
      onRetryCalendar: () => {},
    }),
  );
  const day = document.querySelector<HTMLButtonElement>('button[aria-label*="11 de novembro"]');
  assert.ok(day);
  assert.match(day.className, /line-through/);
  assert.equal(day.disabled, true);
});
