# CLAUDE.md

This file gives Claude (via Claude Code) context on the nawara-frontend repository. Read this first before making changes.

## What this repository is

**nawara-frontend is the shared frontend platform of the Nawara ecosystem**: framework-independent foundations (`foundation`
layer) and framework-specific shared implementations (`angular` layer first), consumed by independent product repositories
(Nawara Admin, Nawara Drive, Nawara School, future products) as versioned packages. It is **not** an application, **not** a
product, and **not** "one Angular app for everything". Full model: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

**Current state: one package, `@nawara-solutions/design-tokens` 0.1.0** (bound to GitHub Packages, not yet published, no consumer yet; DT1 +
DT2a of ADR-0003). Releases follow [ADR-0004](docs/adr/0004-release-and-publication.md) and [`docs/RELEASING.md`](docs/RELEASING.md):
a reviewed version bump, then an owner tag; the release workflow is disabled until the owner configures it. Its `src/` JSON is the token source of truth and `dist/` is generated, never edited or committed. Further slices
(DT2b shadows, deferred until a shared component needs them; Admin adoption; other extractions from [`docs/ADMIN-EXTRACTION-INVENTORY.md`](docs/ADMIN-EXTRACTION-INVENTORY.md))
happen only when the owner authorizes them.

## Shared AI-Agent Workflow Standard

Branch naming, commit message format, PR conventions and the ADR/ADD/SDD/TDD design-doc process are defined once for all Nawara
Solutions projects in [`../ai-standard/README.md`](../ai-standard/README.md). This repo's `/branch`, `/commit`, `/pr`,
`/design-doc` commands, its `design-conformance`/`docs-writer`/`tech-lead` agents, its design-doc hook, `CONTRIBUTING.md`,
`docs/README.md`, `.husky/commit-msg` and `docs/<type>/template.md` are **symlinks** into that shared source. **Editing one of
them from here edits it for every Nawara project:** don't, unless the owner explicitly asks for a shared-standard change (then
STOP and report the proposal separately). `commitlint.config.cjs`, `.github/PULL_REQUEST_TEMPLATE.md` and `.mcp.json` are real
copies; `docs/<type>/README.md` were seeded from the standard and are owned here. The symlinks need the sibling layout
(`ai-standard/` next to `nawara-frontend/` under one parent folder); `npm run check:repo` verifies them.

Never run `prettier --write` (or any formatter/fixer) on the symlinked shared files; `.prettierignore` excludes them.

**Write guard (local to this repository).** `.claude/hooks/guard-sibling-writes.sh` (`PreToolUse`) denies any `Write`/`Edit`
whose resolved target is outside this repository but inside the parent folder — a write through an ai-standard symlink or
into a sibling repository. It cannot see shell commands: never use `sed -i`, `>`/`>>`, `cp`, `mv`, `rm` or a fixer on a
symlinked path or outside this repository. Before editing any file, `ls -l` it if it might be a symlink.

## Git Workflow Permissions

- NEVER create a branch, commit, push, or open a PR unless explicitly asked. Ask first, then act.
- Use `/branch`, `/commit`, `/pr` for version-control work — see `CONTRIBUTING.md`.
- Conventional Commits; subject lines <= 100 characters (commitlint). Never `--no-verify`. Never commit on `main`; squash-merge.
- Never publish a package, create a registry token or secret, or change GitHub settings without explicit owner authorization.

## Sibling repositories: read-only

`../nawara-core`, `../nawara-admin`, `../nawara-drive` (and `nawara-school` when cloned) may be **read** to understand contracts
and existing implementations. From this repository, never edit, create or delete their files, switch their branches, or run
their scripts that write. Product changes (for example Admin adopting a shared package) happen in a separately authorized task
in that product's repository.

## Hard rules

**Ownership.** Product-specific functionality belongs to the product repository. Only genuinely reusable frontend functionality
belongs here. Never add product business/domain logic, product copy or product workflows (Drive: students, lessons, vehicles,
exams; School: classes, attendance, gradebooks; Admin: organization/operator/audit administration). Product repositories are
never treated as shared libraries.

**Honest framework classification** ([`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) §3):

- `packages/foundation/*` — framework-independent code only; it never depends on or imports Angular, Vue, React, React Native,
  Expo or Tauri.
- `packages/angular/*` — Angular-shared code; may depend on `foundation`; Angular and CDK are `peerDependencies`.
- A future `vue` (or other) layer may depend on `foundation` and itself, **never on `angular`**. Adding a layer needs an ADR.
- A framework layer never uses another framework (no React or Vue in `angular`, and so on).
- **Tauri is an application runtime, not a layer:** shared code never imports `@tauri-apps/*`. A Tauri desktop app consumes
  the layer of its own frontend framework (Angular + Tauri → `angular` + `foundation`; React + Tauri → `foundation` only today).
- Every package declares what it imports (`dependencies`/`peerDependencies`; `devDependencies` for tests only), and depends
  only on registry version ranges (no `file:`, `link:`, git or URL specs). npm workspaces hoist undeclared imports and hide
  the mistake; pnpm consumers (School) break on it. Packages never set `packageManager` or `engines.npm/pnpm/yarn`.
- Never wrap framework-specific code to make it look framework-independent. Do not create Vue, React, React Native, Flutter or
  Tauri packages without real consumers and an ADR.
- No circular dependencies; no install-time scripts; package names `@nawara-solutions/<name>` /
  `@nawara-solutions/angular-<name>`. `npm run check:repo` enforces these.

**Reuse before creating.** Before creating any new component, directive, pipe, service, utility, form primitive, layout
primitive, theme capability, auth abstraction, authorization abstraction or API abstraction:

1. search `packages/**` (and the extraction inventory) for an equivalent; if it exists, reuse or extend it generically;
2. decide whether it is product-specific (→ the product repository) or genuinely generic;
3. extract only with a real implementation, a confirmed second use (or an obviously generic responsibility) and a stable,
   documented, product-independent API — never because two files look similar ([`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) §7).

Use `/reuse-check <what you need>` to run this decision explicitly. When working from a product repository, check this
repository before building generic frontend functionality there.

**Working with products.** [`docs/SHARED-CONTRIBUTION-POLICY.md`](docs/SHARED-CONTRIBUTION-POLICY.md) is the authoritative
policy for cross-repository work: a missing generic capability is its own `nawara-frontend` task, branch and PR, never a
side effect of a product task; the Frontend change merges first and the product adopts it afterwards in its own PR;
products may stay on different compatible versions; the shared foundation does not impose one product appearance
(Drive need not look like Admin); product token extensions never redefine a foundation-owned token name. A task here
never includes product changes, and a product task never includes changes here.

**Shared API quality** (§8): generic and documented public APIs; composition over giant configurable components; shared code owns
no user-facing copy (labels are inputs/keys); WCAG 2.2 AA; English/French/Arabic and RTL (logical CSS properties); responsive;
light/dark/system themes through semantic tokens; works inside a Tauri webview without importing Tauri; no secrets in browser
storage/URLs/logs; frontend authorization is UX — Core decides; behaviour keys on Core `code`/status, never on a human `message`.

**No speculative work:** no empty packages or folders, no abstraction without a consumer, no state library without a demonstrated
problem, no "utils" bin. Work only inside the scope the owner authorized, then STOP and report.

## Nawara Core

Core's contract is its HTTP API (Core ADR-0041). Shared frontend infrastructure may implement Core's documented contracts (for
example the ADR-0054 error body) but never imports Core code or Core libraries (`@nawara/service-kit`, `@nawara/audit-contract`).
A needed Core change is a Core follow-up, not a change from here.

## Commands and validation

Shared commands: `/branch`, `/commit`, `/pr`, `/design-doc`. Shared agents: `design-conformance`, `docs-writer`, `tech-lead`.
Repository command: `/reuse-check`.

| Script | Does |
|---|---|
| `npm run check:repo` | architecture and safety checks: layers, frameworks and dependency directions, declared and package-contained imports, registry-only dependency specs, product isolation, cycles, names, publication boundary, install scripts, package-manager neutrality, product-domain terms, action pinning, ai-standard links, the repository's Claude hooks |
| `npm run test:repo` | the checks' own tests (`node:test`) |
| `npm run format` / `npm run format:check` | Prettier write / check |
| `npm run test:packages` | every workspace package: build, then its tests (design-tokens: validation, contrast, determinism, npm-pack and consumer proof) |
| `npm run check:release` | release preflight (ADR-0004): every publishable package is bound to GitHub Packages, has a changelog section for its version, and its real tarball holds no credential or registry configuration; never publishes |
| `npm run validate` | **format:check → check:repo → test:repo → test:packages → check:release**: run before every commit and before reporting work complete |

Toolchain: Node 24.18.0 (`.node-version`), npm 11.16.0 (`packageManager`), npm workspaces `packages/*/*`. Install with
`npm install`; CI uses `npm ci --ignore-scripts`. TypeScript, ESLint, Vitest and ng-packagr are added with the first Angular
package.
