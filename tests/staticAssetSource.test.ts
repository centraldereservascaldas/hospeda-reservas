import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

function resolveImage(
  application: Record<string, string>,
  options: { uuid?: string; digest?: string } = {},
) {
  const dir = mkdtempSync(join(tmpdir(), 'crcn-asset-source-'));
  try {
    const bin = join(dir, 'bin');
    mkdirSync(bin);
    writeFileSync(join(bin, 'curl'), '#!/bin/sh\nprintf "%s" "$CRCN_FAKE_APPLICATION"\n', {
      mode: 0o755,
    });
    writeFileSync(
      join(bin, 'docker'),
      '#!/bin/sh\nprintf "{\\"digest\\":\\"%s\\"}" "$CRCN_FAKE_DIGEST"\n',
      { mode: 0o755 },
    );
    const workflow = readFileSync('.github/workflows/release-image.yml', 'utf8');
    const body = workflow
      .split('        id: previous-assets\n')[1]!
      .split('        run: |\n')[1]!
      .split('\n      - name:')[0]!;
    const script = join(dir, 'resolve.sh');
    writeFileSync(
      script,
      body
        .split('\n')
        .map((line) => line.replace(/^ {10}/, ''))
        .join('\n'),
    );
    const output = join(dir, 'output');
    let failed = false;
    try {
      execFileSync('/bin/bash', [script], {
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH}`,
          COOLIFY_APPLICATION_UUID: options.uuid ?? 'test-app',
          COOLIFY_TOKEN: 'test-only',
          GITHUB_REPOSITORY: 'CentralDeReservasCaldas/Hospeda-Reservas',
          GITHUB_OUTPUT: output,
          CRCN_FAKE_APPLICATION: JSON.stringify(application),
          CRCN_FAKE_DIGEST: options.digest ?? `sha256:${'a'.repeat(64)}`,
        },
        stdio: 'pipe',
      });
    } catch {
      failed = true;
    }
    return { failed, output: existsSync(output) ? readFileSync(output, 'utf8') : '' };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('pins the previous application image to its immutable registry digest', () => {
  const result = resolveImage({
    docker_registry_image_name: 'ghcr.io/centraldereservascaldas/hospeda-reservas',
    docker_registry_image_tag: 'b'.repeat(40),
  });
  assert.equal(result.failed, false);
  assert.equal(
    result.output,
    `image=ghcr.io/centraldereservascaldas/hospeda-reservas@sha256:${'a'.repeat(64)}\n`,
  );
});

test('allows a bootstrap build without a previous configured application', () => {
  assert.deepEqual(resolveImage({}, { uuid: '' }), { failed: false, output: 'image=frontend\n' });
});

test('supports the legacy SHA-prefixed tag after resolving it to a digest', () => {
  const result = resolveImage({
    docker_registry_image_name: 'ghcr.io/centraldereservascaldas/hospeda-reservas',
    docker_registry_image_tag: `sha-${'b'.repeat(40)}`,
  });
  assert.equal(result.failed, false);
  assert.match(result.output, /@sha256:/);
});

test('rejects an unexpected repository, mutable tag or malformed digest', () => {
  const valid = {
    docker_registry_image_name: 'ghcr.io/centraldereservascaldas/hospeda-reservas',
    docker_registry_image_tag: 'b'.repeat(40),
  };
  for (const [app, options] of [
    [{ ...valid, docker_registry_image_name: 'other.example/not-this-project' }, {}],
    [{ ...valid, docker_registry_image_tag: 'latest' }, {}],
    [valid, { digest: 'invalid' }],
    [valid, { uuid: 'bad/app' }],
  ] as const) {
    const result = resolveImage(app, options);
    assert.equal(result.failed, true, JSON.stringify({ app, options, result }));
    assert.equal(result.output, '');
  }
});
