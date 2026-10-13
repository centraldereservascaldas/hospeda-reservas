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
const { render, cleanup, fireEvent, screen } = await import('@testing-library/react');
const { ActiveSearchFilters } = await import('../src/components/ActiveSearchFilters.tsx');
const { createDefaultSearchFilters } = await import('../src/utils/searchUrlState.ts');

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

test('names destination removal and preserves remaining filters until reset', () => {
  const defaultFilters = createDefaultSearchFilters();
  const selectedFilters = {
    ...defaultFilters,
    destination: 'Caldas Novas',
    superhostOnly: true,
    instantBookOnly: true,
  };
  const changes: (typeof selectedFilters)[] = [];
  render(
    React.createElement(ActiveSearchFilters, {
      filters: selectedFilters,
      activeFilterCount: 2,
      defaultFilters,
      onChange: (nextFilters: typeof selectedFilters) => changes.push(nextFilters),
    }),
  );

  assert.ok(screen.getByRole('group', { name: 'Filtros ativos' }));
  fireEvent.click(screen.getByRole('button', { name: 'Remover filtro de destino' }));
  assert.equal(changes[0]?.destination, '');
  assert.equal(changes[0]?.superhostOnly, true);
  assert.equal(changes[0]?.instantBookOnly, true);

  fireEvent.click(screen.getByRole('button', { name: 'Limpar todos os filtros' }));
  assert.deepEqual(changes[1], defaultFilters);
});

test('renders nothing when no destination or counted filter is active', () => {
  render(
    React.createElement(ActiveSearchFilters, {
      filters: createDefaultSearchFilters(),
      activeFilterCount: 0,
      defaultFilters: createDefaultSearchFilters(),
      onChange: () => {},
    }),
  );

  assert.equal(screen.queryByRole('group', { name: 'Filtros ativos' }), null);
});
