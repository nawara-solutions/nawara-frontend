// Determinism proof (ADR-0003 §1, §10): two independent builds, in separate processes with a different working
// directory, timezone and locale, must produce byte-identical artifacts free of environment-dependent content.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { OUTPUT_FILES } from '../scripts/lib/build.mjs';
import { PACKAGE_DIR, tempDir } from './helpers.mjs';

const BUILD = join(PACKAGE_DIR, 'scripts', 'build.mjs');

function buildIn(outDir, cwd, env) {
  const result = spawnSync(process.execPath, [BUILD, '--out', outDir], {
    cwd,
    env: { PATH: process.env.PATH, ...env },
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  return Object.fromEntries(
    readdirSync(outDir)
      .sort()
      .map((name) => [name, readFileSync(join(outDir, name))]),
  );
}

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');

describe('deterministic generation', () => {
  it('produces byte-identical artifacts across processes, directories, timezones and locales', () => {
    const a = tempDir('nawara-tokens-a-');
    const b = tempDir('nawara-tokens-b-');
    try {
      const first = buildIn(join(a.dir, 'dist'), PACKAGE_DIR, {
        TZ: 'UTC',
        LANG: 'C',
        LC_ALL: 'C',
      });
      const second = buildIn(join(b.dir, 'out'), b.dir, {
        TZ: 'Pacific/Kiritimati',
        LANG: 'tr_TR.UTF-8',
        LC_ALL: 'tr_TR.UTF-8',
      });
      assert.deepEqual(Object.keys(first), [...OUTPUT_FILES].sort());
      assert.deepEqual(Object.keys(second), Object.keys(first));
      for (const name of Object.keys(first)) {
        assert.equal(sha256(second[name]), sha256(first[name]), `${name} differs between builds`);
        assert.ok(first[name].equals(second[name]), `${name} bytes differ`);
      }

      for (const [name, buffer] of Object.entries(first)) {
        const text = buffer.toString('utf8');
        assert.equal(Buffer.from(text, 'utf8').equals(buffer), true, `${name} is valid UTF-8`);
        assert.doesNotMatch(text, /\r/, `${name} uses LF only`);
        assert.ok(
          text.endsWith('\n') && !text.endsWith('\n\n'),
          `${name} ends with exactly one newline`,
        );
        assert.doesNotMatch(text, /\t/, `${name} is indented with spaces`);
        for (const path of [PACKAGE_DIR, a.dir, b.dir, '/tmp/', '/home/'])
          assert.ok(!text.includes(path), `${name} contains the path ${path}`);
        assert.doesNotMatch(
          text,
          /\b\d{4}-\d{2}-\d{2}(T|\b)|\b\d{2}:\d{2}:\d{2}\b/,
          `${name} contains a date or time`,
        );
      }
    } finally {
      a.cleanup();
      b.cleanup();
    }
  });
});
