# 0001. nawara-frontend is a layered, multi-framework platform, starting with no packages

- **Status:** Accepted <!-- Proposed | Accepted | Rejected | Superseded by ADR-000X --> (2026-10-05, by the owner, for the
  initial bootstrap publication)
- **Date:** 2026-10-05
- **Deciders:** Anwar (project owner); drafted during the repository bootstrap

## Context

`nawara-frontend` was created empty to stop each Nawara product from reinventing frontend infrastructure. The evidence on
2026-10-05:

- **The products do not share a framework.** Admin is Angular 22 web; Drive's desktop is Angular 22 + Tauri and its mobile app
  is Expo/React Native; School's desktop is React 18 + Vite + Tauri and its mobile app is Flutter.
- **The only substantial frontend work is in Admin**, which already separates product-independent primitives (`shared/`,
  selector prefix `nw-`, no imports of Admin code) from Admin features, and plans extraction only after a second consumer and an
  owner review (`nawara-admin/docs/ARCHITECTURE.md` §31).
- Core keeps its own shared code inside one repository (`libs/service-kit`, `libs/audit-contract`, npm workspaces) and enforces
  its boundaries with a tested `check:repo` script.
- The repository must not present Angular code as framework-independent, and must not contain product logic.

## Options considered

1. **One Angular library package** (Admin's earlier plan, `@nawara/frontend-kit`). Simple to start; but tokens, assets and
   contracts would be unusable by School's React desktop or a future Vue app without pulling Angular, and the name hides the
   framework.
2. **Framework-agnostic core with per-framework wrappers** (for example Web Components or a headless layer adapted to each
   framework). Maximum theoretical reuse; but there is one real framework consumer today, the wrappers would be speculative, and
   they add a build and behaviour surface nobody needs yet.
3. **Layered packages by framework: `foundation` (framework-independent) and one layer per framework (`angular` first)**, each
   layer a directory, dependency directions enforced by a checker. Honest about frameworks; a new framework is an additive layer;
   little cost while only Angular exists.
4. **Separate repositories per layer** (tokens repository, Angular repository, …). Strong isolation; but cross-layer changes
   (tokens + the components that use them) become multi-repository releases with no benefit at this size.

And, orthogonally, **when to create packages:** (a) create skeleton packages now, or (b) create each package with the first
extraction slice that fills it.

## Decision

We propose **Option 3 with (b)**:

- npm workspaces at `packages/<layer>/<name>`; layers `foundation` and `angular` are defined; a future framework layer is added
  by a new ADR and a `LAYERS` entry.
- `foundation` may depend only on `foundation`; `angular` on `foundation` and `angular`; no package depends on a product; no
  cycles; framework visible in package names. A framework layer uses only its own framework (no React or Vue inside
  `angular`). Enforced by `npm run check:repo` in CI (`docs/ARCHITECTURE.md` §5–§6).
- **Tauri is an application runtime, not a layer.** Shared code never imports `@tauri-apps/*`; a Tauri desktop app consumes
  the layer of its frontend framework (Drive desktop: `angular` + `foundation`; School desktop: `foundation`). Shared
  Tauri/Rust code would need its own decision and two real consumers.
- npm workspaces are this repository's internal tooling only; published packages stay package-manager neutral (ADR-0002).
- **No package is created during the bootstrap.** The first package appears with the first extraction slice from Admin
  (`docs/ADMIN-EXTRACTION-INVENTORY.md`), so no empty or speculative package exists.

## Consequences

- **Easier:** a React, Vue or Flutter consumer can adopt `foundation` artifacts without Angular; boundary violations fail CI;
  adding a framework layer later does not disturb existing packages.
- **Harder:** Angular components cannot be shared with School's React desktop (by design — that would need a React layer or an
  ADR for framework-neutral components); the checker must be maintained as layers are added.
- **Out of reach of npm packages:** Flutter (School mobile) cannot consume any package here; sharing with it needs a generated
  artifact (for example tokens exported for Dart) or a Dart package, decided separately. React Native (Drive mobile) shares
  JavaScript but not the DOM or CSS, so only plain-TypeScript `foundation` code could serve it.
- **Given up:** the immediate "one kit" simplicity of Option 1 and the theoretical reach of Option 2.
- **Follow-up:** ADR-0002 (package scope and consumption); a token-format ADR before the tokens slice; ESLint/TypeScript/
  Vitest/ng-packagr configuration with the first package; an Admin-authorized update of Admin's documents that name
  `@nawara/frontend-kit`.
