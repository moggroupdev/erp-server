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

DROP TRIGGER IF EXISTS order_items_sync_total_amount ON order_items;
CREATE TRIGGER order_items_sync_total_amount
AFTER INSERT OR UPDATE OR DELETE ON order_items
FOR EACH ROW EXECUTE PROCEDURE sync_order_total_amount();

-- ---------------------------------------------------------------------------
-- Inventory source validation: enforce the correct source FK per transaction type.
-- Complements the XOR check constraint (exactly one source set) by requiring:
--   receipt → purchase_receipt_item_id
--   issue   → production_plan_item_id
-- Fires BEFORE INSERT/UPDATE; rejects invalid rows with an exception.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION validate_inventory_transaction_item_source()
RETURNS TRIGGER AS $$
DECLARE
  txn_type inventory_transaction_type;
BEGIN
  SELECT transaction_type INTO txn_type
  FROM inventory_transactions
  WHERE id = NEW.transaction_id;

  IF txn_type = 'receipt' AND NEW.purchase_receipt_item_id IS NULL THEN
    RAISE EXCEPTION 'Receipt inventory transactions require purchase_receipt_item_id on each item';
  END IF;

  IF txn_type = 'issue' AND NEW.production_plan_item_id IS NULL THEN
    RAISE EXCEPTION 'Issue inventory transactions require production_plan_item_id on each item';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS inventory_transaction_items_validate_source ON inventory_transaction_items;
CREATE TRIGGER inventory_transaction_items_validate_source
BEFORE INSERT OR UPDATE ON inventory_transaction_items
FOR EACH ROW EXECUTE PROCEDURE validate_inventory_transaction_item_source();

-- ---------------------------------------------------------------------------
-- Address city rules: Egyptian addresses require city_id; non-Egyptian must not set it.
-- PostgreSQL CHECK constraints cannot reference other tables, so this runs as a trigger.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION validate_egyptian_city_required()
RETURNS TRIGGER AS $$
DECLARE
  country_code text;
BEGIN
  SELECT code INTO country_code FROM countries WHERE id = NEW.country_id;

  IF country_code = 'EG' AND NEW.city_id IS NULL THEN
    RAISE EXCEPTION 'city_id is required when country is Egypt (EG)';
  END IF;

  IF country_code IS DISTINCT FROM 'EG' AND NEW.city_id IS NOT NULL THEN
    RAISE EXCEPTION 'city_id must be NULL when country is not Egypt (EG)';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS customer_addresses_validate_egyptian_city ON customer_addresses;
CREATE TRIGGER customer_addresses_validate_egyptian_city
BEFORE INSERT OR UPDATE ON customer_addresses
FOR EACH ROW EXECUTE PROCEDURE validate_egyptian_city_required();

DROP TRIGGER IF EXISTS vendor_addresses_validate_egyptian_city ON vendor_addresses;
CREATE TRIGGER vendor_addresses_validate_egyptian_city
BEFORE INSERT OR UPDATE ON vendor_addresses
FOR EACH ROW EXECUTE PROCEDURE validate_egyptian_city_required();
