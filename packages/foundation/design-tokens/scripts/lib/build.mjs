// Orchestration: load → validate → contrast → emit into a temporary directory → replace the output directory.
// On any problem nothing is written and the previous output (if any) is left untouched.
import { mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { checkContrast } from './contrast.mjs';
import { emitCss, emitManifest, emitScss } from './emit.mjs';
import { TokenBuildError, loadModel } from './load.mjs';
import { validateModel } from './validate.mjs';

/** The only files the generator writes. Names are constants, never derived from token data. */
export const OUTPUT_FILES = ['tokens.css', 'breakpoints.scss', 'manifest.json'];

export function compile(srcDir, packageJson) {
  const model = loadModel(srcDir);
  const problems = validateModel(model);
  // DT1 ships the default accent only, which needs no selector. Emitting [data-accent] rules is future work.
  const extra = Object.keys(model.accent).filter((name) => name !== 'default');
  if (extra.length)
    problems.push(
      `accent ${extra.join(', ')}: [data-accent] emission is not implemented (only the default accent ships)`,
    );
  if (problems.length === 0) {
    let pairs;
    try {
      pairs = JSON.parse(readFileSync(join(srcDir, 'contrast.pairs.json'), 'utf8'));
    } catch (error) {
      problems.push(`contrast.pairs.json: ${error.message}`);
    }
    if (pairs) problems.push(...checkContrast(model, pairs));
  }
  if (problems.length) throw new TokenBuildError(problems);
  return {
    'tokens.css': emitCss(model),
    'breakpoints.scss': emitScss(model),
    'manifest.json': emitManifest(model, packageJson),
  };
}

/** Writes all outputs to a sibling temporary directory, then swaps it in place of `outDir`. */
export function writeOutputs(outDir, files) {
  const tmp = mkdtempSync(join(dirname(outDir), `.${basename(outDir)}-tmp-`));
  try {
    for (const name of OUTPUT_FILES)
      writeFileSync(join(tmp, name), files[name], { encoding: 'utf8' });
    rmSync(outDir, { recursive: true, force: true });
    renameSync(tmp, outDir);
  } catch (error) {
    rmSync(tmp, { recursive: true, force: true });
    throw error;
  }
}

export function build({ srcDir, outDir, packageJson }) {
  const files = compile(srcDir, packageJson);
  writeOutputs(outDir, files);
  return files;
}
