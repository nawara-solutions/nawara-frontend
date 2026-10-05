// Resolver semantics (DTCG Resolver 2025.10): sources apply in resolutionOrder, the last occurrence of a token wins;
// aliases resolve against the merged set of one context combination.

/** The merged tokens (key → token) of one context combination, in resolution order. */
export function contextTokens(
  model,
  { theme = 'light', accent = 'default', motion = 'standard' } = {},
) {
  const merged = new Map();
  const layers = [
    model.sets.reference,
    model.sets.scale,
    model.sets.breakpoint,
    model.theme[theme] ?? [],
    model.accent[accent] ?? [],
    model.motion[motion] ?? [],
  ];
  for (const layer of layers) for (const token of layer) merged.set(token.key, token);
  return merged;
}

/** Follows a token's alias chain to its literal token. Throws on an unresolved alias, a cycle or a type mismatch. */
export function resolveToken(merged, key) {
  const seen = [];
  let token = merged.get(key);
  if (!token) throw new Error(`unknown token ${key}`);
  while (token.alias) {
    seen.push(token.key);
    const target = token.alias.join('.');
    if (seen.includes(target)) throw new Error(`alias cycle ${[...seen, target].join(' → ')}`);
    const next = merged.get(target);
    if (!next) throw new Error(`${token.label}:${token.key}: unresolved alias {${target}}`);
    if (next.type !== token.type)
      throw new Error(
        `${token.label}:${token.key}: alias {${target}} is ${next.type}, expected ${token.type}`,
      );
    token = next;
  }
  return token;
}

/** Every context combination the source defines, in a stable order. */
export function contextCombinations(model) {
  const combos = [];
  for (const theme of Object.keys(model.theme)) {
    for (const accent of Object.keys(model.accent)) {
      for (const motion of Object.keys(model.motion)) combos.push({ theme, accent, motion });
    }
  }
  return combos;
}
