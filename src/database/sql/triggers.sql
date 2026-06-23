-- PostgreSQL triggers not managed by Drizzle migrations.
--
-- When to run:
--   After npm run db:migrate (new DB, schema changes, or trigger edits).
--   Re-run if a migration drops/recreates the affected tables.
--   Safe to run multiple times (CREATE OR REPLACE + DROP IF EXISTS).
--
-- Workflow: db:generate → db:migrate → db:triggers

-- ---------------------------------------------------------------------------
-- AUTO-GENERATED CODE SEQUENCES AND TRIGGERS
-- Format: {PREFIX}-{6-digit sequential number} (e.g., US-000001, CU-000002)
-- - Code is auto-generated on INSERT if null
-- - Unique constraint enforced at database level
-- ---------------------------------------------------------------------------

-- USERS: US
CREATE SEQUENCE IF NOT EXISTS users_code_seq START 1 INCREMENT 1;

CREATE OR REPLACE FUNCTION generate_users_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.code IS NULL THEN
    NEW.code := 'US-' || LPAD(nextval('users_code_seq')::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_generate_code ON users;
CREATE TRIGGER users_generate_code
BEFORE INSERT ON users
FOR EACH ROW EXECUTE PROCEDURE generate_users_code();

-- CUSTOMERS: CU
CREATE SEQUENCE IF NOT EXISTS customers_code_seq START 1 INCREMENT 1;

CREATE OR REPLACE FUNCTION generate_customers_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.code IS NULL THEN
    NEW.code := 'CU-' || LPAD(nextval('customers_code_seq')::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS customers_generate_code ON customers;
CREATE TRIGGER customers_generate_code
BEFORE INSERT ON customers
FOR EACH ROW EXECUTE PROCEDURE generate_customers_code();

-- VENDORS: VE
CREATE SEQUENCE IF NOT EXISTS vendors_code_seq START 1 INCREMENT 1;

CREATE OR REPLACE FUNCTION generate_vendors_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.code IS NULL THEN
    NEW.code := 'VE-' || LPAD(nextval('vendors_code_seq')::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS vendors_generate_code ON vendors;
CREATE TRIGGER vendors_generate_code
BEFORE INSERT ON vendors
FOR EACH ROW EXECUTE PROCEDURE generate_vendors_code();

-- ORDERS: OR
CREATE SEQUENCE IF NOT EXISTS orders_code_seq START 1 INCREMENT 1;

CREATE OR REPLACE FUNCTION generate_orders_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.code IS NULL THEN
    NEW.code := 'OR-' || LPAD(nextval('orders_code_seq')::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS orders_generate_code ON orders;
CREATE TRIGGER orders_generate_code
BEFORE INSERT ON orders
FOR EACH ROW EXECUTE PROCEDURE generate_orders_code();

-- PURCHASE ORDERS: PO
CREATE SEQUENCE IF NOT EXISTS purchase_orders_code_seq START 1 INCREMENT 1;

CREATE OR REPLACE FUNCTION generate_purchase_orders_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.code IS NULL THEN
    NEW.code := 'PO-' || LPAD(nextval('purchase_orders_code_seq')::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS purchase_orders_generate_code ON purchase_orders;
CREATE TRIGGER purchase_orders_generate_code
BEFORE INSERT ON purchase_orders
FOR EACH ROW EXECUTE PROCEDURE generate_purchase_orders_code();

-- PURCHASE RECEIPTS: PR
CREATE SEQUENCE IF NOT EXISTS purchase_receipts_code_seq START 1 INCREMENT 1;

CREATE OR REPLACE FUNCTION generate_purchase_receipts_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.code IS NULL THEN
    NEW.code := 'PR-' || LPAD(nextval('purchase_receipts_code_seq')::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS purchase_receipts_generate_code ON purchase_receipts;
CREATE TRIGGER purchase_receipts_generate_code
BEFORE INSERT ON purchase_receipts
FOR EACH ROW EXECUTE PROCEDURE generate_purchase_receipts_code();

-- DELIVERIES: DE
CREATE SEQUENCE IF NOT EXISTS deliveries_code_seq START 1 INCREMENT 1;

CREATE OR REPLACE FUNCTION generate_deliveries_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.code IS NULL THEN
    NEW.code := 'DE-' || LPAD(nextval('deliveries_code_seq')::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS deliveries_generate_code ON deliveries;
CREATE TRIGGER deliveries_generate_code
BEFORE INSERT ON deliveries
FOR EACH ROW EXECUTE PROCEDURE generate_deliveries_code();

-- INSTALLATIONS: IN
CREATE SEQUENCE IF NOT EXISTS installations_code_seq START 1 INCREMENT 1;

CREATE OR REPLACE FUNCTION generate_installations_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.code IS NULL THEN
    NEW.code := 'IN-' || LPAD(nextval('installations_code_seq')::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS installations_generate_code ON installations;
CREATE TRIGGER installations_generate_code
BEFORE INSERT ON installations
FOR EACH ROW EXECUTE PROCEDURE generate_installations_code();

-- PRODUCTION PLANS: PP
CREATE SEQUENCE IF NOT EXISTS production_plans_code_seq START 1 INCREMENT 1;

CREATE OR REPLACE FUNCTION generate_production_plans_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.code IS NULL THEN
    NEW.code := 'PP-' || LPAD(nextval('production_plans_code_seq')::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS production_plans_generate_code ON production_plans;
CREATE TRIGGER production_plans_generate_code
BEFORE INSERT ON production_plans
FOR EACH ROW EXECUTE PROCEDURE generate_production_plans_code();

-- INVENTORY TRANSACTIONS: IT
CREATE SEQUENCE IF NOT EXISTS inventory_transactions_code_seq START 1 INCREMENT 1;

CREATE OR REPLACE FUNCTION generate_inventory_transactions_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.code IS NULL THEN
    NEW.code := 'IT-' || LPAD(nextval('inventory_transactions_code_seq')::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS inventory_transactions_generate_code ON inventory_transactions;
CREATE TRIGGER inventory_transactions_generate_code
BEFORE INSERT ON inventory_transactions
FOR EACH ROW EXECUTE PROCEDURE generate_inventory_transactions_code();

-- MATERIAL TRANSFERS: MT
CREATE SEQUENCE IF NOT EXISTS material_transfers_code_seq START 1 INCREMENT 1;

CREATE OR REPLACE FUNCTION generate_material_transfers_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.code IS NULL THEN
    NEW.code := 'MT-' || LPAD(nextval('material_transfers_code_seq')::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS material_transfers_generate_code ON material_transfers;
CREATE TRIGGER material_transfers_generate_code
BEFORE INSERT ON material_transfers
FOR EACH ROW EXECUTE PROCEDURE generate_material_transfers_code();

-- PRODUCT TRANSFERS: PT
CREATE SEQUENCE IF NOT EXISTS product_transfers_code_seq START 1 INCREMENT 1;

CREATE OR REPLACE FUNCTION generate_product_transfers_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.code IS NULL THEN
    NEW.code := 'PT-' || LPAD(nextval('product_transfers_code_seq')::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS product_transfers_generate_code ON product_transfers;
CREATE TRIGGER product_transfers_generate_code
BEFORE INSERT ON product_transfers
FOR EACH ROW EXECUTE PROCEDURE generate_product_transfers_code();
