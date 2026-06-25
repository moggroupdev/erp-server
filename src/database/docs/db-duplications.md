# Database duplications

Intentional redundant columns kept for **read performance** (avoid joins on hot queries). Default is DRY — add entries here only when the trade-off is justified.

Schema marker: `// RFP` on the column (see `AGENTS.md`).

**Not listed here:** derived/cached values (`total_amount`, `quantity`, synced timestamps). Those live in [`app-logic-reminder.md`](./app-logic-reminder.md) and use the `// app-synced` schema marker.

---

## When to add a duplication

1. The column is reachable via an existing FK chain but queried/filtered often without needing the parent row.
2. The join cost outweighs storage + sync complexity.
3. Add `// RFP` on the column, document below, and implement sync in the service layer.

## Entry template

```markdown
### `table.column`
- **Canonical source:** `other_table.column` via `fk_column`
- **Why:** e.g. list/filter API without joining `other_table`
- **Sync:** set on INSERT from source; immutable / or updated when …
- **Index:** `index_name` (if any)
```

---

## Current duplications

### `orders.customer_id`
- **Canonical source:** `inquiries.customer_id` via `orders.inquiry_id`
- **Why:** List and filter orders by customer without joining `inquiries` on every order query.
- **Sync:** Copy `inquiries.customer_id` on order creation. Must match the inquiry's customer; treat as immutable unless `inquiry_id` changes (validate in service if ever allowed).
- **Index:** `orders_customer_id_idx`
