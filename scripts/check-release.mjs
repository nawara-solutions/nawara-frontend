#!/usr/bin/env node
// Release preflight (ADR-0004). Never publishes and never contacts a registry.
//
//   node scripts/check-release.mjs
//     Every publishable workspace package (not "private"): manifest bound to GitHub Packages, a changelog section for its
//     version, and its real `npm pack` tarball free of credentials and registry configuration. Run by `npm run validate`
//     and CI after the packages are built.
//
//   node scripts/check-release.mjs --tag <dir>-v<version> --pack-destination <dir>
//     The release workflow: the tag must name a publishable package and its exact version, the changelog must date that
//     version, and the checked tarball is kept in <dir> (its path, the package name, version and dist-tag are written to
//     $GITHUB_OUTPUT when set). The workflow attests and publishes exactly that file.
import { execFileSync } from 'node:child_process';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import {
  checkChangelog,
  checkPublishableManifest,
  checkTarball,
  distTagOf,
  parseReleaseTag,
} from './lib/release.mjs';

function workspacePackages(root) {
  const found = [];
  const base = join(root, 'packages');
  if (!existsSync(base)) return found;
  for (const layer of readdirSync(base)) {
    for (const dir of readdirSync(join(base, layer))) {
      const path = join(base, layer, dir);
      if (!existsSync(join(path, 'package.json'))) continue;
      found.push({
        dir,
        path,
        packagePath: relative(root, path),
        manifest: JSON.parse(readFileSync(join(path, 'package.json'), 'utf8')),
      });
    }
  }
  return found;
}

/** Packs with npm exactly as `npm publish` would (scripts ignored: the build already ran), then reads the tarball back. */
function packAndRead(pkg, destination) {
  const [packed] = JSON.parse(
    execFileSync('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', destination], {
      cwd: pkg.path,
      encoding: 'utf8',
      env: { ...process.env, npm_config_update_notifier: 'false' },
    }),
  );
  const tarball = join(destination, packed.filename);
  const extracted = mkdtempSync(join(tmpdir(), 'nawara-release-'));
  try {
    execFileSync('tar', ['-xzf', tarball, '-C', extracted]);
    const files = {};
    const read = (dir) => {
      for (const name of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, name.name);
        if (name.isDirectory()) read(full);
        else files[relative(join(extracted, 'package'), full)] = readFileSync(full, 'utf8');
      }
    };
    read(join(extracted, 'package'));
    return { tarball, files };
  } finally {
    rmSync(extracted, { recursive: true, force: true });
  }
}

export function runReleaseCheck(root, { tag, packDestination } = {}) {
  const problems = [];
  const packages = workspacePackages(root);
  const checkOne = (pkg, released, destination) => {
    const local = [
      ...checkPublishableManifest(pkg.manifest, pkg.packagePath),
      ...checkChangelog(
        existsSync(join(pkg.path, 'CHANGELOG.md'))
          ? readFileSync(join(pkg.path, 'CHANGELOG.md'), 'utf8')
          : '',
        pkg.manifest.version,
        { released, where: `${pkg.packagePath}/CHANGELOG.md` },
      ),
    ];
    if (local.length > 0) return { problems: local };
    const { tarball, files } = packAndRead(pkg, destination);
    return { problems: checkTarball(files, pkg.manifest), tarball };
  };

  if (!tag) {
    const publishable = packages.filter((p) => p.manifest.private !== true);
    const scratch = mkdtempSync(join(tmpdir(), 'nawara-pack-'));
    try {
      for (const pkg of publishable) problems.push(...checkOne(pkg, false, scratch).problems);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
    return { problems, checked: publishable.map((p) => p.manifest.name) };
  }

  const parsed = parseReleaseTag(tag);
  if (!parsed) return { problems: [`tag ${tag}: not <package directory>-v<semver>`] };
  const pkg = packages.find((p) => p.dir === parsed.dir);
  if (!pkg) return { problems: [`tag ${tag}: no workspace package in packages/*/${parsed.dir}`] };
  if (pkg.manifest.private === true) {
    return { problems: [`tag ${tag}: ${pkg.manifest.name} is private and cannot be released`] };
  }
  if (pkg.manifest.version !== parsed.version) {
    return {
      problems: [
        `tag ${tag}: ${pkg.manifest.name} is at ${pkg.manifest.version}; bump the version in a reviewed pull request before tagging`,
      ],
    };
  }
  if (!packDestination) return { problems: ['--tag needs --pack-destination'] };
  mkdirSync(packDestination, { recursive: true });
  const result = checkOne(pkg, true, packDestination);
  return {
    problems: result.problems,
    checked: [pkg.manifest.name],
    release: result.tarball && {
      tarball: result.tarball,
      name: pkg.manifest.name,
      version: pkg.manifest.version,
      distTag: distTagOf(pkg.manifest.version),
    },
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const { values } = parseArgs({
    options: { tag: { type: 'string' }, 'pack-destination': { type: 'string' } },
  });
  const {
    problems,
    checked = [],
    release,
  } = runReleaseCheck(root, {
    tag: values.tag,
    packDestination: values['pack-destination'],
  });
  if (problems.length > 0) {
    console.error(`release checks failed (${problems.length}):`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  if (release && process.env.GITHUB_OUTPUT) {
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      `tarball=${release.tarball}\nname=${release.name}\nversion=${release.version}\ndist-tag=${release.distTag}\n`,
    );
  }
  console.log(
    release
      ? `release checks passed: ${release.name}@${release.version} (dist-tag ${release.distTag}) packed at ${release.tarball}; nothing published`
      : `release checks passed: ${checked.length} publishable package(s)${checked.length ? ` (${checked.join(', ')})` : ''}: GitHub Packages binding, changelog, tarball contents; nothing published`,
  );
}
