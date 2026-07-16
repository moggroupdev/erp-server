# Database duplications

Columns that duplicate data reachable elsewhere. Default is DRY — add only when the benefit outweighs sync cost.

| Marker                 | Purpose                                                                                            |
| ---------------------- | -------------------------------------------------------------------------------------------------- |
| `@RFP_APP_CHECKED`     | Redundant for performance — copy on insert for list/filter without hot joins; validated in service |
| `@CACHING_APP_SYNCED`  | Live cache — app recomputes from child rows or events                                              |
| `@HISTORICAL_SNAPSHOT` | Point-in-time price/cost — frozen on insert; catalog may change later                              |

Schema format: `// @MARKER - brief rule`.

Sync/validation rules → `[application-logic.md](./application-logic.md)`.

---

## @RFP_APP_CHECKED

| Column                           | Canonical source                                                                                                 | Why                                                    |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `contracts.customer_id`          | `inquiries.customer_id` via `inquiry_id`                                                                         | Filter contracts by customer without joining inquiries |
| `maintenance_orders.customer_id` | `customer_addresses.customer_id` via `customer_address_id`; or service agreement address when `service_contract` | Filter MOs by customer without deep joins              |
| `inquiry_items.product_code`     | `product_dimensions.product_code` via `product_dimension_id`                                                     | Filter lines by product without joining dimensions     |
| `offer_items.product_code`       | Same                                                                                                             | Same                                                   |
| `preview_items.product_code`     | Same                                                                                                             | Same                                                   |
| `contract_items.product_code`    | Same                                                                                                             | Same                                                   |

**Sync:** copy from canonical source on INSERT; immutable unless the driving FK changes (re-validate in service).

---

## @CACHING_APP_SYNCED

| Column                                  | Source                                                                                      |
| --------------------------------------- | ------------------------------------------------------------------------------------------- |
| `offers.total_amount`                   | `SUM(quantity × unit_price)` from `offer_items`                                             |
| `contracts.total_amount`                | `SUM(quantity × unit_price)` from `contract_items` where `cancelled_at IS NULL`             |
| `material_purchase_orders.total_amount` | `SUM(quantity_ordered × unit_cost)` from `material_purchase_order_items`                    |
| `product_purchase_orders.total_amount`  | `SUM(quantity_ordered × unit_cost)` from `product_purchase_order_items`                     |
| `materials.quantity`                    | Net from `inventory_transaction_items` by `transaction_type` (receipt +, issue −, return +) |
| `materials.unit_cost`                   | Derived from `inventory_transaction_items.unit_cost` per costing method                     |
| `material_purchase_orders.completed_at` | All lines fully received (`received + rejected = ordered`) across receipts                  |
| `product_purchase_orders.completed_at`  | Every ordered unit has a `product_purchase_receipt_items` row                               |
| `product_units.produced_at`             | Last `production_plan_items.completed_at` for the unit                                      |
| `product_units.received_at`             | Parent `product_purchase_receipts.received_at` via receipt item                             |
| `product_units.delivered_at`            | Parent `deliveries.completed_at` via `delivery_items`                                       |
| `product_units.installed_at`            | Parent `installations.completed_at` via `installation_items`                                |
| `product_units.warranty_started_at`     | Parent `customer_receptions.received_at` via `customer_reception_items`                     |
| `product_units.cancelled_at`            | Parent `contract_items` cancelled/replaced, or unit dropped on quantity decrease            |

**Concurrency:** use `sql\`quantity + ${n}`for`materials.quantity` — never read-modify-write in Node.

---

## @HISTORICAL_SNAPSHOT

| Column                                     | Set on insert from                                             |
| ------------------------------------------ | -------------------------------------------------------------- |
| `offer_items.unit_price`                   | Quoted price (e.g. catalog BOM × `pricing_factor`)             |
| `contract_items.unit_price`                | Pre-discount quoted price; changes via cancel-and-replace only |
| `material_purchase_order_items.unit_cost`  | Agreed purchase price on the PO line                           |
| `product_purchase_order_items.unit_cost`   | Agreed purchase price on the PO line                           |
| `inventory_transaction_items.unit_cost`    | User-provided actual cost at transaction time                  |
| `maintenance_order_spare_parts.unit_price` | Selling price at time of use                                   |

**Rules:** set once on INSERT; omit from update DTOs. Not the same as live catalog (`materials.unit_cost`).

---

## When to add

1. **RFP** — column reachable via FK chain but queried/filtered often; join cost > storage + sync.
2. **Caching** — aggregate or status mirror recomputed from children/events.
3. **Snapshot** — business value must stay fixed while master data changes.

Add the marker on the column and document it here.
