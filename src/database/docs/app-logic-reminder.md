# App logic reminder

Business logic **not** enforced by database triggers must be implemented in NestJS services. Schema columns marked `// app-synced` are maintained by the application.

`boms.unit_cost` and `inventory_transaction_items.unit_cost` are **not** app-synced — they are user-provided at creation (historical cost record) and should be omitted from update DTOs.

---

## 1. Totals recalculation

Recalculate parent totals inside a transaction whenever line items are created, updated, or deleted.

| Target column | Source table | Formula |
|---------------|--------------|---------|
| `offers.total_amount` | `offer_items` | `SUM(quantity * unit_price)` |
| `orders.total_amount` | `order_items` | `SUM(quantity * unit_price)` |
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
- Auto-generate when units are created for an order (before physical receipt/production).
- Must remain unique; omit from update DTOs.

### Timestamp sync (`product_units` — all `// app-synced`)

| Column | Source event |
|--------|--------------|
| `produced_at` | Manufactured: when the unit's final `production_plan_items` stage is completed |
| `received_at` | Imported: when linked via `product_purchase_receipt_items` and parent receipt `received_at` is set |
| `delivered_at` | When parent `deliveries.delivered_at` is set for a `delivery_items` row referencing the unit |
| `installed_at` | When parent `installations.installed_at` is set for an `installation_items` row referencing the unit |

Update or clear timestamps if the source event is undone (e.g. delivery cancelled).

---

## 5. RFP field sync

See [`db-duplications.md`](./db-duplications.md). On order creation:

- Set `orders.customer_id` from `inquiries.customer_id`.
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
- Unit's `order_item_id` must match `product_purchase_order_items.order_item_id` for the linked PO line
- **Exception:** `BadRequestException` with a clear message

### Order delivery address (`orders.delivery_address_id`)
- Address must belong to `orders.customer_id` (via `customer_addresses.customer_id`)
- **Exception:** `BadRequestException('Delivery address does not belong to customer')`

### Default addresses (`customer_addresses`, `vendor_addresses`)
- Only one `is_default = true` per customer/vendor (partial unique index). Unset the previous default when setting a new one in the same transaction.

---

## 7. Workflow guards

### Inquiry → offer → order
- Order linked to offer only if `offers.status = 'accepted'`
- Cannot downgrade offer from `accepted` while an order references it
- **Exception:** `ConflictException` or `BadRequestException`

### Inquiry status (`inquiries.status`)
- Enforce valid transitions in the service (e.g. cannot skip required steps). Status is stored explicitly (not derived from dates).

### Offer status (`offers.status`)
- Enforce valid transitions; coordinate with inquiry status updates where required.

### Entity status from dates (no status enum — derive in API layer)

| Entity | Active | Completed | Cancelled |
|--------|--------|-----------|-----------|
| `orders` | no `completed_at` / `cancelled_at` | `completed_at` set | `cancelled_at` set |
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
