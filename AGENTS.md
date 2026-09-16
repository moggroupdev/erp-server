# AGENTS.md — ERP Server

NestJS + Drizzle (PostgreSQL) ERP backend. Follow existing patterns; keep changes focused.

---

## Enums & constants

| Layer | File                          | Role                                                                                                                                                           |
| ----- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| App   | `src/utils/constants.ts`      | Single source for enum values (`*_VALUES` + derived `*_STATUSES` objects). Never hardcode enum strings elsewhere.                                              |
| DB    | `src/database/schema/common/` | Shared schema primitives: `enums.ts`, `properties.ts` (shared columns), `types.ts`, `constraints.ts`, `approval-gates.ts`. Imports enum values from constants. |

**New enum:** constants → `common/enums.ts` → schema. Migration is done manually by a developer (see Migrations).

---

## Schema

- One file per domain under `src/database/schema/`; export tables + `relations`; register in `index.ts`.
- **Fully define** FKs, indexes, checks, and Drizzle relations in schema — not only in app code.
- Index FKs and filter/sort columns. Use `check` for DB-level invariants.
- **Foreign keys:** default to inline `.references()`. When Drizzle's auto-generated constraint name would exceed PostgreSQL's 63-character identifier limit (`{table}_{column}_{refTable}_{refColumn}_fk`), declare the column as a bare type and add `foreignKey({ name: '<short_abbrev>_fk', ... })` in the table callback — use the same abbrev prefix as indexes on that table (e.g. `mpoi_mpo_id_fk`, `inv_tx_items_tx_id_fk`).
- **Uniqueness:** use `.unique()` on a column **or** `uniqueIndex()` — never both with the same name (breaks migrations).
- Use `uniqueIndex()` only for partial uniqueness (e.g. one default address).
- Status often comes from timestamps (`cancelledAt`, `completedAt`) — avoid redundant **entity-level** status enums.
- **Multi-party approval:** use `approvalGateColumns(prefix)` + `approvalGateConstraints(table, prefix, tableAbbrev, users.id)` from `schema/common/approval-gates.ts`. Each gate is `decision` (`approval_decision`: pending/approved/rejected) + `decidedAt` + `decidedBy` + `decisionReason` (required iff rejected). Overall entity status is still derived (rejected if any gate rejected; approved if all approved; else pending). Do not add a header status column.

### DRY vs. performance

- **Default:** no redundancy. Prefer FKs + joins over duplicated codes, names, or IDs.
- **Exception:** a denormalized column is allowed when it avoids a hot join on frequent reads (list/filter APIs). Keep these rare.
- Mark RFP (Redundant For Performance columns) copies with `// @RFP_APP_CHECKED - …` and document in `src/database/docs/db-duplications.md`; sync/validation rules in `src/database/docs/application-logic.md`.
- Mark cached/derived columns with `// @CACHING_APP_SYNCED - …`; document in both `src/database/docs/db-duplications.md` and `src/database/docs/application-logic.md`.
- Mark point-in-time price/cost copies with `// @HISTORICAL_SNAPSHOT - …`; document in `src/database/docs/db-duplications.md`.
- Mark service-validated columns with `// @APP_CHECKED - …`; document in `src/database/docs/application-logic.md`.

### Performance

- Index columns used in `WHERE`, `ORDER BY`, and join keys.
- Prefer narrow selects; use Drizzle `with` only when needed.
- Drizzle `with` aliases are `{table}_{rel}_{rel}_…` and Postgres truncates identifiers at 63 chars. Do not nest another `with` on a deep path — load the leaf via `extras` (see `src/utils/extras/`) or a second query.
- Use `src/utils/services/query-builder.service.ts` for list/filter/pagination.
- Quantity updates: `sql\`quantity + ${n}` in transactions — never read-modify-write in Node.
- After a mutation, avoid a second `get()` just to build the response. Prefer Drizzle `.returning()` on the same `insert`/`update`, or compose `{ ...entity, updatedField }` from data already in hand when the client revalidates anyway. Spotlight: fewer DB round-trips.

---

## Docs & triggers

| File                                     | Purpose                                                                                              |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `README.md`                              | High-level business scope, managed domains, end-to-end workflow, and current data-model coverage.    |
| `src/database/docs/tables-summary.md`    | All schema tables — primary key, deleting behavior, audit columns, and human-readable code prefixes. |
| `src/database/docs/db-duplications.md`   | `@RFP_APP_CHECKED`, `@CACHING_APP_SYNCED`, and `@HISTORICAL_SNAPSHOT` column inventory.              |
| `src/database/docs/application-logic.md` | Business logic that is not handled in DB — caching sync, RFP sync, validations, workflow guards.     |
| `src/database/docs/audit-trail.md`       | Audit trail design — hybrid Nest GUCs + Postgres trigger, file map, query API, ops.                 |
| `src/database/sql/triggers.sql`          | Low-level integrity (auto-generated `code` on INSERT) **and** audit emit infrastructure (`audit_emit` + attach loop). Not business workflow logic. |

**Triggers example:** `CTR-00000001` via sequence + `BEFORE INSERT` on `contracts`. Add new coded entities here; omit `code` from create DTOs.

**Audit emit:** After adding a new audited table, re-run `db:triggers` so `audit_emit_row` is attached. Update `audit_resolve_linkage` in the same file when the table needs parent/root linkage. Seed scripts may `SET erp.audit_skip = 'true'` to skip logging.

**Audit maintenance rule:** service/controller/DTO changes usually do not need audit-specific code. Existing and new writes are captured automatically through the wrapped Drizzle pool. Touch `triggers.sql` only when excluding a table from auditing or when a new child table needs parent/root linkage.

### Keeping docs in sync

After **every** change, update all affected docs in the **same** change — never leave them stale.

| Change type                                                                  | Update                                                                           |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| New/changed table                                                            | `tables-summary.md`                                                              |
| New/changed `code` prefix or coded table                                     | `triggers.sql`                                                                   |
| `@RFP_APP_CHECKED` redundant column, or `@CACHING_APP_SYNCED` derived column | `db-duplications.md` and `application-logic.md`                                  |
| `@HISTORICAL_SNAPSHOT column`                                                | `db-duplications.md`                                                             |
| `@APP_CHECKED` column or validation rule                                     | `application-logic.md`                                                           |
| New/changed domain, entity, or workflow step                                 | `README.md` (What the System Manages, business process, Current Scope as needed) |
| Schema or feature scope shift                                                | `README.md` Current Scope                                                        |

Updating existing docs is required; do not create new markdown files unless the user asks, and keep these docs summarized.

---

## Migrations

**Agents must not run** `db:generate`, `db:migrate`, or `db:triggers` after schema changes. Stop at schema (and related docs/triggers SQL edits); a developer runs the workflow manually:

```bash
npm run db:generate → db:migrate → db:triggers
```

Review generated SQL for duplicate indexes. Greenfield reset: drop DB/schema, then full workflow. Keep `src/database/docs/tables-summary.md` current when adding or changing tables.

---

## NestJS

- Transactions for multi-table writes and recalculations.
- Nest HTTP exceptions with clear messages; omit immutable fields (`code`, `createdAt`, `createdBy`) from update DTOs.
- Permissions from `PERMISSION_VALUES` in constants.

### Module naming abbreviations

| Abbrev / module      | Means                                                     | Table                        |
| -------------------- | --------------------------------------------------------- | ---------------------------- |
| `boms`               | Product standard BOMs (bill of materials)                 | `product_standard_boms`      |
| `mm-boms` / `MmBoms` | Manufactured-material BOMs (`mm` = manufactured material) | `manufactured_material_boms` |

Same `mm` / `mmb` shorthand appears on DB constraint names (e.g. `mmb_manufactured_material_code_fk`). Prefer these short module/route names over spelling out `manufactured-material-boms`. Permission strings stay fully spelled (`add_manufactured_material_bom`, …).

---

## Comments

Brief inline comments are allowed to explain non-obvious business logic, schema intent. Keep them short — do not restate what the code already says.
