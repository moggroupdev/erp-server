# Application logic

Business rules **not** enforced by DB triggers — implement in NestJS services.

| Marker                | Meaning                                                                      |
| --------------------- | ---------------------------------------------------------------------------- |
| `@RFP_APP_CHECKED`    | App **copies** on insert from canonical source and **validates** consistency |
| `@CACHING_APP_SYNCED` | App **writes** this column from other tables or events                       |
| `@APP_CHECKED`        | App **validates** on create/update (cross-table, conditional requiredness)   |

Duplication Inventory → `[db-duplications.md](./db-duplications.md)`.

---

## Global policies

- **No hard deletion** — use `deleted_at`, `cancelled_at`, or status; history stays queryable.
- **Codes immutable** — auto-generated `code` columns (triggers) omitted from create/update DTOs.
- **Snapshots immutable** — `@HISTORICAL_SNAPSHOT` columns set on insert only; omit from update DTOs.

---

## @RFP_APP_CHECKED

Set from canonical source on INSERT; immutable unless driving FK changes.

| Column                                                  | Rule                                                                                                |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `contracts.customer_id`                                 | Copy `inquiries.customer_id`; must match `customer_addresses.customer_id` for `delivery_address_id` |
| `maintenance_orders.customer_id`                        | From `customer_address_id` or service agreement address when `service_contract`                     |
| `*_items.product_code` (inquiry/offer/preview/contract) | Copy `product_dimensions.product_code` for `product_dimension_id`                                   |

On contract creation: when `offer_id` is set, copy `offers.discount_pct` to `contracts.discount_pct` (`@APP_CHECKED`, not snapshot).

---

## @CACHING_APP_SYNCED

Recalculate inside a transaction when source rows change.

**Parent totals** — default to `0` when no lines remain:

| Column                                  | Formula                                                   |
| --------------------------------------- | --------------------------------------------------------- |
| `offers.total_amount`                   | `SUM(quantity × unit_price)`                              |
| `contracts.total_amount`                | `SUM(quantity × unit_price)` where `cancelled_at IS NULL` |
| `material_purchase_orders.total_amount` | `SUM(quantity_ordered × unit_price)`                      |
| `product_purchase_orders.total_amount`  | `SUM(quantity_ordered × unit_price)`                      |
| `outsourcing_orders.total_amount`       | `SUM(quantity_ordered × unit_manufacturing_cost)`         |

`**materials.quantity`\*\* — on inventory item insert/delete/update: receipt +, issue −, return +; revert on delete; use `sql\`quantity + ${n}`. Omit from material create/update DTOs (schema default `0` on create).

`**materials.unit_price`\*\* — recalculate from `inventory_transaction_items.unit_price` when inventory items change; apply configured costing method; omit from material create/update DTOs (schema default `0`).

`**materials.opening_unit_price` / `materials.opening_quantity`\*\* — omit from material create/update DTOs (schema defaults `0`); not client-writable via materials CRUD.

**PO `completed_at`** — set when fully fulfilled; clear if receipts reversed.

**`outsourcing_orders.completed_at`** — set when all order lines are fully received (`received + rejected = ordered`) across receipts; clear if receipts reversed.

**`product_units` timestamps** — mirror workflow events; update or clear when source is undone (e.g. delivery cancelled). Ignore cancelled plan items when computing `produced_at`. Warranty end = `warranty_started_at` + 1 year (API only).

**Serial numbers** — auto-generate on unit creation; unique; omit from update DTOs.

---

## @APP_CHECKED — validations

Skip when DB already enforces (checks, partial unique indexes, deferred triggers).

### Inventory (`inventory_transactions` / `inventory_transaction_items`)

All sources live on the header — one source event per transaction; items only carry material, quantity, and price. Source exclusivity and source-vs-`transaction_type` matching are DB checks (`inv_tx_source_non_conflicting`, `inv_tx_receipt_source_type_match`, `inv_tx_issue_source_type_match`), so `return` transactions can carry no source at all.

- A production issue is scoped to one `production_plan_item_id` (one unit + stage) per transaction
- Each item's `material_code` must belong to the header source (e.g. a line of the linked purchase receipt, a `maintenance_order_materials` row of the linked maintenance order, or the plan item's product BOM)

### Warehouse (legacy issue permits)

- `legacy_issue_permit_items.sequence_order` — sequential display order within a permit; assigned from create-payload array order (`index + 1`) or `max + 1` when appending an item

### Purchasing

- Material receipt: sum of `quantity_received + quantity_rejected` per PO line ≤ `quantity_ordered`
- Product PO: one line per `(ppo_id, contract_item_id)` (DB unique)
- Product receipt: one receipt line per `product_unit_id`; unit's `contract_item_id` must match PO line

### Outsourcing

- Manufactured-material BOMs are managed by Nest module / route `mm-boms` (`MmBoms*`); table remains `manufactured_material_boms` (`mm` = manufactured material)
- `manufactured_material_boms.manufactured_material_code` — must have `materials.material_type = 'manufactured_material'`
- `manufactured_material_boms.material_code` — must not be a manufactured material (raw materials / spare parts only); direct self-reference is also DB-checked
- `outsourcing_order_items.manufactured_material_code` — must have `materials.material_type = 'manufactured_material'`
- Materials issued to the supplier are recorded as an `inventory_transactions` header (`transaction_type = 'issue'`) linked via `outsourcing_order_id` — no separate issue header table (mirrors the maintenance order flow)
- `inventory_transaction_items.material_code` — when the header's `outsourcing_order_id` is set, must exist in the `manufactured_material_boms` of one of the order's manufactured materials
- Issue quantities — pre-fill from `manufactured_material_boms.quantity_required ×` remaining ordered qty; user may adjust before confirming
- Outsourcing receipt: sum of `quantity_received + quantity_rejected` per order line ≤ `quantity_ordered`

### Production

- `product_standard_boms.product_dimension_id` — parent product must have `products.source_type = 'manufactured'`
- `production_plan_items.production_stage` — must exist in unit's product routing; complete only after prior `sequence_order` step
- `product_production_routes.sequence_order` — must be in a step order
- `product_production_routes.completion_percentage` — routes for a product must sum to 100%; validate on route create/update/delete

### Users & roles

- `users.production_sub_department` — required if `department_id = PRODUCTION_DEPARTMENT_ID`
- `roles.max_discount_pct` — cap company negotiation rounds and direct contract discounts; `NULL` = no discount; admins exempt
- `roles.department_id` — when set, user's `department_id` must match on role assignment

### Contracts

- `contracts.delivery_address_id` — must belong to `contracts.customer_id`
- `contracts.discount_pct` — when `offer_id` set, must match `offers.discount_pct`; when null offer, set on create with role cap

### Deliveries & installations

- `delivery_items.product_unit_id` / `installation_items.product_unit_id` — unit must belong to parent `contract_id`
- Site address from `contracts.delivery_address_id` (not stored on delivery/installation)

### Customer receptions

- `customer_id` matches every unit's contract customer
- When `delivery_id` / `installation_id` set, all items must be on that delivery/installation
- Reject cancelling delivery/installation referenced by a reception

### Maintenance

- `maintenance_order_items.product_unit_id` — belongs to MO `customer_id`; not cancelled; in-warranty rules when `in_warranty`; address match when `service_contract`
- `maintenance_order_materials` — one row per material per order (DB unique); repeated use of the same material accumulates into that row's `quantity`

### Catalog pricing

- Suggested price = `SUM(bom.quantity_required × materials.unit_price) × products.pricing_factor` for selected dimension

### Materials

- `materials.code` — random unique 6-digit string (`100000`–`999999`) generated on create; omit from create/update DTOs; immutable
- `materials.sub_category_id` — must exist in `material_category_subs` on create/update
- `unit_price`, `quantity`, `opening_unit_price`, `opening_quantity` — not accepted on create/update DTOs
- `material_unit_conversions.unit` — must differ from the material's base `unit_of_measurement` (`@APP_CHECKED`); unique per `(material_code, unit)`
- Quantity-entry endpoints (BOM items today; purchasing/inventory/maintenance/outsourcing when built) may accept an optional `unit`; the service converts via `conversion_factor_to_base` (or leaves the quantity unchanged when `unit` is omitted / equals the base unit) and persists only the base-unit quantity — the entered unit is not stored

### Supplier addresses

- `supplier_addresses.city_id` — required when `country_id = EGYPT_COUNTRY_ID`; must be omitted (null) for other countries
- At most one default address per supplier (`supplier_addresses_one_default`); setting a new default clears the previous one in `addAddress` and `setDefaultAddress`

---

## Workflow guards

### Inquiry → preview → offer → contract

- Contract from offer only if `offers.status = 'accepted'`; cannot downgrade accepted offer while contract references it
- Enforce inquiry/offer status transitions in service
- `offer_negotiations` — append-only log; `offers.discount_pct` = currently agreed (updated on accept, not auto-synced from last row)
- Company negotiation rows capped by role; reject rounds when offer is accepted/rejected/cancelled

### Status from timestamps (derive in API)

| Entity                                                                                       | Active                           | Completed                 | Cancelled      |
| -------------------------------------------------------------------------------------------- | -------------------------------- | ------------------------- | -------------- |
| `contracts`                                                                                  | no `completed_at`/`cancelled_at` | `completed_at`            | `cancelled_at` |
| `contract_items`                                                                             | no `cancelled_at`                | —                         | `cancelled_at` |
| `product_units`                                                                              | no `cancelled_at`                | `warranty_started_at`     | `cancelled_at` |
| `previews`, `deliveries`, `installations`, `trips`, `maintenance_orders`                     | scheduled, not done/cancelled    | `completed_at` (trips: —) | `cancelled_at` |
| `material_purchase_orders`, `product_purchase_orders`, `outsourcing_orders`                  | open                             | `completed_at`            | `cancelled_at` |
| Receipts (`material_purchase_receipts`, `product_purchase_receipts`, `outsourcing_receipts`) | —                                | `received_at`             | —              |

Mutually exclusive `completed_at` and `cancelled_at` where both exist.

---

## Contract lifecycle

Lines are **immutable** — amend via append, cancel, or replace; never hard-delete.

| Change                     | Operation                                                                                     |
| -------------------------- | --------------------------------------------------------------------------------------------- |
| New line                   | **Append** — insert item, create units, recalc total                                          |
| Remove line                | **Cancel item** — cancel item + units + plan items, recalc total                              |
| Qty/price/dimension change | **Replace** — new item with `previous_version_id`, cancel old, apply unit delta, recalc total |
| Whole order                | **Cancel contract** — cancel header + cascade items/units/plans, recalc total                 |

**Replace quantity delta:** ↑ create units on new item; ↓ cancel excess active units on old item; unchanged qty still gets fresh units on new item (old units stay on cancelled row for history).

**Cascade audit:** `cancelled_by` / `cancellation_reason` on contract or direct item cancel only — not on cascaded units or plan items.

**DTOs:** omit `previous_version_id`, `cancelled_at`, `cancelled_by`, `cancellation_reason`, `created_by` on contract item updates; omit contract cancel fields from generic updates.

**Version chain:** walk `previous_version_id` forward for history; `WHERE previous_version_id = ?` for successors.

**Active lines:** `contract_id = ? AND cancelled_at IS NULL`.
