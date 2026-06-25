CREATE TABLE "material_purchase_order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"material_purchase_order_id" uuid NOT NULL,
	"material_code" text NOT NULL,
	"quantity_ordered" numeric(15, 3) NOT NULL,
	"unit_cost" numeric(15, 3) NOT NULL,
	"notes" text,
	CONSTRAINT "mpoi_quantity_ordered_non_negative" CHECK ("material_purchase_order_items"."quantity_ordered" >= 0)
);
--> statement-breakpoint
CREATE TABLE "material_purchase_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"vendor_id" uuid NOT NULL,
	"total_amount" numeric(15, 3) NOT NULL,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "material_purchase_orders_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "material_purchase_receipt_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"material_purchase_receipt_id" uuid NOT NULL,
	"material_purchase_order_item_id" uuid NOT NULL,
	"quantity_received" numeric(15, 3) NOT NULL,
	"quantity_rejected" numeric(15, 3) DEFAULT 0 NOT NULL,
	"inspection_notes" text,
	CONSTRAINT "mpri_quantity_received_non_negative" CHECK ("material_purchase_receipt_items"."quantity_received" >= 0),
	CONSTRAINT "mpri_quantity_rejected_non_negative" CHECK ("material_purchase_receipt_items"."quantity_rejected" >= 0)
);
--> statement-breakpoint
CREATE TABLE "material_purchase_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"material_purchase_order_id" uuid NOT NULL,
	"received_at" timestamp with time zone,
	"received_by" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "material_purchase_receipts_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "product_purchase_order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_purchase_order_id" uuid NOT NULL,
	"order_item_id" uuid NOT NULL,
	"quantity_ordered" integer NOT NULL,
	"unit_cost" numeric(15, 3) NOT NULL,
	"notes" text,
	CONSTRAINT "ppoi_quantity_ordered_positive" CHECK ("product_purchase_order_items"."quantity_ordered" > 0)
);
--> statement-breakpoint
CREATE TABLE "product_purchase_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"vendor_id" uuid NOT NULL,
	"total_amount" numeric(15, 3) NOT NULL,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "product_purchase_orders_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "product_purchase_receipt_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_purchase_receipt_id" uuid NOT NULL,
	"product_purchase_order_item_id" uuid NOT NULL,
	"product_unit_id" uuid NOT NULL,
	"inspection_notes" text,
	CONSTRAINT "product_purchase_receipt_items_product_unit_id_unique" UNIQUE("product_unit_id")
);
--> statement-breakpoint
CREATE TABLE "product_purchase_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"product_purchase_order_id" uuid NOT NULL,
	"received_at" timestamp with time zone,
	"received_by" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "product_purchase_receipts_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "product_units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"serial_number" text NOT NULL,
	"vendor_serial_number" text,
	"order_item_id" uuid NOT NULL,
	"produced_at" timestamp with time zone,
	"received_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"installed_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "product_units_serial_number_unique" UNIQUE("serial_number"),
	CONSTRAINT "product_units_vendor_serial_number_unique" UNIQUE("vendor_serial_number")
);
--> statement-breakpoint
ALTER TABLE "purchase_order_items" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "purchase_orders" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "purchase_receipt_items" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "purchase_receipts" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "product_transfer_items" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "product_transfers" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "purchase_order_items" CASCADE;--> statement-breakpoint
DROP TABLE "purchase_orders" CASCADE;--> statement-breakpoint
DROP TABLE "purchase_receipt_items" CASCADE;--> statement-breakpoint
DROP TABLE "purchase_receipts" CASCADE;--> statement-breakpoint
DROP TABLE "product_transfer_items" CASCADE;--> statement-breakpoint
DROP TABLE "product_transfers" CASCADE;--> statement-breakpoint
ALTER TABLE "boms" DROP CONSTRAINT "boms_order_item_material_unique";--> statement-breakpoint
ALTER TABLE "production_plan_items" DROP CONSTRAINT "production_plan_items_plan_order_stage_unique";--> statement-breakpoint
ALTER TABLE "delivery_items" DROP CONSTRAINT "delivery_items_quantity_positive";--> statement-breakpoint
ALTER TABLE "order_items" DROP CONSTRAINT "order_items_quantity_produced_non_negative";--> statement-breakpoint
ALTER TABLE "order_items" DROP CONSTRAINT "order_items_quantity_produced_lte_quantity";--> statement-breakpoint
ALTER TABLE "production_plan_items" DROP CONSTRAINT "production_plan_items_quantity_planned_non_negative";--> statement-breakpoint
ALTER TABLE "production_plan_items" DROP CONSTRAINT "production_plan_items_quantity_completed_non_negative";--> statement-breakpoint
ALTER TABLE "production_plan_items" DROP CONSTRAINT "production_plan_items_quantity_completed_lte_planned";--> statement-breakpoint
ALTER TABLE "inventory_transaction_items" DROP CONSTRAINT "inventory_transaction_items_quantity_positive";--> statement-breakpoint
ALTER TABLE "inventory_transaction_items" DROP CONSTRAINT "inventory_transaction_items_source_non_conflicting";--> statement-breakpoint
ALTER TABLE "inventory_transaction_items" DROP CONSTRAINT "inventory_transaction_items_material_or_product_xor";--> statement-breakpoint
ALTER TABLE "installation_items" DROP CONSTRAINT "installation_items_quantity_positive";--> statement-breakpoint
ALTER TABLE "boms" DROP CONSTRAINT "boms_order_item_id_order_items_id_fk";
--> statement-breakpoint
ALTER TABLE "delivery_items" DROP CONSTRAINT "delivery_items_order_item_id_order_items_id_fk";
--> statement-breakpoint
ALTER TABLE "offer_items" DROP CONSTRAINT "offer_items_inquiry_item_id_inquiry_items_id_fk";
--> statement-breakpoint
ALTER TABLE "order_items" DROP CONSTRAINT "order_items_offer_item_id_offer_items_id_fk";
--> statement-breakpoint
ALTER TABLE "production_plan_items" DROP CONSTRAINT "production_plan_items_order_item_id_order_items_id_fk";
--> statement-breakpoint
ALTER TABLE "inventory_transaction_items" DROP CONSTRAINT "inventory_transaction_items_product_code_products_code_fk";
--> statement-breakpoint
ALTER TABLE "inventory_transaction_items" DROP CONSTRAINT "inv_tx_items_pr_item_id_fk";
--> statement-breakpoint
ALTER TABLE "installation_items" DROP CONSTRAINT "installation_items_order_item_id_order_items_id_fk";
--> statement-breakpoint
DROP INDEX "boms_order_item_id_idx";--> statement-breakpoint
DROP INDEX "delivery_items_order_item_id_idx";--> statement-breakpoint
DROP INDEX "offer_items_inquiry_item_id_idx";--> statement-breakpoint
DROP INDEX "order_items_offer_item_id_idx";--> statement-breakpoint
DROP INDEX "production_plan_items_order_item_id_idx";--> statement-breakpoint
DROP INDEX "inventory_transaction_items_transaction_id_idx";--> statement-breakpoint
DROP INDEX "inventory_transaction_items_material_code_idx";--> statement-breakpoint
DROP INDEX "inventory_transaction_items_product_code_idx";--> statement-breakpoint
DROP INDEX "inventory_transaction_items_purchase_receipt_item_id_idx";--> statement-breakpoint
DROP INDEX "inventory_transaction_items_production_plan_item_id_idx";--> statement-breakpoint
DROP INDEX "installation_items_order_item_id_idx";--> statement-breakpoint
ALTER TABLE "offer_items" ALTER COLUMN "title" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory_transaction_items" ALTER COLUMN "material_code" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "boms" ADD COLUMN "product_unit_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "deliveries" ADD COLUMN "assigned_to" uuid;--> statement-breakpoint
ALTER TABLE "delivery_items" ADD COLUMN "product_unit_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "preview_id" uuid;--> statement-breakpoint
ALTER TABLE "production_plan_items" ADD COLUMN "product_unit_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory_transaction_items" ADD COLUMN "material_purchase_receipt_item_id" uuid;--> statement-breakpoint
ALTER TABLE "installation_items" ADD COLUMN "product_unit_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "material_purchase_order_items" ADD CONSTRAINT "material_purchase_order_items_material_purchase_order_id_material_purchase_orders_id_fk" FOREIGN KEY ("material_purchase_order_id") REFERENCES "public"."material_purchase_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_purchase_order_items" ADD CONSTRAINT "material_purchase_order_items_material_code_materials_code_fk" FOREIGN KEY ("material_code") REFERENCES "public"."materials"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_purchase_orders" ADD CONSTRAINT "material_purchase_orders_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_purchase_orders" ADD CONSTRAINT "material_purchase_orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_purchase_receipt_items" ADD CONSTRAINT "mpri_receipt_id_fk" FOREIGN KEY ("material_purchase_receipt_id") REFERENCES "public"."material_purchase_receipts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_purchase_receipt_items" ADD CONSTRAINT "mpri_mpoi_id_fk" FOREIGN KEY ("material_purchase_order_item_id") REFERENCES "public"."material_purchase_order_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_purchase_receipts" ADD CONSTRAINT "material_purchase_receipts_material_purchase_order_id_material_purchase_orders_id_fk" FOREIGN KEY ("material_purchase_order_id") REFERENCES "public"."material_purchase_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_purchase_receipts" ADD CONSTRAINT "material_purchase_receipts_received_by_users_id_fk" FOREIGN KEY ("received_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_purchase_receipts" ADD CONSTRAINT "material_purchase_receipts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_purchase_order_items" ADD CONSTRAINT "product_purchase_order_items_product_purchase_order_id_product_purchase_orders_id_fk" FOREIGN KEY ("product_purchase_order_id") REFERENCES "public"."product_purchase_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_purchase_order_items" ADD CONSTRAINT "product_purchase_order_items_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_purchase_orders" ADD CONSTRAINT "product_purchase_orders_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_purchase_orders" ADD CONSTRAINT "product_purchase_orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_purchase_receipt_items" ADD CONSTRAINT "product_purchase_receipt_items_product_unit_id_product_units_id_fk" FOREIGN KEY ("product_unit_id") REFERENCES "public"."product_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_purchase_receipt_items" ADD CONSTRAINT "ppri_receipt_id_fk" FOREIGN KEY ("product_purchase_receipt_id") REFERENCES "public"."product_purchase_receipts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_purchase_receipt_items" ADD CONSTRAINT "ppri_ppoi_id_fk" FOREIGN KEY ("product_purchase_order_item_id") REFERENCES "public"."product_purchase_order_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_purchase_receipts" ADD CONSTRAINT "product_purchase_receipts_product_purchase_order_id_product_purchase_orders_id_fk" FOREIGN KEY ("product_purchase_order_id") REFERENCES "public"."product_purchase_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_purchase_receipts" ADD CONSTRAINT "product_purchase_receipts_received_by_users_id_fk" FOREIGN KEY ("received_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_purchase_receipts" ADD CONSTRAINT "product_purchase_receipts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_units" ADD CONSTRAINT "product_units_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_units" ADD CONSTRAINT "product_units_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mpoi_mpo_id_idx" ON "material_purchase_order_items" USING btree ("material_purchase_order_id");--> statement-breakpoint
CREATE INDEX "mpoi_material_code_idx" ON "material_purchase_order_items" USING btree ("material_code");--> statement-breakpoint
CREATE INDEX "mpo_code_idx" ON "material_purchase_orders" USING btree ("code");--> statement-breakpoint
CREATE INDEX "mpo_vendor_id_idx" ON "material_purchase_orders" USING btree ("vendor_id");--> statement-breakpoint
CREATE INDEX "mpo_completed_at_idx" ON "material_purchase_orders" USING btree ("completed_at");--> statement-breakpoint
CREATE INDEX "mpo_cancelled_at_idx" ON "material_purchase_orders" USING btree ("cancelled_at");--> statement-breakpoint
CREATE INDEX "mpo_created_by_idx" ON "material_purchase_orders" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "mpo_created_at_idx" ON "material_purchase_orders" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "mpri_receipt_id_idx" ON "material_purchase_receipt_items" USING btree ("material_purchase_receipt_id");--> statement-breakpoint
CREATE INDEX "mpri_mpoi_id_idx" ON "material_purchase_receipt_items" USING btree ("material_purchase_order_item_id");--> statement-breakpoint
CREATE INDEX "mpr_code_idx" ON "material_purchase_receipts" USING btree ("code");--> statement-breakpoint
CREATE INDEX "mpr_mpo_id_idx" ON "material_purchase_receipts" USING btree ("material_purchase_order_id");--> statement-breakpoint
CREATE INDEX "mpr_received_at_idx" ON "material_purchase_receipts" USING btree ("received_at");--> statement-breakpoint
CREATE INDEX "mpr_received_by_idx" ON "material_purchase_receipts" USING btree ("received_by");--> statement-breakpoint
CREATE INDEX "mpr_created_by_idx" ON "material_purchase_receipts" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "mpr_created_at_idx" ON "material_purchase_receipts" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "ppoi_ppo_id_idx" ON "product_purchase_order_items" USING btree ("product_purchase_order_id");--> statement-breakpoint
CREATE INDEX "ppoi_order_item_id_idx" ON "product_purchase_order_items" USING btree ("order_item_id");--> statement-breakpoint
CREATE INDEX "ppo_code_idx" ON "product_purchase_orders" USING btree ("code");--> statement-breakpoint
CREATE INDEX "ppo_vendor_id_idx" ON "product_purchase_orders" USING btree ("vendor_id");--> statement-breakpoint
CREATE INDEX "ppo_created_at_idx" ON "product_purchase_orders" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "ppo_created_by_idx" ON "product_purchase_orders" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "ppo_completed_at_idx" ON "product_purchase_orders" USING btree ("completed_at");--> statement-breakpoint
CREATE INDEX "ppo_cancelled_at_idx" ON "product_purchase_orders" USING btree ("cancelled_at");--> statement-breakpoint
CREATE INDEX "ppri_receipt_id_idx" ON "product_purchase_receipt_items" USING btree ("product_purchase_receipt_id");--> statement-breakpoint
CREATE INDEX "ppri_ppoi_id_idx" ON "product_purchase_receipt_items" USING btree ("product_purchase_order_item_id");--> statement-breakpoint
CREATE INDEX "ppri_product_unit_id_idx" ON "product_purchase_receipt_items" USING btree ("product_unit_id");--> statement-breakpoint
CREATE INDEX "ppr_code_idx" ON "product_purchase_receipts" USING btree ("code");--> statement-breakpoint
CREATE INDEX "ppr_ppo_id_idx" ON "product_purchase_receipts" USING btree ("product_purchase_order_id");--> statement-breakpoint
CREATE INDEX "ppr_received_at_idx" ON "product_purchase_receipts" USING btree ("received_at");--> statement-breakpoint
CREATE INDEX "ppr_received_by_idx" ON "product_purchase_receipts" USING btree ("received_by");--> statement-breakpoint
CREATE INDEX "ppr_created_at_idx" ON "product_purchase_receipts" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "ppr_created_by_idx" ON "product_purchase_receipts" USING btree ("created_by");--> statement-breakpoint
CREATE UNIQUE INDEX "product_units_serial_number_unique" ON "product_units" USING btree ("serial_number");--> statement-breakpoint
CREATE INDEX "product_units_order_item_id_idx" ON "product_units" USING btree ("order_item_id");--> statement-breakpoint
CREATE INDEX "product_units_created_at_idx" ON "product_units" USING btree ("created_at");--> statement-breakpoint
ALTER TABLE "boms" ADD CONSTRAINT "boms_product_unit_id_product_units_id_fk" FOREIGN KEY ("product_unit_id") REFERENCES "public"."product_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_items" ADD CONSTRAINT "delivery_items_product_unit_id_product_units_id_fk" FOREIGN KEY ("product_unit_id") REFERENCES "public"."product_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_preview_id_previews_id_fk" FOREIGN KEY ("preview_id") REFERENCES "public"."previews"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_plan_items" ADD CONSTRAINT "production_plan_items_product_unit_id_product_units_id_fk" FOREIGN KEY ("product_unit_id") REFERENCES "public"."product_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transaction_items" ADD CONSTRAINT "inv_tx_items_mpri_id_fk" FOREIGN KEY ("material_purchase_receipt_item_id") REFERENCES "public"."material_purchase_receipt_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "installation_items" ADD CONSTRAINT "installation_items_product_unit_id_product_units_id_fk" FOREIGN KEY ("product_unit_id") REFERENCES "public"."product_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "boms_product_unit_id_idx" ON "boms" USING btree ("product_unit_id");--> statement-breakpoint
CREATE INDEX "deliveries_assigned_to_idx" ON "deliveries" USING btree ("assigned_to");--> statement-breakpoint
CREATE INDEX "delivery_items_product_unit_id_unique" ON "delivery_items" USING btree ("product_unit_id");--> statement-breakpoint
CREATE INDEX "production_plan_items_product_unit_id_idx" ON "production_plan_items" USING btree ("product_unit_id");--> statement-breakpoint
CREATE INDEX "inv_tx_items_transaction_id_idx" ON "inventory_transaction_items" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "inv_tx_items_material_code_idx" ON "inventory_transaction_items" USING btree ("material_code");--> statement-breakpoint
CREATE INDEX "inv_tx_items_mpri_id_idx" ON "inventory_transaction_items" USING btree ("material_purchase_receipt_item_id");--> statement-breakpoint
CREATE INDEX "inv_tx_items_pp_item_id_idx" ON "inventory_transaction_items" USING btree ("production_plan_item_id");--> statement-breakpoint
CREATE INDEX "installation_items_product_unit_id_unique" ON "installation_items" USING btree ("product_unit_id");--> statement-breakpoint
ALTER TABLE "boms" DROP COLUMN "order_item_id";--> statement-breakpoint
ALTER TABLE "delivery_items" DROP COLUMN "order_item_id";--> statement-breakpoint
ALTER TABLE "delivery_items" DROP COLUMN "quantity";--> statement-breakpoint
ALTER TABLE "offer_items" DROP COLUMN "inquiry_item_id";--> statement-breakpoint
ALTER TABLE "order_items" DROP COLUMN "offer_item_id";--> statement-breakpoint
ALTER TABLE "order_items" DROP COLUMN "standard";--> statement-breakpoint
ALTER TABLE "order_items" DROP COLUMN "quantity_produced";--> statement-breakpoint
ALTER TABLE "production_plan_items" DROP COLUMN "order_item_id";--> statement-breakpoint
ALTER TABLE "production_plan_items" DROP COLUMN "quantity_planned";--> statement-breakpoint
ALTER TABLE "production_plan_items" DROP COLUMN "quantity_completed";--> statement-breakpoint
ALTER TABLE "inventory_transaction_items" DROP COLUMN "product_code";--> statement-breakpoint
ALTER TABLE "inventory_transaction_items" DROP COLUMN "purchase_receipt_item_id";--> statement-breakpoint
ALTER TABLE "installation_items" DROP COLUMN "order_item_id";--> statement-breakpoint
ALTER TABLE "installation_items" DROP COLUMN "quantity";--> statement-breakpoint
ALTER TABLE "boms" ADD CONSTRAINT "boms_product_unit_material_unique" UNIQUE("product_unit_id","material_code");--> statement-breakpoint
ALTER TABLE "delivery_items" ADD CONSTRAINT "delivery_items_product_unit_id_unique" UNIQUE("product_unit_id");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_preview_id_unique" UNIQUE("preview_id");--> statement-breakpoint
ALTER TABLE "installation_items" ADD CONSTRAINT "installation_items_product_unit_id_unique" UNIQUE("product_unit_id");--> statement-breakpoint
ALTER TABLE "inventory_transaction_items" ADD CONSTRAINT "inv_tx_items_quantity_positive" CHECK ("inventory_transaction_items"."quantity" > 0);--> statement-breakpoint
ALTER TABLE "inventory_transaction_items" ADD CONSTRAINT "inv_tx_items_source_non_conflicting" CHECK ((
        "inventory_transaction_items"."material_purchase_receipt_item_id" IS NULL OR "inventory_transaction_items"."production_plan_item_id" IS NULL
      ));