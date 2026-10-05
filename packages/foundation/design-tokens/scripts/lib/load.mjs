// Loads the resolver document and its token files (DTCG 2025.10 subset, ADR-0003 §1) into a flat model, validating
// structure, names and values. Token data is only parsed as JSON, never imported or evaluated.
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';

export class TokenBuildError extends Error {
  constructor(problems) {
    super(
      `design tokens: ${problems.length} problem(s)\n${problems.map((p) => `  - ${p}`).join('\n')}`,
    );
    this.problems = problems;
  }
}

export const RESOLVER_FILE = 'nawara.resolver.json';
export const PROVENANCE = 'com.nawara-solutions.provenance';
export const ACCENT_CONTRACT = 'com.nawara-solutions.accent-contract';

const SEGMENT = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RESERVED = new Set(['__proto__', 'constructor', 'prototype']);
const TYPES = new Set([
  'color',
  'dimension',
  'fontFamily',
  'fontWeight',
  'number',
  'duration',
  'cubicBezier',
]);
const TOKEN_KEYS = new Set(['$value', '$type', '$description', '$extensions', '$deprecated']);
const GROUP_KEYS = new Set(['$type', '$description', '$extensions', '$deprecated']);
const ALIAS = /^\{([a-z0-9]+(?:-[a-z0-9]+)*(?:\.[a-z0-9]+(?:-[a-z0-9]+)*)*)\}$/;
const FONT_NAME = /^-?[A-Za-z0-9][A-Za-z0-9 -]{0,63}$/;
const HEX = /^#[0-9a-f]{6}$/;

// The fixed resolver shape the generated CSS contract depends on (ADR-0003 §4, §5).
const SETS = ['reference', 'scale', 'breakpoint'];
const ORDER = [
  '#/sets/reference',
  '#/sets/scale',
  '#/sets/breakpoint',
  '#/modifiers/theme',
  '#/modifiers/accent',
  '#/modifiers/motion',
];

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const finite = (v) => typeof v === 'number' && Number.isFinite(v);

/** A resolver `$ref` must name a `.json` file inside `srcDir`: no URL, absolute path, `..` or symlink escape. */
export function confinedPath(srcDir, ref) {
  if (typeof ref !== 'string' || ref.length === 0)
    throw new Error('reference must be a non-empty string');
  if (/^[a-z][a-z0-9+.-]*:/i.test(ref)) throw new Error(`reference "${ref}" is a URL`);
  if (isAbsolute(ref) || ref.startsWith('/') || ref.includes('\\'))
    throw new Error(`reference "${ref}" is absolute`);
  if (ref.split('/').includes('..'))
    throw new Error(`reference "${ref}" leaves the source directory`);
  if (!ref.endsWith('.json')) throw new Error(`reference "${ref}" is not a .json file`);
  const root = realpathSync(srcDir);
  const full = resolve(root, ref);
  if (!full.startsWith(root + sep))
    throw new Error(`reference "${ref}" leaves the source directory`);
  if (!existsSync(full)) throw new Error(`reference "${ref}" does not exist`);
  if (!realpathSync(full).startsWith(root + sep))
    throw new Error(`reference "${ref}" resolves outside the source directory`);
  return full;
}

function readJson(file, problems, label) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    problems.push(`${label}: not valid JSON (${error.message})`);
    return undefined;
  }
}

function validateValue(type, value) {
  if (typeof value === 'string') {
    const alias = ALIAS.exec(value);
    if (alias) return { alias: alias[1].split('.') };
    if (type !== 'fontFamily')
      return { error: `"${value}" is neither a ${type} value nor a {group.token} alias` };
  }
  switch (type) {
    case 'color': {
      if (!isObject(value)) return { error: 'color must be an object' };
      const extra = Object.keys(value).filter(
        (k) => !['colorSpace', 'components', 'alpha', 'hex'].includes(k),
      );
      if (extra.length) return { error: `unsupported color keys ${extra.join(', ')}` };
      if (value.colorSpace !== 'srgb') return { error: 'colorSpace must be "srgb"' };
      if (typeof value.hex !== 'string' || !HEX.test(value.hex))
        return { error: 'hex must be lowercase #rrggbb' };
      const c = value.components;
      if (!Array.isArray(c) || c.length !== 3 || !c.every((x) => finite(x) && x >= 0 && x <= 1)) {
        return { error: 'components must be three numbers between 0 and 1' };
      }
      const bytes = [1, 3, 5].map((i) => parseInt(value.hex.slice(i, i + 2), 16));
      if (c.some((x, i) => Math.round(x * 255) !== bytes[i]))
        return { error: `components do not match ${value.hex}` };
      if (
        value.alpha !== undefined &&
        !(finite(value.alpha) && value.alpha >= 0 && value.alpha <= 1)
      ) {
        return { error: 'alpha must be a number between 0 and 1' };
      }
      return { ok: true };
    }
    case 'dimension':
      if (!isObject(value) || Object.keys(value).length !== 2 || !finite(value.value))
        return { error: 'dimension must be { value, unit }' };
      // `em` is a documented deviation (DTCG 2025.10 allows px and rem): letter spacing follows the text size.
      if (!['px', 'rem', 'em'].includes(value.unit))
        return { error: `unit "${value.unit}" is not px, rem or em` };
      return { ok: true };
    case 'duration':
      if (
        !isObject(value) ||
        Object.keys(value).length !== 2 ||
        !finite(value.value) ||
        value.value < 0
      )
        return { error: 'duration must be { value >= 0, unit }' };
      if (!['ms', 's'].includes(value.unit))
        return { error: `unit "${value.unit}" is not ms or s` };
      return { ok: true };
    case 'cubicBezier':
      if (
        !Array.isArray(value) ||
        value.length !== 4 ||
        !value.every(finite) ||
        value[0] < 0 ||
        value[0] > 1 ||
        value[2] < 0 ||
        value[2] > 1
      ) {
        return { error: 'cubicBezier must be [x1, y1, x2, y2] with x1, x2 between 0 and 1' };
      }
      return { ok: true };
    case 'fontWeight':
      return Number.isInteger(value) && value >= 1 && value <= 1000
        ? { ok: true }
        : { error: 'fontWeight must be an integer 1-1000' };
    case 'number':
      return finite(value) ? { ok: true } : { error: 'number must be finite' };
    case 'fontFamily': {
      const names = Array.isArray(value) ? value : [value];
      if (names.length === 0 || !names.every((n) => typeof n === 'string' && FONT_NAME.test(n))) {
        return { error: 'font family names may contain only letters, digits, spaces and hyphens' };
      }
      return { ok: true };
    }
    default:
      return { error: `unknown type "${type}"` };
  }
}

function validateProvenance(extensions, where, problems) {
  if (extensions === undefined) return undefined;
  if (!isObject(extensions)) {
    problems.push(`${where}: $extensions must be an object`);
    return undefined;
  }
  for (const key of Object.keys(extensions)) {
    if (key !== PROVENANCE) problems.push(`${where}: unsupported extension "${key}"`);
  }
  const p = extensions[PROVENANCE];
  if (p === undefined) return undefined;
  if (!isObject(p) || !['design', 'derived'].includes(p.source)) {
    problems.push(`${where}: provenance source must be "design" or "derived"`);
    return undefined;
  }
  if (p.reason !== undefined && (typeof p.reason !== 'string' || p.reason.trim() === '')) {
    problems.push(`${where}: provenance reason must be a non-empty string`);
  }
  if (p.source === 'derived' && (typeof p.reason !== 'string' || p.reason.trim() === '')) {
    problems.push(`${where}: a derived value needs a provenance reason`);
  }
  return p.source;
}

/**
 * Flattens one token file into token records, reporting every structural problem. Explicit group `$type`
 * declarations are recorded in `groupTypes` so validation can compare them across sources (merged-tree typing).
 */
function flatten(json, label, layer, problems, groupTypes) {
  const tokens = [];
  const walk = (node, path, inheritedType) => {
    const where = `${label}:${path.join('.') || '<root>'}`;
    if (!isObject(node)) {
      problems.push(`${where}: must be an object`);
      return;
    }
    const isToken = Object.hasOwn(node, '$value');
    const keys = Object.keys(node);
    for (const key of keys) {
      if (key.startsWith('$')) {
        if (!(isToken ? TOKEN_KEYS : GROUP_KEYS).has(key))
          problems.push(`${where}: unsupported property "${key}"`);
      } else if (isToken) {
        problems.push(`${where}: a token cannot contain "${key}"`);
      } else if (RESERVED.has(key)) {
        problems.push(`${where}: reserved name "${key}"`);
      } else if (!SEGMENT.test(key)) {
        problems.push(`${where}: invalid name "${key}" (lowercase kebab-case)`);
      }
    }
    if (node.$description !== undefined && typeof node.$description !== 'string')
      problems.push(`${where}: $description must be a string`);
    if (
      node.$deprecated !== undefined &&
      typeof node.$deprecated !== 'boolean' &&
      typeof node.$deprecated !== 'string'
    ) {
      problems.push(`${where}: $deprecated must be a boolean or string`);
    }
    const type = node.$type ?? inheritedType;
    if (node.$type !== undefined && !TYPES.has(node.$type))
      problems.push(`${where}: unknown $type "${node.$type}"`);
    if (isToken) {
      if (path.length === 0) {
        problems.push(`${where}: a token needs a name`);
        return;
      }
      if (!TYPES.has(type)) {
        problems.push(`${where}: token has no known $type`);
        return;
      }
      const checked = validateValue(type, node.$value);
      if (checked.error) problems.push(`${where}: ${checked.error}`);
      const provenance = validateProvenance(node.$extensions, where, problems);
      tokens.push({
        path,
        key: path.join('.'),
        type,
        value: node.$value,
        alias: checked.alias,
        deprecated: node.$deprecated !== undefined && node.$deprecated !== false,
        inheritsType: node.$type === undefined,
        provenance,
        label,
        layer,
      });
      return;
    }
    if (node.$extensions !== undefined)
      problems.push(`${where}: $extensions are supported on tokens only`);
    if (node.$type !== undefined && path.length > 0)
      groupTypes.push({ key: path.join('.'), type: node.$type, label });
    for (const key of keys) {
      if (!key.startsWith('$') && SEGMENT.test(key) && !RESERVED.has(key))
        walk(node[key], [...path, key], type);
    }
  };
  walk(json, [], undefined);
  return tokens;
}

function loadSources(srcDir, sources, where, layer, problems, groupTypes) {
  if (!Array.isArray(sources)) {
    problems.push(`${where}: sources must be an array`);
    return [];
  }
  const tokens = [];
  for (const source of sources) {
    if (!isObject(source) || Object.keys(source).length !== 1 || typeof source.$ref !== 'string') {
      problems.push(
        `${where}: each source must be { "$ref": "<file>.json" } (inline tokens are not supported)`,
      );
      continue;
    }
    let file;
    try {
      file = confinedPath(srcDir, source.$ref);
    } catch (error) {
      problems.push(`${where}: ${error.message}`);
      continue;
    }
    const label = relative(srcDir, file).split(sep).join('/');
    const json = readJson(file, problems, label);
    if (json !== undefined) tokens.push(...flatten(json, label, layer, problems, groupTypes));
  }
  return tokens;
}

/** Loads and structurally validates the whole source. Throws TokenBuildError with every problem found. */
export function loadModel(srcDir) {
  const problems = [];
  const resolverFile = resolve(srcDir, RESOLVER_FILE);
  const doc = existsSync(resolverFile)
    ? readJson(resolverFile, problems, RESOLVER_FILE)
    : (problems.push(`${RESOLVER_FILE}: missing`), undefined);
  if (!isObject(doc)) {
    if (doc !== undefined) problems.push(`${RESOLVER_FILE}: must be an object`);
    throw new TokenBuildError(problems);
  }
  if (doc.version !== '2025.10') problems.push(`${RESOLVER_FILE}: version must be "2025.10"`);
  const setNames = Object.keys(doc.sets ?? {});
  if (setNames.join() !== SETS.join())
    problems.push(`${RESOLVER_FILE}: sets must be exactly ${SETS.join(', ')}`);
  const order = Array.isArray(doc.resolutionOrder) ? doc.resolutionOrder.map((e) => e?.$ref) : [];
  if (order.join() !== ORDER.join())
    problems.push(`${RESOLVER_FILE}: resolutionOrder must be ${ORDER.join(' → ')}`);

  const modifiers = doc.modifiers ?? {};
  if (Object.keys(modifiers).join() !== 'theme,accent,motion')
    problems.push(`${RESOLVER_FILE}: modifiers must be exactly theme, accent, motion`);
  const contexts = (name) => (isObject(modifiers[name]?.contexts) ? modifiers[name].contexts : {});
  const theme = contexts('theme');
  if (Object.keys(theme).join() !== 'light,dark' || modifiers.theme?.default !== 'light') {
    problems.push(`${RESOLVER_FILE}: theme must have contexts light, dark and default "light"`);
  }
  const accent = contexts('accent');
  if (
    !Array.isArray(accent.default) ||
    accent.default.length !== 0 ||
    modifiers.accent?.default !== 'default'
  ) {
    problems.push(
      `${RESOLVER_FILE}: accent must have an empty "default" context and default "default"`,
    );
  }
  for (const name of Object.keys(accent)) {
    if (RESERVED.has(name) || !SEGMENT.test(name))
      problems.push(`${RESOLVER_FILE}: invalid accent name "${name}"`);
  }
  const motion = contexts('motion');
  if (
    Object.keys(motion).join() !== 'standard,reduced' ||
    !Array.isArray(motion.standard) ||
    motion.standard.length !== 0 ||
    modifiers.motion?.default !== 'standard'
  ) {
    problems.push(
      `${RESOLVER_FILE}: motion must have an empty "standard" context, a "reduced" context and default "standard"`,
    );
  }
  const contract = modifiers.accent?.$extensions?.[ACCENT_CONTRACT]?.tokens;
  if (
    !Array.isArray(contract) ||
    contract.length === 0 ||
    !contract.every((t) => typeof t === 'string' && ALIAS.test(`{${t}}`))
  ) {
    problems.push(`${RESOLVER_FILE}: accent ${ACCENT_CONTRACT}.tokens must list token paths`);
  }

  const groupTypes = [];
  const set = (name) =>
    loadSources(
      srcDir,
      doc.sets?.[name]?.sources,
      `sets.${name}`,
      `set:${name}`,
      problems,
      groupTypes,
    );
  const ctx = (mod, map) =>
    Object.fromEntries(
      Object.keys(map).map((c) => [
        c,
        loadSources(srcDir, map[c], `modifiers.${mod}.${c}`, `${mod}:${c}`, problems, groupTypes),
      ]),
    );
  const model = {
    sets: { reference: set('reference'), scale: set('scale'), breakpoint: set('breakpoint') },
    theme: ctx('theme', theme),
    accent: ctx('accent', accent),
    motion: ctx('motion', motion),
    accentContract: Array.isArray(contract) ? [...contract] : [],
    groupTypes,
  };
  if (problems.length) throw new TokenBuildError(problems);
  return model;
}
