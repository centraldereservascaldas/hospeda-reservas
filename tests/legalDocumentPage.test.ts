import assert from 'node:assert/strict';
import test from 'node:test';
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
const { render, screen, waitFor, cleanup } = await import('@testing-library/react');
const { LegalDocumentPage } = await import('../src/components/LegalDocumentPage.tsx');
const { readLegalPageSummaries } = await import('../src/utils/legalPages.ts');

test('renders legal copy as text and validates published page summaries', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        page: {
          slug: 'privacidade',
          path: '/privacidade',
          title: 'Aviso de privacidade',
          version: '1.0',
          publishedAt: '2026-10-01',
          sections: [
            { title: 'Dados', content: 'Texto <script>alert("x")</script> exibido com segurança.' },
          ],
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );

  try {
    const validSummary = {
      slug: 'privacidade',
      path: '/privacidade',
      title: 'Aviso de privacidade',
      version: '1.0',
      publishedAt: '2026-10-01',
    };
    assert.deepEqual(
      readLegalPageSummaries({
        pages: [validSummary, { ...validSummary, path: 'javascript:alert(1)' }],
      }),
      [validSummary],
    );

    render(React.createElement(LegalDocumentPage, { slug: 'privacidade' }));
    await screen.findByRole('heading', { name: 'Aviso de privacidade' });
    const measurementPreferences = screen.getByRole('region', { name: 'Preferências de medição' });
    assert.ok(measurementPreferences.closest('main'));
    assert.doesNotMatch(measurementPreferences.className, /\bfixed\b/);
    await waitFor(() => {
      assert.equal(document.querySelector('script'), null);
      assert.ok(screen.getByText('Texto <script>alert("x")</script> exibido com segurança.'));
    });
  } finally {
    cleanup();
    globalThis.fetch = originalFetch;
  }
});
