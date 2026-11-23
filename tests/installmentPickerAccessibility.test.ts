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
const { InstallmentPicker } = await import('../src/components/booking/InstallmentPicker.tsx');
afterEach(cleanup);

test('parcelamento anuncia a opção selecionada e fecha ao sair pelo teclado', () => {
  function Example() {
    const [value, setValue] = React.useState(1);
    return React.createElement(
      'div',
      null,
      React.createElement('span', { id: 'installments-label' }, 'Parcelamento'),
      React.createElement(InstallmentPicker, {
        labelledBy: 'installments-label',
        value,
        onChange: setValue,
        options: [
          { installments: 1, label: '1x de R$ 100,00' },
          { installments: 2, label: '2x de R$ 55,00' },
        ],
      }),
      React.createElement('button', { type: 'button' }, 'Continuar'),
    );
  }
  const view = render(React.createElement(Example));
  const trigger = view.getByRole('button', { name: 'Parcelamento 1x de R$ 100,00' });
  fireEvent.click(trigger);
  fireEvent.click(view.getByRole('option', { name: '2x de R$ 55,00' }));
  assert.equal(view.getByRole('button', { name: 'Parcelamento 2x de R$ 55,00' }), trigger);
  fireEvent.click(trigger);
  const option = view.getByRole('option', { name: '2x de R$ 55,00' });
  const next = view.getByRole('button', { name: 'Continuar' });
  fireEvent.blur(option, { relatedTarget: next });
  assert.equal(view.queryByRole('listbox'), null);
  assert.equal(trigger.getAttribute('aria-expanded'), 'false');
});

test('bloqueio fecha o menu aberto e impede alterar a parcela', () => {
  let changes = 0;
  const options = [
    { installments: 1, label: '1x de R$ 100,00' },
    { installments: 2, label: '2x de R$ 55,00' },
  ];
  const props = {
    options,
    value: 1,
    onChange: () => {
      changes += 1;
    },
  };
  const view = render(React.createElement(InstallmentPicker, props));
  const trigger = view.getByRole('button', { name: '1x de R$ 100,00' });
  fireEvent.click(trigger);
  const option = view.getByRole('option', { name: '2x de R$ 55,00' });

  view.rerender(React.createElement(InstallmentPicker, { ...props, disabled: true }));
  assert.equal(view.queryByRole('listbox'), null);
  assert.equal(trigger.getAttribute('aria-expanded'), 'false');
  assert.equal((trigger as HTMLButtonElement).disabled, true);
  fireEvent.click(option);
  assert.equal(changes, 0);

  view.rerender(React.createElement(InstallmentPicker, props));
  assert.equal(view.queryByRole('listbox'), null);
});
