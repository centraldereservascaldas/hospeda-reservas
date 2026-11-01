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
const { CondominiumDirectory } =
  await import('../src/components/condominium/CondominiumDirectory.tsx');

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

const condominium = {
  id: 'residencial-lago-azul',
  name: 'Residencial Lago Azul',
  description:
    'Condomínio familiar com piscinas termais, áreas de descanso, jardins e acesso prático às principais atrações de Caldas Novas.',
  images: ['https://example.com/piscina.jpg', 'https://example.com/jardim.jpg'],
  accommodationCount: 12,
};

test('directory keeps descriptive text readable and photo/detail controls touch sized', () => {
  const { container } = render(
    React.createElement(CondominiumDirectory, {
      condominiums: [condominium],
      onSelectCondominium: () => {},
    }),
  );

  assert.ok(screen.getByRole('region', { name: 'Condomínios de Caldas Novas' }));
  assert.match(screen.getByText(condominium.description).className, /text-sm/);

  const detailButton = screen.getByRole('button', { name: 'Ver detalhes do condomínio' });
  assert.match(detailButton.className, /min-h-11/);
  assert.match(detailButton.className, /text-sm/);

  const nextPhoto = screen.getByRole('button', { name: 'Próxima foto de Residencial Lago Azul' });
  assert.match(nextPhoto.className, /h-11 w-11/);
  fireEvent.click(nextPhoto);
  assert.ok(screen.getByText('2 / 2'));
  assert.equal(container.querySelector('img')?.getAttribute('src'), condominium.images[1]);
  assert.equal(
    container.querySelector('img')?.getAttribute('alt'),
    'Residencial Lago Azul — foto 2 do condomínio',
  );
});

test('directory exposes an explanatory empty state when no condominium data is available', () => {
  render(
    React.createElement(CondominiumDirectory, {
      condominiums: [],
      onSelectCondominium: () => {},
    }),
  );

  assert.ok(screen.getByRole('heading', { name: 'Nenhum condomínio disponível no momento' }));
  assert.match(screen.getByText(/associados a acomodações ativas/).textContent || '', /ativas/);
});

test('directory swipes photos without opening details and preserves vertical scrolling taps', () => {
  const selectedCondominiums: string[] = [];
  const { container } = render(
    React.createElement(CondominiumDirectory, {
      condominiums: [condominium],
      onSelectCondominium: (selected) => selectedCondominiums.push(selected.id),
    }),
  );
  const detailTrigger = screen.getByRole('button', {
    name: 'Ver detalhes de Residencial Lago Azul',
  });

  fireEvent.touchStart(detailTrigger, {
    touches: [{ identifier: 1, clientX: 240, clientY: 120 }],
  });
  fireEvent.touchEnd(detailTrigger, {
    changedTouches: [{ identifier: 1, clientX: 120, clientY: 124 }],
  });
  assert.equal(container.querySelector('img')?.getAttribute('src'), condominium.images[1]);
  assert.equal(
    container.querySelector('img')?.getAttribute('alt'),
    'Residencial Lago Azul — foto 2 do condomínio',
  );
  assert.ok(screen.getByText('2 / 2'));
  fireEvent.click(detailTrigger);
  assert.deepEqual(selectedCondominiums, []);

  fireEvent.touchStart(detailTrigger, {
    touches: [{ identifier: 1, clientX: 120, clientY: 120 }],
  });
  fireEvent.touchEnd(detailTrigger, {
    changedTouches: [{ identifier: 1, clientX: 124, clientY: 190 }],
  });
  fireEvent.click(detailTrigger);
  assert.deepEqual(selectedCondominiums, [condominium.id]);
});

test('offers a crawlable condominium page while keeping the details modal available', () => {
  render(
    React.createElement(CondominiumDirectory, {
      condominiums: [{ ...condominium, pageUrl: '/condominios/property-1' }],
      onSelectCondominium: () => {},
    }),
  );
  assert.equal(
    screen.getByRole('link', { name: 'Ver condomínio e acomodações' }).getAttribute('href'),
    '/condominios/property-1',
  );
  assert.ok(screen.getByRole('button', { name: 'Ver detalhes de Residencial Lago Azul' }));
});
