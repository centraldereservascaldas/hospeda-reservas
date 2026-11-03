import assert from 'node:assert/strict';
import test from 'node:test';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
  utimesSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'crcn-assets-'));
  const previous = join(dir, 'previous');
  const current = join(dir, 'current');
  const output = join(dir, 'out');
  mkdirSync(previous);
  mkdirSync(current);
  const merge = () =>
    execFileSync(
      process.execPath,
      [resolve('docker/merge-static-assets.mjs'), previous, current, output],
      { stdio: 'pipe' },
    );
  const clean = () => rmSync(dir, { recursive: true, force: true });
  return { previous, current, output, merge, clean };
}

test('keeps the active previous release and its lazy imports even when its build is old', () => {
  const f = fixture();
  try {
    writeFileSync(join(f.previous, 'index-previous.js'), 'import("./lazy-previous.js")');
    writeFileSync(join(f.previous, 'lazy-previous.js'), 'export const version = 1;');
    utimesSync(
      join(f.previous, 'index-previous.js'),
      new Date('2000-01-01'),
      new Date('2000-01-01'),
    );
    writeFileSync(join(f.current, 'index-current.js'), 'export const version = 2;');
    f.merge();
    assert.equal(
      readFileSync(join(f.output, 'lazy-previous.js'), 'utf8'),
      'export const version = 1;',
    );
    assert.ok(existsSync(join(f.output, 'index-previous.js')));
    assert.ok(existsSync(join(f.output, 'index-current.js')));
    const manifest = JSON.parse(readFileSync(join(f.output, '.retained-assets.json'), 'utf8'));
    assert.deepEqual(manifest.current, ['index-current.js']);
    assert.ok(manifest.retained['index-previous.js'] > Date.now());
  } finally {
    f.clean();
  }
});

test('expires old inherited releases without extending their original retention deadline', () => {
  const f = fixture();
  try {
    const expiry = Date.now() + 100_000;
    writeFileSync(join(f.previous, 'old-expired.js'), 'expired');
    writeFileSync(join(f.previous, 'old-valid.js'), 'valid');
    writeFileSync(
      join(f.previous, '.retained-assets.json'),
      JSON.stringify({
        version: 1,
        current: [],
        retained: { 'old-expired.js': 1, 'old-valid.js': expiry },
      }),
    );
    writeFileSync(join(f.current, 'index-current.js'), 'current');
    f.merge();
    assert.equal(existsSync(join(f.output, 'old-expired.js')), false);
    const manifest = JSON.parse(readFileSync(join(f.output, '.retained-assets.json'), 'utf8'));
    assert.equal(manifest.retained['old-valid.js'], expiry);
  } finally {
    f.clean();
  }
});

test('rejects a changed payload at the same immutable asset URL', () => {
  const f = fixture();
  try {
    writeFileSync(join(f.previous, 'same-abcdefgh.js'), 'old');
    writeFileSync(join(f.current, 'same-abcdefgh.js'), 'changed');
    assert.throws(f.merge, /Immutable asset collision/);
    assert.equal(existsSync(f.output), false);
  } finally {
    f.clean();
  }
});

test('rejects traversal in a previous manifest and does not write output', () => {
  const f = fixture();
  try {
    writeFileSync(
      join(f.previous, '.retained-assets.json'),
      JSON.stringify({ version: 1, current: ['../private'], retained: {} }),
    );
    writeFileSync(join(f.current, 'index-current.js'), 'current');
    assert.throws(f.merge, /Invalid previous asset manifest/);
    assert.equal(existsSync(f.output), false);
  } finally {
    f.clean();
  }
});
