// Cross-layer rules of the foundation source (ADR-0003 §2, §3, §5, §7, §10). Structural rules live in load.mjs.
import { cssName } from './format.mjs';
import { contextCombinations, contextTokens, resolveToken } from './resolve.mjs';

/**
 * Words that name a layout region, a product presentation or artwork. They never appear in foundation token names:
 * such tokens belong to a product extension (ADR-0003 §2, §6). Product-domain vocabulary is enforced repository-wide by
 * `check:repo`.
 */
const FORBIDDEN_WORDS = new Set([
  'admin',
  'auth',
  'avatar',
  'bloom',
  'botanical',
  'chart',
  'flower',
  'illustration',
  'logo',
  'product',
  'shell',
  'sidebar',
  'swatch',
  'topbar',
  'urgent',
  'workspace',
]);

const keysOf = (tokens) => new Set(tokens.map((t) => t.key));

export function validateModel(model) {
  const problems = [];
  const all = [
    ...model.sets.reference,
    ...model.sets.scale,
    ...model.sets.breakpoint,
    ...Object.values(model.theme).flat(),
    ...Object.values(model.accent).flat(),
    ...Object.values(model.motion).flat(),
  ];

  // Names: no region/product/artwork words; one CSS name per token path.
  const byCss = new Map();
  for (const token of all) {
    const word = token.path.flatMap((s) => s.split('-')).find((w) => FORBIDDEN_WORDS.has(w));
    if (word)
      problems.push(
        `${token.label}:${token.key}: "${word}" names product presentation or artwork; it belongs to a product extension`,
      );
    const css = cssName(token.path);
    const other = byCss.get(css);
    if (other && other !== token.key)
      problems.push(`${token.label}:${token.key}: CSS name ${css} duplicates ${other}`);
    else byCss.set(css, token.key);
  }

  // Tiers: reference only in the reference set; breakpoints only in the breakpoint set.
  for (const token of all) {
    const top = token.path[0];
    if ((top === 'ref') !== (token.layer === 'set:reference')) {
      problems.push(
        `${token.label}:${token.key}: reference tokens (ref.*) live only in the reference set`,
      );
    }
    if ((top === 'breakpoint') !== (token.layer === 'set:breakpoint')) {
      problems.push(
        `${token.label}:${token.key}: breakpoints live only in the breakpoint set, under "breakpoint"`,
      );
    }
  }
  const breakpoints = model.sets.breakpoint;
  for (const token of breakpoints) {
    if (
      token.type !== 'dimension' ||
      token.alias ||
      token.value?.unit !== 'rem' ||
      !(token.value?.value > 0)
    ) {
      problems.push(`${token.label}:${token.key}: a breakpoint is a positive rem dimension`);
    }
  }
  const values = breakpoints.map((t) => t.value?.value);
  if (values.some((v, i) => i > 0 && !(v > values[i - 1])))
    problems.push('breakpoints must be listed in ascending order');

  // Base sets never redefine each other; themes and accents never redefine base tokens.
  const base = new Set([
    ...keysOf(model.sets.reference),
    ...keysOf(model.sets.scale),
    ...keysOf(model.sets.breakpoint),
  ]);
  const seenBase = new Set();
  for (const token of [...model.sets.reference, ...model.sets.scale, ...model.sets.breakpoint]) {
    if (seenBase.has(token.key))
      problems.push(`${token.label}:${token.key}: defined twice in the base sets`);
    seenBase.add(token.key);
  }
  for (const token of [
    ...Object.values(model.theme).flat(),
    ...Object.values(model.accent).flat(),
  ]) {
    if (base.has(token.key))
      problems.push(
        `${token.label}:${token.key}: a theme or accent cannot redefine a reference, scale or breakpoint token`,
      );
  }

  // Merged-tree typing (DTCG Resolver 2025.10 merges all sources into one tree): a group path has one $type in every
  // source, and no token inherits a type that the nearest typed group of the merged tree would contradict.
  const groupTypes = new Map();
  for (const group of model.groupTypes) {
    if (!groupTypes.has(group.key)) groupTypes.set(group.key, []);
    groupTypes.get(group.key).push(group);
  }
  for (const [key, declarations] of groupTypes) {
    if (new Set(declarations.map((d) => d.type)).size > 1) {
      const where = declarations.map((d) => `${d.type} in ${d.label}`).join(', ');
      problems.push(
        `group ${key}: $type differs across sources (${where}); declare $type on the tokens instead`,
      );
    }
  }
  for (const token of all) {
    if (!token.inheritsType) continue;
    for (let depth = token.path.length - 1; depth > 0; depth--) {
      const declarations = groupTypes.get(token.path.slice(0, depth).join('.'));
      if (!declarations) continue;
      const other = declarations.find((d) => d.type !== token.type);
      if (other) {
        problems.push(
          `${token.label}:${token.key}: inherits $type ${token.type}, but merged sources would type it ${other.type} (group ${token.path.slice(0, depth).join('.')} in ${other.label})`,
        );
      }
      break;
    }
  }

  // Light/dark parity: identical semantic paths.
  const light = keysOf(model.theme.light ?? []);
  const dark = keysOf(model.theme.dark ?? []);
  for (const key of light)
    if (!dark.has(key)) problems.push(`theme: ${key} is in light but not in dark`);
  for (const key of dark)
    if (!light.has(key)) problems.push(`theme: ${key} is in dark but not in light`);

  // Accent contract: the controlled tokens exist in both themes; every accent overrides exactly that list.
  const contract = new Set(model.accentContract);
  for (const key of contract) {
    if (!light.has(key) || !dark.has(key))
      problems.push(`accent contract: ${key} is not a semantic token of both themes`);
  }
  for (const [name, tokens] of Object.entries(model.accent)) {
    if (name === 'default') continue;
    const defined = keysOf(tokens);
    for (const key of contract)
      if (!defined.has(key)) problems.push(`accent "${name}": missing accent-controlled ${key}`);
    for (const key of defined)
      if (!contract.has(key)) problems.push(`accent "${name}": ${key} is not accent-controlled`);
  }

  // Reduced motion overrides existing scale tokens of the same type only.
  const scale = new Map(model.sets.scale.map((t) => [t.key, t]));
  for (const token of model.motion.reduced ?? []) {
    if (scale.get(token.key)?.type !== token.type)
      problems.push(
        `${token.label}:${token.key}: reduced motion overrides only existing scale tokens of the same type`,
      );
  }

  // Provenance: every reference value and every raw (non-alias) theme or accent value.
  for (const token of [
    ...model.sets.reference,
    ...Object.values(model.theme).flat(),
    ...Object.values(model.accent).flat(),
  ]) {
    if (!token.alias && token.provenance === undefined) {
      problems.push(
        `${token.label}:${token.key}: a ${token.layer === 'set:reference' ? 'reference' : 'raw theme/accent'} value needs provenance (design or derived)`,
      );
    }
  }

  // Aliases resolve (no unresolved target, no cycle, matching type) in every context combination.
  const aliasProblems = new Set();
  for (const combo of contextCombinations(model)) {
    const merged = contextTokens(model, combo);
    for (const key of merged.keys()) {
      try {
        resolveToken(merged, key);
      } catch (error) {
        aliasProblems.add(error.message);
      }
    }
  }
  problems.push(...aliasProblems);
  return problems;
}
