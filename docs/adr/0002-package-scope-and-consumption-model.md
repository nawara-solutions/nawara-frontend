# 0002. Package scope `@nawara-solutions` and consumption through GitHub Packages

- **Status:** Accepted <!-- Proposed | Accepted | Rejected | Superseded by ADR-000X --> (2026-10-05, by the owner, for the
  initial bootstrap publication. **Acceptance decides the direction only: nothing is published,** and the release
  workflow needs its own authorization.)
- **Date:** 2026-10-05
- **Deciders:** Anwar (project owner); drafted during the repository bootstrap

## Context

Admin, Drive and School are independent repositories with their own lockfiles; they need a versioned way to consume
`nawara-frontend` packages (ADR-0001). Evidence on 2026-10-05: the GitHub organization `nawara-solutions` (Free plan) hosts every
Nawara repository and has no npm package; no Nawara repository configures a registry or `publishConfig`; Core's `@nawara/*`
libraries are private workspace packages never published. GitHub Packages' npm registry accepts only packages whose scope is
the owning account. Admin's documents anticipated the name `@nawara/frontend-kit`. Details and alternatives:
[`docs/CONSUMPTION.md`](../CONSUMPTION.md).

## Options considered

1. **GitHub Packages, scope `@nawara-solutions`.** Same organization and permission model; publication with the workflow's
   `GITHUB_TOKEN`; consumers authenticate even for public packages (per-repository read grants in CI, a personal token on
   developer machines).
2. **Public npmjs.com organization (scope `@nawara` if available).** Installs without authentication; but introduces a new
   vendor account, long-lived npm publish tokens and a public supply-chain surface not standardized in Nawara.
3. **Git dependencies on tags.** No registry; but installs source rather than built artifacts and runs lifecycle scripts on the
   consumer.
4. **Copy into products.** No infrastructure; it is the duplication this repository exists to prevent.

## Decision

We propose **Option 1**: packages are named `@nawara-solutions/<name>` (framework-independent) and
`@nawara-solutions/angular-<name>` (Angular), are published only to `https://npm.pkg.github.com` by a future release workflow on
protected refs, follow SemVer per package (`0.x` during extraction), declare framework packages as peer dependencies, and are
consumed with a project `.npmrc` that maps the scope and at most references an environment variable for the token, never a
committed credential. `npm run check:repo` already refuses a package that is neither `private` nor bound to GitHub Packages,
and any install-time lifecycle script.

**Package-manager neutrality.** npm workspaces are internal to this repository; consumers keep their own package manager
(npm in Admin and Drive, pnpm + Turborepo in School). Published packages are standard npm tarballs; they declare every import
(pnpm has no hoisting), depend on each other through plain version ranges, and never set `packageManager` or
`engines.npm/pnpm/yarn` — all enforced by `check:repo` ([`CONSUMPTION.md`](../CONSUMPTION.md) §3).

## Consequences

- **Easier:** no new vendor or secret; publication rights follow repository permissions; accidental public-npm publication is
  blocked by the checker.
- **Harder:** every consumer (CI, Docker builds, developers) needs authentication to install, including for public packages;
  each package must grant read access to each product repository; npm's own provenance attestation is not available (artifact
  attestations instead).
- **Risk — dependency confusion:** a consumer without the scope mapping would resolve `@nawara-solutions/*` on public
  npmjs.com. Every product commits the mapping before adopting a package, and the owner reserves the `nawara-solutions`
  organization on npmjs.com without publishing there.
- **Follow-up:** a release ADR/TDD (tooling such as Changesets, changelogs, the publish workflow and its attestation) before the
  first publication; product-side `.npmrc` and CI changes in each product's own authorized task; update Admin's documents that
  name `@nawara/frontend-kit`.
