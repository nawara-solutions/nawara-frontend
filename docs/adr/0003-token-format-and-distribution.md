# 0003. Token format and distribution architecture

- **Status:** Accepted <!-- Proposed | Accepted | Rejected | Superseded by ADR-000X --> (2026-10-05, by the owner, after the
  architecture review. **Acceptance decides the architecture only:** no package, token source, generator or artifact exists yet;
  the first package is designed and built in its own authorized slice.)
- **Date:** 2026-10-05
- **Deciders:** Anwar (project owner); drafted from the Admin extraction inventory and a read-only inspection of Admin's tokens

## Context

ADR-0001 requires this decision before the first package, `@nawara-solutions/design-tokens` (`packages/foundation/design-tokens`),
is created. The evidence (Nawara Admin `main` `7103274`, its `src/styles/` and `tools/check-contrast.mjs`; re-verified on 2026-10-05 against Admin's working branch `fc756d1`, where no token, contrast or
`index.html` file has changed;
Drive `291df47`; the School stack as recorded in `ARCHITECTURE.md` §3 and §10; `docs/ADMIN-EXTRACTION-INVENTORY.md`):

- **Admin has a mature three-tier system, written as SCSS mixins that emit CSS custom properties.**
  - *Reference* `--nw-ref-*`: 86 colour ramp values, each annotated `design` or `derived` (`tokens/_primitives.scss`). Nothing
    outside the token files reads them.
  - *Scales*, theme-independent (`tokens/_scales.scss`): space `0…10`, radius, font families, weights, text sizes, line heights,
    letter spacing, z-index `0…500`, durations and easings, control heights, focus-ring width and offset; under
    `prefers-reduced-motion: reduce` the durations collapse to `1ms`. The same file also holds Admin layout values
    (`--nw-shell-sidebar-width`, `--nw-content-max`) and illustration/auth masks.
  - *Semantic* light and dark sets (`tokens/_theme-light.scss`, `_theme-dark.scss`), 107/106 entries, each defined intentionally
    (not by inversion), aliasing reference tokens.
- **Runtime switching is attribute-based:** `:root` holds light; `[data-theme='light'|'dark']` on `<html>` or any subtree selects a
  theme; `@media (prefers-color-scheme: dark) :root:not([data-theme])` implements "system". `[data-accent='rose'|'plum'|'indigo'|
  'teal'|'amber']` overrides a fixed set of accent tokens per theme (`tokens/_accents.scss`); coral, the default, is the base theme's
  own values. A no-flash script in Admin's `index.html` sets `data-theme`/`data-accent` from `localStorage` (`nw.theme`,
  `nw.accent`, `nw.locale`) before Angular starts; `ThemeService` repeats the theme and accent lists in TypeScript.
- **What the shared primitives actually consume** (`shared/ui`, `styles/base`, `styles/abstracts`): about 104 non-reference tokens,
  all from the scales and the semantic families `color`, `surface`, `text`, `border`, `status`, `alert`, `focus`, `shadow`,
  `scrim`, `gradient-brand`, plus *component* tokens they define locally (`--nw-button-*`, `--nw-inline-alert-*`,
  `--nw-status-badge-*`, `--nw-toast-accent`, `--nw-brand-mark-size`) and the `--nw-logo-*` artwork tokens read only by
  `nw-brand-mark`. **None of the Admin-shell families.**
- **Admin-specific tokens are mixed into the same files:** `sidebar-*`, `topbar-*`, `workspace-*`, `auth-panel-*`, `chart-*`,
  `swatch-*`, `urgent-*`, decorative `accent-{pink,orange,amber,purple}-*`, `product-school-bg`, `surface-sidebar`,
  `shadow-auth-card`, the shell layout values and masks, and brand artwork (`--nw-logo-*`, botanical illustration) that the theme
  and accent files pull in through `tokens/_brand-artwork.scss`. Accent mixins set raw hex values and also include artwork.
- **Breakpoints** exist only as a Sass map (`abstracts/_breakpoints.scss`, `em` units, a `from()` mixin) because media queries
  cannot read custom properties; Admin mirrors them by hand as CDK `BreakpointObserver` queries.
- **Contrast** is checked by a Node script that regex-parses the SCSS theme and accent files and evaluates a list of text/surface
  pairs (thresholds 4.5 and 3) in both themes and every accent. The pairs live in the script, not in the tokens.
- **Consumers:** Admin (Angular 22) uses `var(--nw-*)` everywhere, with Sass `includePaths: ['src/styles']`. Drive desktop (Angular
  + Tauri, a 9-file scaffold) uses its own unprefixed `--color-*` / `--font-family-base`. School desktop is React 18 + Vite + Tauri
  (2 files) and School mobile Flutter; Drive mobile is React Native. None of these consume tokens yet; none can consume Sass or
  Angular. Flutter and React Native cannot consume CSS at all.
- **The token format is stable.** The Design Tokens Community Group published its first stable specification, **2025.10**
  (28 October 2025): the Format module and a **Resolver module** that describes context-dependent values (light/dark themes and
  similar) through sets and modifiers. Established tools implement it (Terrazzo's parser supports 2025.10 including resolvers).
- **Known naming debt:** `--nw-font-latin` and `--nw-font-sans` are the same stack; `--nw-font-weight-bold` equals semibold (600);
  accent and decorative names mix families (`accent-pink-*` beside `color-primary`); the light/dark name sets differ by about one
  entry.

## Options considered

1. **A. SCSS as the source of truth.** Keep the mixins; the package ships Sass that emits CSS. *Pros:* smallest change, proven in
   Admin, breakpoints are native Sass. *Cons:* values and meaning are locked in Sass syntax: every non-web export, validation or
   contrast check must parse Sass (today's checker already regex-parses it); provenance lives only in comments; consumers need
   Sass and, as today, path configuration; React (CSS-only) consumers still need a compiled artifact; Flutter/React Native exports
   would require replacing the source later.
2. **B. A structured source aligned with the W3C Design Tokens (DTCG) format, generating platform artifacts.** JSON token sets
   (`$value`, `$type`, `$description`, `$extensions`, aliases `{group.token}`) are canonical; a build emits CSS custom properties
   (and, where useful, Sass). *Pros:* framework-independent data; references, parity, provenance and contrast become ordinary data
   checks; new targets (TypeScript, Dart) are added as emitters without touching the source. *Cons:* a build step and a migration
   of Admin's values into JSON; generator code to own (or a tool to adopt); the theme and accent contexts must be expressed with the
   DTCG resolver model, which the generator then has to implement for the subset in use.
3. **C. TypeScript as the source of truth.** Typed token objects compiled to CSS. *Pros:* type safety and editor support for web
   developers. *Cons:* forces a JS toolchain and module semantics on every consumer, including future Dart generation; data is
   code (computed values, imports) and harder to validate or diff; no advantage over JSON for a value catalogue.
4. **D. Defer: keep SCSS now, move to a structured source later.** *Pros:* zero work today. *Cons:* the extraction would publish a
   Sass-shaped contract and then migrate it again; the move costs the same later and touches more consumers.

### Decision matrix

`●` strong, `◐` adequate, `○` weak.

| # | Criterion | A. SCSS | B. DTCG-aligned JSON | C. TypeScript | D. Defer |
|---|---|---|---|---|---|
| 1 | Existing Admin compatibility (`--nw-*`) | ● | ● (same emitted names) | ● | ● |
| 2 | Zero/low-regression migration | ● | ◐ (parity-tested conversion) | ◐ | ● now, ○ later |
| 3 | Angular consumption | ● | ● | ● | ● |
| 4 | React web consumption | ◐ (needs compiled CSS) | ● | ● | ◐ |
| 5 | Future Flutter/RN export | ○ | ● | ◐ | ○ |
| 6 | CSS custom-property output | ● | ● | ● | ● |
| 7 | Runtime light/dark switching | ● | ● | ● | ● |
| 8 | Runtime accent switching | ● | ● | ● | ● |
| 9 | Subtree-scoped themes | ● | ● | ● | ● |
| 10 | Breakpoint representation (one source) | ● (Sass only) | ● (source → Sass, later TS) | ● | ◐ |
| 11 | Provenance preservation | ○ (comments) | ● (`$extensions`) | ◐ | ○ |
| 12 | Aliases/references | ◐ (`var()` text) | ● (resolvable) | ● | ◐ |
| 13 | Validation | ○ | ● | ◐ | ○ |
| 14 | Light/dark parity checking | ○ | ● | ● | ○ |
| 15 | Contrast checking | ◐ (regex) | ● | ● | ◐ |
| 16 | Developer ergonomics | ● | ◐ | ● | ● |
| 17 | CI friendliness | ◐ | ● | ● | ◐ |
| 18 | Package distribution | ◐ | ● | ◐ | ◐ |
| 19 | No consumer `includePaths` | ◐ (needs pkg resolution) | ● (CSS) | ● | ◐ |
| 20 | No runtime JS needed | ● | ● | ◐ (risk of JS runtime) | ● |
| 21 | Future extensibility | ○ | ● | ◐ | ○ |
| 22 | Complexity / maintenance cost | ● | ◐ | ◐ | ● now |

## Decision

We propose **Option B**, constrained to stay small: a DTCG-aligned JSON source, an in-repository generator, and **CSS custom
properties as the only initial runtime artifact**. The emitted names are Admin's existing `--nw-*` names, so the first adoption
changes no component.

### 1. Canonical source and generation

- **Canonical:** JSON token files in `packages/foundation/design-tokens` following the **DTCG 2025.10 Format module** (`$value`,
  `$type`, `$description`, `$extensions`, groups, `{alias}` references). The contexts — the `light`/`dark` theme sets and the
  accents — are described by **one DTCG 2025.10 resolver document** (sets for reference, scales and semantic tokens; a `theme`
  modifier with `light` and `dark`; an `accent` modifier with the shipped accents), so the context model is standard data rather
  than a private convention. The package documents and validates the subset it uses; deviations from the stable specification are
  recorded, not silent. Types used initially: `color`, `dimension`, `fontFamily`, `fontWeight`, `duration`,
  `cubicBezier`, `number`; anything else (shadows, gradients) is a documented string value until a typed form is needed.
- **Generated, never hand-edited, never committed — but always published.** Every artifact in §8 is build output and is not
  stored in git; the JSON source and the resolver document are the only source of truth. *Not in git* does not mean *not in the
  package*: the package build writes the artifacts to the package's `dist/` (gitignored, and skipped by `check:repo`'s source
  scan) before its tests and before packing, and the published tarball — like any
  `npm pack` tarball used for local cross-repository testing (`CONSUMPTION.md`) — contains them, listed in `files` and `exports`.
  Consumers never run the generator and need none of its tooling. A clean clone runs the package build before its tests; CI
  builds from a clean checkout, checks that two builds are byte-identical, and checks that the packed tarball contains every
  exported artifact (§10).
- **Generator:** a small, dependency-free Node script inside the package, limited to the DTCG subset in use, the resolver contexts
  above and the INITIAL emitters of §8 (CSS, Sass breakpoints, token manifest). An established tool (Terrazzo, Style Dictionary) is
  **not** adopted now, because: the selector contract of §4–§5 (`:root`, `[data-theme]` on any element, `:root:not([data-theme])`
  under `prefers-color-scheme`, theme × accent combinations, reduced motion) would need a custom formatter in either tool as well;
  the INITIAL output is a few small text files; and a tool brings a dependency tree into a package whose CI must stay reproducible
  under `npm ci --ignore-scripts` (ADR-0002). Because the source is stable DTCG 2025.10 with a standard resolver document, a tool
  can replace the generator later **without touching the source**.
- **Re-evaluation trigger:** before writing any further emitter — TypeScript beyond simple name constants, React Native, Dart — or
  if the generator outgrows a small, reviewed script, an established DTCG 2025.10 tool is evaluated first; a new in-house emitter
  then needs a recorded reason.

### 2. Foundation, brand and product

**The foundation is the shared Nawara design language, not a brand-neutral kit.** Three things are kept apart:

1. **Design-system mechanics** — tiers, naming, the theme and accent contracts, scales. Product- and brand-independent.
2. **Nawara brand identity expressed as tokens** — the coral + ink palette (Admin `docs/BRAND.md` §0: owner decision 2026-10-04,
   Coral as the brand default) and the brand type families. Shared by every Nawara product **on purpose**, so these are
   foundation values.
3. **Product presentation** — Admin's shell, workspace atmosphere, charts, appearance presets, decorative accents, product
   identity colours (for example School's product tile) and all artwork. Product extensions (§6).

A value first designed in an Admin screen enters the foundation only when it expresses (1) or (2) **and** a shared primitive or
base style consumes it; being used by Admin is not enough. Logo and illustration files are brand *assets*, not tokens, and are not
part of this package (§14).

### 2a. Tiers

| Tier | Example names | Who may read it | In the foundation package |
|---|---|---|---|
| **Reference** | `--nw-ref-coral-600`, `--nw-ref-ink-50` | theme and accent sets, product extension *theme* sets; never components | yes |
| **Scale** (theme-independent) | `--nw-space-4`, `--nw-radius-md`, `--nw-text-size-sm`, `--nw-z-modal`, `--nw-duration-base`, `--nw-control-height-md`, `--nw-focus-ring-width` | everyone | yes |
| **Semantic** (per theme) | `--nw-color-primary`, `--nw-surface-raised`, `--nw-text-secondary`, `--nw-border-default`, `--nw-status-danger-fg`, `--nw-alert-info-bg`, `--nw-focus-ring`, `--nw-shadow-md`, `--nw-scrim` | everyone | yes |
| **Component** | `--nw-button-bg`, `--nw-inline-alert-border` | the component that defines it | **no**: stays in the component's own styles (later shipped with `angular-ui`), as Admin already does |
| **Product extension** | `--nw-sidebar-background`, `--nw-workspace-atmosphere`, `--nw-chart-line`, `--nw-logo-leaf` | that product only | **no**: in the product repository |

The foundation semantic set starts as **the tokens the shared primitives and base styles consume** (the ~104 names above, minus
component and artwork tokens), plus their light/dark counterparts. A token enters the foundation only with a product-independent
meaning; anything named after a layout region, a feature, a product or artwork does not.

### 3. Naming contract

- **`--nw-` is the authoritative public prefix** for every shared web token; the CSS name is `--nw-` plus the token's path joined
  by `-` (`color.primary.hover` → `--nw-color-primary-hover`; `ref.coral.600` → `--nw-ref-coral-600`). Group names are lowercase
  `kebab-case` words; no product, layout-region or feature words in foundation paths.
- **Preserved now (public compatibility):** every `--nw-*` name the shared primitives and Admin consume today, with its current
  value, including `--nw-font-latin`/`--nw-font-sans`/`--nw-font-arabic` and `--nw-font-weight-bold`.
- **Naming debt, deprecated later and never renamed silently:** `--nw-font-latin` (alias of `--nw-font-sans`);
  `--nw-font-weight-bold` equal to semibold (documented, kept); decorative `accent-*` names (product extension, §6); Drive's
  unprefixed `--color-*` / `--font-family-base` (not adopted: Drive moves to `--nw-*` when it consumes the package). A deprecation is
  announced in the changelog, kept for a minor release with the old name emitted as an alias, and removed in a major.
- **Token versioning (ADR-0002 SemVer):** adding a token is minor; changing a value is minor, with a changelog entry and a passing
  contrast gate; changing a token's meaning, removing or renaming a name, or changing the attribute/selector contract is major.

### 4. Theme model

- `light` and `dark` are **token sets** with **identical semantic paths** (parity enforced, §10). **`system` is not a token set**: it
  is the absence of `data-theme`, resolved by the generated `prefers-color-scheme` rule.
- The **generated CSS owns the selectors**, exactly Admin's current contract: `:root` (scales, reference, light), `[data-theme='light']`,
  `[data-theme='dark']`, `@media (prefers-color-scheme: dark) { :root:not([data-theme]) { dark } }`, and
  `@media (prefers-reduced-motion: reduce)` for the motion scale. Attribute selectors work on any element, so subtree themes keep
  working. Consumers only set attributes; no runtime JS is required to style an application.

### 5. Accent model

- An **accent** is a named override, per theme, of a **closed list of accent-controlled semantic tokens** (today: `color-primary`,
  `-hover`, `-active`, `-subtle`, `surface-brand-subtle`, `text-on-primary`, `text-brand`, `text-link`, `border-brand`,
  `focus-ring`, `focus-halo`). Every accent defines all of them for both themes (accent parity, §10). Accent values should alias
  reference ramps; a raw value is allowed only with provenance (§7).
- The **default accent is the base theme's own values**: no `data-accent` attribute. The generated selectors are
  `[data-accent='<name>']` combined with the theme selectors, exactly as Admin emits them today.
- **The foundation ships the accent contract and the default.** Admin's five presets (rose, plum, indigo, teal, amber) are recorded
  in Admin's `docs/BRAND.md` as UI proposals, not brand: they start as **Admin's product extension** and move into the foundation only when a
  second product adopts them. Any product may define its own accents with the same selector contract and token list in its own
  extension; it never edits the package. Artwork that follows an accent (logo colours) belongs to the product or brand-assets owner,
  not to accent sets.

### 6. Product extension model

```text
@nawara-solutions/design-tokens   reference · scales · semantic light/dark · accent contract · reduced motion
        │  (products read; the foundation never reads products)
        ▼
<product> extension               product tokens, product accents, artwork tokens; may alias foundation reference/scale/semantic
        │
        ▼
<product> shell and components    read semantic + scale + their own extension tokens; never reference tokens
```

- A product extension is the product's own token file(s) (initially Admin keeps its SCSS) loaded **after** the foundation CSS,
  using the same `--nw-` prefix and the same theme/accent selectors. Its names must not collide with foundation names (the package
  publishes its name list; a product check can compare).
- **The foundation must not reference any product token**, and its paths may not contain product, layout-region or artwork words
  (validated, §10). Drive, School and future products follow the same rule with their own shells.

### 7. Provenance

Reference values and raw accent values carry `$extensions["com.nawara-solutions.provenance"]`: `"design"` (stated by the design
source) or `"derived"` (computed for a UI need); `"derived"` requires a `$description` giving the reason, as Admin's comments do
today. Provenance is required on reference and raw accent values, optional elsewhere, and is never promoted from derived to design
without a new design source.

### 8. Output artifacts

| Artifact | Class | Notes |
|---|---|---|
| CSS custom properties: reference, scales, semantic light/dark, system and reduced-motion rules, accent mechanism | **INITIAL** | one stylesheet in `dist/`, exposed by an `exports` subpath (for example `@nawara-solutions/design-tokens/tokens.css`) |
| Sass breakpoint module: the map and a `from()` mixin, generated from breakpoint tokens | **INITIAL** | exported through the package's `exports` with a `sass` condition and imported as `@use 'pkg:@nawara-solutions/design-tokens/breakpoints'` (Sass's Node package importer); the form is verified against Angular CLI and Vite when the package is built. Never consumer `includePaths` |
| Public token manifest: every emitted name with its resolved value per context (light, dark, each shipped accent) | **INITIAL** | exported and packed like the CSS (not a runtime dependency of applications): name-collision and deprecation checks, and the values products need to check **their** contrast pairs against foundation surfaces (Admin's presets are evaluated against foundation backgrounds) |
| TypeScript constants: breakpoint queries, theme and accent names | **FUTURE** | replaces Admin's hand-kept `BreakpointObserver` mirror and `ThemeService` lists when an Angular package needs them |
| Resolved JSON for non-web consumers (full structured data beyond the manifest) | **FUTURE** | when a non-web consumer or tooling needs it |
| Dart (Flutter) and React Native/TypeScript value exports | **FUTURE** | new emitters over the same source; not required of any consumer today |
| Raw Sass mixins of the whole token set, component tokens, JS theme runtime, framework presets (Tailwind etc.) | **NOT NEEDED** | |

Breakpoints are **not** emitted as custom properties (they cannot drive media queries). Font *family names* are scale tokens; font
binaries, licensing and delivery are not part of this package.

### 9. Web consumer contract

1. Load the package stylesheet once, globally (Angular: `angular.json` `styles`; Vite/React: one CSS import), **before** the
   product extension stylesheet.
2. Use `var(--nw-*)` semantic and scale tokens in components; never reference tokens.
3. Set `data-theme` and `data-accent` on `<html>` or a subtree; omit them for system and default.
4. Use `@use 'pkg:@nawara-solutions/design-tokens/breakpoints' as bp;` for media queries (Sass consumers only; React consumers
   without Sass get breakpoint constants with the FUTURE TypeScript artifact).

No consumer Sass `includePaths`, no JavaScript and no framework are required.

### 10. Validation contract (the package's CI)

Structure and type validity of the source subset; no duplicate CSS names; every alias resolves; no alias cycles; light/dark
semantic parity; accent parity (every accent defines exactly the accent-controlled list for both themes); naming rules (prefix,
case, no product/region/artwork words in foundation paths); provenance present and valid where required; the reference tier read
only by theme/accent sets; the resolver document valid and every context resolvable; generated artifacts built from the source in
CI (never committed, so never stale), **deterministic** (two builds, identical bytes), and **present in the packed tarball**; and a **contrast
check at least as strict as Admin's `check:contrast`**: its pairs and thresholds, evaluated in light and dark and in every
accent the package ships.

**Contrast pairs are validation configuration, separate from token values** (a pair is a usage relationship, not a value). The
contrast checker is reusable by products for their extension pairs (a later tooling decision).

### 11. No-flash compatibility

The token contract guarantees the attribute names and values the bootstrap writes: `data-theme` ∈ {`light`, `dark`} (absent =
system) and `data-accent` ∈ the accent names (absent = default), on any element. Storage keys (`nw.theme`, `nw.accent`,
`nw.locale`) and the bootstrap script stay **product implementation** in Admin; the future TypeScript name constants (§8) can feed
them, but the package ships no bootstrap.

### 12. Migration (Admin, the first slice)

1. Classify every Admin token as foundation (product-independent, consumed by shared primitives/base) or Admin extension (shell,
   features, artwork, presets, decorative accents, masks, layout widths) — in this repository's slice, reviewed.
2. Write the foundation source with **Admin's exact names and values**; generate the CSS.
3. **Parity gate:** for every selector (`:root`, both `data-theme`, system, reduced motion, each shipped accent), the generated
   custom properties equal Admin's compiled values for the foundation names **at the adoption commit** (Admin's styles are under
   active development: the baseline is re-taken then, never reused from this ADR). A mismatch blocks adoption.
4. In one Admin change: load the package CSS, keep Admin's extension tokens in Admin (still SCSS, after the package CSS), delete
   Admin's local copies of the moved tokens, switch breakpoint `@use` to the package path; components are untouched because every
   `var(--nw-*)` name still resolves.
5. Admin `npm run validate` (its contrast check on the extension pairs and presets reads foundation values from the package
   manifest instead of parsing the removed SCSS) and visual review in light and dark, LTR and RTL,
   and the accents.

Admin's extension may later move to its own JSON source with the same generator; that is Admin's choice, not a prerequisite.

### 13. Rollback

Revert the Admin adoption commit: Admin's local token files return and the package dependency is removed. Nothing persistent
changes (no data, no backend, no production authority), and the package can stay published and unused.

### 14. Out of scope

Angular component APIs and component tokens, the icon registry, the form-field API, Transloco, the Core HTTP client and auth, the
release workflow and publication (ADR-0002 follow-up), final brand colours and logo artwork, font binaries and licensing, Dart and
React Native generators, Tauri, product shell design, and the base/reset and accessibility Sass helpers (decided with the slice that
extracts them).

## Consequences

- **Easier:** one framework-independent source serves Angular and React now (CSS) and Dart/React Native later (new emitters);
  parity, references, provenance and contrast become data checks instead of SCSS parsing; Admin adopts with no component churn;
  products extend without forking the package; breakpoints have one source.
- **Harder:** a generator and a schema subset to own and test; Admin's values must be transcribed to JSON exactly (mitigated by the
  parity gate); the theme-file split must be reviewed token by token; contributors edit JSON rather than SCSS.
- **Given up:** shipping Admin's SCSS as-is (Option A); a third-party token tool for now.
- **Follow-up:** this ADR's acceptance; the foundation/extension classification and the package design with the first slice; the
  release ADR/TDD before publication (ADR-0002); an Admin-authorized change for adoption; extend `check:repo`'s package source scan to the
  token JSON (product-term and framework rules; it scans code and style files today); later decisions on accent presets, contrast
  tooling for products, TypeScript/Dart emitters (each behind the re-evaluation trigger of §1) and the deprecation of
  `--nw-font-latin`.
