// Test helpers: the real source copied to a temporary directory, then mutated. Negative fixtures are produced here at
// test time, so no invalid token data is ever committed.
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PACKAGE_DIR = fileURLToPath(new URL('..', import.meta.url));
export const SRC_DIR = join(PACKAGE_DIR, 'src');
export const PACKAGE_JSON = JSON.parse(readFileSync(join(PACKAGE_DIR, 'package.json'), 'utf8'));

export function tempDir(prefix = 'nawara-tokens-') {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

/** A copy of src/ in a temporary directory; `edit(file, fn)` mutates one JSON file of it. */
export function sourceCopy() {
  const { dir, cleanup } = tempDir();
  const src = join(dir, 'src');
  cpSync(SRC_DIR, src, { recursive: true });
  const edit = (file, fn) => {
    const path = join(src, file);
    const json = JSON.parse(readFileSync(path, 'utf8'));
    const result = fn(json);
    writeFileSync(path, `${JSON.stringify(result ?? json, null, 2)}\n`);
  };
  const write = (file, text) => writeFileSync(join(src, file), text);
  return { dir, src, edit, write, cleanup };
}

/** The files a packed tarball of this package must contain, exactly. */
export const PACKED_FILES = [
  'CHANGELOG.md',
  'README.md',
  'dist/breakpoints.scss',
  'dist/manifest.json',
  'dist/tokens.css',
  'package.json',
];

/** Problems with a packed file list: missing or unexpected files, and exports whose target is not packed. */
export function verifyPackedFiles(files, packageJson) {
  const problems = [];
  const set = new Set(files);
  for (const file of PACKED_FILES) if (!set.has(file)) problems.push(`missing ${file}`);
  for (const file of set) if (!PACKED_FILES.includes(file)) problems.push(`unexpected ${file}`);
  const targets = Object.values(packageJson.exports).flatMap((t) =>
    typeof t === 'string' ? [t] : Object.values(t),
  );
  for (const target of targets) {
    const file = target.replace(/^\.\//, '');
    if (!set.has(file)) problems.push(`export target ${target} is not in the tarball`);
  }
  return problems;
}
