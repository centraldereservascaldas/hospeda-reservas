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
const { render, cleanup } = await import('@testing-library/react');
const { FilterModal } = await import('../src/components/FilterModal.tsx');
const { createDefaultSearchFilters } = await import('../src/utils/searchUrlState.ts');

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

test('synchronizes its draft after external filters are cleared while the modal stays mounted', () => {
  const selectedFilters = {
    ...createDefaultSearchFilters(),
    amenities: ['Piscina'],
    minBedrooms: 2,
  };
  const { rerender } = render(
    React.createElement(FilterModal, {
      isOpen: true,
      onClose: () => {},
      filters: selectedFilters,
      onApplyFilters: () => {},
      onResetFilters: () => {},
      currency: 'BRL',
      matchingCount: 0,
    }),
  );

  const amenity = Array.from(document.querySelectorAll('button')).find((button) =>
    button.textContent?.includes('Piscina'),
  );
  const bedroomTwo = Array.from(document.querySelectorAll('button')).find(
    (button) => button.textContent === '2+' && button.getAttribute('aria-pressed') === 'true',
  );
  assert.equal(amenity?.getAttribute('aria-pressed'), 'true');
  assert.ok(bedroomTwo);

  rerender(
    React.createElement(FilterModal, {
      isOpen: false,
      onClose: () => {},
      filters: createDefaultSearchFilters(),
      onApplyFilters: () => {},
      onResetFilters: () => {},
      currency: 'BRL',
      matchingCount: 0,
    }),
  );
  rerender(
    React.createElement(FilterModal, {
      isOpen: true,
      onClose: () => {},
      filters: createDefaultSearchFilters(),
      onApplyFilters: () => {},
      onResetFilters: () => {},
      currency: 'BRL',
      matchingCount: 0,
    }),
  );

  const resetAmenity = Array.from(document.querySelectorAll('button')).find((button) =>
    button.textContent?.includes('Piscina'),
  );
  const anyBedrooms = Array.from(document.querySelectorAll('button')).find(
    (button) => button.textContent === 'Qualquer' && button.getAttribute('aria-pressed') === 'true',
  );
  assert.equal(resetAmenity?.getAttribute('aria-pressed'), 'false');
  assert.ok(anyBedrooms);
});
