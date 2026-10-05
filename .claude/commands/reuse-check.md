---
description: Decide whether needed frontend functionality is reused, extended, shared, or kept in the product (no code changes)
argument-hint: <what you need, e.g. "a confirm dialog for destructive actions" or "an Angular date-range picker">
allowed-tools: Read, Glob, Grep
---

Run the reuse-before-duplication decision of `docs/ARCHITECTURE.md` §7 for `$ARGUMENTS`, and report a recommendation. This
command is read-only: it never creates, moves or edits a file. If `$ARGUMENTS` is empty, ask what functionality is needed.

Steps:

1. Restate the need in one line, and the consumer: which product, which framework (Angular, React, Vue, React Native, Flutter),
   web or Tauri desktop.
2. **Product-specific?** If it encodes a product domain, workflow or copy (Drive: students, lessons, vehicles, exams; School:
   classes, attendance, gradebooks; Admin: organization/operator/audit administration), the answer is **product repository**.
   Say which generic shared primitives it could compose, if any exist. Stop here.
3. **Already shared?** Search `packages/**` (names, exports, READMEs) for an equivalent, in the layer the consumer can use:
   `foundation` for any framework; `angular` only for Angular consumers. A Vue/React/Flutter consumer can never use an
   `angular` package. If found: **reuse**; if it almost fits, propose a generic extension of its API (not a fork, not a wrapper
   that only renames it).
4. **Known candidate?** Check `docs/ADMIN-EXTRACTION-INVENTORY.md` (and, read-only, the product's own candidate register, e.g.
   `../nawara-admin/docs/ROADMAP.md` "Kit register"). If a candidate exists in a product, say so: reuse there or plan its
   extraction rather than writing a second copy.
5. **Genuinely generic?** Apply the extraction criteria: a real first implementation, a confirmed second use (or an obviously
   generic responsibility), a stable product-independent API. Similar-looking code is not enough. If the criteria are not met:
   **build it in the product** and mark it CANDIDATE there.
6. Classify honestly: framework-independent (`foundation`), Angular-shared (`angular`), or product-specific. Never propose
   wrapping framework code to look framework-independent.

Report, in this shape:

- **Decision:** REUSE `<package/export>` | EXTEND `<package>` | EXTRACT (proposed slice) | PRODUCT (`<repo>`)
- **Layer:** foundation | angular | product
- **Evidence:** the files/packages searched and what was (not) found
- **Next step:** one line; any extraction is a separate, owner-authorized task
