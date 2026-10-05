// The accent contract with a TEST-ONLY accent (never shipped). An accent context overrides exactly the 11
// accent-controlled tokens with aliases to per-theme tokens that the theme sets define: a DTCG modifier cannot depend on
// another modifier, so theme-dependent accent values reach it through aliases (Resolver 2025.10).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { compile } from '../scripts/lib/build.mjs';
import { checkContrast } from '../scripts/lib/contrast.mjs';
import { loadModel } from '../scripts/lib/load.mjs';
import { contextTokens, resolveToken } from '../scripts/lib/resolve.mjs';
import { validateModel } from '../scripts/lib/validate.mjs';
import { PACKAGE_JSON, sourceCopy } from './helpers.mjs';

const CONTRACT = [
  'color.primary',
  'color.primary-hover',
  'color.primary-active',
  'color.primary-subtle',
  'surface.brand-subtle',
  'text.on-primary',
  'text.brand',
  'text.link',
  'border.brand',
  'focus.ring',
  'focus.halo',
];
const slot = (key) => key.replace('.', '-');

/** Adds accent `name`; `targets[theme][key]` is the alias target of each accent-controlled token in that theme. */
function withAccent(copy, name, targets, { omit } = {}) {
  for (const theme of ['light', 'dark']) {
    copy.edit(`tokens/theme/${theme}.tokens.json`, (j) => {
      j.palette = { $type: 'color' };
      for (const key of CONTRACT)
        j.palette[`${name}-${slot(key)}`] = { $value: `{${targets[theme][key]}}` };
    });
  }
  const overrides = {};
  for (const key of CONTRACT.filter((k) => k !== omit)) {
    const [group, token] = key.split('.');
    // Typed per token, never per group: `focus` is also a dimension group in the scale set (merged-tree typing).
    overrides[group] ??= {};
    overrides[group][token] = { $type: 'color', $value: `{palette.${name}-${slot(key)}}` };
  }
  copy.write(`accent-${name}.tokens.json`, `${JSON.stringify(overrides, null, 2)}\n`);
  copy.edit(
    'nawara.resolver.json',
    (r) => void (r.modifiers.accent.contexts[name] = [{ $ref: `accent-${name}.tokens.json` }]),
  );
}

/**
 * Targets equal to the default accent's own values in each theme (an accent that changes nothing). The default
 * focus.halo is a raw value with no reference behind it, so the probe points it at focus.ring.
 */
function defaultTargets(src) {
  const model = loadModel(src);
  const targets = {};
  for (const theme of ['light', 'dark']) {
    const merged = contextTokens(model, { theme });
    targets[theme] = Object.fromEntries(
      CONTRACT.map((k) => [k, k === 'focus.halo' ? 'focus.ring' : resolveToken(merged, k).key]),
    );
  }
  return targets;
}

describe('accent contract (test-only accent)', () => {
  it('resolves a complete accent per theme through aliases', () => {
    const copy = sourceCopy();
    try {
      const targets = defaultTargets(copy.src);
      targets.light['color.primary'] = 'ref.ink.700';
      targets.dark['color.primary'] = 'ref.ink.200';
      withAccent(copy, 'probe', targets);
      const model = loadModel(copy.src);
      assert.deepEqual(validateModel(model), []);
      assert.equal(
        resolveToken(contextTokens(model, { theme: 'light', accent: 'probe' }), 'color.primary')
          .key,
        'ref.ink.700',
      );
      assert.equal(
        resolveToken(contextTokens(model, { theme: 'dark', accent: 'probe' }), 'color.primary').key,
        'ref.ink.200',
      );
      assert.equal(
        resolveToken(contextTokens(model, { theme: 'light' }), 'color.primary').key,
        'ref.coral.600',
        'default unchanged',
      );
    } finally {
      copy.cleanup();
    }
  });

  it('rejects an accent that misses an accent-controlled token', () => {
    const copy = sourceCopy();
    try {
      withAccent(copy, 'probe', defaultTargets(copy.src), { omit: 'text.link' });
      assert.match(
        validateModel(loadModel(copy.src)).join('\n'),
        /accent "probe": missing accent-controlled text\.link/,
      );
    } finally {
      copy.cleanup();
    }
  });

  it('rejects an accent that overrides a token outside the contract', () => {
    const copy = sourceCopy();
    try {
      withAccent(copy, 'probe', defaultTargets(copy.src));
      copy.edit(
        'accent-probe.tokens.json',
        (j) => void (j.text.primary = { $type: 'color', $value: '{ref.ink.700}' }),
      );
      assert.match(
        validateModel(loadModel(copy.src)).join('\n'),
        /accent "probe": text\.primary is not accent-controlled/,
      );
    } finally {
      copy.cleanup();
    }
  });

  it('checks contrast in every accent, not only the default', () => {
    const copy = sourceCopy();
    try {
      const targets = defaultTargets(copy.src);
      targets.light['text.link'] = 'ref.ink.300';
      withAccent(copy, 'probe', targets);
      const problems = checkContrast(loadModel(copy.src), {
        groups: [
          { foregrounds: ['--nw-text-link'], backgrounds: ['--nw-surface-raised'], min: 4.5 },
        ],
      });
      assert.equal(problems.length, 1);
      assert.match(problems[0], /contrast light\/probe: --nw-text-link on --nw-surface-raised/);
    } finally {
      copy.cleanup();
    }
  });

  it('refuses to generate artifacts for a non-default accent (no [data-accent] emission in DT1)', () => {
    const copy = sourceCopy();
    try {
      withAccent(copy, 'probe', defaultTargets(copy.src));
      assert.throws(
        () => compile(copy.src, PACKAGE_JSON),
        /accent probe: \[data-accent\] emission is not implemented/,
      );
    } finally {
      copy.cleanup();
    }
  });
});
