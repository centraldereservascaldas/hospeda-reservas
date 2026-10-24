import assert from 'node:assert/strict';
import test from 'node:test';
import { focusWithoutScrolling } from '../src/utils/focus.ts';

test('restores keyboard focus without changing the saved scroll position', () => {
  let receivedOptions: Parameters<HTMLElement['focus']>[0] | undefined;
  const target: Pick<HTMLElement, 'focus'> = {
    focus: (options) => {
      receivedOptions = options;
    },
  };

  focusWithoutScrolling(target);

  assert.deepEqual(receivedOptions, { preventScroll: true });
});

test('ignores a missing focus target', () => {
  assert.doesNotThrow(() => focusWithoutScrolling(null));
});
