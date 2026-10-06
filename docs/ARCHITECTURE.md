# nawara-frontend — platform architecture

The root architecture document of this repository (the whole-repository ADD in the sense of
[`docs/README.md`](README.md)). Decisions with their rationale are ADRs: [ADR-0001](adr/0001-layered-multi-framework-frontend-platform.md)
(layering), [ADR-0002](adr/0002-package-scope-and-consumption-model.md) (package scope and consumption) and
[ADR-0003](adr/0003-token-format-and-distribution.md) (token format and distribution). The extraction plan
for Nawara Admin is [`ADMIN-EXTRACTION-INVENTORY.md`](ADMIN-EXTRACTION-INVENTORY.md); the consumption model is
[`CONSUMPTION.md`](CONSUMPTION.md).

## 0. Status (2026-10-05)

**One package exists: `@nawara-solutions/design-tokens` 0.1.0** (`packages/foundation/design-tokens`, private, not
published): design-token slices DT1 and DT2a of [ADR-0003](adr/0003-token-format-and-distribution.md); shadows (DT2b) are
deferred. No product consumes
it yet; Admin adoption is a later, separately authorized step. Everything below marked *planned* or *future* does not exist.

## 1. What this repository is, and is not

**It is** the shared frontend platform of the Nawara ecosystem: the home of frontend code that is *genuinely* reusable across
Nawara products, kept honest about which framework it needs.

**It is not:**

- one Angular application used by every product;
- a product: no product screen, workflow, copy or business rule lives here (Admin, Drive and School keep theirs);
- a backend or a backend client SDK owned by Core: Core's contract is its HTTP API (Core `CLAUDE.md`, ADR-0041);
- a mobile or desktop platform: no Flutter, React Native or Tauri/Rust code is shared until real consumers justify it (§10);
- a "utils" bin or a component library built ahead of real screens.

## 2. Position in the ecosystem

```text
                       nawara-core  (backend platform; HTTP APIs only, never imported)
                            ▲
                            │ HTTP (each product calls Core itself)
     ┌──────────────────────┼──────────────────────────────┐
     │                      │                              │
 nawara-admin          nawara-drive                   nawara-school
 Angular 22 web        desktop: Angular 22 + Tauri    desktop: React 18 + Vite + Tauri
                       mobile: Expo / React Native    mobile: Flutter
     │                      │                              │
     └──── consume versioned packages (future, ADR-0002) ──┘
                            │
                            ▼
                     nawara-frontend
        foundation (framework-independent)  ◄──  angular (Angular-shared)
```

Evidence for the product stacks: `nawara-admin/package.json`, `nawara-drive/apps/{desktop,mobile}/package.json`, and the
`nawara-school` repository on GitHub (`apps/admin-desktop/package.json`, `apps/mobile/pubspec.yaml`) as of 2026-10-05.

Arrows point from consumer to dependency. Nothing here depends on a product, and a product never acts as a library for another.

## 3. Classifying code honestly

| Class | Meaning | Examples | Where it lives |
|---|---|---|---|
| **A. Framework-independent** | Works without any UI framework. Plain TypeScript/CSS/data/assets. | design tokens as CSS custom properties, brand assets, icon metadata, TypeScript types for Core's public error body, pure formatting helpers | `packages/foundation/*` |
| **B. Framework-shared** | Needs one framework. Today only Angular. | Angular components, directives, pipes, DI providers, Angular i18n/theme/HTTP-interceptor infrastructure, Angular form primitives | `packages/angular/*` |
| **C. Product-specific** | Encodes a product's domain, workflow or copy. | Admin organization administration, Drive lesson scheduling, School gradebook | the product repository, always |

Rules:

- **No pretending.** An Angular component is never wrapped to look framework-independent. A Web Component wrapper, a "universal"
  adapter or a headless abstraction is introduced only by an ADR with real consumers in two frameworks.
- **Framework-independent is a property of the code, not a wish.** If it imports a framework (or only makes sense inside one),
  it is class B.
- **When unsure, it stays in the product** until a second consumer confirms it (§7).

## 4. Repository layout

```text
nawara-frontend/
├── packages/                    ← today: foundation/design-tokens (ADR-0003)
│   ├── foundation/<name>/       class A, published as @nawara-solutions/<name>
│   └── angular/<name>/          class B, published as @nawara-solutions/angular-<name>
├── scripts/                     check-repo.mjs (architecture checks) and their tests
├── docs/                        this document, ADRs, consumption model, extraction inventory
├── .claude/ .husky/ …           ai-standard integration (symlinks; see CLAUDE.md)
└── package.json                 npm workspaces: packages/*/*
```

- **The layer is the directory.** `packages/<layer>/<name>`; the checker derives the layer from the path, so a package cannot
  claim one layer and live in another.
- **The framework is in the name.** `@nawara-solutions/angular-ui` cannot be mistaken for something a Vue app can use;
  `@nawara-solutions/design-tokens` carries no framework prefix and may not depend on one.
- A future framework gets its own directory (`packages/vue/*` → `@nawara-solutions/vue-*`), added deliberately (§10).
- No empty directories: a layer directory appears with its first package.
- A showcase/playground application is **not** created yet. It is justified once there are Angular components to render
  (expected with the first `angular` package; decision recorded then).

## 5. Dependency rules

| From | May depend on | Must never depend on |
|---|---|---|
| `foundation/*` | other `foundation/*`; framework-free npm packages | any UI framework or runtime (`@angular/*`, `vue`, `react`, `react-dom`, `react-native`, `expo`, `@tauri-apps/*`, …); any `angular/*` package |
| `angular/*` | `foundation/*`, other `angular/*`, Angular and Angular CDK (as **peer** dependencies) | any other framework's package (React, Vue, React Native, …); `@tauri-apps/*`; any product |
| future `vue/*` (not created) | `foundation/*`, other `vue/*` | `angular/*` — a Vue application never receives Angular code |
| every package | — | a product repository (`nawara-admin`, `nawara-drive`, `nawara-school`, their scopes, or a path into them); a dependency cycle; install-time lifecycle scripts |
| product repositories | published `@nawara-solutions/*` packages | this repository's source by relative path |
| this repository | Core's *published contracts* as types it writes itself (e.g. the ADR-0054 error body) | Core source code or Core libraries (`@nawara/service-kit`, `@nawara/audit-contract` are Core-internal) |

Framework peer ranges follow the product versions in use: Angular packages declare `@angular/*` as `peerDependencies` matching
the Angular major the products run (22 today), never as `dependencies` (one Angular instance per application).

## 6. Enforcement

`npm run check:repo` (`scripts/check-repo.mjs`, tested by `npm run test:repo`) enforces, and CI runs on every pull request:

| Rule | Enforced how |
|---|---|
| layer of every package is known; foundation never uses a framework; a framework layer uses only its own framework; no layer imports Tauri | manifest dependency scan + source import scan (`import`, `export … from`, `require`, dynamic `import()`, SCSS/CSS `@use`/`@forward`/`@import`) over `.ts/.tsx/.js/.jsx/.vue/.svelte/.html/.scss/.css` |
| allowed dependency directions between layers | manifest and import scan against §5 |
| relative imports stay inside their own package | resolved-path check (a `../../angular/…` path cannot bypass the layer rules) |
| every imported package is declared by the importing package (`devDependencies` only in tests) | import scan against the manifest: npm hoisting hides undeclared imports; pnpm consumers break on them |
| dependencies are registry version ranges only (no `file:`, `link:`, git, GitHub, URL specs) | manifest check |
| packages never set `packageManager` or `engines.npm/pnpm/yarn` | manifest check (consumers choose their package manager) |
| the workspace root is private; the repository's Claude hooks stay registered | root manifest and `.claude/settings.json` checks |
| frameworks are `peerDependencies` of framework packages, never `dependencies` | manifest check |
| no product dependency, by name, scope or path | manifest specs and import specifiers |
| no dependency cycles between workspace packages | graph check over `dependencies`, `peerDependencies`, `optionalDependencies` |
| package names `@nawara-solutions/<name>` / `@nawara-solutions/angular-<name>` | manifest check |
| publication boundary: `"private": true` or `publishConfig.registry` = GitHub Packages | manifest check (prevents accidental public-npm publication) |
| no `preinstall`/`install`/`postinstall`/`prepublish` scripts | manifest check |
| no product-domain vocabulary (student, instructor, lesson, vehicle, driving, exam, gradebook, classroom, attendance, teacher, pupil, daycare) in package sources | word scan after camelCase splitting |
| GitHub Actions pinned to a full SHA with a `# vX.Y.Z` comment | workflow scan |
| ai-standard symlinks exist with the exact targets (and resolve locally); real copies equal ai-standard | link/copy check |
| Claude `Write`/`Edit` never lands outside this repository inside its parent folder (ai-standard through a symlink, a sibling repository) | `.claude/hooks/guard-sibling-writes.sh` (`PreToolUse`), tested by `test:repo`; shell writes are not covered (CLAUDE.md) |

The framework families (`FRAMEWORKS` in `scripts/lib/checks.mjs`) are a maintained list: Angular, React, React Native/Expo,
Vue, Svelte, Solid, Lit, Preact, Stencil, Qwik and Tauri today. A framework that appears in Nawara is added there first.

**Not enforced mechanically** (review and agent rules in `CLAUDE.md`): whether an API is generic enough, accessibility,
RTL/i18n readiness, Admin-specific terms that are not in the vocabulary list. The vocabulary list is a tripwire, not a proof.
ESLint import rules for package-internal boundaries arrive with the first TypeScript package.

## 7. Reuse before duplication

```text
Need frontend functionality
        │
        ▼
Is it product/domain-specific? ──yes──► product repository
        │ no
        ▼
Does nawara-frontend already provide it ──yes──► REUSE (do not fork, do not wrap to rename)
for this framework?                              (missing capability → extend the shared API generically)
        │ no
        ▼
Is it genuinely generic, with a stable, ──no / not yet──► product repository (mark it CANDIDATE there)
documented, product-independent contract?
        │ yes, and proven by a real consumer
        ▼
Extract into nawara-frontend (one slice at a time; §8)
```

Extraction criteria (from Nawara Admin's reuse rule, `nawara-admin/docs/ARCHITECTURE.md` §31, adopted here):

1. a first real implementation exists in a product;
2. a second use is confirmed (or the responsibility is obviously generic: tokens, theme, typography, focus, button, icon, dialog,
   form field, data state);
3. a stable, product-independent API is identified;
4. it then moves, with tests, documentation, accessibility, RTL, both themes.

Similar-looking files are **not** a reason to extract. Prefer **composition** (a generic table primitive that Admin and Drive
each compose into `OrganizationTable` / `StudentTable`) over configuration-heavy universal components.

Vocabulary shared with Admin: **LOCAL** (product-specific), **CANDIDATE** (generic, proven in one product), **SHARED** (in this
repository).

## 8. Rules for shared APIs

- **Generic and documented.** Every public export is documented; no product names, product routes or product copy.
- **Shared code owns no user-facing copy.** Labels, accessible names and messages are inputs or translation keys provided by the
  consumer (Admin's `nw-*` primitives already follow this).
- **Accessibility:** WCAG 2.2 AA target; semantic HTML; keyboard and screen reader support; visible focus.
- **Internationalization:** English, French and Arabic from the start; RTL with logical CSS properties; never branch on a Core
  human `message`, only on `code`/status (Core ADR-0054).
- **Responsive:** works from narrow viewports to desktop; container queries in components.
- **Themes:** light, dark and system preference, through semantic tokens; no raw colours in components.
- **Desktop/Tauri consumers:** web primitives must work inside a Tauri webview (no assumptions about `window.open`, service
  workers or a server origin) **without** importing Tauri. Tauri-specific helpers are not web primitives (§10).
- **Security:** no tokens or secrets in browser storage, URLs or logs; frontend authorization is UX only, Core decides
  (Core ADR-0041, ADR-0050).
- **No speculative abstraction,** no state library, no circular dependencies, no barrel-of-everything entry points.

## 9. Relationship with Nawara Core

Core is the backend platform; its only contract is HTTP (Core `CLAUDE.md`, ADR-0041). Generic *frontend* infrastructure for
calling Core — an error model mapping Core's `{ statusCode, message, code, requestId }` body, an `Accept-Language` interceptor,
request-id propagation — is a legitimate shared candidate, because every product calls the same Core. It is written here against
Core's documented contracts; it never imports Core code. A Core contract change is a Core decision first.

## 10. Frameworks: now and later

| Technology | Today in Nawara | In this repository |
|---|---|---|
| Angular | Admin (web), Drive desktop (Angular 22 + Tauri) | `angular` layer — planned first framework layer |
| React (web/desktop) | School desktop (React 18 + Vite + Tauri) | none; a `react` layer only when a second React consumer needs the same thing; until then School may consume `foundation` |
| Vue | none | none; `vue` layer when a real Vue product exists |
| React Native | Drive mobile (Expo) | none; RN shares JS but not DOM/CSS, so it is its own layer if ever justified |
| Flutter | School mobile | none; Dart cannot consume npm packages. Sharing would be a separate Dart package (pub, likely another repository). Tokens could reach Flutter only through a generated artifact: a future Dart emitter over the ADR-0003 source (not built) |
| Tauri | Drive desktop, School desktop | none; a Tauri desktop consumes the layer of its frontend framework. Tauri/Rust helpers only when two desktop apps share them |

Adding a layer: an ADR, a `LAYERS` entry in `scripts/lib/checks.mjs` (with `mayDependOn: ['foundation', '<self>']`), tests,
and an update to §5.

## 11. Toolchain baseline

| Item | Choice | Why |
|---|---|---|
| Node | 24.18.0 (`.node-version`, `engines`) | same as Nawara Admin's `.node-version`, the first consumer |
| Package manager | npm 11.16.0 (`packageManager`) with npm workspaces | Admin, Core and Drive all use npm 11.16; School uses pnpm 9 but only `foundation` packages would ever reach it, and published packages are package-manager-neutral |
| Formatting | Prettier 3 (`printWidth` 100, single quotes; Markdown and ai-standard files excluded) | Admin's configuration |
| Commits | commitlint + husky via ai-standard | ai-standard onboarding steps 3, 5 |
| Checks/tests | Node's built-in `node:test` for repository scripts and packages (`npm run test:packages`) | Core's `check:repo`/`test:repo` pattern; no extra dependency |
| Design tokens | dependency-free Node generator (`packages/foundation/design-tokens/scripts`); `sass` 1.104.1 as its only, test-only, dev dependency (proves the `pkg:` consumer import) | ADR-0003; the same Sass version as Nawara Admin |
| Deferred to the first Angular package | TypeScript, ESLint (+ angular-eslint), Stylelint, Vitest, ng-packagr | the design-tokens package is plain data and Node scripts and needs none of them; versions will follow Admin (TypeScript 6.0, Angular 22.2, Vitest 5, ESLint 10) |

## 12. Not decided here

- Release tooling (for example Changesets) and the version policy details — recommendation in [`CONSUMPTION.md`](CONSUMPTION.md).
- Whether a showcase application is a workspace in this repository.
- Whether School's React desktop consumes `foundation` packages.
