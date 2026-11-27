import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const stylesheet = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');

test('hero search keeps the guest controls clear at tablet widths', () => {
  const tabletStyles = stylesheet.match(
    /@media \(min-width: 640px\) and \(max-width: 839px\) \{([\s\S]*?)\n\}/,
  )?.[1];

  assert.ok(tabletStyles, 'tablet search styles should cover the constrained 640–839px range');
  assert.match(tabletStyles, /\[data-search-segment='guests'\]/);
  assert.match(tabletStyles, /width: 3rem/);
  assert.match(tabletStyles, /display: none/);
  assert.match(tabletStyles, /text-overflow: ellipsis/);
  assert.match(tabletStyles, /white-space: nowrap/);
});
