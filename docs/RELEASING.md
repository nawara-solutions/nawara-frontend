# Releasing a package

How a workspace package is published to GitHub Packages ([ADR-0004](adr/0004-release-and-publication.md), within
[ADR-0002](adr/0002-package-scope-and-consumption-model.md)). How products install it: [`CONSUMPTION.md`](CONSUMPTION.md).

> **Status (2026-10-06): the release workflow exists and is disabled.** Nothing has been published. Publication needs the
> owner configuration below, then a release pull request and a tag, each an owner decision.

## Owner configuration

One-time settings, done by the owner in GitHub (none of them is made by an agent or by this repository). Until all of 1–3
are in place, `.github/workflows/release.yml` skips its job.

1. **Tag ruleset** (repository → Settings → Rules → Rulesets → New tag ruleset): target tags matching `*-v*`; restrict
   creation, update and deletion to the owner (bypass list: repository admins only). A release tag is then an owner act, and a
   published tag cannot be moved.
2. **Environment `npm-publish`** (Settings → Environments): required reviewer = the owner; deployment tags rule = `*-v*`
   only (no branches). Create it before step 3: a job that names a missing environment would create it unprotected.
3. **Repository variable `NPM_PUBLISH_ENABLED` = `true`** (Settings → Secrets and variables → Actions → Variables). It
   switches the workflow on; deleting it switches publication off again. No secret is needed: the job uses its own
   `GITHUB_TOKEN`.
4. **Check the Actions token policy** (organization and repository → Settings → Actions → General → Workflow permissions):
   the workflow requests `packages: write`, `id-token: write` and `attestations: write` explicitly; an organization policy
   that caps these would make the publish step fail with 403.
5. **Reserve the `nawara-solutions` organization on npmjs.com** and publish nothing there (dependency-confusion protection,
   [`CONSUMPTION.md`](CONSUMPTION.md#dependency-confusion)).
6. **After the first publication of each package** (github.com → the organization → Packages → the package → Package
   settings):
   - **Visibility.** Decide public or private. A public package on a public repository costs nothing; a private one counts
     against the Free plan's storage and transfer quota. Installing requires authentication either way.
   - **Manage Actions access:** add each consuming product repository (`nawara-admin`, later `nawara-drive`,
     `nawara-school`) with the **Read** role, so their workflows' `GITHUB_TOKEN` can install it. This repository keeps
     **Write** (it was linked on first publication through the package's `repository` field).
   - **License.** Packages declare `"license": "UNLICENSED"` (no rights granted) until the owner chooses a license.

## Release procedure

1. **Release pull request** (normal branch, review and CI): set `version` in the package's `package.json` to the new SemVer
   version (rules: the package README, "Versioning"), date its changelog section `## x.y.z (YYYY-MM-DD)`, and run
   `npm install --package-lock-only --ignore-scripts` so the lockfile records the version. Merge it (squash).
2. **Tag the merge commit on `main`** (owner): `git tag design-tokens-v0.1.0 <merge sha>` then
   `git push origin design-tokens-v0.1.0`. Format: `<package directory>-v<version>`; one tag per package release.
3. **Approve the `npm-publish` deployment** in the workflow run. The job:
   - checks that the tagged commit is on `main`;
   - runs `npm ci --ignore-scripts` and the full `npm run validate`;
   - runs `node scripts/check-release.mjs --tag <tag>`: the tag names a publishable package at exactly that version, the
     changelog section is dated, and the packed tarball holds no credential or registry configuration;
   - attests the tarball (GitHub artifact attestation) and publishes **that file** with `npm publish --ignore-scripts`,
     under the `latest` dist-tag, or `next` for a pre-release (`x.y.z-rc.1`).
4. **Verify** (read-only): the package page shows the version and the attestation;
   `gh attestation verify <tarball> --repo nawara-solutions/nawara-frontend` succeeds on a downloaded tarball;
   `npm view @nawara-solutions/<name>@<version> --registry https://npm.pkg.github.com` (with a `read:packages` token) answers.

A published version is immutable. A bad release is fixed by a new version; deprecate the bad one if needed
(`npm deprecate`, owner action). Never delete a version a product may have installed.

## Checks without publishing

`npm run check:release` (part of `npm run validate` and CI) packs every publishable package and checks its manifest binding,
changelog section and tarball contents. It never publishes and never contacts a registry.
