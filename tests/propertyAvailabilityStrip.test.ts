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
  assert.doesNotMatch(inRangeDate.className, /bg-orange-100/);
  assert.match(inRangeDate.className, /text-neutral-600/);
});
