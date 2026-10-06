# Shared contribution and product extension policy

How Nawara products (Admin, Drive, School, future products) and `nawara-frontend` work together without blocking or
contaminating each other. This is the **authoritative process policy**; it operationalizes decisions already accepted in
[ADR-0001](adr/0001-layered-multi-framework-frontend-platform.md) (layers),
[ADR-0002](adr/0002-package-scope-and-consumption-model.md) (packages and versions) and
[ADR-0003](adr/0003-token-format-and-distribution.md) (tokens and product extensions), and the layering rules of
[`ARCHITECTURE.md`](ARCHITECTURE.md). It adds no architecture: where this document and an ADR disagree, the ADR wins.

**Reuse before duplicating. Extract when genuinely generic. Keep business logic with its product.**

## 1. The rules

1. **Reuse first.** Before building a generic *web* frontend capability in a product, look in `nawara-frontend` for a
   compatible one (the package tables in the [README](../README.md), each package's README, `/reuse-check`). If it exists,
   reuse it; do not duplicate an equivalent generic primitive without a product-specific reason. "Compatible" includes the
   framework (rule 6).
2. **Product ownership.** Business and domain UI stays in its product repository: Admin organization management in
   `nawara-admin`, Drive booking, lesson and vehicle UI in `nawara-drive`, School gradebook and classroom UI in
   `nawara-school`. Two screens that look alike are not a shared component.
3. **A shared capability is its own contribution.** A product that needs a generic capability `nawara-frontend` lacks never
   adds it as a side effect of the product task. It becomes a separate `nawara-frontend` task, branch and pull request
   (§2).
4. **No inseparable cross-repository change.** A product task does not modify `nawara-frontend`, another product or
   `nawara-core`; a `nawara-frontend` task does not modify a product or Core. Each repository stays independently
   understandable, testable and mergeable. No commit and no pull request spans repositories.
5. **Version independence.** Products are not required to run the same shared-package version at the same time. Packages
   follow SemVer; a product may stay on an older compatible version while another upgrades. A shared release never forces
   a simultaneous migration: each product upgrades deliberately, in its own repository, with its own validation and pull
   request.
6. **Framework compatibility.** Framework-independent capabilities (`foundation`: design tokens, contracts, semantic
   concepts, accessibility rules, framework-free assets) can serve any product. A framework-specific implementation serves
   only consumers of that framework: an Angular component an Angular app, a React component a React app, and likewise for
   Vue, Flutter and React Native. Nothing is wrapped to look portable.
7. **Product visual identity.** `nawara-frontend` is a shared design and engineering foundation, **not one product
   appearance**. Each product owns its theme, shell, layouts, product-specific semantic extensions and components, visual
   hierarchy, UX and artwork. Nawara Drive may look different from Nawara Admin, and Nawara School from both.
8. **Product token extensions never redefine the foundation.** §3.

Dependency direction, without exception:

```text
product → foundation      allowed
foundation → product      forbidden
product → another product forbidden (Admin ↔ Drive ↔ School)
```

## 2. Contribution flow

```text
Product need discovered
        │
        ▼
Does nawara-frontend already provide a compatible capability? ──yes──► reuse it
        │ no
        ▼
Is the requirement genuinely product-independent (§4)? ──no──► keep it in the product
        │ yes
        ▼
Separate nawara-frontend task and branch
        ▼
Frontend implementation → Frontend validation and CI → Frontend pull request → OWNER MERGE
        ▼
Product updates its dependency (its own branch)
        ▼
Product validation → product pull request
```

The Frontend change merges first; the product consumes it afterwards, in its own pull request. Until a package is
published (ADR-0002), "updates its dependency" means the local tarball procedure of [`CONSUMPTION.md`](CONSUMPTION.md).
While the Frontend contribution is in review, the product may keep a local implementation and mark it as a candidate; it
removes it when it adopts the shared one.

## 3. Product token extensions

The foundation package owns **every token name it exports**: the names listed in
`@nawara-solutions/design-tokens/manifest.json` (ADR-0003 §6, §8).

A product extension **may**:

- define product-specific semantics and visual identity in its own tokens;
- reference (alias) foundation tokens;
- override **only an explicitly supported customization point**. Today there is exactly one: a product accent, which
  overrides exactly the manifest's `accentControlled` tokens under a `[data-accent='<name>']` selector (ADR-0003 §5).

A product extension **must not**:

- define a token whose name the foundation owns, outside a supported customization point (a collision);
- change the meaning of a foundation token (for example make a status colour decorative);
- be depended on by the foundation, or have its tokens moved into the foundation because one product uses them.

Product extension stylesheets load after the foundation stylesheet. Product tokens keep the `--nw-` prefix (ADR-0003 §6);
**no per-product namespace is prescribed yet**, and none is needed for the collision rule. It will be decided, if useful,
with the first real product extension.

**Enforcement.** The contract is documented; automation is deferred until a product extension exists. The interface is
already in place: a product-side check reads `manifest.json` and fails when the product defines a foundation-owned name
(any `manifest.tokens[].name`), unless that name is in `manifest.accentControlled` and the definition sits inside an accent
selector. That check belongs to the adopting product's own validation, added with its adoption; `nawara-frontend` never
crawls product repositories.

## 4. What belongs in nawara-frontend

`nawara-frontend` is **not** where every reusable-looking component goes. A candidate should satisfy all of:

1. a product-independent meaning;
2. a stable, reusable contract;
3. a compatible technology and layer (ARCHITECTURE §3, §5);
4. no dependency on product business logic;
5. a real consumer need.

Extraction is evidence-driven: a shared package or capability is created because a real consumer requires it, never
because it might be needed later. This holds for every layer that does not exist today — React, Vue, Flutter, React
Native — and for Tauri.

- **Tauri** is a runtime, not a frontend framework layer. A Tauri app consumes the packages of its frontend framework
  (Angular + Tauri: `angular` and `foundation`; Vue or React + Tauri: `foundation` and that framework's layer if it
  exists). Rust commands, local database integration, updater logic and filesystem integration stay in the product
  unless several real consumers later justify sharing them. There is no `nawara-tauri`.
- **Mobile.** There is no generic `nawara-mobile` platform. Flutter and React Native implementations are not reusable
  between each other. If several products use the same mobile framework and show real overlap, a framework-specific
  package can be evaluated then. Extract after evidence of reuse.

## 5. Guidance for product repositories

Agents working in a product repository do not read this repository's `CLAUDE.md`. Each product should carry this short
section in its own `CLAUDE.md` (added in that product's own, separately authorized change):

```markdown
## Shared frontend platform (nawara-frontend)

`../nawara-frontend` holds the shared Nawara frontend foundation. Its policy is
`../nawara-frontend/docs/SHARED-CONTRIBUTION-POLICY.md`.

- Before building a generic web frontend capability here, check nawara-frontend for a compatible one and reuse it.
- Product business and domain UI stays in this repository.
- Never edit nawara-frontend as part of a task in this repository. If a genuinely generic capability is missing, stop and
  propose a separate nawara-frontend task; it merges there first, and this product adopts it afterwards in its own change.
- This product owns its theme, layouts and visual identity. Its tokens must not redefine a name exported by
  `@nawara-solutions/design-tokens` (see `manifest.json`), except through a supported customization point.
```
