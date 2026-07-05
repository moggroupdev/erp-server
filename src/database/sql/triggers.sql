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
-- Format: {PREFIX}-{8-digit sequential number} (e.g., USR-00000001, CUS-00000002)
-- - Code is auto-generated on INSERT if null
-- - Unique constraint enforced at database level
-- ---------------------------------------------------------------------------

-- USERS: USR
CREATE SEQUENCE IF NOT EXISTS users_code_seq START 1 INCREMENT 1;

CREATE OR REPLACE FUNCTION generate_users_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.code IS NULL THEN
    NEW.code := 'USR-' || LPAD(nextval('users_code_seq')::text, 8, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_generate_code ON users;
CREATE TRIGGER users_generate_code
BEFORE INSERT ON users
FOR EACH ROW EXECUTE PROCEDURE generate_users_code();

-- ---------------------------------------------------------------------------

-- CUSTOMERS: CUS
CREATE SEQUENCE IF NOT EXISTS customers_code_seq START 1 INCREMENT 1;

CREATE OR REPLACE FUNCTION generate_customers_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.code IS NULL THEN
    NEW.code := 'CUS-' || LPAD(nextval('customers_code_seq')::text, 8, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS customers_generate_code ON customers;
CREATE TRIGGER customers_generate_code
BEFORE INSERT ON customers
FOR EACH ROW EXECUTE PROCEDURE generate_customers_code();

-- ---------------------------------------------------------------------------

-- VENDORS: VEN
CREATE SEQUENCE IF NOT EXISTS vendors_code_seq START 1 INCREMENT 1;

CREATE OR REPLACE FUNCTION generate_vendors_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.code IS NULL THEN
    NEW.code := 'VEN-' || LPAD(nextval('vendors_code_seq')::text, 8, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS vendors_generate_code ON vendors;
CREATE TRIGGER vendors_generate_code
BEFORE INSERT ON vendors
FOR EACH ROW EXECUTE PROCEDURE generate_vendors_code();

-- ---------------------------------------------------------------------------

-- CONTRACTS: CTR
CREATE SEQUENCE IF NOT EXISTS contracts_code_seq START 1 INCREMENT 1;

CREATE OR REPLACE FUNCTION generate_contracts_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.code IS NULL THEN
    NEW.code := 'CTR-' || LPAD(nextval('contracts_code_seq')::text, 8, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS contracts_generate_code ON contracts;
CREATE TRIGGER contracts_generate_code
BEFORE INSERT ON contracts
FOR EACH ROW EXECUTE PROCEDURE generate_contracts_code();

-- ---------------------------------------------------------------------------

-- MATERIAL PURCHASE ORDERS: MPO
CREATE SEQUENCE IF NOT EXISTS material_purchase_orders_code_seq START 1 INCREMENT 1;

CREATE OR REPLACE FUNCTION generate_material_purchase_orders_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.code IS NULL THEN
    NEW.code := 'MPO-' || LPAD(nextval('material_purchase_orders_code_seq')::text, 8, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS material_purchase_orders_generate_code ON material_purchase_orders;
CREATE TRIGGER material_purchase_orders_generate_code
BEFORE INSERT ON material_purchase_orders
FOR EACH ROW EXECUTE PROCEDURE generate_material_purchase_orders_code();

-- ---------------------------------------------------------------------------

-- MATERIAL PURCHASE RECEIPTS: MPR
CREATE SEQUENCE IF NOT EXISTS material_purchase_receipts_code_seq START 1 INCREMENT 1;

CREATE OR REPLACE FUNCTION generate_material_purchase_receipts_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.code IS NULL THEN
    NEW.code := 'MPR-' || LPAD(nextval('material_purchase_receipts_code_seq')::text, 8, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS material_purchase_receipts_generate_code ON material_purchase_receipts;
CREATE TRIGGER material_purchase_receipts_generate_code
BEFORE INSERT ON material_purchase_receipts
FOR EACH ROW EXECUTE PROCEDURE generate_material_purchase_receipts_code();

-- ---------------------------------------------------------------------------

-- DELIVERIES: DEL
CREATE SEQUENCE IF NOT EXISTS deliveries_code_seq START 1 INCREMENT 1;

CREATE OR REPLACE FUNCTION generate_deliveries_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.code IS NULL THEN
    NEW.code := 'DEL-' || LPAD(nextval('deliveries_code_seq')::text, 8, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS deliveries_generate_code ON deliveries;
CREATE TRIGGER deliveries_generate_code
BEFORE INSERT ON deliveries
FOR EACH ROW EXECUTE PROCEDURE generate_deliveries_code();

-- ---------------------------------------------------------------------------

-- INSTALLATIONS: INS
CREATE SEQUENCE IF NOT EXISTS installations_code_seq START 1 INCREMENT 1;

CREATE OR REPLACE FUNCTION generate_installations_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.code IS NULL THEN
    NEW.code := 'INS-' || LPAD(nextval('installations_code_seq')::text, 8, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS installations_generate_code ON installations;
CREATE TRIGGER installations_generate_code
BEFORE INSERT ON installations
FOR EACH ROW EXECUTE PROCEDURE generate_installations_code();

-- ---------------------------------------------------------------------------

-- PRODUCTION PLANS: PPL
CREATE SEQUENCE IF NOT EXISTS production_plans_code_seq START 1 INCREMENT 1;

CREATE OR REPLACE FUNCTION generate_production_plans_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.code IS NULL THEN
    NEW.code := 'PPL-' || LPAD(nextval('production_plans_code_seq')::text, 8, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS production_plans_generate_code ON production_plans;
CREATE TRIGGER production_plans_generate_code
BEFORE INSERT ON production_plans
FOR EACH ROW EXECUTE PROCEDURE generate_production_plans_code();

-- ---------------------------------------------------------------------------

-- INVENTORY TRANSACTIONS: IVT
CREATE SEQUENCE IF NOT EXISTS inventory_transactions_code_seq START 1 INCREMENT 1;

CREATE OR REPLACE FUNCTION generate_inventory_transactions_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.code IS NULL THEN
    NEW.code := 'IVT-' || LPAD(nextval('inventory_transactions_code_seq')::text, 8, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS inventory_transactions_generate_code ON inventory_transactions;
CREATE TRIGGER inventory_transactions_generate_code
BEFORE INSERT ON inventory_transactions
FOR EACH ROW EXECUTE PROCEDURE generate_inventory_transactions_code();

-- ---------------------------------------------------------------------------

-- PRODUCT PURCHASE ORDERS: PPO
CREATE SEQUENCE IF NOT EXISTS product_purchase_orders_code_seq START 1 INCREMENT 1;

CREATE OR REPLACE FUNCTION generate_product_purchase_orders_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.code IS NULL THEN
    NEW.code := 'PPO-' || LPAD(nextval('product_purchase_orders_code_seq')::text, 8, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS product_purchase_orders_generate_code ON product_purchase_orders;
CREATE TRIGGER product_purchase_orders_generate_code
BEFORE INSERT ON product_purchase_orders
FOR EACH ROW EXECUTE PROCEDURE generate_product_purchase_orders_code();

-- ---------------------------------------------------------------------------

-- PRODUCT PURCHASE RECEIPTS: PPR
CREATE SEQUENCE IF NOT EXISTS product_purchase_receipts_code_seq START 1 INCREMENT 1;

CREATE OR REPLACE FUNCTION generate_product_purchase_receipts_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.code IS NULL THEN
    NEW.code := 'PPR-' || LPAD(nextval('product_purchase_receipts_code_seq')::text, 8, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS product_purchase_receipts_generate_code ON product_purchase_receipts;
CREATE TRIGGER product_purchase_receipts_generate_code
BEFORE INSERT ON product_purchase_receipts
FOR EACH ROW EXECUTE PROCEDURE generate_product_purchase_receipts_code();

-- ---------------------------------------------------------------------------

-- CUSTOMER RECEPTIONS: REC
CREATE SEQUENCE IF NOT EXISTS customer_receptions_code_seq START 1 INCREMENT 1;

CREATE OR REPLACE FUNCTION generate_customer_receptions_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.code IS NULL THEN
    NEW.code := 'REC-' || LPAD(nextval('customer_receptions_code_seq')::text, 8, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS customer_receptions_generate_code ON customer_receptions;
CREATE TRIGGER customer_receptions_generate_code
BEFORE INSERT ON customer_receptions
FOR EACH ROW EXECUTE PROCEDURE generate_customer_receptions_code();

-- ---------------------------------------------------------------------------
-- PRODUCT PRODUCTION ROUTES: completion percentages must sum to 100 per product
-- Deferred so routes can be inserted row-by-row within one transaction.
-- When a product has no routes, the sum check is skipped.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION check_product_production_routes_sum_100()
RETURNS TRIGGER AS $$
DECLARE
  codes text[];
  code text;
  route_count integer;
  total numeric;
BEGIN
  IF TG_OP = 'DELETE' THEN
    codes := ARRAY[OLD.product_code];
  ELSIF TG_OP = 'UPDATE' AND OLD.product_code IS DISTINCT FROM NEW.product_code THEN
    codes := ARRAY[OLD.product_code, NEW.product_code];
  ELSE
    codes := ARRAY[NEW.product_code];
  END IF;

  FOREACH code IN ARRAY codes LOOP
    SELECT COUNT(*)::integer, COALESCE(SUM(completion_percentage), 0)
    INTO route_count, total
    FROM product_production_routes
    WHERE product_code = code;

    IF route_count > 0 AND total <> 100 THEN
      RAISE EXCEPTION 'Product production routes for % must sum to 100%%, got %', code, total;
    END IF;
  END LOOP;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS product_production_routes_sum_100 ON product_production_routes;
CREATE CONSTRAINT TRIGGER product_production_routes_sum_100
AFTER INSERT OR UPDATE OR DELETE ON product_production_routes
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE PROCEDURE check_product_production_routes_sum_100();
