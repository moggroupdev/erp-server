-- PostgreSQL triggers not managed by Drizzle migrations.
--
-- When to run:
--   After npm run db:migrate (new DB, schema changes, or trigger edits).
--   Re-run if a migration drops/recreates the affected tables.
--   Safe to run multiple times (CREATE OR REPLACE + DROP IF EXISTS).
--
-- Workflow: db:generate → db:migrate → db:triggers
--
-- Also includes audit_emit infrastructure (append-only audit_logs writer).
-- After adding tables, re-run so the attach loop installs audit_emit_row.
-- Update audit_resolve_linkage when a new child needs parent/root mapping.

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

-- SUPPLIERS: SUP
CREATE SEQUENCE IF NOT EXISTS suppliers_code_seq START 1 INCREMENT 1;

CREATE OR REPLACE FUNCTION generate_suppliers_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.code IS NULL THEN
    NEW.code := 'SUP-' || LPAD(nextval('suppliers_code_seq')::text, 8, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS suppliers_generate_code ON suppliers;
CREATE TRIGGER suppliers_generate_code
BEFORE INSERT ON suppliers
FOR EACH ROW EXECUTE PROCEDURE generate_suppliers_code();

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

-- MATERIAL PURCHASE REQUISITIONS: MPReq
CREATE SEQUENCE IF NOT EXISTS material_purchase_requisitions_code_seq START 1 INCREMENT 1;

CREATE OR REPLACE FUNCTION generate_material_purchase_requisitions_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.code IS NULL THEN
    NEW.code := 'MPReq-' || LPAD(nextval('material_purchase_requisitions_code_seq')::text, 8, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS material_purchase_requisitions_generate_code ON material_purchase_requisitions;
CREATE TRIGGER material_purchase_requisitions_generate_code
BEFORE INSERT ON material_purchase_requisitions
FOR EACH ROW EXECUTE PROCEDURE generate_material_purchase_requisitions_code();

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

-- OUTSOURCING ORDERS: OSO
CREATE SEQUENCE IF NOT EXISTS outsourcing_orders_code_seq START 1 INCREMENT 1;

CREATE OR REPLACE FUNCTION generate_outsourcing_orders_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.code IS NULL THEN
    NEW.code := 'OSO-' || LPAD(nextval('outsourcing_orders_code_seq')::text, 8, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS outsourcing_orders_generate_code ON outsourcing_orders;
CREATE TRIGGER outsourcing_orders_generate_code
BEFORE INSERT ON outsourcing_orders
FOR EACH ROW EXECUTE PROCEDURE generate_outsourcing_orders_code();

-- ---------------------------------------------------------------------------

-- OUTSOURCING RECEIPTS: OSR
CREATE SEQUENCE IF NOT EXISTS outsourcing_receipts_code_seq START 1 INCREMENT 1;

CREATE OR REPLACE FUNCTION generate_outsourcing_receipts_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.code IS NULL THEN
    NEW.code := 'OSR-' || LPAD(nextval('outsourcing_receipts_code_seq')::text, 8, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS outsourcing_receipts_generate_code ON outsourcing_receipts;
CREATE TRIGGER outsourcing_receipts_generate_code
BEFORE INSERT ON outsourcing_receipts
FOR EACH ROW EXECUTE PROCEDURE generate_outsourcing_receipts_code();

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

-- SERVICE AGREEMENTS: SVC
CREATE SEQUENCE IF NOT EXISTS service_agreements_code_seq START 1 INCREMENT 1;

CREATE OR REPLACE FUNCTION generate_service_agreements_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.code IS NULL THEN
    NEW.code := 'SVC-' || LPAD(nextval('service_agreements_code_seq')::text, 8, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS service_agreements_generate_code ON service_agreements;
CREATE TRIGGER service_agreements_generate_code
BEFORE INSERT ON service_agreements
FOR EACH ROW EXECUTE PROCEDURE generate_service_agreements_code();

-- ---------------------------------------------------------------------------

-- MAINTENANCE ORDERS: MNT
CREATE SEQUENCE IF NOT EXISTS maintenance_orders_code_seq START 1 INCREMENT 1;

CREATE OR REPLACE FUNCTION generate_maintenance_orders_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.code IS NULL THEN
    NEW.code := 'MNT-' || LPAD(nextval('maintenance_orders_code_seq')::text, 8, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS maintenance_orders_generate_code ON maintenance_orders;
CREATE TRIGGER maintenance_orders_generate_code
BEFORE INSERT ON maintenance_orders
FOR EACH ROW EXECUTE PROCEDURE generate_maintenance_orders_code();

-- ---------------------------------------------------------------------------

-- TRIPS: TRP
CREATE SEQUENCE IF NOT EXISTS trips_code_seq START 1 INCREMENT 1;

CREATE OR REPLACE FUNCTION generate_trips_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.code IS NULL THEN
    NEW.code := 'TRP-' || LPAD(nextval('trips_code_seq')::text, 8, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trips_generate_code ON trips;
CREATE TRIGGER trips_generate_code
BEFORE INSERT ON trips
FOR EACH ROW EXECUTE PROCEDURE generate_trips_code();

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

-- ---------------------------------------------------------------------------
-- AUDIT TRAIL: append-only audit_logs writer (infrastructure, not business logic)
-- Nest sets erp.* GUCs on the same connection before mutations; this trigger
-- reads them and inserts snapshots. Re-run db:triggers after new tables so
-- the attach loop picks them up. Parent/root map: update audit_resolve_linkage.
-- Skip: SET erp.audit_skip = 'true' (seed scripts). Never audits audit_logs
-- or login_history.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION audit_guc(p_key text)
RETURNS text AS $$
  SELECT NULLIF(current_setting(p_key, true), '');
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION audit_record_id(p_table text, p_row jsonb)
RETURNS text AS $$
DECLARE
  col text;
  parts text[] := ARRAY[]::text[];
BEGIN
  FOR col IN
    SELECT a.attname::text
    FROM pg_index i
    JOIN LATERAL unnest(i.indkey) WITH ORDINALITY AS k(attnum, ord) ON true
    JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum AND NOT a.attisdropped
    WHERE i.indrelid = ('public.' || quote_ident(p_table))::regclass
      AND i.indisprimary
    ORDER BY k.ord
  LOOP
    parts := parts || COALESCE(p_row->>col, '');
  END LOOP;
  RETURN array_to_string(parts, '/');
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION audit_changed_columns(p_old jsonb, p_new jsonb)
RETURNS text[] AS $$
  SELECT COALESCE(array_agg(key ORDER BY key), ARRAY[]::text[])
  FROM (
    SELECT COALESCE(o.key, n.key) AS key
    FROM jsonb_each(p_old) AS o
    FULL OUTER JOIN jsonb_each(p_new) AS n ON o.key = n.key
    WHERE o.value IS DISTINCT FROM n.value
  ) diff;
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION audit_redact_row(p_table text, p_row jsonb)
RETURNS jsonb AS $$
BEGIN
  IF p_row IS NULL THEN
    RETURN NULL;
  END IF;
  IF p_table = 'users' AND p_row ? 'password' THEN
    RETURN jsonb_set(p_row, '{password}', '"[redacted]"'::jsonb);
  END IF;
  RETURN p_row;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Child → immediate parent → owning document. Missing entries → null pairs.
-- Lookups when root id is not on the child (e.g. MPO allocation lines).
CREATE OR REPLACE FUNCTION audit_resolve_linkage(
  p_table text,
  p_row jsonb,
  OUT parent_table_name text,
  OUT parent_record_id text,
  OUT root_table_name text,
  OUT root_record_id text
)
AS $$
DECLARE
  v text;
BEGIN
  parent_table_name := NULL;
  parent_record_id := NULL;
  root_table_name := NULL;
  root_record_id := NULL;

  IF p_row IS NULL THEN
    RETURN;
  END IF;

  CASE p_table
    -- Auth / org / reference children
    WHEN 'permissions' THEN
      parent_table_name := 'roles';
      parent_record_id := p_row->>'role_id';
    WHEN 'cities' THEN
      parent_table_name := 'governorates';
      parent_record_id := p_row->>'governorate_id';
    WHEN 'material_category_subs' THEN
      parent_table_name := 'material_category_mains';
      parent_record_id := p_row->>'main_category_id';
    WHEN 'product_category_subs' THEN
      parent_table_name := 'product_category_mains';
      parent_record_id := p_row->>'main_category_id';

    -- Master data children
    WHEN 'customer_addresses' THEN
      parent_table_name := 'customers';
      parent_record_id := p_row->>'customer_id';
      root_table_name := 'customers';
      root_record_id := parent_record_id;
    WHEN 'supplier_addresses' THEN
      parent_table_name := 'suppliers';
      parent_record_id := p_row->>'supplier_id';
      root_table_name := 'suppliers';
      root_record_id := parent_record_id;
    WHEN 'product_dimensions' THEN
      parent_table_name := 'products';
      parent_record_id := p_row->>'product_code';
      root_table_name := 'products';
      root_record_id := parent_record_id;
    WHEN 'product_production_routes' THEN
      parent_table_name := 'products';
      parent_record_id := p_row->>'product_code';
      root_table_name := 'products';
      root_record_id := parent_record_id;
    WHEN 'product_standard_boms' THEN
      parent_table_name := 'product_dimensions';
      parent_record_id := p_row->>'product_dimension_id';
      root_table_name := 'products';
      SELECT product_code INTO v FROM product_dimensions WHERE id = (p_row->>'product_dimension_id')::uuid;
      root_record_id := v;
    WHEN 'material_unit_conversions' THEN
      parent_table_name := 'materials';
      parent_record_id := p_row->>'material_code';
      root_table_name := 'materials';
      root_record_id := parent_record_id;
    WHEN 'manufactured_material_boms' THEN
      parent_table_name := 'materials';
      parent_record_id := p_row->>'manufactured_material_code';
      root_table_name := 'materials';
      root_record_id := parent_record_id;

    -- Sales funnel
    WHEN 'inquiry_items' THEN
      parent_table_name := 'inquiries';
      parent_record_id := p_row->>'inquiry_id';
      root_table_name := 'inquiries';
      root_record_id := parent_record_id;
    WHEN 'previews' THEN
      parent_table_name := 'inquiries';
      parent_record_id := p_row->>'inquiry_id';
      root_table_name := 'previews';
      root_record_id := p_row->>'id';
    WHEN 'preview_items' THEN
      parent_table_name := 'previews';
      parent_record_id := p_row->>'preview_id';
      root_table_name := 'previews';
      root_record_id := parent_record_id;
    WHEN 'offers' THEN
      parent_table_name := 'inquiries';
      parent_record_id := p_row->>'inquiry_id';
      root_table_name := 'offers';
      root_record_id := p_row->>'id';
    WHEN 'offer_items' THEN
      parent_table_name := 'offers';
      parent_record_id := p_row->>'offer_id';
      root_table_name := 'offers';
      root_record_id := parent_record_id;
    WHEN 'offer_negotiations' THEN
      parent_table_name := 'offers';
      parent_record_id := p_row->>'offer_id';
      root_table_name := 'offers';
      root_record_id := parent_record_id;
    WHEN 'contract_items' THEN
      parent_table_name := 'contracts';
      parent_record_id := p_row->>'contract_id';
      root_table_name := 'contracts';
      root_record_id := parent_record_id;
    WHEN 'product_units' THEN
      parent_table_name := 'contract_items';
      parent_record_id := p_row->>'contract_item_id';
      root_table_name := 'contracts';
      SELECT contract_id::text INTO v FROM contract_items WHERE id = (p_row->>'contract_item_id')::uuid;
      root_record_id := v;

    -- Fulfillment
    WHEN 'deliveries' THEN
      parent_table_name := 'contracts';
      parent_record_id := p_row->>'contract_id';
      root_table_name := 'contracts';
      root_record_id := parent_record_id;
    WHEN 'delivery_items' THEN
      parent_table_name := 'deliveries';
      parent_record_id := p_row->>'delivery_id';
      root_table_name := 'contracts';
      SELECT contract_id::text INTO v FROM deliveries WHERE id = (p_row->>'delivery_id')::uuid;
      root_record_id := v;
    WHEN 'installations' THEN
      parent_table_name := 'contracts';
      parent_record_id := p_row->>'contract_id';
      root_table_name := 'contracts';
      root_record_id := parent_record_id;
    WHEN 'installation_items' THEN
      parent_table_name := 'installations';
      parent_record_id := p_row->>'installation_id';
      root_table_name := 'contracts';
      SELECT contract_id::text INTO v FROM installations WHERE id = (p_row->>'installation_id')::uuid;
      root_record_id := v;
    WHEN 'customer_reception_items' THEN
      parent_table_name := 'customer_receptions';
      parent_record_id := p_row->>'customer_reception_id';
      root_table_name := 'customer_receptions';
      root_record_id := parent_record_id;

    -- Material purchasing
    WHEN 'material_purchase_requisition_items' THEN
      parent_table_name := 'material_purchase_requisitions';
      parent_record_id := p_row->>'material_purchase_requisition_id';
      root_table_name := 'material_purchase_requisitions';
      root_record_id := parent_record_id;
    WHEN 'material_purchase_order_items' THEN
      parent_table_name := 'material_purchase_orders';
      parent_record_id := p_row->>'material_purchase_order_id';
      root_table_name := 'material_purchase_orders';
      root_record_id := parent_record_id;
    WHEN 'material_purchase_order_item_requisition_items' THEN
      parent_table_name := 'material_purchase_order_items';
      parent_record_id := p_row->>'material_purchase_order_item_id';
      root_table_name := 'material_purchase_orders';
      SELECT material_purchase_order_id::text INTO v
      FROM material_purchase_order_items
      WHERE id = (p_row->>'material_purchase_order_item_id')::uuid;
      root_record_id := v;
    WHEN 'material_purchase_order_item_contract_items' THEN
      parent_table_name := 'material_purchase_order_items';
      parent_record_id := p_row->>'material_purchase_order_item_id';
      root_table_name := 'material_purchase_orders';
      SELECT material_purchase_order_id::text INTO v
      FROM material_purchase_order_items
      WHERE id = (p_row->>'material_purchase_order_item_id')::uuid;
      root_record_id := v;
    WHEN 'material_purchase_receipts' THEN
      parent_table_name := 'material_purchase_orders';
      parent_record_id := p_row->>'material_purchase_order_id';
      root_table_name := 'material_purchase_orders';
      root_record_id := parent_record_id;
    WHEN 'material_purchase_receipt_items' THEN
      parent_table_name := 'material_purchase_receipts';
      parent_record_id := p_row->>'material_purchase_receipt_id';
      root_table_name := 'material_purchase_orders';
      SELECT material_purchase_order_id::text INTO v
      FROM material_purchase_receipts
      WHERE id = (p_row->>'material_purchase_receipt_id')::uuid;
      root_record_id := v;

    -- Product purchasing
    WHEN 'product_purchase_order_items' THEN
      parent_table_name := 'product_purchase_orders';
      parent_record_id := p_row->>'product_purchase_order_id';
      root_table_name := 'product_purchase_orders';
      root_record_id := parent_record_id;
    WHEN 'product_purchase_receipts' THEN
      parent_table_name := 'product_purchase_orders';
      parent_record_id := p_row->>'product_purchase_order_id';
      root_table_name := 'product_purchase_orders';
      root_record_id := parent_record_id;
    WHEN 'product_purchase_receipt_items' THEN
      parent_table_name := 'product_purchase_receipts';
      parent_record_id := p_row->>'product_purchase_receipt_id';
      root_table_name := 'product_purchase_orders';
      SELECT product_purchase_order_id::text INTO v
      FROM product_purchase_receipts
      WHERE id = (p_row->>'product_purchase_receipt_id')::uuid;
      root_record_id := v;

    -- Outsourcing
    WHEN 'outsourcing_order_items' THEN
      parent_table_name := 'outsourcing_orders';
      parent_record_id := p_row->>'outsourcing_order_id';
      root_table_name := 'outsourcing_orders';
      root_record_id := parent_record_id;
    WHEN 'outsourcing_receipts' THEN
      parent_table_name := 'outsourcing_orders';
      parent_record_id := p_row->>'outsourcing_order_id';
      root_table_name := 'outsourcing_orders';
      root_record_id := parent_record_id;
    WHEN 'outsourcing_receipt_items' THEN
      parent_table_name := 'outsourcing_receipts';
      parent_record_id := p_row->>'outsourcing_receipt_id';
      root_table_name := 'outsourcing_orders';
      SELECT outsourcing_order_id::text INTO v
      FROM outsourcing_receipts
      WHERE id = (p_row->>'outsourcing_receipt_id')::uuid;
      root_record_id := v;

    -- Supplier invoices (polymorphic parent/root = linked order)
    WHEN 'supplier_invoices' THEN
      IF p_row->>'material_purchase_order_id' IS NOT NULL THEN
        parent_table_name := 'material_purchase_orders';
        parent_record_id := p_row->>'material_purchase_order_id';
        root_table_name := 'material_purchase_orders';
        root_record_id := parent_record_id;
      ELSIF p_row->>'product_purchase_order_id' IS NOT NULL THEN
        parent_table_name := 'product_purchase_orders';
        parent_record_id := p_row->>'product_purchase_order_id';
        root_table_name := 'product_purchase_orders';
        root_record_id := parent_record_id;
      ELSIF p_row->>'outsourcing_order_id' IS NOT NULL THEN
        parent_table_name := 'outsourcing_orders';
        parent_record_id := p_row->>'outsourcing_order_id';
        root_table_name := 'outsourcing_orders';
        root_record_id := parent_record_id;
      END IF;

    -- Maintenance
    WHEN 'maintenance_order_items' THEN
      parent_table_name := 'maintenance_orders';
      parent_record_id := p_row->>'maintenance_order_id';
      root_table_name := 'maintenance_orders';
      root_record_id := parent_record_id;
    WHEN 'maintenance_order_materials' THEN
      parent_table_name := 'maintenance_orders';
      parent_record_id := p_row->>'maintenance_order_id';
      root_table_name := 'maintenance_orders';
      root_record_id := parent_record_id;

    -- Production
    WHEN 'production_plan_items' THEN
      parent_table_name := 'production_plans';
      parent_record_id := p_row->>'plan_id';
      root_table_name := 'production_plans';
      root_record_id := parent_record_id;
    WHEN 'production_plan_item_notes' THEN
      parent_table_name := 'production_plan_items';
      parent_record_id := p_row->>'plan_item_id';
      root_table_name := 'production_plans';
      SELECT plan_id::text INTO v FROM production_plan_items WHERE id = (p_row->>'plan_item_id')::uuid;
      root_record_id := v;

    -- Inventory (polymorphic source)
    WHEN 'inventory_transactions' THEN
      IF p_row->>'material_purchase_receipt_id' IS NOT NULL THEN
        parent_table_name := 'material_purchase_receipts';
        parent_record_id := p_row->>'material_purchase_receipt_id';
        root_table_name := 'material_purchase_orders';
        SELECT material_purchase_order_id::text INTO v
        FROM material_purchase_receipts
        WHERE id = (p_row->>'material_purchase_receipt_id')::uuid;
        root_record_id := v;
      ELSIF p_row->>'outsourcing_receipt_id' IS NOT NULL THEN
        parent_table_name := 'outsourcing_receipts';
        parent_record_id := p_row->>'outsourcing_receipt_id';
        root_table_name := 'outsourcing_orders';
        SELECT outsourcing_order_id::text INTO v
        FROM outsourcing_receipts
        WHERE id = (p_row->>'outsourcing_receipt_id')::uuid;
        root_record_id := v;
      ELSIF p_row->>'outsourcing_order_id' IS NOT NULL THEN
        parent_table_name := 'outsourcing_orders';
        parent_record_id := p_row->>'outsourcing_order_id';
        root_table_name := 'outsourcing_orders';
        root_record_id := parent_record_id;
      ELSIF p_row->>'maintenance_order_id' IS NOT NULL THEN
        parent_table_name := 'maintenance_orders';
        parent_record_id := p_row->>'maintenance_order_id';
        root_table_name := 'maintenance_orders';
        root_record_id := parent_record_id;
      ELSIF p_row->>'production_plan_item_id' IS NOT NULL THEN
        parent_table_name := 'production_plan_items';
        parent_record_id := p_row->>'production_plan_item_id';
        root_table_name := 'production_plans';
        SELECT plan_id::text INTO v
        FROM production_plan_items
        WHERE id = (p_row->>'production_plan_item_id')::uuid;
        root_record_id := v;
      ELSE
        root_table_name := 'inventory_transactions';
        root_record_id := p_row->>'id';
      END IF;
    WHEN 'inventory_transaction_items' THEN
      parent_table_name := 'inventory_transactions';
      parent_record_id := p_row->>'transaction_id';
      SELECT l.root_table_name, l.root_record_id
      INTO root_table_name, root_record_id
      FROM audit_resolve_linkage(
        'inventory_transactions',
        (SELECT to_jsonb(t) FROM inventory_transactions t WHERE t.id = (p_row->>'transaction_id')::uuid)
      ) AS l;

    -- Legacy
    WHEN 'legacy_issue_permit_items' THEN
      parent_table_name := 'legacy_issue_permits';
      parent_record_id := p_row->>'issue_permit_id';
      root_table_name := 'legacy_issue_permits';
      root_record_id := parent_record_id;

    ELSE
      -- Top-level docs / unmapped reference: self-root for known documents only
      IF p_table IN (
        'users', 'customers', 'suppliers', 'products', 'materials',
        'inquiries', 'contracts', 'trips', 'customer_receptions',
        'material_purchase_requisitions', 'material_purchase_orders',
        'product_purchase_orders', 'outsourcing_orders',
        'supplier_quotation_emails', 'service_agreements', 'maintenance_orders',
        'production_plans', 'legacy_issue_permits'
      ) THEN
        root_table_name := p_table;
        root_record_id := COALESCE(p_row->>'id', p_row->>'code');
      END IF;
  END CASE;

  -- Enforce pair CHECKs: both null or both set
  IF parent_table_name IS NULL OR parent_record_id IS NULL THEN
    parent_table_name := NULL;
    parent_record_id := NULL;
  END IF;
  IF root_table_name IS NULL OR root_record_id IS NULL THEN
    root_table_name := NULL;
    root_record_id := NULL;
  END IF;
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION audit_emit()
RETURNS TRIGGER AS $$
DECLARE
  v_old jsonb;
  v_new jsonb;
  v_action text;
  v_record_id text;
  v_changed text[];
  v_actor_user_id uuid;
  v_actor_name text;
  v_actor_is_admin boolean;
  v_actor_role_id uuid;
  v_actor_department_id uuid;
  v_operation_id uuid;
  v_ip text;
  v_ua text;
  v_parent_table text;
  v_parent_id text;
  v_root_table text;
  v_root_id text;
  v_row jsonb;
BEGIN
  IF audit_guc('erp.audit_skip') = 'true' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_action := 'insert';
    v_old := NULL;
    v_new := audit_redact_row(TG_TABLE_NAME, to_jsonb(NEW));
    v_changed := NULL;
    v_row := v_new;
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'delete';
    v_old := audit_redact_row(TG_TABLE_NAME, to_jsonb(OLD));
    v_new := NULL;
    v_changed := NULL;
    v_row := v_old;
  ELSE
    v_action := 'update';
    v_old := audit_redact_row(TG_TABLE_NAME, to_jsonb(OLD));
    v_new := audit_redact_row(TG_TABLE_NAME, to_jsonb(NEW));
    v_changed := audit_changed_columns(to_jsonb(OLD), to_jsonb(NEW));
    IF v_changed IS NULL OR cardinality(v_changed) = 0 THEN
      RETURN NEW;
    END IF;
    v_row := v_new;
  END IF;

  v_record_id := audit_record_id(TG_TABLE_NAME, v_row);

  BEGIN
    v_actor_user_id := audit_guc('erp.actor_user_id')::uuid;
  EXCEPTION WHEN others THEN
    v_actor_user_id := NULL;
  END;

  v_actor_name := audit_guc('erp.actor_name');
  BEGIN
    v_actor_is_admin := audit_guc('erp.actor_is_admin')::boolean;
  EXCEPTION WHEN others THEN
    v_actor_is_admin := NULL;
  END;
  BEGIN
    v_actor_role_id := audit_guc('erp.actor_role_id')::uuid;
  EXCEPTION WHEN others THEN
    v_actor_role_id := NULL;
  END;
  BEGIN
    v_actor_department_id := audit_guc('erp.actor_department_id')::uuid;
  EXCEPTION WHEN others THEN
    v_actor_department_id := NULL;
  END;

  -- Scripts may set actor_user_id without snapshot GUCs
  IF v_actor_user_id IS NOT NULL AND v_actor_name IS NULL THEN
    SELECT name, is_admin, role_id, department_id
    INTO v_actor_name, v_actor_is_admin, v_actor_role_id, v_actor_department_id
    FROM users
    WHERE id = v_actor_user_id;
  END IF;

  BEGIN
    v_operation_id := audit_guc('erp.operation_id')::uuid;
  EXCEPTION WHEN others THEN
    v_operation_id := NULL;
  END;
  v_ip := audit_guc('erp.ip_address');
  v_ua := audit_guc('erp.user_agent');

  SELECT
    l.parent_table_name, l.parent_record_id, l.root_table_name, l.root_record_id
  INTO v_parent_table, v_parent_id, v_root_table, v_root_id
  FROM audit_resolve_linkage(TG_TABLE_NAME, v_row) AS l;

  INSERT INTO audit_logs (
    table_name,
    record_id,
    action,
    old_row,
    new_row,
    changed_columns,
    actor_user_id,
    actor_name,
    actor_is_admin,
    actor_role_id,
    actor_department_id,
    operation_id,
    ip_address,
    user_agent,
    parent_table_name,
    parent_record_id,
    root_table_name,
    root_record_id
  ) VALUES (
    TG_TABLE_NAME,
    v_record_id,
    v_action::audit_action,
    v_old,
    v_new,
    v_changed,
    v_actor_user_id,
    v_actor_name,
    v_actor_is_admin,
    v_actor_role_id,
    v_actor_department_id,
    v_operation_id,
    v_ip,
    v_ua,
    v_parent_table,
    v_parent_id,
    v_root_table,
    v_root_id
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.relname AS table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relname NOT IN ('audit_logs', 'login_history')
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS audit_emit_row ON %I', r.table_name);
    EXECUTE format(
      'CREATE TRIGGER audit_emit_row
       AFTER INSERT OR UPDATE OR DELETE ON %I
       FOR EACH ROW EXECUTE PROCEDURE audit_emit()',
      r.table_name
    );
  END LOOP;
END;
$$;
