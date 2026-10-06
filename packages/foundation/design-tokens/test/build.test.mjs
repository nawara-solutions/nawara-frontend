// Positive behaviour of the real source: the public contract the generated artifacts must keep (ADR-0003 §3–§9).
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { OUTPUT_FILES, build, compile } from '../scripts/lib/build.mjs';
import { loadModel } from '../scripts/lib/load.mjs';
import { contextTokens, resolveToken } from '../scripts/lib/resolve.mjs';
import { PACKAGE_JSON, SRC_DIR, sourceCopy, tempDir } from './helpers.mjs';

const names = (list) =>
  list
    .split(/\s+/)
    .filter(Boolean)
    .map((n) => `--nw-${n}`);

/** The public names of DT1: Nawara Admin's existing names, preserved exactly (ADR-0003 §3). */
const PUBLIC = {
  reference:
    names(`ref-coral-50 ref-coral-100 ref-coral-200 ref-coral-300 ref-coral-400 ref-coral-500 ref-coral-600
    ref-coral-700 ref-coral-800 ref-coral-900 ref-coral-950 ref-ink-0 ref-ink-50 ref-ink-100 ref-ink-200 ref-ink-300
    ref-ink-400 ref-ink-450 ref-ink-475 ref-ink-500 ref-ink-600 ref-ink-700 ref-ink-750 ref-ink-800 ref-ink-850 ref-ink-900`),
  // DT2a: the functional status hues, exactly the steps the shared semantic tokens use.
  referenceDt2a:
    names(`ref-green-50 ref-green-200 ref-green-300 ref-green-700 ref-green-850 ref-green-900 ref-amber-50
    ref-amber-200 ref-amber-300 ref-amber-700 ref-amber-850 ref-amber-900 ref-blue-50 ref-blue-200 ref-blue-300
    ref-blue-600 ref-blue-850 ref-blue-900`),
  scale:
    names(`control-height-md control-height-sm duration-base duration-fast duration-slow ease-emphasized
    ease-standard focus-ring-offset focus-ring-width font-arabic font-latin font-mono font-sans font-weight-bold
    font-weight-medium font-weight-regular font-weight-semibold letter-spacing-label line-height-normal line-height-snug
    line-height-tight radius-lg radius-md radius-pill radius-sm radius-xl space-0 space-1 space-2 space-3 space-4 space-5
    space-6 space-7 space-8 space-9 space-10 text-size-2xl text-size-3xl text-size-4xl text-size-lg text-size-md
    text-size-sm text-size-xl text-size-xs z-base z-dropdown z-modal z-overlay z-sticky z-toast`),
  semantic:
    names(`border-brand border-default border-strong border-subtle color-neutral-active color-neutral-hover
    color-primary color-primary-active color-primary-hover color-primary-subtle focus-halo focus-ring surface-brand-subtle
    surface-overlay surface-page surface-raised surface-sunken text-brand text-disabled text-label text-link
    text-on-primary text-primary text-secondary`),
  // DT2a: danger action, status, alert and scrim.
  semanticDt2a:
    names(`color-danger-hover color-danger-active text-on-danger status-success-fg status-success-bg
    status-warning-fg status-warning-bg status-danger-fg status-danger-bg status-info-fg status-info-bg alert-danger-bg
    alert-danger-fg alert-danger-border alert-danger-icon alert-warning-bg alert-warning-fg alert-warning-border
    alert-warning-icon alert-info-bg alert-info-fg alert-info-border alert-info-icon alert-success-bg alert-success-fg
    alert-success-border alert-success-icon scrim`),
};
PUBLIC.reference.push(...PUBLIC.referenceDt2a);
PUBLIC.semantic.push(...PUBLIC.semanticDt2a);

const files = compile(SRC_DIR, PACKAGE_JSON);
const css = files['tokens.css'];
const manifest = JSON.parse(files['manifest.json']);
const token = (name) => manifest.tokens.find((t) => t.name === name);

/** The declarations of one CSS block, as name → value. */
function blockDeclarations(selector) {
  const start = css.indexOf(`${selector} {`);
  assert.notEqual(start, -1, `missing block ${selector}`);
  const body = css.slice(start + selector.length + 2, css.indexOf('}', start));
  return Object.fromEntries(
    [...body.matchAll(/^\s*([\w-]+):\s*(.+);$/gm)].map((m) => [m[1], m[2]]),
  );
}

describe('source', () => {
  it('parses into the resolver layers and resolves every alias in every context', () => {
    const model = loadModel(SRC_DIR);
    assert.deepEqual(Object.keys(model.theme), ['light', 'dark']);
    assert.deepEqual(Object.keys(model.accent), ['default']);
    assert.deepEqual(Object.keys(model.motion), ['standard', 'reduced']);
    assert.equal(model.accentContract.length, 11);
    const dark = contextTokens(model, { theme: 'dark' });
    assert.equal(resolveToken(dark, 'text.primary').key, 'ref.ink.0');
    assert.equal(resolveToken(contextTokens(model), 'text.primary').key, 'ref.ink.900');
  });
});

describe('public names', () => {
  it('generates exactly the DT1 public name set, by tier', () => {
    for (const tier of ['reference', 'scale', 'semantic']) {
      assert.deepEqual(
        manifest.tokens
          .filter((t) => t.tier === tier)
          .map((t) => t.name)
          .sort(),
        [...PUBLIC[tier]].sort(),
        tier,
      );
    }
    assert.equal(manifest.tokens.length, 147, 'DT1 101 + DT2a 46');
    assert.deepEqual(
      Object.keys(blockDeclarations(':root'))
        .filter((n) => n.startsWith('--'))
        .sort(),
      [...PUBLIC.reference, ...PUBLIC.scale, ...PUBLIC.semantic].sort(),
    );
  });

  it('never emits breakpoints, shadows (DT2b, deferred), artwork, product or component tokens as custom properties', () => {
    assert.doesNotMatch(
      css,
      /--nw-(breakpoint|shadow|logo|sidebar|workspace|chart|swatch|avatar|urgent|accent-|button|inline-alert|status-badge|toast)/,
    );
  });
});

describe('tokens.css', () => {
  it('has the five blocks in the contract order', () => {
    const order = [
      ':root {',
      "[data-theme='light'] {",
      "[data-theme='dark'] {",
      '@media (prefers-color-scheme: dark) {',
      '  :root:not([data-theme]) {',
      '@media (prefers-reduced-motion: reduce) {',
    ];
    const positions = order.map((s) => css.indexOf(s));
    assert.ok(
      positions.every((p) => p >= 0),
      'every block present',
    );
    assert.deepEqual(
      [...positions].sort((a, b) => a - b),
      positions,
    );
    assert.doesNotMatch(css, /data-accent/, 'only the default accent ships: no [data-accent] rule');
  });

  it('defines light on :root and [data-theme=light], dark on [data-theme=dark] and the system rule, with color-scheme', () => {
    const root = blockDeclarations(':root');
    const light = blockDeclarations("[data-theme='light']");
    const dark = blockDeclarations("[data-theme='dark']");
    const system = blockDeclarations('  :root:not([data-theme])');
    assert.equal(root['color-scheme'], 'light');
    assert.equal(light['color-scheme'], 'light');
    assert.equal(dark['color-scheme'], 'dark');
    assert.deepEqual(system, dark);
    for (const name of PUBLIC.semantic) {
      assert.equal(root[name], light[name], name);
      assert.ok(dark[name], `${name} in dark`);
    }
    assert.equal(light['--nw-text-primary'], 'var(--nw-ref-ink-900)');
    assert.equal(dark['--nw-text-primary'], 'var(--nw-ref-ink-0)');
    assert.equal(dark['--nw-color-primary'], 'var(--nw-ref-coral-400)');
    assert.equal(light['--nw-focus-halo'], 'rgb(229 56 59 / 22%)');
    assert.equal(dark['--nw-focus-halo'], 'rgb(255 92 95 / 30%)');
  });

  it('keeps Admin-compatible literal formats', () => {
    const root = blockDeclarations(':root');
    assert.equal(root['--nw-ref-coral-600'], '#c42427');
    assert.equal(root['--nw-space-0'], '0');
    assert.equal(root['--nw-space-4'], '1rem');
    assert.equal(root['--nw-radius-pill'], '999px');
    assert.equal(
      root['--nw-font-sans'],
      "'Readex Pro', system-ui, -apple-system, 'Segoe UI', sans-serif",
    );
    assert.equal(
      root['--nw-font-mono'],
      "'JetBrains Mono', ui-monospace, 'SFMono-Regular', Menlo, monospace",
    );
    assert.equal(root['--nw-ease-emphasized'], 'cubic-bezier(0.3, 0, 0, 1.2)');
    assert.equal(root['--nw-letter-spacing-label'], '0.08em');
    assert.equal(root['--nw-z-toast'], '500');
  });

  it('collapses the duration scale under prefers-reduced-motion', () => {
    assert.deepEqual(blockDeclarations('@media (prefers-reduced-motion: reduce) {\n  :root'), {
      '--nw-duration-base': '1ms',
      '--nw-duration-fast': '1ms',
      '--nw-duration-slow': '1ms',
    });
  });

  it('emits the deprecated --nw-font-latin as a copy of --nw-font-sans, never as var()', () => {
    const root = blockDeclarations(':root');
    assert.equal(root['--nw-font-latin'], root['--nw-font-sans']);
    assert.deepEqual(token('--nw-font-latin').deprecated, { aliasOf: '--nw-font-sans' });
  });
});

describe('breakpoints.scss', () => {
  it('lists the four breakpoints in em, ascending, with the from() mixin', () => {
    const scss = files['breakpoints.scss'];
    assert.match(
      scss,
      /\$breakpoints: \(\n {2}tablet: 37\.5em,\n {2}laptop: 56\.25em,\n {2}desktop: 75em,\n {2}wide: 100em,\n\);/,
    );
    assert.match(scss, /@mixin from\(\$name\)/);
    assert.match(scss, /@error 'Unknown breakpoint/);
  });
});

describe('manifest.json', () => {
  it('has only the planned fields', () => {
    assert.deepEqual(Object.keys(manifest), [
      'package',
      'version',
      'contexts',
      'attributes',
      'accentControlled',
      'breakpoints',
      'tokens',
    ]);
    assert.equal(manifest.package, '@nawara-solutions/design-tokens');
    assert.equal(manifest.version, PACKAGE_JSON.version);
    assert.deepEqual(manifest.attributes, { theme: 'data-theme', accent: 'data-accent' });
    assert.deepEqual(manifest.breakpoints, {
      tablet: '37.5em',
      laptop: '56.25em',
      desktop: '75em',
      wide: '100em',
    });
    for (const t of manifest.tokens) {
      for (const key of Object.keys(t))
        assert.ok(
          ['name', 'tier', 'type', 'values', 'reducedMotion', 'provenance', 'deprecated'].includes(
            key,
          ),
          key,
        );
    }
  });

  it('resolves every value to a literal per theme', () => {
    assert.deepEqual(token('--nw-text-primary').values, { light: '#17131f', dark: '#ffffff' });
    assert.deepEqual(token('--nw-surface-brand-subtle').values, {
      light: '#fff1f1',
      dark: '#3d2532',
    });
    assert.deepEqual(token('--nw-space-2').values, { light: '0.5rem', dark: '0.5rem' });
    assert.equal(token('--nw-duration-base').reducedMotion, '1ms');
    for (const t of manifest.tokens)
      for (const v of Object.values(t.values)) assert.doesNotMatch(v, /var\(/, t.name);
  });

  it('lists the 11 accent-controlled tokens and provenance where required', () => {
    assert.equal(manifest.accentControlled.length, 11);
    assert.ok(manifest.accentControlled.includes('--nw-focus-halo'));
    assert.ok(
      manifest.tokens
        .filter((t) => t.tier === 'reference')
        .every((t) => ['design', 'derived'].includes(t.provenance)),
    );
    assert.equal(token('--nw-ref-ink-450').provenance, 'derived');
    assert.equal(token('--nw-focus-halo').provenance, 'derived');
    assert.equal(token('--nw-text-primary').provenance, undefined);
  });
});

describe('build output', () => {
  it('writes exactly the three artifacts into an empty directory (clean build)', () => {
    const { dir, cleanup } = tempDir();
    try {
      const out = join(dir, 'dist');
      build({ srcDir: SRC_DIR, outDir: out, packageJson: PACKAGE_JSON });
      assert.deepEqual(readdirSync(out).sort(), [...OUTPUT_FILES].sort());
      for (const name of OUTPUT_FILES)
        assert.equal(readFileSync(join(out, name), 'utf8'), files[name]);
      assert.deepEqual(readdirSync(dir), ['dist'], 'no temporary directory left behind');
    } finally {
      cleanup();
    }
  });

  it('leaves the previous output untouched when the source is invalid', () => {
    const copy = sourceCopy();
    try {
      const out = join(copy.dir, 'dist');
      build({ srcDir: copy.src, outDir: out, packageJson: PACKAGE_JSON });
      writeFileSync(join(out, 'marker'), 'previous');
      copy.edit('tokens/theme/dark.tokens.json', (j) => void delete j.text.label);
      assert.throws(
        () => build({ srcDir: copy.src, outDir: out, packageJson: PACKAGE_JSON }),
        /in light but not in dark/,
      );
      assert.ok(existsSync(join(out, 'marker')), 'previous output kept');
      assert.deepEqual(
        readdirSync(copy.dir).sort(),
        ['dist', 'src'],
        'no temporary directory left behind',
      );
    } finally {
      copy.cleanup();
    }
  });
});

describe('DT2a: status, alert, danger and scrim', () => {
  it('resolves the danger action, status and alert semantics per theme', () => {
    assert.deepEqual(token('--nw-color-danger-hover').values, {
      light: '#a01c1f',
      dark: '#ff9597',
    });
    assert.deepEqual(token('--nw-text-on-danger').values, { light: '#ffffff', dark: '#17131f' });
    assert.deepEqual(token('--nw-status-success-fg').values, { light: '#15803d', dark: '#86d9a3' });
    assert.deepEqual(token('--nw-status-warning-bg').values, { light: '#fef4e6', dark: '#3d2826' });
    assert.deepEqual(token('--nw-alert-info-fg').values, { light: '#17131f', dark: '#ffffff' });
    assert.deepEqual(token('--nw-alert-warning-border').values, {
      light: '#f5cf9c',
      dark: '#6b4a2a',
    });
    const dark = blockDeclarations("[data-theme='dark']");
    assert.equal(dark['--nw-status-info-fg'], 'var(--nw-ref-blue-300)');
    assert.equal(dark['--nw-alert-danger-icon'], 'var(--nw-ref-coral-300)');
  });

  it('emits the scrim as a colour with transparency, in both themes and the system rule', () => {
    assert.equal(blockDeclarations(':root')['--nw-scrim'], 'rgb(23 19 31 / 48%)');
    assert.equal(blockDeclarations("[data-theme='dark']")['--nw-scrim'], 'rgb(0 0 0 / 64%)');
    assert.equal(blockDeclarations('  :root:not([data-theme])')['--nw-scrim'], 'rgb(0 0 0 / 64%)');
    assert.deepEqual(token('--nw-scrim'), {
      name: '--nw-scrim',
      tier: 'semantic',
      type: 'color',
      values: { light: 'rgb(23 19 31 / 48%)', dark: 'rgb(0 0 0 / 64%)' },
      provenance: 'derived',
    });
  });

  it('keeps danger and status out of the accent contract: an accent never recolours severity', () => {
    assert.equal(manifest.accentControlled.length, 11);
    assert.ok(!manifest.accentControlled.some((n) => /danger|status|alert|scrim/.test(n)));
  });

  it('records provenance on the new status hues, with reasons for the derived steps', () => {
    for (const name of PUBLIC.referenceDt2a)
      assert.ok(['design', 'derived'].includes(token(name).provenance), name);
    const derived = PUBLIC.referenceDt2a.filter((n) => token(n).provenance === 'derived').sort();
    assert.deepEqual(derived, [
      '--nw-ref-amber-850',
      '--nw-ref-amber-900',
      '--nw-ref-blue-200',
      '--nw-ref-blue-850',
      '--nw-ref-blue-900',
    ]);
  });

  it('checks 71 contrast pairs (40 DT1 + 31 DT2a) in both themes', () => {
    const config = JSON.parse(readFileSync(join(SRC_DIR, 'contrast.pairs.json'), 'utf8'));
    const pairs = config.groups.flatMap((g) =>
      g.foregrounds.flatMap((fg) => g.backgrounds.map((bg) => [fg, bg, g.min])),
    );
    assert.equal(pairs.length, 71);
    assert.ok(
      pairs.some(
        ([fg, bg, min]) =>
          fg === '--nw-alert-warning-icon' && bg === '--nw-alert-warning-bg' && min === 3,
      ),
    );
    assert.ok(
      pairs.some(
        ([fg, bg, min]) =>
          fg === '--nw-status-danger-fg' && bg === '--nw-color-neutral-hover' && min === 4.5,
      ),
    );
  });
});
