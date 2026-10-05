// Foundation contrast gate (ADR-0003 §10): the same formula and thresholds as Nawara Admin's check:contrast
// (WCAG 2.x relative luminance, exact ratio, solid colours only), evaluated in every theme and accent.
import { cssName } from './format.mjs';
import { contextTokens, resolveToken } from './resolve.mjs';

const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

export const contrastRatio = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/** Expands the pair groups; returns [fg, bg, min] triples or problems with the configuration itself. */
export function expandPairs(config) {
  const problems = [];
  const pairs = [];
  if (!Array.isArray(config?.groups) || config.groups.length === 0)
    return { pairs, problems: ['contrast.pairs.json: groups must be a non-empty array'] };
  config.groups.forEach((group, i) => {
    const names = (list) =>
      Array.isArray(list) &&
      list.length > 0 &&
      list.every((n) => typeof n === 'string' && n.startsWith('--nw-'));
    if (
      !names(group?.foregrounds) ||
      !names(group?.backgrounds) ||
      !(typeof group.min === 'number' && group.min >= 1)
    ) {
      problems.push(
        `contrast.pairs.json: group ${i} needs foregrounds, backgrounds (--nw-* names) and min >= 1`,
      );
      return;
    }
    for (const fg of group.foregrounds)
      for (const bg of group.backgrounds) pairs.push([fg, bg, group.min]);
  });
  return { pairs, problems };
}

/** Checks every pair in every theme × accent (standard motion). Returns problems; empty means the gate passes. */
export function checkContrast(model, config) {
  const { pairs, problems } = expandPairs(config);
  if (problems.length) return problems;
  for (const theme of Object.keys(model.theme)) {
    for (const accent of Object.keys(model.accent)) {
      const merged = contextTokens(model, { theme, accent });
      const byCss = new Map([...merged.values()].map((t) => [cssName(t.path), t.key]));
      const solid = (name) => {
        const key = byCss.get(name);
        if (!key) throw new Error(`${name} is not a token`);
        const token = resolveToken(merged, key);
        if (token.type !== 'color') throw new Error(`${name} is not a colour`);
        if (token.value.alpha !== undefined && token.value.alpha !== 1)
          throw new Error(`${name} is not a solid colour`);
        return token.value.hex;
      };
      for (const [fg, bg, min] of pairs) {
        try {
          const ratio = contrastRatio(solid(fg), solid(bg));
          if (ratio < min)
            problems.push(
              `contrast ${theme}/${accent}: ${fg} on ${bg} = ${ratio.toFixed(2)} (needs ${min})`,
            );
        } catch (error) {
          problems.push(`contrast ${theme}/${accent}: ${fg} on ${bg}: ${error.message}`);
        }
      }
    }
  }
  return problems;
}
