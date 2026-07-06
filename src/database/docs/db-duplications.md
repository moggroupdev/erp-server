# Database duplications

**RFP** = **Redundant For Performance** — the `// RFP` schema comment marks a column that duplicates data already reachable via FKs, kept to avoid hot-path joins on frequent reads (list/filter APIs).

Default is DRY — add entries here only when the join cost outweighs storage + sync complexity.

**Not listed here:** derived/cached values (`total_amount`, `quantity`, synced timestamps) and non-RFP service-validated columns. Those live in [`application-logic.md`](./application-logic.md) and use the `// app-synced` or `// app-checked` schema markers.

**RFP columns are always `// app-checked` too** — every denormalized copy must be set from its canonical source and kept consistent in the service layer. Use `// RFP — app-checked` on the column with a brief inline sync rule.

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

### `contracts.customer_id`

- **Canonical source:** `inquiries.customer_id` via `contracts.inquiry_id`
- **Why:** List and filter contracts by customer without joining `inquiries` on every contract query.
- **Sync:** Copy `inquiries.customer_id` on contract creation. Must match the inquiry's customer; treat as immutable unless `inquiry_id` changes (validate in service if ever allowed).
- **Index:** `contracts_customer_id_idx`

### `inquiry_items.product_code`

- **Canonical source:** `product_dimensions.product_code` via `inquiry_items.product_dimension_id`
- **Why:** List and filter inquiry lines by product without joining `product_dimensions` on every item query.
- **Sync:** Copy `product_dimensions.product_code` on item insert. Immutable after insert.
- **Index:** `inquiry_items_product_code_idx`

### `offer_items.product_code`

- **Canonical source:** `product_dimensions.product_code` via `offer_items.product_dimension_id`
- **Why:** List and filter offer lines by product without joining `product_dimensions` on every item query.
- **Sync:** Copy `product_dimensions.product_code` on item insert. Immutable after insert.
- **Index:** `offer_items_product_code_idx`

### `preview_items.product_code`

- **Canonical source:** `product_dimensions.product_code` via `preview_items.product_dimension_id`
- **Why:** List and filter preview lines by product without joining `product_dimensions` on every item query.
- **Sync:** Copy `product_dimensions.product_code` on item insert. Immutable after insert.
- **Index:** `preview_items_product_code_idx`

### `contract_items.product_code`

- **Canonical source:** `product_dimensions.product_code` via `contract_items.product_dimension_id`
- **Why:** List and filter contract lines by product without joining `product_dimensions` on every item query.
- **Sync:** Copy `product_dimensions.product_code` on item insert. Immutable after insert.
- **Index:** `contract_items_product_code_idx`

### `maintenance_orders.customer_id`

- **Canonical source:** `customer_addresses.customer_id` via `maintenance_orders.customer_address_id`; when `maintenance_type = 'service_contract'`, via `service_agreements.customer_address_id` → `customer_addresses.customer_id`
- **Why:** List and filter maintenance orders by customer without joining address, agreement, or item/unit chains.
- **Sync:** Set on INSERT from `customer_address_id` or the linked service agreement's address. Must match the customer on every serviced unit; validate in service when adding items.
- **Index:** `maintenance_orders_customer_id_idx`
