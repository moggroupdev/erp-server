# AGENTS.md — ERP Server

NestJS + Drizzle (PostgreSQL) ERP backend. Follow existing patterns; keep changes focused.

---

## Enums & constants

| Layer | File                          | Role                                                                                                                                      |
| ----- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| App   | `src/utils/constants.ts`      | Single source for enum values (`*_VALUES` + derived `*_STATUSES` objects). Never hardcode enum strings elsewhere.                         |
| DB    | `src/database/schema/common/` | Shared schema primitives: `enums.ts`, `properties.ts` (shared columns), `types.ts`, `constraints.ts`. Imports enum values from constants. |

**New enum:** constants → `common/enums.ts` → schema. Migration is done manually by a developer (see Migrations).

---

## Schema

- One file per domain under `src/database/schema/`; export tables + `relations`; register in `index.ts`.
- **Fully define** FKs, indexes, checks, and Drizzle relations in schema — not only in app code.
- Index FKs and filter/sort columns. Use `check` for DB-level invariants.
- **Foreign keys:** default to inline `.references()`. When Drizzle's auto-generated constraint name would exceed PostgreSQL's 63-character identifier limit (`{table}_{column}_{refTable}_{refColumn}_fk`), declare the column as a bare type and add `foreignKey({ name: '<short_abbrev>_fk', ... })` in the table callback — use the same abbrev prefix as indexes on that table (e.g. `mpoi_mpo_id_fk`, `inv_tx_items_tx_id_fk`).
- **Uniqueness:** use `.unique()` on a column **or** `uniqueIndex()` — never both with the same name (breaks migrations).
- Use `uniqueIndex()` only for partial uniqueness (e.g. one default address).
- Status often comes from timestamps (`cancelledAt`, `completedAt`) — avoid redundant status enums.

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
- Use `src/utils/services/query-builder.service.ts` for list/filter/pagination.
- Quantity updates: `sql\`quantity + ${n}` in transactions — never read-modify-write in Node.

---

## Docs & triggers

| File                                     | Purpose                                                                                              |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `README.md`                              | High-level business scope, managed domains, end-to-end workflow, and current data-model coverage.    |
| `src/database/docs/tables-summary.md`    | All schema tables — primary key, deleting behavior, audit columns, and human-readable code prefixes. |
| `src/database/docs/db-duplications.md`   | `@RFP_APP_CHECKED`, `@CACHING_APP_SYNCED`, and `@HISTORICAL_SNAPSHOT` column inventory.              |
| `src/database/docs/application-logic.md` | Business logic that is not handled in DB — caching sync, RFP sync, validations, workflow guards.     |
| `src/database/sql/triggers.sql`          | Low-level integrity only (like auto-generated `code` on INSERT). Not business logic.                 |

**Triggers example:** `CTR-00000001` via sequence + `BEFORE INSERT` on `contracts`. Add new coded entities here; omit `code` from create DTOs.

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

---

## Comments

Brief inline comments are allowed to explain non-obvious business logic, schema intent. Keep them short — do not restate what the code already says.
