# 📋 ERP App Logic Reminder: Database Trigger Migrations

Since we have removed the business-logic triggers from the database, these constraints and sync operations **must be implemented at the NestJS/Drizzle ORM application layer** when building out the services.

This file serves as a reminder and design blueprint for the backend implementation.

---

## 1. Totals Recalculation

Recalculate parent totals whenever items are added, updated, or removed.

### 💰 Offers Total Amount
* **Source Database Table**: `offer_items`
* **Target Database Table**: `offers`
* **Trigger Action**: `SUM(quantity * unit_price)`
* **Implementation Recipe**:
  - Whenever `offer_items` are created, updated, or deleted, run a query inside a transaction to sum up all items for that `offer_id`.
  - Update `offers.total_amount` with the sum (default to `0` if no items remain).

### 🛒 Orders Total Amount
* **Source Database Table**: `order_items`
* **Target Database Table**: `orders`
* **Trigger Action**: `SUM(quantity * unit_price)`
* **Implementation Recipe**:
  - Same as offers: wrap the order items mutation and total updating inside a single database transaction.

---

## 2. Business Logic Validations

Perform validation checks at the application level to throw readable HTTP exceptions instead of raw database trigger errors.

### 📦 Inventory Transaction Item Source Validation
* **Database Table**: `inventory_transaction_items`
* **Validation Rule**:
  - `purchase_receipt_item_id` can **only** be set if the parent `inventory_transactions.transaction_type` is `'receipt'`.
  - `production_plan_item_id` can **only** be set if the parent `inventory_transactions.transaction_type` is `'issue'`.
* **NestJS Exception**: Throw `BadRequestException('Invalid item source for transaction type')` if violated.

### 🧾 Purchase Receipt Item Quantities Validation
* **Database Table**: `purchase_receipt_items`
* **Validation Rule**:
  - The sum of `quantity_received + quantity_rejected` for a specific `purchase_order_item_id` (across all non-cancelled receipts) must not exceed the ordered quantity `quantity_ordered` on the related `purchase_order_items`.
* **NestJS Exception**: Throw `BadRequestException('Purchase receipt totals exceed ordered quantity')` if violated.

---

## 3. Inventory Quantity Synchronization

Synchronize material quantities based on ledger transactions using concurrent-safe operations.

### 🔄 Materials Quantity Sync
* **Trigger Table**: `inventory_transaction_items`
* **Target Table**: `materials` (column `quantity`)
* **Behavior**:
  - **On Insert**:
    - If `transaction_type = 'receipt'`, add quantity: `materials.quantity += item.quantity`
    - If `transaction_type = 'issue'`, subtract quantity: `materials.quantity -= item.quantity`
  - **On Delete**:
    - Revert the effect of the deleted transaction.
  - **On Update**:
    - Revert the old effect and apply the new effect.
* **⚠️ CRITICAL implementation details (Concurrency)**:
  - Do NOT fetch the quantity to Node memory, calculate, and write it back. This causes race conditions.
  - Instead, use database-level incremental expressions inside a transaction:
    ```typescript
    // Drizzle example:
    await tx.update(materials)
      .set({ quantity: sql`quantity + ${amount}` })
      .where(eq(materials.code, materialCode));
    ```

---

## 4. State Transition & Workflow Guards

Enforce business state rules in NestJS services.

### 🔒 Order Offer Status
* **Rules**:
  - An Order can only be linked to an Offer if `offers.status = 'accepted'`.
  - You cannot downgrade an Offer's status away from `'accepted'` once an Order has already been created referencing it.
* **NestJS Exception**: Throw `ConflictException` or `BadRequestException` with custom error messages.

---

## 5. Code Immutability

Ensure generated codes (e.g. `US-xxxxxx`, `PO-xxxxxx`) cannot be modified after creation.

* **Rules**:
  - Omit the `code` field from NestJS update DTOs (e.g. `UpdateOrderDto`).
  - Do not map or pass the `code` column in any SQL update statement.

---

## 6. Product Transfer — `quantityProduced` Synchronization

When a `product_transfer_items` record is created (or deleted/reversed), the application layer **must** adjust `order_items.quantity_produced` for both sides inside a single transaction.

The **"from" order item is not stored** on `product_transfer_items` — derive it from `productionPlanItem.orderItemId`:

### 📦 On Create (transfer units from → to)
* **Source Table**: `product_transfer_items`
* **Behavior**:
  - `fromOrderItem.quantityProduced -= quantity` (give up produced units)
  - `toOrderItem.quantityProduced += quantity` (receive produced units)
* **Pre-condition checks** (throw `BadRequestException` if violated):
  - `toOrderItemId !== planItem.orderItemId` — cannot transfer to the same order item the plan item already belongs to.
  - `fromOrderItem.quantityProduced >= quantity` — cannot transfer more than what has been produced on the source item.
  - `toOrderItem.quantityProduced + quantity <= toOrderItem.quantity` — cannot exceed destination demand.
  - `fromOrderItem.productCode === toOrderItem.productCode` — must be the same product.
* **⚠️ Concurrency** — use incremental SQL expressions, not read-modify-write:
  ```typescript
  await tx.update(orderItems)
    .set({ quantityProduced: sql`quantity_produced - ${quantity}` })
    .where(eq(orderItems.id, fromOrderItemId));

  await tx.update(orderItems)
    .set({ quantityProduced: sql`quantity_produced + ${quantity}` })
    .where(eq(orderItems.id, toOrderItemId));
  ```

### ↩️ On Delete / Reversal
* Re-derive `fromOrderItemId` from the stored `productionPlanItemId`.
* Revert both sides symmetrically (add back to `from`, subtract from `to`).
* Apply the same pre-condition checks in reverse before reverting.
