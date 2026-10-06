# Consuming nawara-frontend packages

> **Status (2026-10-06): distribution implemented, nothing published.** `@nawara-solutions/design-tokens` 0.1.0 is bound to
> GitHub Packages ([ADR-0002](adr/0002-package-scope-and-consumption-model.md)); the release process and its disabled workflow
> are [ADR-0004](adr/0004-release-and-publication.md) and [`RELEASING.md`](RELEASING.md). No token, secret or registry setting
> exists yet: the first publication needs the owner configuration in `RELEASING.md` and its own owner decision. No product
> consumes a package yet; each adoption is that product's own authorized task.

## 1. Evidence (2026-10-05)

- GitHub organization `nawara-solutions` (Free plan). `nawara-frontend`, `nawara-admin`, `nawara-core`, `nawara-drive` and `nawara-school` are
  public repositories. The organization has **no npm package** in GitHub Packages today.
- **No Nawara repository uses a private registry**: no `.npmrc` with a registry, no `publishConfig`. Core's `@nawara/service-kit`
  and `@nawara/audit-contract` are `private: true` workspace libraries consumed only inside Core.
- Products are independent repositories with their own lockfiles: Admin (npm 11.16), Drive (npm 11.16, per-app installs),
  School (pnpm 9 + Turborepo).
- Admin's documentation anticipated a single `@nawara/frontend-kit`; this repository replaces that plan with layered packages.

## 2. Options considered

| Option | Verdict |
|---|---|
| **GitHub Packages (npm registry `https://npm.pkg.github.com`)** | **Recommended.** Same organization, same permissions model, packages linked to this repository, no new vendor or account, `GITHUB_TOKEN` can publish from Actions. |
| Public npmjs.com organization | Not standardized in Nawara; needs a new account and a new trust boundary (npm tokens). Reconsider only if packages must be installable without authentication. |
| Another private registry | None is in use for Nawara. |
| Git dependencies (`github:nawara-solutions/nawara-frontend#tag`) | Rejected: installs source, not built artifacts; runs the package's lifecycle scripts on the consumer's machine; no workspace subpath support. |
| Copying code into each product | Rejected: the duplication this repository exists to stop. |
| Merging products into one monorepo | Rejected: products are deliberately independent repositories. |

## 3. Recommended model

### Names and scope

GitHub Packages requires an npm scope equal to the owning account, so packages are `@nawara-solutions/*` (not `@nawara/*`, which
is Core's internal workspace scope):

- framework-independent: `@nawara-solutions/<name>` (for example `@nawara-solutions/design-tokens`);
- Angular: `@nawara-solutions/angular-<name>` (for example `@nawara-solutions/angular-ui`, planned).

`npm run check:repo` already enforces the names and refuses any package that is neither `private` nor bound to GitHub Packages
through `publishConfig.registry`.

### Versioning and compatibility

- **SemVer per package**, independent versions. `0.x` while the first slices are extracted (breaking changes allowed, announced
  in the changelog); `1.0.0` once an API has two consumers and has been stable through one product release.
- **Angular packages declare Angular as a peer dependency** with the major the products run (`^22.x`). Moving to a new Angular
  major is a major release of every Angular package. Products upgrade Angular and the Angular packages together.
- A **changelog per package**. Versions are set explicitly in a reviewed release pull request; no release tool derives them
  ([ADR-0004](adr/0004-release-and-publication.md)).
- Products **pin exact versions** with their lockfile and receive updates through their own Dependabot pull requests.

### Publication

Implemented by [ADR-0004](adr/0004-release-and-publication.md); procedure and owner settings in [`RELEASING.md`](RELEASING.md).

- Only from a release tag `<package directory>-v<version>` on a commit of `main`, by `.github/workflows/release.yml` with
  `permissions: { contents: read, packages: write, id-token: write, attestations: write }`, after approval in the
  `npm-publish` environment; never from pull requests and never from a developer machine. Disabled until the owner sets
  `NPM_PUBLISH_ENABLED`.
- The tarball is built in CI from a clean `npm ci --ignore-scripts`, checked by `scripts/check-release.mjs` (no credential or
  registry configuration inside), attested with a GitHub artifact attestation, and published as that exact file. `dist/` is
  never committed.

### Consumption from a product

Each product commits a project `.npmrc` that maps only the scope, never a credential:

```ini
@nawara-solutions:registry=https://npm.pkg.github.com
```

- **CI:** GitHub Packages requires authentication even to install public packages. The product's workflow uses its own
  `GITHUB_TOKEN` with `packages: read`; each package grants the product repository read access in its package settings
  (Admin, Drive, School). No long-lived secret is created. The project `.npmrc` may carry an **environment reference**
  (`//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}`, the form `actions/setup-node` writes); npm and pnpm both expand it
  at install time. It is a reference, never a value.
- **Developers:** a personal access token (classic) with `read:packages` in the **user-level** `~/.npmrc`
  (`//npm.pkg.github.com/:_authToken=…`), never in a repository. (GitHub Packages' npm registry does not accept fine-grained
  tokens at the time of writing; re-check before onboarding.)
- **Docker builds** (Admin's production image) receive the token as a BuildKit secret mount, never as a build argument or layer.

#### Setup by environment

What a product needs once it adopts a package (each change is that product's own task). `NODE_AUTH_TOKEN` is the only variable
name used.

| Where | Configuration | Token |
|---|---|---|
| Project `.npmrc` (committed) | `@nawara-solutions:registry=https://npm.pkg.github.com` and, optionally, `//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}` (a reference; npm 11 tolerates it unset) | none |
| Developer machine | user-level `~/.npmrc`: `//npm.pkg.github.com/:_authToken=<classic PAT, read:packages>`, or export `NODE_AUTH_TOKEN` | personal, never committed |
| GitHub Actions | job `permissions: { contents: read, packages: read }`; `actions/setup-node` with `registry-url: https://npm.pkg.github.com` and `scope: '@nawara-solutions'`; `env: NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}` on the install step only | the job's `GITHUB_TOKEN`; the package grants the repository **Read** ([`RELEASING.md`](RELEASING.md#owner-configuration)) |
| Docker build | `RUN --mount=type=secret,id=npm_token,env=NODE_AUTH_TOKEN npm ci --ignore-scripts` in the build stage (Dockerfile syntax 1.10 or later), with the project `.npmrc` reference above; the runtime stage copies only built output | passed with `docker build --secret id=npm_token,env=NODE_AUTH_TOKEN`, or `secrets: npm_token=${{ secrets.GITHUB_TOKEN }}` in `docker/build-push-action`; never `ARG`/`ENV`, never in a layer |

A frontend bundle never contains the token: it is used only by the package manager at install time, and shared packages
ship no install script and no configuration file (`check:release`).

### Package-manager neutrality (npm, pnpm, others)

`nawara-frontend` uses npm workspaces **internally**. That choice never reaches consumers: a published package is a standard
npm-format tarball that npm (Admin, Drive), pnpm (School) and other clients install the same way. To keep it that way:

- **Scope mapping:** npm and pnpm both read the project `.npmrc` shown above (scope registry and `${…}` token references).
  A Yarn Berry consumer would use `npmScopes` in `.yarnrc.yml` instead; no Nawara product uses Yarn today.
- **Declared imports:** pnpm's `node_modules` is strict (no hoisting), so a package that imports something it does not declare
  works here and breaks in School. `check:repo` refuses undeclared imports.
- **Registry ranges between packages:** packages depend on each other through plain version ranges (npm workspaces have no
  `workspace:` protocol), so published manifests need no rewriting and resolve identically in every client.
- **No package-manager constraint:** packages never set `packageManager` or `engines.npm/pnpm/yarn` (`check:repo`);
  `engines.node` is allowed.
- **Peer dependencies:** pnpm reports peer conflicts strictly; Angular packages declare honest peer ranges covering the products'
  Angular versions.
- **Exact pins:** npm `--save-exact` / pnpm `add --save-exact` (`-E`); each product's own lockfile (`package-lock.json`,
  `pnpm-lock.yaml`) records the resolution.
- **Local tarballs:** `npm pack` output installs with `pnpm add <path>.tgz` as well as `npm install <path>.tgz`.

### Dependency confusion

If a consumer lacks the scope mapping, its client resolves `@nawara-solutions/*` on the public npmjs.com registry, where anyone
could register that organization name and publish look-alike packages. Mitigations: every product commits the scope mapping
before its first install of a shared package, and the owner **reserves the `nawara-solutions` organization on npmjs.com**
(publishing nothing there) so the names cannot be claimed by someone else.

### Local development across repositories

1. **Develop and test inside this repository first** (unit tests; later a showcase application). This is the primary loop.
2. To try an unreleased change in a product: `npm pack` the package here and install the tarball in the product
   (`npm install …/nawara-solutions-angular-ui-0.3.0.tgz`, or `pnpm add …` in School), then restore the lockfile before
   committing. The tarball is exactly what would be published.
3. **Avoid `npm link`, `pnpm link` and `file:`/`link:` symlinks for framework packages:** a symlinked library resolves `@angular/core` from its own
   `node_modules`, which gives the application two Angular instances (dependency-injection and signal failures).
4. A product never commits a dependency on a local path into this repository (`check:repo` refuses the reverse direction here;
   product repositories should add the same rule when they adopt the first package).

## 4. Trust boundaries

- Who can publish: workflows of `nawara-solutions/nawara-frontend` on protected refs only.
- What a consumer runs at install: nothing — shared packages may not define install-time lifecycle scripts (`check:repo`).
- Secrets: none in this repository. Publication uses the workflow's `GITHUB_TOKEN`; consumption uses each product's
  `GITHUB_TOKEN` in CI and personal tokens in user-level configuration on developer machines.
- Name squatting: the `nawara-solutions` organization reserved on npmjs.com (owner action) and committed scope mappings
  close the dependency-confusion path.
