// Pure release checks (ADR-0004): what a publishable package, its release tag, its changelog and its packed tarball must
// satisfy before the release workflow may publish it to GitHub Packages. No function here touches the network or a registry.
import { GITHUB_PACKAGES_REGISTRY } from './checks.mjs';

export const SCOPE = '@nawara-solutions';
export const REPOSITORY_URL = 'git+https://github.com/nawara-solutions/nawara-frontend.git';

/** SemVer 2.0.0 without build metadata (npm ignores it for identity, so a release never uses it). */
const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?$/;

/**
 * A release tag is `<package directory>-v<version>`, for example `design-tokens-v0.1.0` or `angular-ui-v0.3.0-rc.1`.
 * Returns `{ dir, version }` or `null`.
 */
export function parseReleaseTag(tag) {
  const match = /^([a-z0-9]+(?:-[a-z0-9]+)*)-v(.+)$/.exec(tag ?? '');
  if (!match || !SEMVER.test(match[2])) return null;
  return { dir: match[1], version: match[2] };
}

/** The tag that releases `version` of the package in `packages/<layer>/<dir>`. */
export const releaseTagOf = (dir, version) => `${dir}-v${version}`;

/** A pre-release (`x.y.z-…`) is published under the `next` dist-tag, never as `latest`. */
export const distTagOf = (version) => (version.includes('-') ? 'next' : 'latest');

/**
 * A package that is not `private` is publishable: it must be bound to GitHub Packages, carry a SemVer version, point
 * npm and GitHub back to its directory in this repository (GitHub links the package to the repository through
 * `repository`), and declare the files it ships.
 */
export function checkPublishableManifest(manifest, packagePath) {
  const where = `${packagePath}/package.json`;
  if (manifest.private === true) return [];
  const problems = [];
  if (manifest.publishConfig?.registry !== GITHUB_PACKAGES_REGISTRY) {
    problems.push(`${where}: publishConfig.registry must be ${GITHUB_PACKAGES_REGISTRY}`);
  }
  const extraConfig = Object.keys(manifest.publishConfig ?? {}).filter((k) => k !== 'registry');
  if (extraConfig.length > 0) {
    problems.push(
      `${where}: publishConfig may only set "registry" (found ${extraConfig.join(', ')}); access and dist-tags are decided by the release workflow`,
    );
  }
  if (!manifest.name?.startsWith(`${SCOPE}/`)) {
    problems.push(`${where}: a publishable package is scoped ${SCOPE}`);
  }
  if (!SEMVER.test(manifest.version ?? '')) {
    problems.push(`${where}: version "${manifest.version}" is not SemVer (x.y.z or x.y.z-pre)`);
  }
  if (
    manifest.repository?.url !== REPOSITORY_URL ||
    manifest.repository?.directory !== packagePath
  ) {
    problems.push(
      `${where}: repository must be { "url": "${REPOSITORY_URL}", "directory": "${packagePath}" }`,
    );
  }
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
    problems.push(`${where}: a publishable package lists the files it ships in "files"`);
  }
  if (!manifest.license) {
    problems.push(`${where}: a publishable package declares a "license" (or "UNLICENSED")`);
  }
  return problems;
}

/**
 * The changelog must have a `## <version>` section. For a release (`released: true`) the heading must carry the release
 * date (`## 1.2.0 (2026-10-06)`) and must not say "unreleased": the version is decided in a reviewed pull request.
 */
export function checkChangelog(text, version, { released, where = 'CHANGELOG.md' }) {
  const escaped = version.replace(/[.+-]/g, '\\$&');
  const heading = new RegExp(`^## ${escaped}(?:\\s.*)?$`, 'm').exec(text ?? '');
  if (!heading) return [`${where}: no "## ${version}" section`];
  if (released && !/^## \S+ \(\d{4}-\d{2}-\d{2}\)$/.test(heading[0])) {
    return [
      `${where}: "${heading[0]}" must read "## ${version} (YYYY-MM-DD)" before ${version} is released`,
    ];
  }
  return [];
}

/** File names that never belong in a published tarball: registry or environment configuration, keys, nested archives. */
const FORBIDDEN_FILE =
  /(^|\/)(\.npmrc|\.yarnrc(\.yml)?|\.env(\..*)?|.*\.pem|.*\.key|.*\.p12|.*\.tgz|node_modules)(\/|$)/i;

/** Credential shapes that must never appear in packaged content. */
const CREDENTIALS = [
  [/\bgh[pousr]_[A-Za-z0-9]{36,}\b/, 'a GitHub token'],
  [/\bgithub_pat_[A-Za-z0-9_]{22,}\b/, 'a GitHub fine-grained token'],
  [/\bnpm_[A-Za-z0-9]{36}\b/, 'an npm token'],
  [/_authToken\s*=/, 'a registry auth token setting'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'a private key'],
];

/** `files` maps each tarball path (without the `package/` prefix) to its text content. */
export function checkTarball(files, manifest) {
  const problems = [];
  const paths = Object.keys(files);
  if (!paths.includes('package.json')) problems.push('tarball: no package.json');
  for (const path of paths) {
    if (FORBIDDEN_FILE.test(path)) problems.push(`tarball: ${path} must not be published`);
    for (const [pattern, what] of CREDENTIALS) {
      if (pattern.test(files[path])) problems.push(`tarball: ${path} contains ${what}`);
    }
  }
  if (files['package.json']) {
    const packed = JSON.parse(files['package.json']);
    if (packed.name !== manifest.name || packed.version !== manifest.version) {
      problems.push(
        `tarball: packs ${packed.name}@${packed.version}, expected ${manifest.name}@${manifest.version}`,
      );
    }
  }
  return problems;
}
