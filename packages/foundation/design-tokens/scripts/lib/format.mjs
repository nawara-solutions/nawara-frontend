// Deterministic CSS formatting of validated token values. No locale-dependent API is used anywhere.

export const cssName = (path) => `--nw-${path.join('-')}`;

/** Shortest stable decimal text of a number, without floating-point noise (0.3 * 100 → "30"). */
export function formatNumber(n) {
  const text = String(Number(n.toPrecision(12)));
  if (/e/i.test(text)) throw new Error(`number ${n} cannot be written without an exponent`);
  return text;
}

// Generic families and keywords stay unquoted; single-word names stay unquoted (Menlo), as in Nawara Admin.
const UNQUOTED = new Set([
  'serif',
  'sans-serif',
  'monospace',
  'cursive',
  'fantasy',
  'system-ui',
  'ui-serif',
  'ui-sans-serif',
  'ui-monospace',
  'ui-rounded',
  'emoji',
  'math',
  'fangsong',
  '-apple-system',
]);
const quoteFamily = (name) => (UNQUOTED.has(name) || /^[A-Za-z]+$/.test(name) ? name : `'${name}'`);

/** The CSS text of a literal (non-alias) token. Values were validated in load.mjs. */
export function literal(token) {
  const v = token.value;
  switch (token.type) {
    case 'color': {
      if (v.alpha === undefined || v.alpha === 1) return v.hex;
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(v.hex.slice(i, i + 2), 16));
      return `rgb(${r} ${g} ${b} / ${formatNumber(v.alpha * 100)}%)`;
    }
    case 'dimension':
      return v.value === 0 ? '0' : `${formatNumber(v.value)}${v.unit}`;
    case 'duration':
      return `${formatNumber(v.value)}${v.unit}`;
    case 'cubicBezier':
      return `cubic-bezier(${v.map(formatNumber).join(', ')})`;
    case 'fontWeight':
    case 'number':
      return formatNumber(v);
    case 'fontFamily':
      return (Array.isArray(v) ? v : [v]).map(quoteFamily).join(', ');
    default:
      throw new Error(`cannot format type ${token.type}`);
  }
}

/** Natural, locale-independent order of token paths: numeric segments numerically, others by code unit. */
export function comparePaths(a, b) {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const x = a[i];
    const y = b[i];
    if (x === y) continue;
    const nx = /^\d+$/.test(x);
    const ny = /^\d+$/.test(y);
    if (nx && ny) return Number(x) - Number(y);
    if (nx !== ny) return nx ? -1 : 1;
    return x < y ? -1 : 1;
  }
  return a.length - b.length;
}
