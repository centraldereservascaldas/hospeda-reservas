import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost/',
});
Object.assign(dom.window, {
  requestAnimationFrame: (callback: (timestamp: number) => void) =>
    setTimeout(() => callback(Date.now()), 0),
  cancelAnimationFrame: (handle: number) => clearTimeout(handle),
});
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  Element: dom.window.Element,
  Node: dom.window.Node,
  getComputedStyle: dom.window.getComputedStyle,
});

const React = (await import('react')).default;
const { cleanup, fireEvent, render, screen } = await import('@testing-library/react');
const { CondominiumDetailModal } =
  await import('../src/components/condominium/CondominiumDetailModal.tsx');

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

const condominium = {
  id: 'residencial-lago-azul',
  name: 'Residencial Lago Azul',
  description: 'Condomínio familiar com piscinas termais e jardins.',
  images: ['https://example.com/piscina.jpg', 'https://example.com/jardim.jpg'],
  accommodationCount: 12,
};

test('condominium gallery supports directional touch swipes and keeps pinch zoom enabled', () => {
  const { getByRole } = render(
    React.createElement(CondominiumDetailModal, {
      condominium,
      onClose: () => {},
    }),
  );
  const galleryTrigger = getByRole('button', { name: 'Mostrar todas as 2 fotos' });
  const detailPhotoAction = getByRole('button', {
    name: 'Ampliar foto do condomínio Residencial Lago Azul',
  });
  assert.match(galleryTrigger.className, /text-sm/);
  galleryTrigger.focus();
  fireEvent.click(galleryTrigger);

  const gallery = getByRole('dialog', {
    name: 'Galeria de fotos do condomínio Residencial Lago Azul',
  });
  const touchSurface = gallery.querySelector<HTMLElement>('[style*="pan-x"]');
  assert.ok(touchSurface);
  assert.equal(touchSurface.style.touchAction, 'pan-x pan-y pinch-zoom');
  assert.equal(gallery.querySelector('[aria-live="polite"]')?.getAttribute('aria-atomic'), 'true');
  assert.match(getByRole('button', { name: 'Fechar galeria' }).className, /h-11 w-11/);
  assert.match(getByRole('button', { name: 'Foto anterior' }).className, /h-11 w-11/);
  assert.match(getByRole('button', { name: 'Próxima foto' }).className, /h-11 w-11/);

  fireEvent.touchStart(touchSurface, {
    touches: [{ identifier: 1, clientX: 240, clientY: 140 }],
  });
  fireEvent.touchEnd(touchSurface, {
    changedTouches: [{ identifier: 1, clientX: 120, clientY: 145 }],
  });
  assert.equal(gallery.querySelector('img')?.alt, 'Residencial Lago Azul — foto 2 do condomínio');
  assert.match(gallery.textContent || '', /2 de 2 fotos do condomínio/);

  fireEvent.touchStart(touchSurface, {
    touches: [{ identifier: 1, clientX: 120, clientY: 140 }],
  });
  fireEvent.touchEnd(touchSurface, {
    changedTouches: [{ identifier: 1, clientX: 124, clientY: 220 }],
  });
  assert.equal(gallery.querySelector('img')?.alt, 'Residencial Lago Azul — foto 2 do condomínio');

  fireEvent.touchStart(touchSurface, {
    touches: [
      { identifier: 1, clientX: 120, clientY: 140 },
      { identifier: 2, clientX: 220, clientY: 140 },
    ],
  });
  fireEvent.touchEnd(touchSurface, {
    changedTouches: [{ identifier: 1, clientX: 80, clientY: 140 }],
  });
  assert.equal(gallery.querySelector('img')?.alt, 'Residencial Lago Azul — foto 2 do condomínio');

  fireEvent.touchStart(touchSurface, {
    touches: [{ identifier: 1, clientX: 120, clientY: 140 }],
  });
  fireEvent.touchEnd(touchSurface, {
    changedTouches: [{ identifier: 1, clientX: 220, clientY: 145 }],
  });
  assert.equal(gallery.querySelector('img')?.alt, 'Residencial Lago Azul — foto 1 do condomínio');

  const nextPhotoButton = getByRole('button', { name: 'Próxima foto' });
  fireEvent.touchStart(nextPhotoButton, {
    touches: [{ identifier: 1, clientX: 240, clientY: 140 }],
  });
  fireEvent.touchEnd(touchSurface, {
    changedTouches: [{ identifier: 1, clientX: 120, clientY: 145 }],
  });
  assert.equal(gallery.querySelector('img')?.alt, 'Residencial Lago Azul — foto 1 do condomínio');
  fireEvent.click(nextPhotoButton);
  assert.equal(gallery.querySelector('img')?.alt, 'Residencial Lago Azul — foto 2 do condomínio');

  fireEvent.keyDown(getByRole('button', { name: 'Fechar galeria' }), { key: 'Escape' });
  assert.equal(
    screen.queryByRole('dialog', {
      name: 'Galeria de fotos do condomínio Residencial Lago Azul',
    }),
    null,
  );
  assert.equal(document.activeElement, galleryTrigger);
  assert.ok(detailPhotoAction);
});
