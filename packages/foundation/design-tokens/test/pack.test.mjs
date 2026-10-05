// Packaging and consumer proof (ADR-0002, ADR-0003 §8–§9): the real `npm pack` tarball contains exactly the public
// artifacts, and a consumer that installs it (offline, no install scripts) resolves every export and compiles Sass
// through `pkg:` with no includePaths. Nothing is published.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import * as sass from 'sass';
import { PACKAGE_DIR, PACKAGE_JSON, PACKED_FILES, tempDir, verifyPackedFiles } from './helpers.mjs';

const npm = (args, cwd) => {
  const result = spawnSync('npm', args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, npm_config_update_notifier: 'false' },
  });
  assert.equal(result.status, 0, `npm ${args.join(' ')} failed:\n${result.stderr}`);
  return result.stdout;
};

describe('npm pack and consumer', () => {
  let work;
  let packed;
  let consumer;
  let resolveFrom;

  before(() => {
    work = tempDir('nawara-tokens-pack-');
    execFileSync(process.execPath, [join(PACKAGE_DIR, 'scripts', 'build.mjs')], {
      cwd: PACKAGE_DIR,
    });
    [packed] = JSON.parse(
      npm(['pack', '--json', '--ignore-scripts', '--pack-destination', work.dir], PACKAGE_DIR),
    );
    consumer = join(work.dir, 'consumer');
    mkdirSync(consumer);
    writeFileSync(
      join(consumer, 'package.json'),
      '{ "name": "tokens-consumer-probe", "version": "0.0.0", "private": true }\n',
    );
    npm(
      [
        'install',
        join(work.dir, packed.filename),
        '--ignore-scripts',
        '--offline',
        '--no-audit',
        '--no-fund',
        '--cache',
        join(work.dir, 'cache'),
      ],
      consumer,
    );
    resolveFrom = createRequire(join(consumer, 'package.json'));
  });

  after(() => work?.cleanup());

  it('packs exactly the public files, with every export target present', () => {
    const files = packed.files.map((f) => f.path).sort();
    assert.deepEqual(files, [...PACKED_FILES].sort());
    assert.deepEqual(verifyPackedFiles(files, PACKAGE_JSON), []);
    assert.equal(packed.name, '@nawara-solutions/design-tokens');
    assert.equal(packed.version, PACKAGE_JSON.version);
  });

  it('resolves the CSS, manifest and package.json exports from the installed tarball', () => {
    const css = resolveFrom.resolve('@nawara-solutions/design-tokens/tokens.css');
    assert.equal(
      readFileSync(css, 'utf8'),
      readFileSync(join(PACKAGE_DIR, 'dist', 'tokens.css'), 'utf8'),
    );
    const manifest = JSON.parse(
      readFileSync(resolveFrom.resolve('@nawara-solutions/design-tokens/manifest.json'), 'utf8'),
    );
    assert.equal(manifest.tokens.length, 101);
    assert.equal(
      JSON.parse(
        readFileSync(resolveFrom.resolve('@nawara-solutions/design-tokens/package.json'), 'utf8'),
      ).version,
      PACKAGE_JSON.version,
    );
  });

  it('exposes nothing internal: source, generator, tests and the package root are not exported', () => {
    for (const path of [
      '',
      '/src/nawara.resolver.json',
      '/scripts/build.mjs',
      '/test/helpers.mjs',
      '/dist/tokens.css',
    ]) {
      assert.throws(
        () => resolveFrom.resolve(`@nawara-solutions/design-tokens${path}`),
        /ERR_PACKAGE_PATH_NOT_EXPORTED|No "exports" main defined/,
        path || '<root>',
      );
    }
  });

  it('compiles a Sass probe through pkg: with no includePaths', () => {
    const importers = [new sass.NodePackageImporter(consumer)];
    const probe =
      "@use 'pkg:@nawara-solutions/design-tokens/breakpoints' as bp;\n.probe { @include bp.from(tablet) { display: grid; } @include bp.from(wide) { gap: 1rem; } }\n";
    const { css } = sass.compileString(probe, { importers });
    assert.match(css, /@media \(min-width: 37\.5em\)/);
    assert.match(css, /@media \(min-width: 100em\)/);
    assert.throws(
      () =>
        sass.compileString(
          "@use 'pkg:@nawara-solutions/design-tokens/breakpoints' as bp;\n.x { @include bp.from(huge) { a: b; } }\n",
          { importers },
        ),
      /Unknown breakpoint `huge`/,
    );
  });

  it('fails the tarball check when an export target or required file is missing', () => {
    const missing = PACKED_FILES.filter((f) => f !== 'dist/manifest.json');
    const problems = verifyPackedFiles(missing, PACKAGE_JSON);
    assert.ok(problems.includes('missing dist/manifest.json'));
    assert.ok(problems.includes('export target ./dist/manifest.json is not in the tarball'));
    assert.ok(
      verifyPackedFiles([...PACKED_FILES, 'src/nawara.resolver.json'], PACKAGE_JSON).includes(
        'unexpected src/nawara.resolver.json',
      ),
    );
  });
});
