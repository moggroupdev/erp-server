# App logic reminder

Business logic **not** enforced by database triggers must be implemented in NestJS services. Schema columns marked `// app-synced` are maintained by the application.

`boms.unit_cost` and `inventory_transaction_items.unit_cost` are **not** app-synced — they are user-provided at creation (historical cost record) and should be omitted from update DTOs.

---

## 1. Totals recalculation

Recalculate parent totals inside a transaction whenever line items are created, updated, or deleted.

| Target column | Source table | Formula |
|---------------|--------------|---------|
| `offers.total_amount` | `offer_items` | `SUM(quantity * unit_price)` |
| `contracts.total_amount` | `contract_items` | `SUM(quantity * unit_price) WHERE cancelled_at IS NULL` |
| `material_purchase_orders.total_amount` | `material_purchase_order_items` | `SUM(quantity_ordered * unit_cost)` |
| `product_purchase_orders.total_amount` | `product_purchase_order_items` | `SUM(quantity_ordered * unit_cost)` |

Default to `0` when no items remain.

---

## 2. Cached quantity sync

### `materials.quantity`
- **Source:** `inventory_transaction_items` (via parent `inventory_transactions.transaction_type`)
- **On insert:** `receipt` → add quantity; `issue` → subtract; `return` → add (if used)
- **On delete:** revert the original effect
- **On update:** revert old effect, apply new effect
- **Concurrency:** use `sql\`quantity + ${amount}\`` in a transaction — never read-modify-write in Node

---

## 3. Completion timestamps

| Column | When to set |
|--------|-------------|
| `material_purchase_orders.completed_at` | All order lines fully received (received + rejected = ordered) across non-cancelled receipts |
| `product_purchase_orders.completed_at` | All ordered units have a linked `product_purchase_receipt_items` row (one unit per receipt line) |

Clear `completed_at` if receipts are reversed and the order is no longer fully fulfilled.

---

## 4. Product unit lifecycle

### Serial number (`product_units.serial_number`)
- Auto-generate when units are created for a contract (before physical receipt/production).
- Must remain unique; omit from update DTOs.

### Cancellation (`product_units.cancelled_at`)
- Set when parent `contract_item` is cancelled/replaced, or when quantity decrease drops individual units.
- Cancelled units are excluded from production, delivery, and installation workflows.
- When computing `produced_at`, ignore `production_plan_items` where `cancelled_at` is set.

### Timestamp sync (`product_units` — all `// app-synced`)

| Column | Source event |
|--------|--------------|
| `produced_at` | Manufactured: when the last `production_plan_items` row for the unit has `completed_at` set |
| `received_at` | Imported: when linked via `product_purchase_receipt_items` and parent receipt `received_at` is set |
| `delivered_at` | When parent `deliveries.delivered_at` is set for a `delivery_items` row referencing the unit |
| `installed_at` | When parent `installations.installed_at` is set for an `installation_items` row referencing the unit |

Update or clear timestamps if the source event is undone (e.g. delivery cancelled).

---

## 5. RFP field sync

See [`db-duplications.md`](./db-duplications.md). On contract creation:

- Set `contracts.customer_id` from `inquiries.customer_id`.
- Throw `BadRequestException` if they would diverge.

---

## 6. Business validations

### Inventory transaction item sources (`inventory_transaction_items`)
- `material_purchase_receipt_item_id` only when parent `transaction_type = 'receipt'`
- `production_plan_item_id` only when parent `transaction_type = 'issue'`
- At most one source FK set (DB check enforces non-conflict; validate type match in service)
- **Exception:** `BadRequestException('Invalid item source for transaction type')`

### Material purchase receipt quantities (`material_purchase_receipt_items`)
- Sum of `quantity_received + quantity_rejected` per `material_purchase_order_item_id` (non-cancelled receipts) must not exceed `material_purchase_order_items.quantity_ordered`
- **Exception:** `BadRequestException('Purchase receipt totals exceed ordered quantity')`

### Product purchase receipts (`product_purchase_receipt_items`)
- Each `product_unit_id` is unique (one receipt line per unit)
- Unit's `contract_item_id` must match `product_purchase_order_items.contract_item_id` for the linked PO line
- **Exception:** `BadRequestException` with a clear message

### Production plan items (`production_plan_items`)
- `production_department_id` must reference a department whose `parent_id` equals `PRODUCTION_DEPARTMENT_ID` (seeded Production root)
- **Exception:** `BadRequestException('Production department must be a child of Production')`

### Contract delivery address (`contracts.delivery_address_id`)
- Address must belong to `contracts.customer_id` (via `customer_addresses.customer_id`)
- **Exception:** `BadRequestException('Delivery address does not belong to customer')`

### Default addresses (`customer_addresses`, `vendor_addresses`)
- Only one `is_default = true` per customer/vendor (partial unique index). Unset the previous default when setting a new one in the same transaction.

---

## 7. Workflow guards

### Inquiry → offer → contract
- Contract linked to offer only if `offers.status = 'accepted'`
- Cannot downgrade offer from `accepted` while a contract references it
- **Exception:** `ConflictException` or `BadRequestException`

### Inquiry status (`inquiries.status`)
- Enforce valid transitions in the service (e.g. cannot skip required steps). Status is stored explicitly (not derived from dates).

### Offer status (`offers.status`)
- Enforce valid transitions; coordinate with inquiry status updates where required.

### Entity status from dates (no status enum — derive in API layer)

| Entity | Active | Completed | Cancelled |
|--------|--------|-----------|-----------|
| `contracts` | no `completed_at` / `cancelled_at` | `completed_at` set | `cancelled_at` set |
| `contract_items` | no `cancelled_at` | — | `cancelled_at` set |
| `product_units` | no `cancelled_at` (and not fully installed) | `installed_at` set | `cancelled_at` set |
| `production_plan_items` | no `completed_at` / `cancelled_at` | `completed_at` set | `cancelled_at` set |
| `previews` | scheduled, not completed/cancelled | `completed_at` set | `cancelled_at` set |
| `deliveries` | scheduled, not delivered/cancelled | `delivered_at` set | `cancelled_at` set |
| `installations` | scheduled, not installed/cancelled | `installed_at` set | `cancelled_at` set |
| `material_purchase_orders` | open | `completed_at` set | `cancelled_at` set |
| `product_purchase_orders` | open | `completed_at` set | `cancelled_at` set |

Mutually exclusive completion and cancellation timestamps where both exist.

---

## 8. Code immutability

Auto-generated `code` columns (DB trigger) must not appear in update DTOs or `UPDATE` statements. Omit `code` on insert DTOs — triggers assign it when null.

---

## 9. Soft delete

`deleted_at` on `users`, `customers`, `vendors`, `products`, `materials`: filter out deleted rows in list/detail queries unless explicitly including archived records.

---

## 10. Contract item lifecycle

Contract line items are **immutable once written**. Do not UPDATE mutable fields (`quantity`, `unit_price`, `product_code`, dimensions) on an existing row — use cancel-and-replace instead. See [`contract-item-history.md`](./contract-item-history.md) for the full cycle.

### Operations

| Operation | When | What to do |
|-----------|------|------------|
| **Append** | New line added to an existing contract | INSERT `contract_items` with `previous_version_id = null`, `created_by` = acting user. Create `product_units` (count = quantity). Optionally INSERT `contract_item_dimensions`. Recalculate `contracts.total_amount`. |
| **Cancel item** | Line removed from contract | UPDATE item: `cancelled_at`, `cancelled_by`, `cancellation_reason`. Cascade to active `product_units` and their active `production_plan_items`. Recalculate total. |
| **Replace item** | Quantity, dimensions (reprices), or product code changes | INSERT replacement item with new values, `previous_version_id = old id`, `created_by`. UPDATE old item: `cancelled_at`, `cancelled_by`, `cancellation_reason`. Cascade old item's units/plan items. Apply quantity delta on replacement (see below). INSERT new `contract_item_dimensions` when dimensions change. Recalculate total. |
| **Cancel contract** | Whole order cancelled | UPDATE `contracts.cancelled_at`. App-sync `cancelled_at` on all active `contract_items` (`cancelled_by` / `cancellation_reason` left null). Cascade each item's units and plan items. |

All steps above run inside a **single transaction**.

### Replace — quantity delta

After the replacement item exists and the old item is cancelled:

- **Quantity increased:** create additional `product_units` under the **new** item (auto-generate serial numbers).
- **Quantity decreased:** cancel excess **active** units on the **old** item (those not yet delivered/installed), newest-first or by business rule; set `cancelled_at` on each cancelled unit and on its active `production_plan_items`.
- **Quantity unchanged** (dimensions/price/product swap only): create fresh `product_units` under the new item; old units remain on the cancelled item for history.

Material returns from cancelled in-progress work (inventory transactions, semi-finished returns) are **not** implemented yet — leave hooks for a later pass.

### Cascade rules

When a `contract_item` is cancelled (directly or via contract cancel):

1. Set `cancelled_at` on all active `product_units` for that item.
2. Set `cancelled_at` on all active `production_plan_items` for those units.

When a `product_unit` is cancelled (quantity decrease):

1. Set `cancelled_at` on all active `production_plan_items` for that unit.

Do **not** set `cancelled_by` or `cancellation_reason` on cascaded `product_units` or `production_plan_items` — audit fields live on `contract_items` only.

### Contract cancel — item sync

When `contracts.cancelled_at` is set, app-sync `cancelled_at` on every `contract_item` where `cancelled_at IS NULL`. Do not set `cancelled_by` or `cancellation_reason` on those rows (parent contract cancellation has no per-line actor).

### Totals and queries

- Recalculate `contracts.total_amount` after append, cancel, or replace.
- Default list/detail APIs: filter `contract_items` with `cancelled_at IS NULL` unless history is explicitly requested.
- Filter active `product_units` with `cancelled_at IS NULL` for production, delivery, and installation workflows.

### Validations

- Reject replace/cancel on items where `cancelled_at` is already set.
- Reject append/replace/cancel when parent `contracts.cancelled_at` or `contracts.completed_at` is set (unless business rules allow amendments — enforce in service).
- Replacement item must reference the immediately preceding version via `previous_version_id`.
- `contract_item_dimensions` has no own cancellation column — dimensions belong to the item row; a dimension change always goes through replace (new dimensions row on the new item).

### DTO / update rules

- Omit from update DTOs: `previous_version_id`, `cancelled_at`, `cancelled_by`, `cancellation_reason`, `created_by` (set on insert only).
- Never hard-delete `contract_items`, `product_units`, or `production_plan_items`.
