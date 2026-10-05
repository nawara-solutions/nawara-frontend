// Negative controls: every validation rule must reject what it forbids, with a message naming the rule. Each case
// mutates a temporary copy of the real source; nothing invalid is ever committed.
import assert from 'node:assert/strict';
import { symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { compile } from '../scripts/lib/build.mjs';
import { TokenBuildError } from '../scripts/lib/load.mjs';
import { PACKAGE_JSON, sourceCopy } from './helpers.mjs';

const color = (hex, extra = {}) => ({
  $value: {
    colorSpace: 'srgb',
    components: [1, 3, 5].map(
      (i) => Math.round((parseInt(hex.slice(i, i + 2), 16) / 255) * 1e4) / 1e4,
    ),
    hex,
  },
  ...extra,
});

/** Applies `mutate` to a fresh source copy and asserts the build fails with a problem matching `expected`. */
function rejects(mutate, expected) {
  const copy = sourceCopy();
  try {
    mutate(copy);
    assert.throws(
      () => compile(copy.src, PACKAGE_JSON),
      (error) => {
        assert.ok(error instanceof TokenBuildError, `expected a TokenBuildError, got ${error}`);
        assert.match(error.problems.join('\n'), expected);
        return true;
      },
    );
  } finally {
    copy.cleanup();
  }
}

const LIGHT = 'tokens/theme/light.tokens.json';
const DARK = 'tokens/theme/dark.tokens.json';
const SCALE = 'tokens/scale.tokens.json';
const REFERENCE = 'tokens/reference.tokens.json';
const BREAKPOINT = 'tokens/breakpoint.tokens.json';
const RESOLVER = 'nawara.resolver.json';

describe('names', () => {
  it('rejects two paths that produce the same CSS name', () => {
    rejects(
      (c) =>
        c.edit(
          SCALE,
          (j) =>
            void (j['focus-ring'] = {
              $type: 'dimension',
              width: { $value: { value: 3, unit: 'px' } },
            }),
        ),
      /CSS name --nw-focus-ring-width duplicates/,
    );
  });

  it('rejects invalid segments: uppercase, underscore and CSS syntax characters', () => {
    for (const name of ['Big', 'a_b', 'x;y', 'a}b', '-lead']) {
      rejects(
        (c) => c.edit(SCALE, (j) => void (j.space[name] = { $value: { value: 1, unit: 'rem' } })),
        new RegExp(`invalid name "${name.replace(/[}\]]/g, '\\$&')}"`),
      );
    }
  });

  it('rejects reserved object keys, including a literal __proto__ key', () => {
    rejects(
      (c) => c.edit(SCALE, (j) => void (j.constructor = { $type: 'number', x: { $value: 1 } })),
      /reserved name "constructor"/,
    );
    rejects(
      (c) => c.edit(SCALE, (j) => void (j.space.prototype = { $value: { value: 1, unit: 'rem' } })),
      /reserved name "prototype"/,
    );
    // Written as text: JSON.parse keeps a literal "__proto__" key as an own property, which the loader must refuse.
    rejects((c) => {
      c.write(
        SCALE,
        `{ "__proto__": { "$type": "number", "x": { "$value": 1 } }, "space": { "$type": "dimension", "1": { "$value": { "value": 0.25, "unit": "rem" } } } }\n`,
      );
    }, /reserved name "__proto__"/);
  });

  it('rejects product, layout-region and artwork words in foundation names', () => {
    rejects(
      (c) =>
        c.edit(
          SCALE,
          (j) =>
            void (j.sidebar = {
              $type: 'dimension',
              width: { $value: { value: 16, unit: 'rem' } },
            }),
        ),
      /"sidebar" names product presentation or artwork/,
    );
    rejects((c) => {
      for (const f of [LIGHT, DARK])
        c.edit(f, (j) => void (j.surface['logo-tint'] = { $value: '{ref.coral.50}' }));
    }, /"logo" names product presentation or artwork/);
  });
});

describe('aliases and types', () => {
  it('rejects an unresolved alias', () => {
    rejects(
      (c) => c.edit(LIGHT, (j) => void (j.text.primary.$value = '{ref.ink.999}')),
      /unresolved alias \{ref\.ink\.999\}/,
    );
  });

  it('rejects an alias cycle', () => {
    rejects(
      (c) =>
        c.edit(LIGHT, (j) => {
          j.text.primary.$value = '{text.secondary}';
          j.text.secondary.$value = '{text.primary}';
        }),
      /alias cycle/,
    );
  });

  it('rejects an alias to a token of another type', () => {
    rejects(
      (c) => c.edit(LIGHT, (j) => void (j.text.primary.$value = '{space.4}')),
      /alias \{space\.4\} is dimension, expected color/,
    );
  });

  it('rejects unknown types, unsupported properties and extensions, and malformed values', () => {
    rejects((c) => c.edit(SCALE, (j) => void (j.space.$type = 'size')), /unknown \$type "size"/);
    rejects(
      (c) => c.edit(SCALE, (j) => void (j.space['1'].$unit = 'rem')),
      /unsupported property "\$unit"/,
    );
    rejects(
      (c) => c.edit(SCALE, (j) => void (j.space['1'].$extensions = { 'org.example.tool': {} })),
      /unsupported extension "org\.example\.tool"/,
    );
    rejects(
      (c) => c.edit(REFERENCE, (j) => void (j.ref.coral['50'].$value.components = [0, 0, 0])),
      /components do not match #fff1f1/,
    );
    rejects(
      (c) => c.edit(SCALE, (j) => void (j.space['1'].$value = { value: 1, unit: 'vh' })),
      /unit "vh" is not px, rem or em/,
    );
    rejects((c) => c.write(SCALE, '{ "space": '), /not valid JSON/);
  });

  it('rejects unsafe font-family names (no quotes, semicolons or braces reach the CSS)', () => {
    rejects(
      (c) =>
        c.edit(SCALE, (j) => void (j.font.mono.$value = ["JetBrains Mono'; } body { color: red"])),
      /font family names may contain only letters, digits, spaces and hyphens/,
    );
  });
});

describe('tiers, themes and motion', () => {
  it('rejects a semantic token present in one theme only', () => {
    rejects(
      (c) => c.edit(DARK, (j) => void delete j.text.label),
      /theme: text\.label is in light but not in dark/,
    );
  });

  it('rejects reference tokens outside the reference set and themes redefining base tokens', () => {
    rejects(
      (c) =>
        c.edit(
          SCALE,
          (j) =>
            void (j.ref = {
              $type: 'color',
              extra: color('#123456', {
                $extensions: { 'com.nawara-solutions.provenance': { source: 'design' } },
              }),
            }),
        ),
      /reference tokens \(ref\.\*\) live only in the reference set/,
    );
    rejects((c) => {
      for (const f of [LIGHT, DARK])
        c.edit(
          f,
          (j) => void (j.space = { $type: 'dimension', 4: { $value: { value: 2, unit: 'rem' } } }),
        );
    }, /a theme or accent cannot redefine a reference, scale or breakpoint token/);
  });

  it('rejects reduced-motion overrides of anything but existing scale tokens', () => {
    rejects(
      (c) =>
        c.edit(
          'tokens/motion/reduced.tokens.json',
          (j) => void (j.duration.instant = { $value: { value: 0, unit: 'ms' } }),
        ),
      /reduced motion overrides only existing scale tokens/,
    );
  });
});

describe('breakpoints', () => {
  it('rejects a breakpoint that is not a positive rem dimension', () => {
    rejects(
      (c) =>
        c.edit(BREAKPOINT, (j) => void (j.breakpoint.tablet.$value = { value: 600, unit: 'px' })),
      /a breakpoint is a positive rem dimension/,
    );
  });

  it('rejects breakpoints outside the breakpoint set and other tokens inside it', () => {
    rejects(
      (c) =>
        c.edit(
          SCALE,
          (j) =>
            void (j.breakpoint = {
              $type: 'dimension',
              huge: { $value: { value: 120, unit: 'rem' } },
            }),
        ),
      /breakpoints live only in the breakpoint set/,
    );
    rejects(
      (c) =>
        c.edit(
          BREAKPOINT,
          (j) =>
            void (j.gutter = { $type: 'dimension', md: { $value: { value: 1, unit: 'rem' } } }),
        ),
      /breakpoints live only in the breakpoint set/,
    );
  });

  it('rejects breakpoints out of ascending order', () => {
    rejects(
      (c) => c.edit(BREAKPOINT, (j) => void (j.breakpoint.laptop.$value.value = 30)),
      /breakpoints must be listed in ascending order/,
    );
  });
});

describe('provenance', () => {
  it('rejects a reference value without provenance', () => {
    rejects(
      (c) => c.edit(REFERENCE, (j) => void delete j.ref.coral['50'].$extensions),
      /ref\.coral\.50: a reference value needs provenance/,
    );
  });

  it('rejects a raw theme value without provenance', () => {
    rejects(
      (c) => c.edit(LIGHT, (j) => void delete j.focus.halo.$extensions),
      /focus\.halo: a raw theme\/accent value needs provenance/,
    );
  });

  it('rejects a derived value without a reason, and an unknown source', () => {
    rejects(
      (c) =>
        c.edit(
          REFERENCE,
          (j) =>
            void delete j.ref.coral['950'].$extensions['com.nawara-solutions.provenance'].reason,
        ),
      /a derived value needs a provenance reason/,
    );
    rejects(
      (c) =>
        c.edit(
          REFERENCE,
          (j) =>
            void (j.ref.ink['0'].$extensions['com.nawara-solutions.provenance'].source = 'guessed'),
        ),
      /provenance source must be "design" or "derived"/,
    );
  });
});

describe('resolver document', () => {
  const setRef = (ref) => (c) =>
    c.edit(RESOLVER, (r) => void (r.sets.scale.sources = [{ $ref: ref }]));

  it('rejects path traversal, absolute paths and URLs in sources', () => {
    rejects((c) => {
      writeFileSync(join(c.dir, 'outside.json'), '{}\n');
      setRef('../outside.json')(c);
    }, /reference "\.\.\/outside\.json" leaves the source directory/);
    rejects(setRef('/etc/hostname.json'), /reference "\/etc\/hostname\.json" is absolute/);
    rejects(setRef('https://example.com/tokens.json'), /is a URL/);
    rejects(setRef('tokens/scale.tokens.yaml'), /is not a \.json file/);
  });

  it('rejects a symlink that escapes the source directory', () => {
    rejects((c) => {
      writeFileSync(join(c.dir, 'outside.json'), '{}\n');
      symlinkSync(join(c.dir, 'outside.json'), join(c.src, 'tokens', 'linked.json'));
      setRef('tokens/linked.json')(c);
    }, /resolves outside the source directory/);
  });

  it('rejects a resolver shape the CSS contract cannot represent', () => {
    rejects(
      (c) => c.edit(RESOLVER, (r) => void delete r.modifiers.theme.contexts.dark),
      /theme must have contexts light, dark/,
    );
    rejects(
      (c) => c.edit(RESOLVER, (r) => void r.resolutionOrder.reverse()),
      /resolutionOrder must be/,
    );
    rejects(
      (c) => c.edit(RESOLVER, (r) => void (r.version = '2024.1')),
      /version must be "2025\.10"/,
    );
    rejects(
      (c) => c.edit(RESOLVER, (r) => void (r.sets.scale.sources = [{ space: {} }])),
      /inline tokens are not supported/,
    );
  });
});

describe('contrast gate', () => {
  it('fails the build when a foundation pair drops below its threshold', () => {
    rejects(
      (c) => c.edit(LIGHT, (j) => void (j.text.secondary.$value = '{ref.ink.300}')),
      /contrast light\/default: --nw-text-secondary on --nw-surface-page = \d+\.\d+ \(needs 4\.5\)/,
    );
  });

  it('rejects a pair naming a missing or non-solid token', () => {
    rejects(
      (c) =>
        c.edit(
          'contrast.pairs.json',
          (j) =>
            void j.groups.push({
              foregrounds: ['--nw-text-primary'],
              backgrounds: ['--nw-focus-halo'],
              min: 3,
            }),
        ),
      /--nw-focus-halo is not a solid colour/,
    );
    rejects(
      (c) =>
        c.edit(
          'contrast.pairs.json',
          (j) =>
            void j.groups.push({
              foregrounds: ['--nw-text-ghost'],
              backgrounds: ['--nw-surface-page'],
              min: 3,
            }),
        ),
      /--nw-text-ghost is not a token/,
    );
  });
});

describe('merged-tree typing (DTCG Resolver: sources merge into one tree)', () => {
  // The structure the Terrazzo re-evaluation exposed: `focus` typed dimension in the scale set and color in the themes.
  const conflictingFocusGroup = (c) => {
    for (const f of [LIGHT, DARK]) {
      c.edit(f, (j) => {
        j.focus = { $type: 'color', ring: { ...j.focus.ring }, halo: { ...j.focus.halo } };
        delete j.focus.ring.$type;
        delete j.focus.halo.$type;
      });
    }
  };

  it('rejects one group path typed differently in different sources', () => {
    rejects(
      conflictingFocusGroup,
      /group focus: \$type differs across sources \(dimension in tokens\/scale\.tokens\.json, color in tokens\/theme\/light\.tokens\.json, color in tokens\/theme\/dark\.tokens\.json\)/,
    );
  });

  it('rejects a token whose inherited type a merged tree would contradict', () => {
    rejects(
      conflictingFocusGroup,
      /tokens\/scale\.tokens\.json:focus\.ring-width: inherits \$type dimension, but merged sources would type it color/,
    );
    rejects(
      conflictingFocusGroup,
      /tokens\/theme\/light\.tokens\.json:focus\.ring: inherits \$type color, but merged sources would type it dimension/,
    );
  });

  it('accepts the same group typed identically across sources and tokens that declare their own type', () => {
    const copy = sourceCopy();
    try {
      // Valid theme overrides: `text` is typed color in both themes; `focus` tokens declare their own type.
      assert.doesNotThrow(() => compile(copy.src, PACKAGE_JSON));
    } finally {
      copy.cleanup();
    }
  });
});
