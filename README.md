# nawara-frontend

The shared frontend platform of the **Nawara** ecosystem (Nawara Solutions): framework-independent frontend foundations and
framework-specific shared implementations, consumed by independent Nawara products.

> **Status: first package in place, nothing published.** `@nawara-solutions/design-tokens` 0.1.0 (private) holds the
> foundation tokens (DT1 + DT2a of [ADR-0003](docs/adr/0003-token-format-and-distribution.md)). No product consumes it yet; Admin
> adoption and further extraction ([inventory](docs/ADMIN-EXTRACTION-INVENTORY.md)) are later, separately authorized phases.

## What it is

- The single place for frontend code that is **genuinely reusable** across Nawara products: design tokens, brand assets,
  accessible UI primitives, theme/locale/RTL infrastructure, generic infrastructure for calling Nawara Core.
- **Layered by framework**, so nothing pretends to be more portable than it is:
  - `foundation` — framework-independent (tokens, assets, plain TypeScript contracts);
  - `angular` — Angular-shared (components, directives, pipes, Angular services), which may build on `foundation`.

## What it is not

- Not one giant Angular application used by every product.
- Not a product: no Admin, Drive or School screens, workflows, copy or business rules.
- Not a backend client of Core's internals: Core is consumed over HTTP only.
- Not (yet) a Vue, React, React Native, Flutter or Tauri library: those layers are **not created** and will be added only when
  real consumers need them.

## Relationships

| Repository | Relationship |
|---|---|
| `nawara-core` | Backend platform. Its contract is its HTTP API. Shared frontend infrastructure may implement Core's documented contracts (for example its error body) but never imports Core code. |
| `nawara-admin` | Angular 22 operator console; the first consumer and the source of the first extractions. |
| `nawara-drive` | Driving-school product: Angular 22 + Tauri desktop (can consume `angular` + `foundation`), Expo/React Native mobile (none of the current layers). |
| `nawara-school` | School product: React + Vite + Tauri desktop (may consume `foundation` only), Flutter mobile (cannot consume npm packages). |
| `ai-standard` | Authoritative AI-agent and workflow standard, integrated by symlinks (see `CLAUDE.md`). |

Products depend on this platform; this platform never depends on a product.

## Core rules

- **Product ownership:** product-specific functionality stays in the product repository.
- **Reuse before duplication:** before building generic frontend functionality in a product, check here; reuse or extend the
  shared implementation. Extract only what has a real implementation, a confirmed second use and a stable, generic API —
  never because two files look similar. Prefer composition (a shared table primitive composed into Admin's `OrganizationTable`
  and Drive's `StudentTable`) over a universal component holding every product's logic.
- **Honest sharing:** framework-independent code never depends on a framework; Angular code is labelled Angular
  (`@nawara-solutions/angular-*`); a future Vue layer never depends on Angular.
- **Quality bar for shared APIs:** documented, accessible (WCAG 2.2 AA), English/French/Arabic with RTL, responsive,
  light/dark themes, usable in a Tauri webview without depending on Tauri.

Details: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Packages

| Package | Layer | State |
|---|---|---|
| [`@nawara-solutions/design-tokens`](packages/foundation/design-tokens/README.md) | foundation | **0.1.0, private** — foundation tokens (DT1 + DT2a: brand palette, scales, semantic, status, alert, danger, scrim, breakpoints); shadows deferred (DT2b) |
| `@nawara-solutions/angular-ui` | angular | **planned**, not created |

Future framework layers (`vue`, `react`, …) are **possibilities only**; see [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) §10
for how Angular, React, Vue, React Native, Flutter and Tauri fit. Consumption (GitHub Packages, versioning, local development) is
described in [`docs/CONSUMPTION.md`](docs/CONSUMPTION.md) and accepted in [ADR-0002](docs/adr/0002-package-scope-and-consumption-model.md); nothing is published yet.

## Repository structure

```text
nawara-frontend/
├── CLAUDE.md                     agent instructions (ai-standard section + frontend platform rules)
├── CONTRIBUTING.md               → ../ai-standard/CONTRIBUTING.md (symlink)
├── package.json                  npm workspaces (packages/*/*), scripts, dev tooling
├── scripts/                      check-repo.mjs (boundary/safety checks) + tests
├── docs/
│   ├── ARCHITECTURE.md           the platform architecture (authority)
│   ├── CONSUMPTION.md            how products will consume packages (recommendation)
│   ├── ADMIN-EXTRACTION-INVENTORY.md
│   ├── README.md                 → ai-standard design-doc process (symlink)
│   └── adr/ add/ sdd/ tdd/       design docs (templates symlinked, indexes local)
├── .claude/                      shared commands/agents/hook (symlinks), settings, /reuse-check
├── .github/                      CI (validation only), Dependabot, PR template
└── packages/                     foundation/design-tokens today; later foundation/<name>, angular/<name>
```

## Development

Requirements: Node 24.18.0 (`.node-version`), npm 11.16.0, and the sibling layout `../ai-standard` for the shared commands and
commit hook.

```bash
npm install          # installs tooling and activates the commit-msg hook (husky)
npm run validate     # format:check → check:repo → test:repo (run before every commit)
npm run check:repo   # architecture and safety checks only
npm run format       # Prettier (Markdown and ai-standard files are excluded)
```

## Contributing

Conventions for branches, Conventional Commits and pull requests: [`CONTRIBUTING.md`](CONTRIBUTING.md) (shared Nawara standard).
Repository-specific rules — ownership, layers, reuse, quality bar — are in [`CLAUDE.md`](CLAUDE.md) and
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). Hard-to-reverse decisions are recorded as ADRs in [`docs/adr/`](docs/adr/).

### Protected `main`

`main` is protected by the repository ruleset `main`. Every change follows one path:

```text
type/short-description branch → pull request → frontend-ci (green, branch up to date with main) → owner squash-merge → main
```

- Direct pushes, force pushes and deletion of `main` are blocked for everyone.
- The required check is `frontend-ci` (the `Frontend CI` workflow, which runs `npm run validate`). The branch must be up to
  date with `main` before merging, and every review conversation must be resolved.
- Pull requests merge by **squash** only (one commit per pull request on `main`). No approval count is required while the
  owner is the only maintainer; the owner merges manually and nothing auto-merges, including Dependabot pull requests.
- Repository administrators can bypass the rules only on a pull request, as a deliberate, audited recovery step (for
  example when CI itself is broken), never for direct pushes.
