# Changelog

All notable changes to `@nawara-solutions/design-tokens`. Versioning rules: [README](README.md#versioning).

## 0.1.0 (2026-10-06)

- First foundation slice (DT1): 26 reference colours (coral and ink), 51 scale tokens, 24 semantic tokens in light and
  dark, 4 breakpoints; generated `tokens.css`, `breakpoints.scss` and `manifest.json`.
- `--nw-font-latin` is deprecated (same stack as `--nw-font-sans`).
- DT2a: 18 reference colours (green, amber and blue status hues) and 28 semantic tokens in light and dark: danger action
  (`--nw-color-danger-hover`, `-active`, `--nw-text-on-danger`), status (`--nw-status-*-fg`, `-bg`), alerts
  (`--nw-alert-*-bg`, `-fg`, `-border`, `-icon`) and `--nw-scrim`; 31 more contrast pairs (71 in total).
- Shadows are not included (DT2b, deferred): they need DTCG `shadow` composites.
- Distribution (ADR-0004): first release, to GitHub Packages only (`publishConfig.registry`), by the tag
  `design-tokens-v0.1.0`; `"license": "UNLICENSED"`.
