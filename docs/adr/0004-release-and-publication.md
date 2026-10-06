# 0004. Release and publication of workspace packages to GitHub Packages

- **Status:** Proposed <!-- Proposed | Accepted | Rejected | Superseded by ADR-000X --> (becomes Accepted when the owner merges
  the pull request that introduces it. **Acceptance decides the release process only: nothing is published** until the owner
  completes the configuration in [`RELEASING.md`](../RELEASING.md#owner-configuration) and pushes a release tag.)
- **Date:** 2026-10-06
- **Deciders:** Anwar (project owner); drafted in the owner-authorized distribution task for `@nawara-solutions/design-tokens`

## Context

ADR-0002 chose GitHub Packages (`https://npm.pkg.github.com`, scope `@nawara-solutions`) and left a follow-up: decide the release
tooling, changelogs, the publish workflow and its attestation before the first publication. Facts on 2026-10-06 (`main`
`87bf10a`): one workspace package, `@nawara-solutions/design-tokens` 0.1.0, `private: true`, with a hand-written changelog and
SemVer rules in its README; CI builds, tests and packs it and proves an offline consumer install, and never publishes. The
organization is on the GitHub Free plan; the repository is public. GitHub Packages publishes from Actions with the workflow's
`GITHUB_TOKEN` and supports GitHub artifact attestations; npm's `--provenance` is an npmjs.com feature and does not apply.

## Options considered

1. **Changesets** (the candidate CONSUMPTION.md named): change files per pull request, automated version PRs and publishing.
   Built for many packages released often; adds a dependency, a bot pull-request flow and generated changelogs for a
   repository with one package and rare releases.
2. **semantic-release or release-please**: versions derived from commit messages. Our commit types describe the repository
   change, not a package's public API (a `feat` in a script is not a token release), so the derived version could be wrong.
3. **Explicit versions plus a tag-triggered workflow** (no new tool): the version and the dated changelog section are edited
   in a reviewed pull request; after merge the owner pushes the tag `<package directory>-v<version>`; a workflow on that tag
   re-validates, packs, attests and publishes exactly that tarball.

## Decision

We choose **Option 3**, with these rules (implemented in `.github/workflows/release.yml` and `scripts/check-release.mjs`):

1. **One release = one package, one version, one tag** `<package directory>-v<version>` (for example `design-tokens-v0.1.0`),
   pointing at a commit on `main`. Versions follow each package's SemVer rules (ADR-0002, ADR-0003 §3); a pre-release
   (`x.y.z-rc.1`) is published under the `next` dist-tag, any other version under `latest`.
2. **The version is decided in review, never by the workflow.** The release pull request sets `version` and dates the
   changelog section (`## x.y.z (YYYY-MM-DD)`). The workflow refuses a tag whose version differs from the manifest, an undated
   section, a private package or a commit not on `main`; it never bumps, commits or pushes.
3. **Publishable shape** (`check:release`, run by `validate` and CI on every pull request): a package that is not `private`
   sets `publishConfig` to exactly `{ "registry": "https://npm.pkg.github.com" }`, a scoped name, a SemVer version, a
   `repository` pointing at its directory here (GitHub links the package to this repository through it), a `files` list and
   a `license`; its real `npm pack` tarball contains no `.npmrc`, environment file, key, nested archive or credential-shaped
   string. `check:repo` keeps refusing any package that is neither private nor bound to GitHub Packages, and install scripts.
4. **Controlled publication.** The workflow runs only on a release tag, only when the repository variable
   `NPM_PUBLISH_ENABLED` is `true`, and only after approval in the `npm-publish` environment. It reruns the full
   `npm run validate` from `npm ci --ignore-scripts`, attests the tarball (`actions/attest-build-provenance`) and publishes that
   same file with `npm publish <tarball> --ignore-scripts`. Its permissions are `contents: read`, `packages: write`,
   `id-token: write`, `attestations: write`; the only credential is the job's `GITHUB_TOKEN`, exposed to the publish step.
5. **No stored secret, no developer-machine publication.** Nothing in this repository, a tarball or a product image carries a
   token. Consumers authenticate as [`CONSUMPTION.md`](../CONSUMPTION.md) describes.

## Consequences

- **Easier:** no new dependency or bot; what is published is exactly the reviewed, validated, attested tarball; a wrong tag
  fails before anything leaves CI; publication stays off until the owner has protected tags and the environment.
- **Harder:** releasing takes a pull request plus a tag push; with many packages released together, Changesets may become
  worthwhile (revisit then, in a new ADR). A published version is immutable: a mistake is fixed by a new version (and, if
  needed, a deprecation), not by republishing.
- **Owner configuration** (tag ruleset, environment with reviewer and repository variable, which together gate the workflow;
  the Actions token policy; package access for products; npmjs.com organization reservation): listed in
  [`RELEASING.md`](../RELEASING.md#owner-configuration).
- **Follow-up:** the first release (`design-tokens-v0.1.0`) is its own owner decision; each product adopts a package in its own
  authorized task after the package is available.
