#!/usr/bin/env node
// Runs the repository's static architecture and safety checks (docs/ARCHITECTURE.md §6). Exit code 1 lists every violation.
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync, readdirSync, readlinkSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SHARED_STANDARD,
  SOURCE_FILE,
  checkActionPins,
  checkClaudeSettings,
  checkCycles,
  checkPackageManifest,
  checkRootManifest,
  checkSharedStandard,
  checkSourceFile,
  checkTokenSourceStyles,
  checkTrackedGenerated,
} from './lib/checks.mjs';

export function runChecks(root) {
  const problems = [];
  const read = (rel) => readFileSync(join(root, rel), 'utf8');
  const readIfExists = (path) => (existsSync(path) ? readFileSync(path, 'utf8') : undefined);

  // 1. ai-standard integration. Without the sibling layout (CI), only the link targets are checked.
  const standardDir = join(root, '..', 'ai-standard');
  const standardPresent = existsSync(standardDir);
  const links = {};
  for (const path of Object.keys(SHARED_STANDARD.symlinks)) {
    const abs = join(root, path);
    let target = null;
    try {
      if (lstatSync(abs).isSymbolicLink()) target = readlinkSync(abs);
    } catch {
      // missing: reported below
    }
    links[path] = { target, resolves: target !== null && existsSync(abs) };
  }
  const copies = {};
  for (const [path, source] of Object.entries(SHARED_STANDARD.copies)) {
    copies[path] = {
      local: readIfExists(join(root, path)),
      standard: readIfExists(join(standardDir, source)),
    };
  }
  problems.push(...checkSharedStandard({ links, copies, standardPresent }));

  // 1b. The root manifest and the repository's Claude Code hooks (the sibling write guard, the design-doc hook).
  const rootManifest = readIfExists(join(root, 'package.json'));
  problems.push(
    ...(rootManifest === undefined
      ? ['package.json: missing']
      : checkRootManifest(JSON.parse(rootManifest))),
  );
  problems.push(...checkClaudeSettings(readIfExists(join(root, '.claude', 'settings.json'))));

  // 2. GitHub Actions pinning.
  const workflowDir = join(root, '.github', 'workflows');
  if (existsSync(workflowDir)) {
    for (const f of readdirSync(workflowDir).filter((n) => /\.ya?ml$/.test(n))) {
      problems.push(...checkActionPins(`.github/workflows/${f}`, read(`.github/workflows/${f}`)));
    }
  }

  // 3. Workspace packages: packages/<layer>/<dir>/package.json.
  const packagesDir = join(root, 'packages');
  const packages = [];
  if (existsSync(packagesDir)) {
    for (const layer of readdirSync(packagesDir).filter((n) =>
      statSync(join(packagesDir, n)).isDirectory(),
    )) {
      for (const dir of readdirSync(join(packagesDir, layer)).filter((n) =>
        statSync(join(packagesDir, layer, n)).isDirectory(),
      )) {
        const manifestPath = join(packagesDir, layer, dir, 'package.json');
        if (!existsSync(manifestPath)) {
          problems.push(`packages/${layer}/${dir}: a package directory without package.json`);
          continue;
        }
        packages.push({ layer, dir, manifest: JSON.parse(readFileSync(manifestPath, 'utf8')) });
      }
    }
  }
  const workspaceLayers = Object.fromEntries(packages.map((p) => [p.manifest.name, p.layer]));
  const graph = {};
  for (const pkg of packages) {
    problems.push(...checkPackageManifest(pkg, workspaceLayers));
    graph[pkg.manifest.name] = Object.keys({
      ...pkg.manifest.dependencies,
      ...pkg.manifest.peerDependencies,
      ...pkg.manifest.optionalDependencies,
    }).filter((d) => d in workspaceLayers);
  }
  problems.push(...checkCycles(graph));

  // 4. Package sources.
  for (const pkg of packages) {
    const files = [...walk(join(packagesDir, pkg.layer, pkg.dir))].map((file) =>
      relative(root, file).split('\\').join('/'),
    );
    problems.push(...checkTokenSourceStyles(files));
    for (const path of files) {
      if (!SOURCE_FILE.test(path)) continue;
      const file = join(root, path);
      problems.push(
        ...checkSourceFile(
          { path, layer: pkg.layer, text: readFileSync(file, 'utf8'), manifest: pkg.manifest },
          workspaceLayers,
        ),
      );
    }
  }

  // 5. Generated output is never tracked (outside a git checkout, for example the checks' own fixtures, there is nothing to check).
  problems.push(...checkTrackedGenerated(trackedFiles(root)));
  return { problems, packageCount: packages.length, standardPresent };
}

function trackedFiles(root) {
  try {
    return execFileSync('git', ['ls-files', '-z', '--', 'packages'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .split('\0')
      .filter(Boolean);
  } catch {
    return [];
  }
}

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (['node_modules', 'dist', 'coverage', '.angular'].includes(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else yield p;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const { problems, packageCount, standardPresent } = runChecks(root);
  if (problems.length > 0) {
    console.error(`repository checks failed (${problems.length}):`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(
    `repository checks passed: root manifest, Claude hooks, ai-standard integration${standardPresent ? '' : ' (link targets only; ../ai-standard absent)'}, ` +
      `action pinning, untracked generated output, ${packageCount} workspace package(s): token-source stylesheets, layers, frameworks, names, publication boundary, install scripts, package-manager neutrality, dependency specs, cycles, declared and contained imports, product terms`,
  );
}
