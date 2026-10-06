// Tests of the release preflight (`npm run test:repo`): each rule rejects what ADR-0004 forbids and accepts what it allows.
// The end-to-end cases pack a throwaway package with the real `npm pack`; nothing is ever published.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { runReleaseCheck } from './check-release.mjs';
import { GITHUB_PACKAGES_REGISTRY } from './lib/checks.mjs';
import {
  REPOSITORY_URL,
  checkChangelog,
  checkPublishableManifest,
  checkTarball,
  distTagOf,
  parseReleaseTag,
  releaseTagOf,
} from './lib/release.mjs';

const PATH = 'packages/foundation/example';
const publishable = (overrides = {}) => ({
  name: '@nawara-solutions/example',
  version: '1.2.3',
  license: 'UNLICENSED',
  repository: { type: 'git', url: REPOSITORY_URL, directory: PATH },
  publishConfig: { registry: GITHUB_PACKAGES_REGISTRY },
  files: ['dist'],
  ...overrides,
});

describe('release tags', () => {
  it('parses <dir>-v<semver>, including pre-releases and hyphenated directories', () => {
    assert.deepEqual(parseReleaseTag('design-tokens-v0.1.0'), {
      dir: 'design-tokens',
      version: '0.1.0',
    });
    assert.deepEqual(parseReleaseTag('angular-ui-v2.0.0-rc.1'), {
      dir: 'angular-ui',
      version: '2.0.0-rc.1',
    });
    assert.equal(releaseTagOf('design-tokens', '0.1.0'), 'design-tokens-v0.1.0');
  });

  it('rejects other shapes', () => {
    for (const tag of [
      'v0.1.0',
      'design-tokens-0.1.0',
      'design-tokens-v0.1',
      'design-tokens-v01.0.0',
      'Design-v1.0.0',
      'x-v1.0.0+build',
      '',
    ]) {
      assert.equal(parseReleaseTag(tag), null, tag);
    }
  });

  it('publishes pre-releases under next and releases under latest', () => {
    assert.equal(distTagOf('1.0.0'), 'latest');
    assert.equal(distTagOf('1.0.0-beta.2'), 'next');
  });
});

describe('publishable manifest', () => {
  it('accepts a GitHub Packages package and ignores private ones', () => {
    assert.deepEqual(checkPublishableManifest(publishable(), PATH), []);
    assert.deepEqual(checkPublishableManifest({ private: true }, PATH), []);
  });

  it('rejects public npm, extra publishConfig, wrong repository, missing files, version or license', () => {
    const cases = [
      [{ publishConfig: undefined }, /publishConfig.registry/],
      [{ publishConfig: { registry: 'https://registry.npmjs.org' } }, /publishConfig.registry/],
      [
        { publishConfig: { registry: GITHUB_PACKAGES_REGISTRY, access: 'public' } },
        /may only set "registry"/,
      ],
      [{ name: '@nawara/example' }, /scoped @nawara-solutions/],
      [{ version: '1.2' }, /not SemVer/],
      [
        { repository: { url: REPOSITORY_URL, directory: 'packages/foundation/other' } },
        /repository must be/,
      ],
      [{ files: [] }, /lists the files/],
      [{ license: undefined }, /license/],
    ];
    for (const [override, expected] of cases) {
      const problems = checkPublishableManifest(publishable(override), PATH);
      assert.ok(
        problems.some((p) => expected.test(p)),
        `${JSON.stringify(override)}: ${problems}`,
      );
    }
  });
});

describe('changelog', () => {
  it('requires a section for the version, and a date before release', () => {
    assert.deepEqual(checkChangelog('## 1.2.3 (unreleased)\n', '1.2.3', { released: false }), []);
    assert.deepEqual(checkChangelog('## 1.2.3 (2026-10-06)\n', '1.2.3', { released: true }), []);
    assert.match(
      checkChangelog('## 1.2.3 (unreleased)\n', '1.2.3', { released: true })[0],
      /YYYY-MM-DD/,
    );
    assert.match(
      checkChangelog('## 1.2.30 (2026-10-06)\n', '1.2.3', { released: false })[0],
      /no "## 1.2.3"/,
    );
    assert.match(checkChangelog('', '1.2.3', { released: false })[0], /no "## 1.2.3"/);
  });
});

describe('tarball contents', () => {
  const manifest = publishable();
  const pkgJson = JSON.stringify({ name: manifest.name, version: manifest.version });

  it('accepts plain package files', () => {
    assert.deepEqual(
      checkTarball({ 'package.json': pkgJson, 'dist/a.css': ':root{}' }, manifest),
      [],
    );
  });

  it('rejects registry configuration, environment files, keys and nested archives', () => {
    for (const path of [
      '.npmrc',
      'dist/.env',
      '.env.production',
      'certs/site.pem',
      'id.key',
      'old.tgz',
      'node_modules/x/index.js',
    ]) {
      const problems = checkTarball({ 'package.json': pkgJson, [path]: '' }, manifest);
      assert.ok(
        problems.some((p) => p.includes(path)),
        `${path}: ${problems}`,
      );
    }
  });

  it('rejects credential-shaped content', () => {
    const secrets = [
      `ghp_${'a'.repeat(36)}`,
      `github_pat_${'A'.repeat(30)}`,
      `npm_${'b'.repeat(36)}`,
      '//npm.pkg.github.com/:_authToken=xyz',
      '-----BEGIN OPENSSH PRIVATE KEY-----',
    ];
    for (const secret of secrets) {
      const problems = checkTarball(
        { 'package.json': pkgJson, 'dist/x.js': `const t = "${secret}";` },
        manifest,
      );
      assert.ok(
        problems.some((p) => p.startsWith('tarball: dist/x.js contains')),
        secret,
      );
    }
  });

  it('rejects a tarball of another package or version', () => {
    const other = JSON.stringify({ name: manifest.name, version: '9.9.9' });
    assert.match(
      checkTarball({ 'package.json': other }, manifest)[0],
      /expected @nawara-solutions\/example@1.2.3/,
    );
  });
});

describe('runReleaseCheck end to end (real npm pack, never published)', () => {
  const fixture = (manifestOverrides = {}, changelog = '## 1.2.3 (2026-10-06)\n', extra = {}) => {
    const root = mkdtempSync(join(tmpdir(), 'nawara-release-test-'));
    const dir = join(root, PATH);
    mkdirSync(join(dir, 'dist'), { recursive: true });
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify(publishable(manifestOverrides), null, 2),
    );
    writeFileSync(join(dir, 'CHANGELOG.md'), changelog);
    writeFileSync(join(dir, 'dist', 'tokens.css'), ':root { --x: 1px; }\n');
    for (const [rel, text] of Object.entries(extra)) writeFileSync(join(dir, rel), text);
    return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
  };

  it('passes a clean package and, for a matching tag, keeps the checked tarball', () => {
    const { root, cleanup } = fixture();
    try {
      assert.deepEqual(runReleaseCheck(root).problems, []);
      const out = join(root, 'out');
      const result = runReleaseCheck(root, { tag: 'example-v1.2.3', packDestination: out });
      assert.deepEqual(result.problems, []);
      assert.equal(result.release.name, '@nawara-solutions/example');
      assert.equal(result.release.distTag, 'latest');
      assert.ok(readFileSync(result.release.tarball).length > 0);
    } finally {
      cleanup();
    }
  });

  it('refuses a tag whose version differs from the manifest, or an undated changelog', () => {
    const { root, cleanup } = fixture({}, '## 1.2.3 (unreleased)\n');
    try {
      assert.match(
        runReleaseCheck(root, { tag: 'example-v1.2.4', packDestination: join(root, 'o') })
          .problems[0],
        /is at 1.2.3/,
      );
      assert.match(
        runReleaseCheck(root, { tag: 'example-v1.2.3', packDestination: join(root, 'o') })
          .problems[0],
        /YYYY-MM-DD/,
      );
      assert.match(
        runReleaseCheck(root, { tag: 'missing-v1.0.0', packDestination: join(root, 'o') })
          .problems[0],
        /no workspace package/,
      );
    } finally {
      cleanup();
    }
  });

  it('refuses a private package for release, and a tarball that ships a credential', () => {
    const priv = fixture({ private: true });
    try {
      assert.match(
        runReleaseCheck(priv.root, { tag: 'example-v1.2.3', packDestination: join(priv.root, 'o') })
          .problems[0],
        /private/,
      );
    } finally {
      priv.cleanup();
    }
    const leaky = fixture({}, undefined, {
      'dist/config.js': `export const token = "ghp_${'z'.repeat(36)}";\n`,
    });
    try {
      assert.ok(
        runReleaseCheck(leaky.root).problems.some((p) =>
          /dist\/config.js contains a GitHub token/.test(p),
        ),
      );
    } finally {
      leaky.cleanup();
    }
  });
});
