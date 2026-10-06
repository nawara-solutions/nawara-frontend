// Tests of the repository checks themselves (`npm run test:repo`): each rule must reject what it forbids and accept what
// it allows, so a passing `check:repo` means something.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, it } from 'node:test';
import { runChecks } from './check-repo.mjs';
import {
  GITHUB_PACKAGES_REGISTRY,
  SHARED_STANDARD,
  checkActionPins,
  checkCycles,
  checkPackageManifest,
  checkPolicyDiscoverable,
  checkClaudeSettings,
  checkRootManifest,
  checkSharedStandard,
  checkSourceFile,
  checkTokenSourceStyles,
  checkTrackedGenerated,
  packageOf,
} from './lib/checks.mjs';

const VALID_SETTINGS = readFileSync(new URL('../.claude/settings.json', import.meta.url), 'utf8');

const TOKENS = '@nawara-solutions/design-tokens';
const UI = '@nawara-solutions/angular-ui';
const LAYERS_OF = { [TOKENS]: 'foundation', [UI]: 'angular' };

const manifest = (layer, dir, extra = {}) => ({
  layer,
  dir,
  manifest: {
    name: extra.name ?? `@nawara-solutions/${layer === 'angular' ? 'angular-' : ''}${dir}`,
    private: true,
    ...extra,
  },
});

describe('checkPackageManifest', () => {
  it('accepts a framework-independent foundation package', () => {
    assert.deepEqual(checkPackageManifest(manifest('foundation', 'design-tokens'), LAYERS_OF), []);
  });

  it('accepts an Angular package that depends on a foundation package and peers on Angular', () => {
    const pkg = manifest('angular', 'ui', {
      dependencies: { [TOKENS]: '0.1.0' },
      peerDependencies: { '@angular/core': '^22.2.0' },
    });
    assert.deepEqual(checkPackageManifest(pkg, LAYERS_OF), []);
  });

  it('rejects a foundation package that depends on Angular, React, Vue or Tauri', () => {
    for (const dep of ['@angular/core', 'react', 'vue', '@tauri-apps/api', 'react-native']) {
      const problems = checkPackageManifest(
        manifest('foundation', 'design-tokens', { peerDependencies: { [dep]: '*' } }),
        LAYERS_OF,
      );
      assert.equal(problems.length, 1, dep);
      assert.match(problems[0], /framework-independent/);
    }
  });

  it('requires Angular to be a peer dependency of an Angular package, never a direct dependency', () => {
    const problems = checkPackageManifest(
      manifest('angular', 'ui', { dependencies: { '@angular/core': '^22.2.0' } }),
      LAYERS_OF,
    );
    assert.deepEqual(problems, [
      'packages/angular/ui/package.json: "@angular/core" must be a peerDependency, not a dependency',
    ]);
  });

  it('rejects a foundation package that depends on an Angular workspace package', () => {
    const problems = checkPackageManifest(
      manifest('foundation', 'design-tokens', { dependencies: { [UI]: '0.1.0' } }),
      LAYERS_OF,
    );
    assert.match(problems.join('\n'), /foundation may depend only on foundation/);
  });

  it('rejects any dependency on a product repository, by name or by path', () => {
    const byName = checkPackageManifest(
      manifest('angular', 'ui', { dependencies: { 'nawara-admin': '*' } }),
      LAYERS_OF,
    );
    const byPath = checkPackageManifest(
      manifest('angular', 'ui', {
        devDependencies: { helper: 'file:../../../../nawara-drive/apps/desktop' },
      }),
      LAYERS_OF,
    );
    assert.match(byName.join(), /product repository/);
    assert.match(byPath.join(), /product repository/);
  });

  it('rejects a misnamed package and a framework prefix in the foundation layer', () => {
    assert.match(
      checkPackageManifest(
        manifest('angular', 'ui', { name: '@nawara/frontend-kit' }),
        LAYERS_OF,
      ).join(),
      /name must be "@nawara-solutions\/angular-ui"/,
    );
    assert.match(
      checkPackageManifest(manifest('foundation', 'angular-forms'), LAYERS_OF).join(),
      /framework prefix/,
    );
  });

  it('rejects an unknown layer instead of guessing its rules', () => {
    assert.match(
      checkPackageManifest(manifest('vue', 'ui'), LAYERS_OF).join(),
      /unknown layer "vue"/,
    );
  });

  it('allows publication only to GitHub Packages', () => {
    const publicNpm = manifest('foundation', 'design-tokens', { private: false });
    const github = manifest('foundation', 'design-tokens', {
      private: false,
      publishConfig: { registry: GITHUB_PACKAGES_REGISTRY },
    });
    assert.match(checkPackageManifest(publicNpm, LAYERS_OF).join(), /publishConfig\.registry/);
    assert.deepEqual(checkPackageManifest(github, LAYERS_OF), []);
  });

  it('rejects another framework, or Tauri, in an Angular package manifest', () => {
    for (const dep of ['react', 'vue', 'react-native', '@tauri-apps/api']) {
      const pkg = manifest('angular', 'ui', { peerDependencies: { [dep]: '*' } });
      assert.match(
        checkPackageManifest(pkg, LAYERS_OF).join(),
        /angular packages may use only angular/,
        dep,
      );
    }
  });

  it('rejects git, GitHub, file, link and URL dependency specs, and product repositories behind them', () => {
    for (const spec of [
      'file:../x',
      'link:../x',
      'github:someone/lib#main',
      'https://example.com/x.tgz',
      'someone/lib',
    ]) {
      const pkg = manifest('foundation', 'design-tokens', { dependencies: { lib: spec } });
      assert.match(
        checkPackageManifest(pkg, LAYERS_OF).join(),
        /not a registry version range/,
        spec,
      );
    }
    for (const spec of [
      'git+https://github.com/nawara-solutions/nawara-admin.git',
      'github:nawara-solutions/nawara-drive#main',
    ]) {
      const pkg = manifest('angular', 'ui', { devDependencies: { helper: spec } });
      assert.match(checkPackageManifest(pkg, LAYERS_OF).join(), /product repository/, spec);
    }
  });

  it('keeps packages package-manager neutral (npm and pnpm consumers)', () => {
    const pkg = manifest('foundation', 'design-tokens', {
      packageManager: 'npm@11.16.0',
      engines: { node: '>=20', npm: '>=11' },
    });
    const problems = checkPackageManifest(pkg, LAYERS_OF);
    assert.equal(problems.length, 2);
    assert.match(problems.join(), /"packageManager" belongs to the workspace root/);
    assert.match(problems.join(), /engines\.npm/);
  });

  it('rejects install-time lifecycle scripts', () => {
    const pkg = manifest('foundation', 'design-tokens', {
      scripts: { postinstall: 'node x.js', build: 'tsc' },
    });
    assert.deepEqual(checkPackageManifest(pkg, LAYERS_OF), [
      'packages/foundation/design-tokens/package.json: the "postinstall" install-time script is forbidden in shared packages',
    ]);
  });
});

describe('checkCycles', () => {
  it('finds a cycle once and accepts an acyclic graph', () => {
    assert.deepEqual(checkCycles({ a: ['b'], b: ['c'], c: [] }), []);
    const problems = checkCycles({ a: ['b'], b: ['a'] });
    assert.equal(problems.length, 1);
    assert.match(problems[0], /a → b → a/);
  });
});

describe('checkSourceFile', () => {
  const FOUNDATION_FILE = 'packages/foundation/design-tokens/src/index.ts';
  const ANGULAR_FILE = 'packages/angular/ui/src/button.ts';
  const ANGULAR_MANIFEST = {
    name: UI,
    dependencies: { [TOKENS]: '0.1.0' },
    peerDependencies: { '@angular/core': '^22.2.0' },
  };
  const check = (path, layer, text, manifest = {}) =>
    checkSourceFile({ path, layer, text, manifest }, LAYERS_OF);

  it('rejects Angular imports in foundation code and accepts declared ones in Angular code', () => {
    const text = "import { Component } from '@angular/core';\n";
    assert.match(check(FOUNDATION_FILE, 'foundation', text).join(), /framework-independent/);
    assert.deepEqual(check(ANGULAR_FILE, 'angular', text, ANGULAR_MANIFEST), []);
  });

  it('rejects another framework or Tauri in Angular code, in any import form and file type', () => {
    for (const [file, text] of [
      [ANGULAR_FILE, "import * as React from 'react';\n"],
      [ANGULAR_FILE, "export { ref } from 'vue';\n"],
      [ANGULAR_FILE, "const { invoke } = await import('@tauri-apps/api/core');\n"],
      ['packages/angular/ui/src/widget.tsx', "import 'react-dom';\n"],
    ]) {
      const problems = check(file, 'angular', text, ANGULAR_MANIFEST).join('\n');
      assert.match(problems, /angular packages may use only angular/, text);
    }
  });

  it('rejects a foundation import of an Angular workspace package, through a subpath or SCSS @use', () => {
    const manifest = { dependencies: { [UI]: '0.1.0' } };
    assert.match(
      check(FOUNDATION_FILE, 'foundation', `import { X } from '${UI}/button';\n`, manifest).join(),
      /foundation may depend only on foundation/,
    );
    assert.match(
      check(
        'packages/foundation/design-tokens/src/_x.scss',
        'foundation',
        `@use '${UI}/styles';\n`,
        manifest,
      ).join(),
      /foundation may depend only on foundation/,
    );
  });

  it('rejects a relative import that leaves its package, and accepts one that stays inside', () => {
    assert.match(
      check(
        FOUNDATION_FILE,
        'foundation',
        "import { b } from '../../../angular/ui/src/button';\n",
      ).join(),
      /leaves its package/,
    );
    assert.deepEqual(
      check(
        FOUNDATION_FILE,
        'foundation',
        "import { s } from './scales';\nimport { t } from '../themes/light';\n",
      ),
      [],
    );
  });

  it('rejects relative imports that reach into a product repository', () => {
    const text = "import { x } from '../../../../nawara-admin/src/app/shared/ui/button/button';\n";
    assert.match(check(ANGULAR_FILE, 'angular', text).join(), /product repository/);
  });

  it('rejects an undeclared package import (pnpm consumers have no hoisting) but allows builtins, self and test devDependencies', () => {
    assert.match(
      check(ANGULAR_FILE, 'angular', "import { of } from 'rxjs';\n", ANGULAR_MANIFEST).join(),
      /does not declare/,
    );
    assert.deepEqual(
      check(
        ANGULAR_FILE,
        'angular',
        `import { join } from 'node:path';\nimport { x } from '${UI}/internal';\n`,
        ANGULAR_MANIFEST,
      ),
      [],
    );
    const spec = 'packages/angular/ui/src/button.spec.ts';
    const withVitest = { ...ANGULAR_MANIFEST, devDependencies: { vitest: '5.0.0' } };
    assert.deepEqual(check(spec, 'angular', "import { it } from 'vitest';\n", withVitest), []);
    assert.match(
      check(ANGULAR_FILE, 'angular', "import { it } from 'vitest';\n", withVitest).join(),
      /does not declare/,
    );
  });

  it('treats bare Sass @use as relative, and scoped or pkg: specifiers as packages', () => {
    const scss = 'packages/foundation/design-tokens/src/_index.scss';
    assert.deepEqual(check(scss, 'foundation', "@use 'sass:math';\n@use 'scales';\n"), []);
    assert.match(
      check(scss, 'foundation', "@use 'pkg:@angular/cdk/overlay';\n").join(),
      /framework-independent/,
    );
  });

  it('rejects product-domain vocabulary, including inside camelCase identifiers, but not look-alike words', () => {
    assert.match(
      check(ANGULAR_FILE, 'angular', 'export class StudentCard {}\n').join(),
      /button\.ts:1: product-domain term "Student"/,
    );
    assert.match(
      check(ANGULAR_FILE, 'angular', 'const nextDrivingLesson = 1;\n').join(),
      /"Driving"/,
    );
    assert.deepEqual(check(ANGULAR_FILE, 'angular', '// for example: examine childNodes\n'), []);
  });
});

describe('checkRootManifest and checkClaudeSettings', () => {
  it('requires a private workspace root', () => {
    assert.deepEqual(checkRootManifest({ private: true }), []);
    assert.equal(checkRootManifest({ name: 'nawara-frontend' }).length, 1);
  });

  it('requires both repository hooks to stay registered', () => {
    assert.deepEqual(checkClaudeSettings(VALID_SETTINGS), []);
    const withoutGuard = JSON.stringify({
      hooks: { PostToolUse: JSON.parse(VALID_SETTINGS).hooks.PostToolUse },
    });
    assert.match(
      checkClaudeSettings(withoutGuard).join(),
      /PreToolUse must run "bash \.claude\/hooks\/guard-sibling-writes\.sh"/,
    );
    assert.match(checkClaudeSettings(undefined).join(), /not valid JSON/);
  });
});

describe('packageOf', () => {
  it('returns the package of bare and scoped specifiers, null for relative ones', () => {
    assert.equal(packageOf('@angular/core/testing'), '@angular/core');
    assert.equal(packageOf('rxjs/operators'), 'rxjs');
    assert.equal(packageOf('./local'), null);
  });
});

describe('checkActionPins', () => {
  it('requires a full SHA and its release comment', () => {
    const sha = 'a'.repeat(40);
    assert.deepEqual(
      checkActionPins('ci.yml', `      - uses: actions/checkout@${sha} # v7.0.1\n`),
      [],
    );
    assert.match(
      checkActionPins('ci.yml', '      - uses: actions/checkout@v7\n').join(),
      /full 40-hex commit SHA/,
    );
    assert.match(
      checkActionPins('ci.yml', `      - uses: actions/checkout@${sha}\n`).join(),
      /release as a comment/,
    );
    assert.deepEqual(checkActionPins('ci.yml', '      - uses: ./.github/actions/local\n'), []);
  });
});

describe('checkSharedStandard', () => {
  const allLinks = (overrides = {}) => ({
    ...Object.fromEntries(
      Object.entries(SHARED_STANDARD.symlinks).map(([p, t]) => [p, { target: t, resolves: true }]),
    ),
    ...overrides,
  });
  const allCopies = (standard) =>
    Object.fromEntries(
      Object.keys(SHARED_STANDARD.copies).map((p) => [p, { local: 'x', standard }]),
    );

  it('accepts the complete integration, with or without the sibling layout', () => {
    assert.deepEqual(
      checkSharedStandard({ links: allLinks(), copies: allCopies('x'), standardPresent: true }),
      [],
    );
    assert.deepEqual(
      checkSharedStandard({
        links: allLinks(),
        copies: allCopies(undefined),
        standardPresent: false,
      }),
      [],
    );
  });

  it('rejects a replaced, retargeted or dangling link, and a drifted copy', () => {
    const problems = checkSharedStandard({
      links: allLinks({
        'CONTRIBUTING.md': { target: null, resolves: false },
        '.claude/commands/pr.md': { target: '../pr.md', resolves: true },
        '.husky/commit-msg': { target: '../../ai-standard/husky/commit-msg', resolves: false },
      }),
      copies: { ...allCopies('x'), 'commitlint.config.cjs': { local: 'changed', standard: 'x' } },
      standardPresent: true,
    });
    assert.equal(problems.length, 4);
  });
});

describe('runChecks (end to end on a temporary repository)', () => {
  const makeRepo = (files) => {
    const parent = mkdtempSync(join(tmpdir(), 'nawara-frontend-check-'));
    const root = join(parent, 'nawara-frontend');
    mkdirSync(root);
    for (const [path, target] of Object.entries(SHARED_STANDARD.symlinks)) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      symlinkSync(target, join(root, path)); // dangling: there is no sibling ai-standard here, as in CI
    }
    for (const path of Object.keys(SHARED_STANDARD.copies)) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), 'copy');
    }
    const base = {
      'package.json': '{"private":true}',
      '.claude/settings.json': VALID_SETTINGS,
      'docs/SHARED-CONTRIBUTION-POLICY.md': '# policy\n',
      'CLAUDE.md': '[policy](docs/SHARED-CONTRIBUTION-POLICY.md)\n',
    };
    for (const [path, text] of Object.entries({ ...base, ...files })) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), text);
    }
    return { root, cleanup: () => rmSync(parent, { recursive: true, force: true }) };
  };

  it('passes a conforming two-layer workspace', () => {
    const { root, cleanup } = makeRepo({
      'packages/foundation/design-tokens/package.json': JSON.stringify({
        name: TOKENS,
        private: true,
      }),
      'packages/foundation/design-tokens/src/index.ts': 'export const space = 4;\n',
      'packages/angular/ui/package.json': JSON.stringify({
        name: UI,
        private: true,
        dependencies: { [TOKENS]: '0.0.0' },
        peerDependencies: { '@angular/core': '^22.2.0' },
      }),
      'packages/angular/ui/src/button.ts': `import { Component } from '@angular/core';\nimport { space } from '${TOKENS}';\n`,
    });
    try {
      const result = runChecks(root);
      assert.deepEqual(result.problems, []);
      assert.equal(result.packageCount, 2);
      assert.equal(result.standardPresent, false);
    } finally {
      cleanup();
    }
  });

  it('reports every violation of a non-conforming workspace', () => {
    const { root, cleanup } = makeRepo({
      'packages/foundation/design-tokens/package.json': JSON.stringify({
        name: TOKENS,
        private: true,
        dependencies: { [UI]: '0.0.0' },
      }),
      'packages/foundation/design-tokens/src/index.ts': "import { signal } from '@angular/core';\n",
      'packages/angular/ui/package.json': JSON.stringify({
        name: UI,
        private: true,
        dependencies: { [TOKENS]: '0.0.0' },
      }),
      'packages/angular/ui/src/student-card.ts': 'export class StudentCard {}\n',
      'packages/angular/empty/README.md': 'no manifest',
      '.github/workflows/ci.yml': 'steps:\n  - uses: actions/checkout@v7\n',
    });
    try {
      const { problems } = runChecks(root);
      const text = problems.join('\n');
      assert.match(text, /foundation may depend only on foundation/);
      assert.match(text, /dependency cycle/);
      assert.match(
        text,
        /imports "@angular\/core" \(angular\); foundation packages are framework-independent/,
      );
      assert.match(text, /product-domain term "Student"/);
      assert.match(text, /packages\/angular\/empty: a package directory without package\.json/);
      assert.match(text, /full 40-hex commit SHA/);
    } finally {
      cleanup();
    }
  });
});

describe('guard-sibling-writes.sh (Claude Code PreToolUse hook)', () => {
  const GUARD = new URL('../.claude/hooks/guard-sibling-writes.sh', import.meta.url);
  const layout = () => {
    const parent = mkdtempSync(join(tmpdir(), 'nawara-guard-'));
    const repo = join(parent, 'nawara-frontend');
    mkdirSync(join(repo, '.claude', 'hooks'), { recursive: true });
    mkdirSync(join(repo, 'docs'));
    mkdirSync(join(parent, 'ai-standard', 'docs'), { recursive: true });
    writeFileSync(join(parent, 'ai-standard', 'docs', 'README.md'), 'shared');
    writeFileSync(join(repo, '.claude', 'hooks', 'guard.sh'), readFileSync(GUARD));
    symlinkSync('../../ai-standard/docs/README.md', join(repo, 'docs', 'README.md'));
    const run = (filePath, extra = {}) =>
      spawnSync('bash', [join(repo, '.claude', 'hooks', 'guard.sh')], {
        input: JSON.stringify({ cwd: repo, tool_input: { file_path: filePath, ...extra } }),
        encoding: 'utf8',
      });
    return { parent, repo, run, cleanup: () => rmSync(parent, { recursive: true, force: true }) };
  };
  const denied = (result) => {
    assert.equal(result.status, 0, result.stderr);
    return (
      result.stdout.trim() !== '' &&
      JSON.parse(result.stdout).hookSpecificOutput.permissionDecision === 'deny'
    );
  };

  it('denies a write through an ai-standard symlink, by absolute or relative path', () => {
    const { repo, run, cleanup } = layout();
    try {
      assert.equal(denied(run(join(repo, 'docs', 'README.md'))), true);
      assert.equal(denied(run('docs/README.md')), true);
    } finally {
      cleanup();
    }
  });

  it('denies a direct write into a sibling repository', () => {
    const { parent, run, cleanup } = layout();
    try {
      assert.equal(denied(run(join(parent, 'nawara-admin', 'src', 'x.ts'))), true);
    } finally {
      cleanup();
    }
  });

  it('allows writes inside the repository, new files included, and outside the parent folder', () => {
    const { repo, run, cleanup } = layout();
    try {
      assert.equal(denied(run(join(repo, 'docs', 'ARCHITECTURE.md'))), false);
      assert.equal(denied(run(join(repo, 'packages', 'foundation', 'x', 'new.ts'))), false);
      assert.equal(denied(run(join(tmpdir(), 'scratch.txt'))), false);
      assert.equal(denied(run('')), false);
    } finally {
      cleanup();
    }
  });
});

describe('generated output and token sources (design-tokens, ADR-0003)', () => {
  it('rejects generated package output tracked by git, and nothing else', () => {
    assert.deepEqual(
      checkTrackedGenerated([
        'packages/foundation/design-tokens/src/nawara.resolver.json',
        'packages/foundation/design-tokens/package.json',
      ]),
      [],
    );
    assert.match(
      checkTrackedGenerated(['packages/foundation/design-tokens/dist/tokens.css']).join(),
      /generated output is tracked by git/,
    );
  });

  it('rejects a hand-written stylesheet in a token source, but not in other packages', () => {
    const token = ['packages/foundation/design-tokens/src/tokens/scale.tokens.json'];
    assert.deepEqual(checkTokenSourceStyles(token), []);
    assert.match(
      checkTokenSourceStyles([...token, 'packages/foundation/design-tokens/src/extra.scss']).join(),
      /hand-written stylesheet in a token source/,
    );
    assert.match(
      checkTokenSourceStyles([
        ...token,
        'packages/foundation/design-tokens/src/tokens/legacy.css',
      ]).join(),
      /legacy\.css/,
    );
    assert.deepEqual(checkTokenSourceStyles(['packages/angular/ui/src/button.scss']), []);
  });

  it('scans token JSON for product vocabulary, without treating JSON as imports', () => {
    const tokens = 'packages/foundation/design-tokens/src/tokens/scale.tokens.json';
    assert.match(
      checkSourceFile(
        { path: tokens, layer: 'foundation', text: '{ "studentCard": { "$value": 1 } }\n' },
        LAYERS_OF,
      ).join(),
      /product-domain term "student"/,
    );
    assert.deepEqual(
      checkSourceFile(
        { path: tokens, layer: 'foundation', text: '{ "from": "@angular/core", "space": {} }\n' },
        LAYERS_OF,
      ),
      [],
    );
  });

  it('treats Sass @use as an import in stylesheets only, never inside a script string', () => {
    const script =
      "const scss = \"@use 'pkg:@nawara-solutions/design-tokens/breakpoints' as bp; @use 'sass:map';\";\n";
    assert.deepEqual(
      checkSourceFile(
        {
          path: 'packages/foundation/design-tokens/scripts/lib/emit.mjs',
          layer: 'foundation',
          text: script,
        },
        LAYERS_OF,
      ),
      [],
    );
    assert.match(
      checkSourceFile(
        {
          path: 'packages/foundation/design-tokens/src/x.scss',
          layer: 'foundation',
          text: "@use 'pkg:@angular/cdk/overlay';\n",
        },
        LAYERS_OF,
      ).join(),
      /framework-independent/,
    );
  });

  it('reports a hand-written stylesheet in a token package end to end', () => {
    const parent = mkdtempSync(join(tmpdir(), 'nawara-frontend-tokens-'));
    const root = join(parent, 'nawara-frontend');
    try {
      for (const [path, target] of Object.entries(SHARED_STANDARD.symlinks)) {
        mkdirSync(dirname(join(root, path)), { recursive: true });
        symlinkSync(target, join(root, path));
      }
      const files = {
        'package.json': '{"private":true}',
        '.claude/settings.json': VALID_SETTINGS,
        'docs/SHARED-CONTRIBUTION-POLICY.md': '# policy\n',
        'CLAUDE.md': '[policy](docs/SHARED-CONTRIBUTION-POLICY.md)\n',
        ...Object.fromEntries(Object.keys(SHARED_STANDARD.copies).map((p) => [p, 'copy'])),
        'packages/foundation/design-tokens/package.json': JSON.stringify({
          name: TOKENS,
          private: true,
        }),
        'packages/foundation/design-tokens/src/tokens/scale.tokens.json':
          '{ "space": { "$type": "number", "1": { "$value": 1 } } }\n',
        'packages/foundation/design-tokens/src/handwritten.scss': '$x: 1;\n',
      };
      for (const [path, text] of Object.entries(files)) {
        mkdirSync(dirname(join(root, path)), { recursive: true });
        writeFileSync(join(root, path), text);
      }
      assert.match(
        runChecks(root).problems.join('\n'),
        /src\/handwritten\.scss: hand-written stylesheet in a token source/,
      );
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });
});

describe('shared contribution policy (agent discoverability)', () => {
  it('requires the policy to exist and CLAUDE.md to link to it', () => {
    const linked =
      'See [`docs/SHARED-CONTRIBUTION-POLICY.md`](docs/SHARED-CONTRIBUTION-POLICY.md).';
    assert.deepEqual(checkPolicyDiscoverable({ policyText: '# policy', claudeText: linked }), []);
    assert.match(
      checkPolicyDiscoverable({ policyText: undefined, claudeText: linked }).join(),
      /SHARED-CONTRIBUTION-POLICY\.md: missing/,
    );
    assert.match(
      checkPolicyDiscoverable({ policyText: '# policy', claudeText: '# CLAUDE.md' }).join(),
      /CLAUDE\.md: must link to docs\/SHARED-CONTRIBUTION-POLICY\.md/,
    );
  });
});
