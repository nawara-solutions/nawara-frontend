# @nawara-solutions/design-tokens

Nawara foundation design tokens, framework-independent ([ADR-0003](../../../docs/adr/0003-token-format-and-distribution.md)).
One DTCG 2025.10 source (`src/`) generates three artifacts; consumers use the artifacts and never run the generator.

> **Status: 0.1.0, bound to GitHub Packages, not yet published** (DT1 + DT2a; releasing: [`docs/RELEASING.md`](../../../docs/RELEASING.md)). It contains the foundation set: the coral + ink brand palette
> and the green/amber/blue status hues, the theme-independent scales, the semantic tokens in light and dark (surfaces,
> text, borders, actions and focus with all 11 accent-controlled tokens; danger actions, status, alerts and the scrim) and
> the breakpoints. **Shadows are deferred (DT2b):** the shared shadows are DTCG `shadow` composites, which the generator
> does not support; supporting them is a tooling decision (see the trigger below), taken when a shared component needs
> foundation-owned shadows. Until then products define `--nw-shadow-*` themselves. No product consumes the package yet.

## Installation

Published to GitHub Packages only (not npmjs.com), once released. A product maps the scope in its committed `.npmrc` and
authenticates with a `read:packages` token; CI and Docker setups are in [`docs/CONSUMPTION.md`](../../../docs/CONSUMPTION.md#setup-by-environment).

```ini
@nawara-solutions:registry=https://npm.pkg.github.com
```

```sh
npm install --save-exact @nawara-solutions/design-tokens   # pnpm add -E @nawara-solutions/design-tokens
```

## Consumer contract

| Export | Artifact | Use |
|---|---|---|
| `@nawara-solutions/design-tokens/tokens.css` | `dist/tokens.css` | load once, globally, **before** any product extension stylesheet (Angular: `angular.json` `styles`; Vite/React: one CSS import) |
| `@nawara-solutions/design-tokens/breakpoints` | `dist/breakpoints.scss` | `@use 'pkg:@nawara-solutions/design-tokens/breakpoints' as bp;` then `@include bp.from(tablet) { … }` — Sass's Node package importer, no `includePaths` |
| `@nawara-solutions/design-tokens/manifest.json` | `dist/manifest.json` | tooling only: every public name with its resolved value per context, for product collision, deprecation and contrast checks |

- Components read **semantic** and **scale** tokens through `var(--nw-*)`, never `--nw-ref-*` reference tokens.
- Theme: set `data-theme="light"` or `"dark"` on `<html>` or any subtree; no attribute follows the system preference.
- Accent: the default (coral, the Nawara brand) is the absence of `data-accent`. Products define other accents in their own
  extension, overriding exactly the manifest's `accentControlled` tokens, loaded after this stylesheet.
- No JavaScript and no framework are required.

## Source and generation

| Path | Content |
|---|---|
| `src/nawara.resolver.json` | DTCG Resolver 2025.10: sets `reference`, `scale`, `breakpoint`; modifiers `theme` (light, dark), `accent` (default) and `motion` (standard, reduced); the accent contract |
| `src/tokens/*.tokens.json` | the token values (DTCG Format 2025.10 subset) |
| `src/contrast.pairs.json` | foundation contrast pairs (configuration, not token values) |
| `scripts/` | the generator: `npm run build` writes `dist/` (gitignored); `npm pack` builds before packing |

The build fails, writing nothing, on any invalid source: structure, names, types, unresolved or cyclic aliases,
light/dark parity, the accent contract, provenance, product/region/artwork words in names, breakpoint placement, or a
contrast pair below its threshold (4.5 for text, 3 for UI components, in both themes).

**Deviations from DTCG 2025.10, by design:** `dimension` also accepts `em` (letter spacing); token sources must be
`{ "$ref": "<file>.json" }` inside `src/` (no inline tokens, no URLs); only the `com.nawara-solutions.provenance`
extension is accepted on tokens.

**Generator scope (ADR-0003 §1):** CSS, Sass breakpoints and the manifest only. The generator stays in-house: the DT1
re-evaluation (Terrazzo 2.7.1, Style Dictionary 5.6) found that a tool would replace only part of the generic layer, while
the Nawara policy, packaging and consumer guarantees stay here, at a much larger dependency cost.

**Tooling trigger.** Re-evaluate an established DTCG 2025.10 tool when **any** of these occurs:

1. the generic token parsing, resolution and output code grows beyond roughly 400 lines;
2. a fourth output target, or any non-web output target, is proposed — Dart, React Native, or TypeScript beyond simple
   name constants;
3. a DTCG feature materially beyond the supported subset is required — composite or advanced types such as shadow,
   typography or gradient, or additional colour spaces;
4. a specification-conformance gap is found that cannot be closed cheaply and clearly here.

Nawara-specific policy and validation code (provenance, the accent contract, naming and boundary rules, contrast, input
confinement) does not count towards the trigger and is not a reason to adopt a generic tool. A trigger means
**re-evaluate**, not migrate automatically.

## Versioning

SemVer (ADR-0002, ADR-0003 §3): a new token is minor; a value change is minor with a changelog entry and a passing
contrast gate; a change of meaning, a removed or renamed name, or a change to the selector/attribute contract is major.
Deprecated names are emitted as copies of their replacement and marked `deprecated.aliasOf` in the manifest for at least
one minor release before removal. `--nw-font-latin` is deprecated in favour of `--nw-font-sans`.
