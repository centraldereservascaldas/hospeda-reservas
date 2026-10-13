import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const stylesheet = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
const reducedMotionRules = stylesheet.match(
  /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*?)\n\}/,
);

test('reduced motion disables animation and minimizes transitions and scrolling', () => {
  assert.ok(reducedMotionRules, 'a reduced-motion media query is present');
  assert.match(reducedMotionRules[1], /animation:\s*none\s*!important/);
  assert.match(reducedMotionRules[1], /transition-duration:\s*0\.01ms\s*!important/);
  assert.match(reducedMotionRules[1], /scroll-behavior:\s*auto\s*!important/);
  assert.match(
    stylesheet,
    /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.category-filter-track\s*\{\s*will-change:\s*auto;/,
  );
});
