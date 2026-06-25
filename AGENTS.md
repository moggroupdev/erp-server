# AGENTS.md — ERP Server

NestJS + Drizzle (PostgreSQL) ERP backend. Follow existing patterns; keep changes focused.

---

## Enums & constants

| Layer | File                                  | Role                                                                                                              |
| ----- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| App   | `src/utils/constants.ts`              | Single source for enum values (`*_VALUES` + derived `*_STATUSES` objects). Never hardcode enum strings elsewhere. |
| DB    | `src/database/schema/common/index.ts` | `pgEnum`, shared columns (`createdAt`, `numeric`, …), check helpers. Imports values from constants.               |

**New enum:** constants → common → schema. Migration is done manually by a developer (see Migrations).

---

## Schema

- One file per domain under `src/database/schema/`; export tables + `relations`; register in `index.ts`.
- **Fully define** FKs, indexes, checks, and Drizzle relations in schema — not only in app code.
- Index FKs and filter/sort columns. Use `check` for DB-level invariants.
- **Uniqueness:** use `.unique()` on a column **or** `uniqueIndex()` — never both with the same name (breaks migrations).
- Use `uniqueIndex()` only for partial uniqueness (e.g. one default address).
- Status often comes from timestamps (`cancelledAt`, `deliveredAt`) — avoid redundant status enums.
- **Materials** → `purchasing-materials.ts` · **Products** → `purchasing-products.ts` (symmetric naming).

### DRY vs. performance

- **Default:** no redundancy. Prefer FKs + joins over duplicated codes, names, or IDs.
- **Exception:** a denormalized column is allowed when it avoids a hot join on frequent reads (list/filter APIs). Keep these rare.
- Mark performance duplications with `// RFP` (redundancy for performance) on the column; list them in `src/database/docs/db-duplications.md` with sync rules.
- Mark application-maintained derived columns with `// app-synced`; document behavior in `src/database/docs/app-logic-reminder.md`.

### Performance

- Index columns used in `WHERE`, `ORDER BY`, and join keys.
- Prefer narrow selects; use Drizzle `with` only when needed.
- Use `src/utils/services/query-builder.service.ts` for list/filter/pagination.
- Quantity updates: `sql\`quantity + ${n}\`` in transactions — never read-modify-write in Node.

---

## Docs & triggers

| File                                      | Purpose                                                                                                                                                    |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `README.md`                               | High-level business scope, managed domains, end-to-end workflow, and current data-model coverage.                                                            |
| `src/database/docs/entity-codes.md`       | Human-readable `code` prefixes and format (`ORD-0000001`, …).                                                                                              |
| `src/database/docs/app-logic-reminder.md` | Business logic removed from DB triggers — implement in NestJS (totals, validations, inventory sync, workflow guards). Update when adding derived behavior. |
| `src/database/docs/db-duplications.md`    | Intentional redundant columns for performance.                                                                                                             |
| `src/database/sql/triggers.sql`           | Low-level integrity only (auto-generated `code` on INSERT). Not business logic.                                                                            |

**Triggers example:** `CTR-0000001` via sequence + `BEFORE INSERT` on `contracts`. Add new coded entities here; omit `code` from create DTOs.

### Keeping docs in sync

After **every** change, update all affected docs in the **same** change — never leave them stale.

| Change type | Update |
| ----------- | ------ |
| New/changed `code` prefix or coded table | `entity-codes.md`, `triggers.sql` |
| `// app-synced` column or derived behavior | `app-logic-reminder.md` |
| `// RFP` column | `db-duplications.md` |
| New/changed domain, entity, or workflow step | `README.md` (What the System Manages, business process, Current Scope as needed) |
| Schema or feature scope shift | `README.md` Current Scope |

Updating existing docs is required; do not create new markdown files unless the user asks (see Agent rules).

---

## Migrations

**Agents must not run** `db:generate`, `db:migrate`, or `db:triggers` after schema changes. Stop at schema (and related docs/triggers SQL edits); a developer runs the workflow manually:

```bash
npm run db:generate → db:migrate → db:triggers
```

Review generated SQL for duplicate indexes. Greenfield reset: drop DB/schema, then full workflow. Keep `schema/index.ts` table list current.

---

## NestJS

- Transactions for multi-table writes and recalculations.
- Nest HTTP exceptions with clear messages; omit immutable fields (`code`, `createdAt`) from update DTOs.
- Permissions from `PERMISSION_VALUES` in constants.

---

## Agent rules

1. Constants first → common → schema.
2. Schema is the contract (FKs, indexes, checks, relations).
3. Minimize redundancy; `// RFP` + `db-duplications.md` for performance copies; `// app-synced` + `app-logic-reminder.md` for derived fields.
4. **Keep docs in sync** — after every change, update all affected files from the table above (`README.md`, `src/database/docs/*`, `triggers.sql` when relevant) in the same change. Use the checklist in Docs & triggers.
5. **Do not migrate** — never run `db:generate`, `db:migrate`, or `db:triggers`; leave that to a developer.
6. Do not commit unless asked.
7. Do not add new markdown files unless requested (updating existing docs is required).
8. **Comments:** brief inline comments are allowed to explain non-obvious business logic, schema intent. Keep them short — do not restate what the code already says.
