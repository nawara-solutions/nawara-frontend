# Nawara Admin — extraction inventory (planning only)

> **Nothing has been extracted.** This is a read-only inventory of `nawara-admin` at branch `feat/admin-a4-s2-working-code`,
> commit `7103274`, taken 2026-10-05. Admin's imports, files and history are unchanged. Every extraction is a separate,
> owner-authorized task, one slice at a time (§5).
>
> Admin already classifies its own work as LOCAL / CANDIDATE / SHARED (`nawara-admin/docs/ARCHITECTURE.md` §31, register in
> `nawara-admin/docs/ROADMAP.md`) and plans a review gate (FK-2) before any extraction. This inventory uses the classes of
> [`ARCHITECTURE.md`](ARCHITECTURE.md) §3 and is consistent with Admin's register; Admin's FK-2 review is where it gets confirmed.

## 1. What Admin is built on

Angular 22.2 (standalone, zoneless, Signals, strict templates), TypeScript 6.0, Angular CDK (dialog, menu, portal, bidi),
Transloco 8 (EN/FR/AR), Lucide icons, `@fontsource` Readex Pro and JetBrains Mono, SCSS with `@use` and BEM, Vitest 5 through
`ng test`, ESLint 10 + angular-eslint, Stylelint, Prettier. Node 24.18, npm 11.16. Selector prefixes: **`nw-`** for
product-independent primitives (already kit-oriented) and `adm-` for Admin.

Coupling measured: `src/app/shared/**` imports only Angular, Angular CDK, `@angular/forms` and `lucide`: **no import of `core/`,
`layout/` or `features/`, and no Transloco**. Shared primitives receive their copy as inputs. This makes `shared/` the cleanest
starting point.

## 2. Classification

### A. Framework-independent candidates (`foundation`)

| Admin source | Candidate | Notes |
|---|---|---|
| `src/styles/tokens/_primitives.scss`, `_scales.scss` | design tokens (colour ramps, spacing, radius, type scale) | product-independent by construction; SCSS mixins emitting CSS custom properties (`--nw-ref-*`, `--nw-*`) |
| `src/styles/tokens/_theme-light.scss`, `_theme-dark.scss` | semantic light/dark tokens | **must be split**: they also hold Admin-shell tokens (`--nw-workspace-*`, `--nw-topbar-background`, the avatar / "Create platform" colours) |
| `src/styles/abstracts/_breakpoints.scss`, `_a11y.scss`; `src/styles/base/_reset.scss`, `_document.scss`, `_accessibility.scss` | breakpoints, a11y mixins, reset and document base | Sass, not Angular; check `_overlay.scss` (CDK overlay styling → Angular layer) |
| `src/app/core/errors/app-error.ts` | error model for Core's ADR-0054 error body (`kind`, `code`, `status`, `requestId`) | plain TypeScript, no Angular import; every product calls the same Core |
| `tools/check-contrast.mjs` | WCAG contrast check of token pairs | Node script; would become this repository's token test once tokens move |
| `public/brand/*.svg`, favicons | Nawara brand assets | **see uncertain**: company brand vs per-product brand |

### B. Angular-shared candidates (`angular`)

| Admin source | Candidate | Notes |
|---|---|---|
| `shared/ui/button`, `icon-button`, `link` | action primitives (attribute selectors on native elements) | low coupling |
| `shared/ui/spinner`, `skeleton`, `data-state`, `inline-alert`, `status-badge` | loading / empty / error / status primitives | `data-state` composes skeleton and icon |
| `shared/ui/form-field`, `checkbox` | form primitives | depend on `@angular/forms` |
| `shared/ui/dialog` (+ `dialog.service`), `menu`, `toast` (+ `toast.service`, `toast-outlet`) | overlay primitives | depend on Angular CDK |
| `shared/ui/icon` | icon component | **the registry needs design** (see risks) |
| `shared/format/format.pipes.ts`, `formatting-locale.ts`, `clock.ts` | date/number/machine-value pipes with an injected locale | `NW_FORMATTING_LOCALE` token already decouples them from Admin's locale service |
| `core/theme/theme.service.ts`, `provide-theme.ts` | light/dark/system theme service | `palette-artwork.ts` is Admin artwork (stays) |
| `core/i18n/locale.service.ts`, `locale.ts`, `catalog.loader.ts`, `localized-title.strategy.ts`, `provide-i18n.ts` | locale + direction (RTL) infrastructure | **depends on Transloco** (see risks) |
| `core/preferences/preference-store.ts` | the single browser-preference registry | key set is Admin's; needs an extensible registry |
| `core/state/view-state.ts` | `ViewState<T>` + `toViewState` (RxJS) | the type is framework-free; the operator is RxJS idiom; one package or two is a design question |
| future `core/http` interceptors (Accept-Language, request id, error normalization) | Core-calling HTTP infrastructure | **not written yet in Admin** (A3+); extract only after it exists |

### C. Admin-specific (must remain in Admin)

`layout/**` as implemented (shell, sidebar + navigation + profile, top bar, context switcher, appearance menus/panel,
preference menus, minimal shell, status page, shell routes) · `core/auth/**` (operator/owner sign-in, MFA, step-up, session —
the Admin flow of Core ADR-0050) · `core/access/**` (Admin capability policy and guards) · `core/context/**` (Company/Platform
scope) · `core/notifications/**` · `core/config/app-environment.ts` · `core/theme/palette-artwork.ts` · `demo/**` ·
`features/**` (auth pages, company overview, platforms, platform scope, settings, the design-system preview page) ·
`src/i18n/*.json` (Admin copy) · `tokens/_accents.scss` and `tokens/_brand-artwork.scss` (Admin appearance presets and
generated artwork) · `public/illustrations/**` · `tools/check-i18n.mjs`, `tools/check-production-bundle.mjs`, `tools/brand/**`.

### D. Uncertain — requires design review

| Item | Question |
|---|---|
| layout primitives (sidebar, top bar, breadcrumbs, page header, status page) | Admin's implementations import Admin auth/scope/capabilities. Generic *primitives* may be carved out later; the Admin shells stay. Needs a second consumer (Drive desktop) to define the API. |
| `shared/ui/brand-mark` and `public/brand/*` | Is the Nawara company mark shared by every product, or does each product have its own mark? Owner/brand decision. |
| authentication frontend infrastructure | Session/bearer handling and WebAuthn helpers (`core/auth/webauthn-client.ts`, Angular `DOCUMENT`) may become generic once Drive/School authenticate against Core; today the flows are Admin's operator flows. |
| `core/state/view-state.ts` | foundation (type) + angular (RxJS operator), or one Angular package? |
| ESLint/Stylelint rules (forbidden frameworks, raw-HTTP rule, BEM pattern, no raw colours) | a shared lint configuration package, or documented copies? Decide when the second product adopts them. |
| fonts (`@fontsource/readex-pro`, `@fontsource/jetbrains-mono`) | part of the tokens package (peer dependency) or each product's choice? |
| token source format | keep SCSS mixins, or move to a DTCG JSON source generating CSS/SCSS (and later Dart for Flutter)? An ADR before the tokens slice. |

## 3. Coupling and migration risks

1. **Admin's open decisions.** Admin A2 has 9 primitives pending the owner's scope decision (D-A2-7) and its own FK-2 extraction
   review. Extraction must not pre-empt either; the first slice should use only approved, stable pieces.
2. **Transloco lock-in.** Shared i18n infrastructure built on Transloco imposes it on every Angular consumer (Drive desktop has no
   i18n library yet). Decide: adopt Transloco platform-wide, or keep shared primitives copy-free (they already are) and leave the
   i18n library to each product.
3. **Closed icon registry.** `NW_ICONS` is a static map that includes product-flavoured icons (`car`, `award`, `building-2`, …).
   A shared icon component needs a registry each product extends (DI-provided), not a central list of every product's icons.
4. **SCSS include paths.** Admin components `@use 'abstracts'` through `stylePreprocessorOptions.includePaths: ['src/styles']`.
   Extracted styles must use package-relative or package-name `@use` paths, and consumers configure nothing implicit.
5. **Mixed token files.** Theme files mix product-independent semantic tokens with Admin-shell tokens; they must be split before
   moving, and `check:contrast` pairs must follow the split.
6. **No-flash bootstrap contract.** `src/index.html` reads the `nw.theme` / `nw.locale` preference keys before Angular starts.
   Extracting theme/preferences means documenting (or shipping) that snippet and the key contract.
7. **Version alignment.** Admin: Angular ^22.2, Vitest 5, jsdom 30. Drive desktop: Angular ^22.1, Vitest 4, jsdom 28. Peer ranges
   must cover both or Drive upgrades first.
8. **Budgets.** Admin enforces `anyComponentStyle` 4 kB warning / 8 kB error; extracted component styles count against every
   consumer's budget.
9. **Brand provenance.** `docs/BRAND.md` marks token values as `design` or `derived`; the shared package must carry that
   provenance, never promote a derived value to a brand value.
10. **Tests move with code.** Admin has 39 spec files; each extracted primitive's spec moves with it, and Admin keeps tests for
    its own compositions.
11. **Naming change.** Admin's documents name the future package `@nawara/frontend-kit` and repository "nawara-frontend-kit".
    The accepted names are `@nawara-solutions/*` in `nawara-frontend` (ADR-0002); Admin's documents need an update in an
    Admin-authorized task.

## 4. Separate findings (not extraction work)

- Admin's CI uses tag-pinned actions (`actions/checkout@v7`), unlike Core's SHA pinning (`check:repo`). Worth aligning in Admin.
- Admin has no `docs/README.md` symlink to ai-standard (Core and Drive have one). Not changed here.

## 5. Proposed slice order

Each slice: extract → publish a `0.x` pre-release (after ADR-0002 acceptance) → Admin consumes it and deletes its local copy in
the same Admin change → Admin `npm run validate` (format, lint, styles, i18n, contrast, tests, build, production check) and a
visual check in both themes, LTR/RTL → next slice.

1. **Design tokens (foundation)** — after the token-format ADR and the theme-file split; brings `check:contrast` along.
2. **Action and feedback primitives (angular)** — button, icon-button, link, spinner, skeleton, inline-alert, status-badge
   (with the extensible icon registry).
3. **Data state + `ViewState` + `AppError`** — once the view-state placement is decided.
4. **Form primitives** — form-field, checkbox.
5. **Overlays** — dialog, menu, toast (CDK).
6. **Theme, preferences, locale/direction** — after the Transloco decision.
7. **HTTP/Core infrastructure** — after Admin writes its first HTTP adapter and interceptors.
8. **Layout primitives** — only when Drive desktop (the likely second Angular consumer) begins real UI work.
