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
const { render, cleanup } = await import('@testing-library/react');
const { CategoryBar } = await import('../src/components/search/CategoryBar.tsx');

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

test('category actions keep accessible names when their visible labels are hidden', () => {
  const { getByRole } = renderCategoryBar();

  assert.ok(getByRole('button', { name: 'Abrir filtros; 2 ativos' }));
  assert.equal(document.querySelector('[aria-label="Ver mapa"]'), null);
});

test('mobile categories use large, single-line chips inside a horizontal scroller', () => {
  const { getByRole } = renderCategoryBar();
  const category = getByRole('button', { name: 'Todas as hospedagens' });
  const scroller = getByRole('group', { name: 'Categorias de hospedagem' });
  const icon = category.querySelector('span[aria-hidden="true"]');

  assert.match(category.className, /min-h-11/);
  assert.match(category.className, /rounded-full/);
  assert.match(category.className, /shrink-0/);
  assert.match(category.className, /focus-visible:outline/);
  assert.match(scroller.className, /overflow-x-auto/);
  assert.match(scroller.className, /no-scrollbar/);
  assert.match(
    category.querySelector('span.whitespace-nowrap')?.textContent ?? '',
    /Todas as hospedagens/,
  );
  assert.equal(icon?.getAttribute('aria-hidden'), 'true');
});

test('all mobile categories remain available to keyboard and horizontal scrolling', () => {
  const { container, getByRole } = renderCategoryBar();
  const scroller = getByRole('group', { name: 'Categorias de hospedagem' });
  const categories = Array.from(container.querySelectorAll<HTMLButtonElement>('[aria-pressed]'));

  assert.equal(categories.length, 3);
  assert.deepEqual(
    categories.map((button) => button.tabIndex),
    [0, 0, 0],
  );
  assert.equal(categories[0].getAttribute('aria-pressed'), 'true');
  assert.equal(categories[2].getAttribute('aria-hidden'), null);
  assert.match(scroller.className, /overflow-x-auto/);
});

test('category and filter actions expose visible keyboard focus styles', () => {
  const { getByRole } = renderCategoryBar();

  assert.match(
    getByRole('button', { name: 'Todas as hospedagens' }).className,
    /focus-visible:outline/,
  );
  assert.match(
    getByRole('button', { name: 'Abrir filtros; 2 ativos' }).className,
    /focus-visible:outline/,
  );
  assert.equal(
    getByRole('button', { name: 'Abrir filtros; 2 ativos' }).getAttribute('aria-label'),
    'Abrir filtros; 2 ativos',
  );
});
