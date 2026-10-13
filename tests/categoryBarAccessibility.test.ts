import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' });
class ResizeObserverStub {
  observe() {}
  disconnect() {}
}
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  Element: dom.window.Element,
  Node: dom.window.Node,
  ResizeObserver: ResizeObserverStub,
  getComputedStyle: dom.window.getComputedStyle,
});

const React = (await import('react')).default;
const { render, fireEvent, cleanup } = await import('@testing-library/react');
const { CategoryBar } = await import('../src/components/CategoryBar.tsx');

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

function renderCategoryBar(overrides: Record<string, unknown> = {}) {
  return render(
    React.createElement(CategoryBar, {
      selectedCategory: 'all',
      onSelectCategory: () => {},
      onOpenFilters: () => {},
      activeFilterCount: 2,
      showTotalWithTaxes: false,
      setShowTotalWithTaxes: () => {},
      viewMode: 'grid',
      setViewMode: () => {},
      availableCategories: [
        { id: 'all', label: 'Todas as hospedagens', icon: 'Sparkles' },
        { id: 'hotel', label: 'Hotéis e resorts', icon: 'Home' },
        { id: 'flat', label: 'Apartamentos', icon: 'Building' },
      ],
      ...overrides,
    }),
  );
}

test('mobile category actions keep accessible names when their visible labels are hidden', () => {
  const { getByRole } = renderCategoryBar();

  assert.ok(getByRole('button', { name: 'Abrir filtros; 2 ativos' }));
  assert.ok(getByRole('button', { name: 'Ver mapa' }));
});

test('map toggle name follows the action and category pagination announces its position', () => {
  const setViewMode = (mode: string) => modes.push(mode);
  const modes: string[] = [];
  const { getByRole } = renderCategoryBar({ setViewMode });

  fireEvent.click(getByRole('button', { name: 'Ver mapa' }));
  assert.deepEqual(modes, ['map']);
  fireEvent.click(getByRole('button', { name: /Ver outros filtros/ }));
  assert.ok(getByRole('button', { name: /Ver filtros anteriores; página 2 de 3/ }));
});
