-- PostgreSQL triggers not managed by Drizzle migrations.
-- Applied separately via: npm run db:apply-triggers
--
-- When to run:
--   After npm run db:migrate (new DB, schema changes, or trigger edits).
--   Re-run if a migration drops/recreates the affected tables.
--   Safe to run multiple times (CREATE OR REPLACE + DROP IF EXISTS).
--
-- Workflow: db:generate → db:migrate → db:apply-triggers

-- ---------------------------------------------------------------------------
-- Offer totals: keep offers.total_amount in sync with offer_items line items.
-- Fires on INSERT/UPDATE/DELETE; recalculates SUM(quantity * unit_price).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sync_offer_total_amount()
RETURNS TRIGGER AS $$
DECLARE
  target_offer_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_offer_id := OLD.offer_id;
  ELSE
    target_offer_id := NEW.offer_id;
  END IF;

  UPDATE offers
  SET total_amount = COALESCE((
    SELECT SUM(quantity * unit_price)
    FROM offer_items
    WHERE offer_id = target_offer_id
  ), 0)
  WHERE id = target_offer_id;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger: attach offer total sync to offer_items writes.
DROP TRIGGER IF EXISTS offer_items_sync_total_amount ON offer_items;
CREATE TRIGGER offer_items_sync_total_amount
AFTER INSERT OR UPDATE OR DELETE ON offer_items
FOR EACH ROW EXECUTE PROCEDURE sync_offer_total_amount();

-- ---------------------------------------------------------------------------
-- Order totals: keep orders.total_amount in sync with order_items line items.
-- Same pattern as offers above.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sync_order_total_amount()
RETURNS TRIGGER AS $$
DECLARE
  target_order_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_order_id := OLD.order_id;
  ELSE
    target_order_id := NEW.order_id;
  END IF;

  UPDATE orders
  SET total_amount = COALESCE((
    SELECT SUM(quantity * unit_price)
    FROM order_items
    WHERE order_id = target_order_id
  ), 0)
  WHERE id = target_order_id;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger: attach order total sync to order_items writes.
DROP TRIGGER IF EXISTS order_items_sync_total_amount ON order_items;
CREATE TRIGGER order_items_sync_total_amount
AFTER INSERT OR UPDATE OR DELETE ON order_items
FOR EACH ROW EXECUTE PROCEDURE sync_order_total_amount();

-- ---------------------------------------------------------------------------
-- Inventory source validation: enforce that provided source IDs match transaction type.
-- Manual adjustments or initial stock can omit both source IDs, but the two sources
-- may not both be set at the same time.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION validate_inventory_transaction_item_source()
RETURNS TRIGGER AS $$
DECLARE
  txn_type inventory_transaction_type;
BEGIN
  SELECT transaction_type INTO txn_type
  FROM inventory_transactions
  WHERE id = NEW.transaction_id;

  IF NEW.purchase_receipt_item_id IS NOT NULL AND txn_type <> 'receipt' THEN
    RAISE EXCEPTION 'purchase_receipt_item_id may only be set on receipt inventory transactions';
  END IF;

  IF NEW.production_plan_item_id IS NOT NULL AND txn_type <> 'issue' THEN
    RAISE EXCEPTION 'production_plan_item_id may only be set on issue inventory transactions';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger: attach source validation to inventory transaction item writes.
DROP TRIGGER IF EXISTS inventory_transaction_items_validate_source ON inventory_transaction_items;
CREATE TRIGGER inventory_transaction_items_validate_source
BEFORE INSERT OR UPDATE ON inventory_transaction_items
FOR EACH ROW EXECUTE PROCEDURE validate_inventory_transaction_item_source();

-- ---------------------------------------------------------------------------
-- Inventory material quantity sync: atomically keep materials.quantity in sync
-- with receipt/issue inventory transaction items.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sync_material_quantity_from_inventory_transaction_items()
RETURNS TRIGGER AS $$
DECLARE
  old_txn_type inventory_transaction_type;
  new_txn_type inventory_transaction_type;
  old_effect numeric := 0;
  new_effect numeric := 0;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT transaction_type INTO new_txn_type
    FROM inventory_transactions
    WHERE id = NEW.transaction_id;

    IF NEW.material_code IS NOT NULL THEN
      IF new_txn_type = 'receipt' THEN
        new_effect := NEW.quantity;
      ELSE
        new_effect := -NEW.quantity;
      END IF;

      UPDATE materials
      SET quantity = quantity + new_effect
      WHERE code = NEW.material_code;
    END IF;

    RETURN NULL;
  ELSIF TG_OP = 'DELETE' THEN
    SELECT transaction_type INTO old_txn_type
    FROM inventory_transactions
    WHERE id = OLD.transaction_id;

    IF OLD.material_code IS NOT NULL THEN
      IF old_txn_type = 'receipt' THEN
        old_effect := OLD.quantity;
      ELSE
        old_effect := -OLD.quantity;
      END IF;

      UPDATE materials
      SET quantity = quantity - old_effect
      WHERE code = OLD.material_code;
    END IF;

    RETURN NULL;
  ELSE
    SELECT transaction_type INTO old_txn_type
    FROM inventory_transactions
    WHERE id = OLD.transaction_id;

    IF NEW.transaction_id = OLD.transaction_id THEN
      new_txn_type := old_txn_type;
    ELSE
      SELECT transaction_type INTO new_txn_type
      FROM inventory_transactions
      WHERE id = NEW.transaction_id;
    END IF;

    IF OLD.material_code IS NOT NULL THEN
      IF old_txn_type = 'receipt' THEN
        old_effect := OLD.quantity;
      ELSE
        old_effect := -OLD.quantity;
      END IF;
    END IF;

    IF NEW.material_code IS NOT NULL THEN
      IF new_txn_type = 'receipt' THEN
        new_effect := NEW.quantity;
      ELSE
        new_effect := -NEW.quantity;
      END IF;
    END IF;

    IF OLD.material_code IS NOT NULL AND OLD.material_code = NEW.material_code THEN
      UPDATE materials
      SET quantity = quantity + new_effect - old_effect
      WHERE code = OLD.material_code;
    ELSE
      IF OLD.material_code IS NOT NULL THEN
        UPDATE materials
        SET quantity = quantity - old_effect
        WHERE code = OLD.material_code;
      END IF;

      IF NEW.material_code IS NOT NULL THEN
        UPDATE materials
        SET quantity = quantity + new_effect
        WHERE code = NEW.material_code;
      END IF;
    END IF;

    RETURN NULL;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Trigger: attach material quantity sync to inventory transaction item writes.
DROP TRIGGER IF EXISTS inventory_transaction_items_sync_material_quantity ON inventory_transaction_items;
CREATE TRIGGER inventory_transaction_items_sync_material_quantity
AFTER INSERT OR UPDATE OR DELETE ON inventory_transaction_items
FOR EACH ROW EXECUTE PROCEDURE sync_material_quantity_from_inventory_transaction_items();

-- ---------------------------------------------------------------------------
-- Purchase receipt validation: prevent total received/rejected quantity from
-- exceeding the ordered quantity for the related purchase order item.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION validate_purchase_receipt_item_totals()
RETURNS TRIGGER AS $$
DECLARE
  total_received numeric;
  ordered_quantity numeric;
BEGIN
  SELECT quantity_ordered INTO ordered_quantity
  FROM purchase_order_items
  WHERE id = NEW.purchase_order_item_id;

  SELECT COALESCE(SUM(pri.quantity_received + pri.quantity_rejected), 0)
  INTO total_received
  FROM purchase_receipt_items pri
  JOIN purchase_receipts pr ON pr.id = pri.purchase_receipt_id
  WHERE pri.purchase_order_item_id = NEW.purchase_order_item_id
    AND pri.id IS DISTINCT FROM NEW.id
    AND pr.cancelled_at IS NULL;

  total_received := total_received + NEW.quantity_received + NEW.quantity_rejected;

  IF total_received > ordered_quantity THEN
    RAISE EXCEPTION 'Purchase receipt totals for order item % exceed ordered quantity %',
      NEW.purchase_order_item_id, ordered_quantity;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger: attach purchase receipt total validation to receipt item writes.
DROP TRIGGER IF EXISTS purchase_receipt_items_validate_totals ON purchase_receipt_items;
CREATE TRIGGER purchase_receipt_items_validate_totals
BEFORE INSERT OR UPDATE ON purchase_receipt_items
FOR EACH ROW EXECUTE PROCEDURE validate_purchase_receipt_item_totals();

-- ---------------------------------------------------------------------------
-- Order offer validation: an order may only reference an accepted offer.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION validate_order_offer_status()
RETURNS TRIGGER AS $$
DECLARE
  offer_status offer_status;
BEGIN
  IF NEW.offer_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT status INTO offer_status
  FROM offers
  WHERE id = NEW.offer_id;

  IF offer_status IS NULL THEN
    RAISE EXCEPTION 'Referenced offer does not exist';
  END IF;

  IF offer_status <> 'accepted' THEN
    RAISE EXCEPTION 'Order may only reference an accepted offer';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger: attach order offer/status validation to order writes.
DROP TRIGGER IF EXISTS orders_validate_offer_status ON orders;
CREATE TRIGGER orders_validate_offer_status
BEFORE INSERT OR UPDATE ON orders
FOR EACH ROW EXECUTE PROCEDURE validate_order_offer_status();

-- ---------------------------------------------------------------------------
-- Offer status protection: prevent changing an accepted offer once an order exists.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION prevent_offer_status_downgrade_when_order_exists()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status = 'accepted' AND NEW.status <> 'accepted' THEN
    IF EXISTS (SELECT 1 FROM orders WHERE offer_id = OLD.id) THEN
      RAISE EXCEPTION 'Cannot change status of an offer that has an existing order';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger: attach offer status protection to offers updates.
DROP TRIGGER IF EXISTS offers_prevent_status_downgrade_when_order_exists ON offers;
CREATE TRIGGER offers_prevent_status_downgrade_when_order_exists
BEFORE UPDATE ON offers
FOR EACH ROW EXECUTE PROCEDURE prevent_offer_status_downgrade_when_order_exists();
