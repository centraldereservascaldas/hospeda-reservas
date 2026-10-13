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
const { cleanup, render } = await import('@testing-library/react');
const { PropertyReviewsSection } =
  await import('../src/components/property/PropertyReviewsSection.tsx');

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

const renderEmptyReviews = (reviewsSynced: boolean, staysSynced: boolean) =>
  render(
    React.createElement(PropertyReviewsSection, {
      property: { rating: 0, reviewCount: 0, reviewsSynced, staysSynced },
      reviews: [],
    }),
  );

test('describes a synchronized empty review list as no published reviews', () => {
  const { getByText } = renderEmptyReviews(true, false);

  assert.ok(getByText('Este anúncio ainda não tem avaliações publicadas.'));
});

test('uses neutral availability copy when reviews are not synchronized', () => {
  const { getByText } = renderEmptyReviews(false, true);

  assert.ok(getByText('As avaliações deste anúncio não estão disponíveis no momento.'));
});

test('hides the empty state after both property and review data are synchronized', () => {
  const { queryByRole } = renderEmptyReviews(true, true);

  assert.equal(queryByRole('heading', { name: 'Avaliações dos hóspedes' }), null);
});
