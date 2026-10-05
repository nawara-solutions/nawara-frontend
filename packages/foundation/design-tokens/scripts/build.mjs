#!/usr/bin/env node
// Builds dist/ (tokens.css, breakpoints.scss, manifest.json) from src/. Usage: node scripts/build.mjs [--out <dir>]
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from './lib/build.mjs';

const packageDir = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
const outIndex = args.indexOf('--out');
const outDir =
  outIndex >= 0 && args[outIndex + 1] ? resolve(args[outIndex + 1]) : resolve(packageDir, 'dist');

try {
  build({
    srcDir: resolve(packageDir, 'src'),
    outDir,
    packageJson: JSON.parse(readFileSync(resolve(packageDir, 'package.json'), 'utf8')),
  });
} catch (error) {
  console.error(error.problems ? error.message : `design tokens: ${error.message}`);
  process.exit(1);
}
