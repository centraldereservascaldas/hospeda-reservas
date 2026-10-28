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
const { render, cleanup, screen } = await import('@testing-library/react');
const { CreateListingModal } = await import('../src/components/owner/CreateListingModal.tsx');

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

test('listing form exposes a named modal and touch-sized inputs, photo choices, and actions', () => {
  const { getByRole } = render(
    React.createElement(CreateListingModal, {
      isOpen: true,
      onClose: () => {},
      onAddProperty: () => {},
      currency: 'BRL',
    }),
  );

  const dialog = getByRole('dialog', { name: 'Anunciar Nova Acomodação' });
  assert.ok(dialog);
  assert.match(
    dialog.parentElement?.className || '',
    /pt-\[max\(2rem,env\(safe-area-inset-top,0px\)\)\]/,
  );
  assert.match(
    dialog.parentElement?.className || '',
    /pb-\[max\(2rem,env\(safe-area-inset-bottom,0px\)\)\]/,
  );
  assert.ok(screen.getByRole('button', { name: 'Fechar formulário de anúncio' }));

  const controls = [
    screen.getByLabelText('Título atrativo do anúncio *'),
    screen.getByLabelText('Categoria'),
    screen.getByLabelText('Cidade'),
    screen.getByLabelText('Estado'),
    screen.getByLabelText('Preço por noite (BRL)'),
    screen.getByLabelText('Taxa de limpeza (BRL)'),
    screen.getByLabelText(/QUARTOS/i),
    screen.getByLabelText(/CAMAS/i),
    screen.getByLabelText(/BANHOS/i),
    screen.getByLabelText(/HÓSPEDES/i),
    screen.getByLabelText('URL da foto principal personalizada'),
    screen.getByLabelText('Descrição do espaço'),
  ];
  for (const control of controls) {
    assert.match(control.className, /min-h-11/);
  }

  const photoButtons = screen.getAllByRole('button', { name: /^Selecionar foto:/ });
  assert.equal(photoButtons.length, 5);
  assert.ok(photoButtons.every((button) => button.className.includes('min-h-11')));
  assert.ok(screen.getByRole('button', { name: 'Cancelar' }));
  assert.ok(screen.getByRole('button', { name: 'Publicar Anúncio' }));
});
