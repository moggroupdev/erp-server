# Database duplications

Intentional redundant columns kept for **read performance** (avoid joins on hot queries). Default is DRY — add entries here only when the trade-off is justified.

**Not listed here:** derived/cached values (`total_amount`, status timestamps synced from other tables). Those live in [`app-logic-reminder.md`](./app-logic-reminder.md).

---

## When to add a duplication

1. The column is reachable via an existing FK chain but queried/filtered often without needing the parent row.
2. The join cost outweighs storage + sync complexity.
3. You document the entry below **before merge** (same PR as the schema change).

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
- **Sync:** Set from the inquiry's `customer_id` on order creation; treat as immutable unless the inquiry link changes (rare — validate in service if ever allowed).
- **Index:** `orders_customer_id_idx`
