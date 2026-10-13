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
const { render, fireEvent, cleanup } = await import('@testing-library/react');
const { HostDashboardView } = await import('../src/components/owner/HostDashboardView.tsx');
const { crcnBackendApi } = await import('../src/services/crcnBackendApi.ts');

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

test('owner dashboard exposes the selected section and announces loading', () => {
  const originalGetOwnerDashboard = crcnBackendApi.getOwnerDashboard;
  crcnBackendApi.getOwnerDashboard = async () => new Promise(() => {});
  try {
    const { getByRole } = render(
      React.createElement(HostDashboardView, { accessToken: 'test-token' }),
    );

    const navigation = getByRole('navigation', { name: 'Seções do painel do proprietário' });
    const overview = getByRole('button', { name: 'Visão geral' });
    const calendar = getByRole('button', { name: 'Calendário' });
    const loading = getByRole('status');

    assert.ok(navigation);
    assert.equal(overview.getAttribute('aria-current'), 'page');
    assert.equal(loading.textContent, 'Carregando dados da Stays…');
    assert.equal(loading.getAttribute('aria-live'), 'polite');

    fireEvent.click(calendar);
    assert.equal(calendar.getAttribute('aria-current'), 'page');
    assert.equal(overview.hasAttribute('aria-current'), false);
  } finally {
    crcnBackendApi.getOwnerDashboard = originalGetOwnerDashboard;
  }
});
