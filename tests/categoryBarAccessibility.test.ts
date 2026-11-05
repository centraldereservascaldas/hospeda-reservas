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

test('mobile category actions keep accessible names when their visible labels are hidden', () => {
  const { getByRole } = renderCategoryBar();

  assert.ok(getByRole('button', { name: 'Abrir filtros; 2 ativos' }));
  assert.ok(getByRole('button', { name: 'Ver mapa' }));
});

test('mobile category cards show compact labels beside icons and keep a full-height touch target', () => {
  const { getByRole } = renderCategoryBar();
  const category = getByRole('button', { name: 'Todas as hospedagens' });
  const iconSurface = category.querySelector('div.relative');
  const label = category.querySelector('span.w-full');

  assert.match(category.className, /flex-row/);
  assert.match(category.className, /gap-2/);
  assert.match(category.className, /min-h-16/);
  assert.match(category.className, /h-16/);
  assert.match(category.className, /sm:h-14/);
  assert.match(category.className, /sm:w-36 sm:min-w-36/);
  assert.match(category.className, /max-height:400px/);
  assert.match(category.className, /h-12/);
  assert.match(category.className, /min-h-12/);
  assert.match(category.className, /sm:gap-4/);
  assert.match(category.className, /sm:px-2/);
  assert.match(iconSurface?.className ?? '', /h-6 w-6/);
  assert.match(iconSurface?.className ?? '', /sm:h-6 sm:w-6/);
  assert.match(iconSurface?.querySelector('svg')?.getAttribute('class') ?? '', /w-4 h-4/);
  assert.match(label?.className ?? '', /flex-1/);
  assert.doesNotMatch(label?.className ?? '', /\bhidden\b/);
  assert.match(label?.textContent ?? '', /Todas as hospedagens/);
  assert.match(label?.className ?? '', /sm:flex-1/);
  assert.match(label?.querySelector('span')?.className ?? '', /text-caption/);
  assert.match(label?.querySelector('span')?.className ?? '', /leading-3/);
});

test('category, filter, map, and price controls expose visible keyboard focus styles', () => {
  const { getByRole } = renderCategoryBar();

  assert.match(
    getByRole('button', { name: 'Todas as hospedagens' }).className,
    /focus-visible:outline/,
  );
  assert.match(
    getByRole('button', { name: 'Abrir filtros; 2 ativos' }).className,
    /focus-visible:outline/,
  );
  assert.match(getByRole('button', { name: 'Ver mapa' }).className, /focus-visible:outline/);
  const totalPriceSwitch = getByRole('switch', { name: 'Exibir total da estadia' });
  assert.match(totalPriceSwitch.className, /h-11 w-11/);
  assert.match(totalPriceSwitch.className, /focus-visible:outline/);
  assert.match(totalPriceSwitch.querySelector('span')?.className ?? '', /h-5 w-9/);
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

test('pagination keeps only visible categories in the tab order and moves focus to the new page', () => {
  const { container, getByRole } = renderCategoryBar();
  const categories = Array.from(
    container.querySelectorAll<HTMLButtonElement>('[data-category-index]'),
  );

  assert.deepEqual(
    categories.map((button) => button.tabIndex),
    [0, -1, -1],
  );
  fireEvent.click(getByRole('button', { name: /Ver outros filtros/ }));

  assert.deepEqual(
    categories.map((button) => button.tabIndex),
    [-1, 0, -1],
  );
  assert.equal(document.activeElement, categories[1]);
  assert.equal(categories[0].getAttribute('aria-hidden'), 'true');
  assert.equal(categories[1].getAttribute('aria-hidden'), 'false');

  fireEvent.click(getByRole('button', { name: /Ver outros filtros/ }));
  assert.deepEqual(
    categories.map((button) => button.tabIndex),
    [-1, -1, 0],
  );
  assert.equal(document.activeElement, categories[2]);
});
