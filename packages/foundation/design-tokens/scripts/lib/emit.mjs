// The three generated artifacts (ADR-0003 §8). Output is UTF-8, LF, two-space indentation, one trailing newline, in a
// canonical order; it contains no timestamp, path or environment value.
import { comparePaths, cssName, formatNumber, literal } from './format.mjs';
import { contextTokens, resolveToken } from './resolve.mjs';

const HEADER =
  '@nawara-solutions/design-tokens: generated from src/ by scripts/build.mjs. Do not edit.';
const TIER = { 'set:reference': 0, 'set:scale': 1 };
const tierOf = (token) => TIER[token.layer] ?? 2;
const byTierThenPath = (a, b) => tierOf(a) - tierOf(b) || comparePaths(a.path, b.path);

/** CSS value of a token in a context: aliases stay `var()` references, except deprecated names, which copy the value. */
function cssValue(merged, token) {
  if (token.alias && !token.deprecated) return `var(${cssName(token.alias)})`;
  return literal(resolveToken(merged, token.key));
}

const declarations = (merged, tokens, indent) =>
  tokens.map((t) => `${indent}${cssName(t.path)}: ${cssValue(merged, t)};`);

const block = (selector, lines, indent = '') =>
  [`${indent}${selector} {`, ...lines, `${indent}}`].join('\n');

export function emitCss(model) {
  const light = contextTokens(model, { theme: 'light' });
  const dark = contextTokens(model, { theme: 'dark' });
  const reduced = contextTokens(model, { theme: 'light', motion: 'reduced' });
  const rootTokens = [...light.values()]
    .filter((t) => t.layer !== 'set:breakpoint')
    .sort(byTierThenPath);
  const themeTokens = (merged) =>
    [...merged.values()].filter((t) => t.layer.startsWith('theme:')).sort(byTierThenPath);
  const reducedTokens = [...reduced.values()]
    .filter((t) => t.layer === 'motion:reduced')
    .sort(byTierThenPath);
  const scheme = (value, indent) => `${indent}color-scheme: ${value};`;

  const parts = [
    `/* ${HEADER} */`,
    block(':root', [...declarations(light, rootTokens, '  '), scheme('light', '  ')]),
    block("[data-theme='light']", [
      ...declarations(light, themeTokens(light), '  '),
      scheme('light', '  '),
    ]),
    block("[data-theme='dark']", [
      ...declarations(dark, themeTokens(dark), '  '),
      scheme('dark', '  '),
    ]),
    block('@media (prefers-color-scheme: dark)', [
      block(
        ':root:not([data-theme])',
        [...declarations(dark, themeTokens(dark), '    '), scheme('dark', '    ')],
        '  ',
      ),
    ]),
    block('@media (prefers-reduced-motion: reduce)', [
      block(':root', declarations(reduced, reducedTokens, '    '), '  '),
    ]),
  ];
  return `${parts.join('\n\n')}\n`;
}

/** Breakpoints in em (media queries resolve rem and em against the same initial font size), ascending. */
export function breakpointList(model) {
  return [...model.sets.breakpoint]
    .sort((a, b) => a.value.value - b.value.value || comparePaths(a.path, b.path))
    .map((t) => [t.path.slice(1).join('-'), `${formatNumber(t.value.value)}em`]);
}

export function emitScss(model) {
  const entries = breakpointList(model).map(([name, value]) => `  ${name}: ${value},`);
  return [
    `// ${HEADER}`,
    "// Use: @use 'pkg:@nawara-solutions/design-tokens/breakpoints' as bp; then @include bp.from(tablet) { … }",
    '',
    "@use 'sass:map';",
    '',
    '$breakpoints: (',
    ...entries,
    ');',
    '',
    '/// Applies from the named breakpoint upwards. Below the first breakpoint is the narrow (default) layout.',
    '@mixin from($name) {',
    '  @if not map.has-key($breakpoints, $name) {',
    "    @error 'Unknown breakpoint `#{$name}`. Use one of: #{map.keys($breakpoints)}.';",
    '  }',
    '  @media (min-width: map.get($breakpoints, $name)) {',
    '    @content;',
    '  }',
    '}',
    '',
  ].join('\n');
}

/** The public manifest: resolved values per context, for product collision, deprecation and contrast checks. */
export function emitManifest(model, packageJson) {
  const light = contextTokens(model, { theme: 'light' });
  const dark = contextTokens(model, { theme: 'dark' });
  const reduced = contextTokens(model, { theme: 'light', motion: 'reduced' });
  const tokens = [...light.values()]
    .filter((t) => t.layer !== 'set:breakpoint')
    .sort(byTierThenPath)
    .map((t) => {
      const entry = {
        name: cssName(t.path),
        tier: ['reference', 'scale', 'semantic'][tierOf(t)],
        type: t.type,
        values: {
          light: literal(resolveToken(light, t.key)),
          dark: literal(resolveToken(dark, t.key)),
        },
      };
      const motion = model.motion.reduced.find((r) => r.key === t.key);
      if (motion) entry.reducedMotion = literal(resolveToken(reduced, t.key));
      const own = t.provenance ?? dark.get(t.key)?.provenance;
      if (own) entry.provenance = own;
      if (t.deprecated && t.alias) entry.deprecated = { aliasOf: cssName(t.alias) };
      return entry;
    });
  const manifest = {
    package: packageJson.name,
    version: packageJson.version,
    contexts: {
      theme: Object.keys(model.theme),
      accent: Object.keys(model.accent),
      motion: Object.keys(model.motion),
    },
    attributes: { theme: 'data-theme', accent: 'data-accent' },
    accentControlled: model.accentContract.map((key) => cssName(key.split('.'))).sort(),
    breakpoints: Object.fromEntries(breakpointList(model)),
    tokens,
  };
  return `${JSON.stringify(manifest, null, 2)}\n`;
}
