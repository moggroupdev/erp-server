ALTER TYPE "public"."material_type" ADD VALUE 'manufactured_material';--> statement-breakpoint
ALTER TYPE "public"."permission" ADD VALUE 'add_product_bom';--> statement-breakpoint
ALTER TYPE "public"."permission" ADD VALUE 'read_product_boms';--> statement-breakpoint
ALTER TYPE "public"."permission" ADD VALUE 'update_product_bom';--> statement-breakpoint
CREATE TABLE "manufactured_material_boms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"manufactured_material_code" text NOT NULL,
	"material_code" text NOT NULL,
	"quantity_required" numeric(15, 3) NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "manufactured_material_boms_manufactured_material_material_unique" UNIQUE("manufactured_material_code","material_code"),
	CONSTRAINT "manufactured_material_boms_no_self_reference" CHECK ("manufactured_material_boms"."manufactured_material_code" <> "manufactured_material_boms"."material_code"),
	CONSTRAINT "manufactured_material_boms_quantity_required_positive" CHECK ("manufactured_material_boms"."quantity_required" > 0)
);
--> statement-breakpoint
CREATE TABLE "outsourcing_order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"outsourcing_order_id" uuid NOT NULL,
	"manufactured_material_code" text NOT NULL,
	"quantity_ordered" numeric(15, 3) NOT NULL,
	"unit_manufacturing_cost" numeric(15, 3) NOT NULL,
	"notes" text,
	CONSTRAINT "osoi_oso_manufactured_material_unique" UNIQUE("outsourcing_order_id","manufactured_material_code"),
	CONSTRAINT "osoi_quantity_ordered_positive" CHECK ("outsourcing_order_items"."quantity_ordered" > 0),
	CONSTRAINT "osoi_unit_manufacturing_cost_positive" CHECK ("outsourcing_order_items"."unit_manufacturing_cost" > 0)
);
--> statement-breakpoint
CREATE TABLE "outsourcing_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"vendor_id" uuid NOT NULL,
	"total_amount" numeric(15, 3) NOT NULL,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "outsourcing_orders_code_unique" UNIQUE("code"),
	CONSTRAINT "oso_completed_cancelled_exclusive" CHECK ("outsourcing_orders"."completed_at" IS NULL OR "outsourcing_orders"."cancelled_at" IS NULL),
	CONSTRAINT "oso_total_amount_non_negative" CHECK ("outsourcing_orders"."total_amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "outsourcing_receipt_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"outsourcing_receipt_id" uuid NOT NULL,
	"outsourcing_order_item_id" uuid NOT NULL,
	"quantity_received" numeric(15, 3) NOT NULL,
	"quantity_rejected" numeric(15, 3) DEFAULT 0 NOT NULL,
	"inspection_notes" text,
	CONSTRAINT "osri_receipt_osoi_unique" UNIQUE("outsourcing_receipt_id","outsourcing_order_item_id"),
	CONSTRAINT "osri_quantity_received_non_negative" CHECK ("outsourcing_receipt_items"."quantity_received" >= 0),
	CONSTRAINT "osri_quantity_rejected_non_negative" CHECK ("outsourcing_receipt_items"."quantity_rejected" >= 0)
);
--> statement-breakpoint
CREATE TABLE "outsourcing_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"outsourcing_order_id" uuid NOT NULL,
	"received_at" timestamp with time zone,
	"received_by" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "outsourcing_receipts_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "inventory_transaction_items" RENAME COLUMN "unit_cost" TO "unit_price";--> statement-breakpoint
ALTER TABLE "material_purchase_order_items" RENAME COLUMN "unit_cost" TO "unit_price";--> statement-breakpoint
ALTER TABLE "product_purchase_order_items" RENAME COLUMN "unit_cost" TO "unit_price";--> statement-breakpoint
ALTER TABLE "products" DROP CONSTRAINT "products_legacy_code_unique";--> statement-breakpoint
ALTER TABLE "inventory_transaction_items" DROP CONSTRAINT "inv_tx_items_unit_cost_positive";--> statement-breakpoint
ALTER TABLE "inventory_transaction_items" DROP CONSTRAINT "inv_tx_items_source_non_conflicting";--> statement-breakpoint
ALTER TABLE "material_purchase_order_items" DROP CONSTRAINT "mpoi_unit_cost_positive";--> statement-breakpoint
ALTER TABLE "product_purchase_order_items" DROP CONSTRAINT "ppoi_unit_cost_positive";--> statement-breakpoint
ALTER TABLE "inventory_transaction_items" ADD COLUMN "outsourcing_order_item_id" uuid;--> statement-breakpoint
ALTER TABLE "inventory_transaction_items" ADD COLUMN "outsourcing_receipt_item_id" uuid;--> statement-breakpoint
ALTER TABLE "manufactured_material_boms" ADD CONSTRAINT "manufactured_material_boms_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manufactured_material_boms" ADD CONSTRAINT "mmb_manufactured_material_code_fk" FOREIGN KEY ("manufactured_material_code") REFERENCES "public"."materials"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manufactured_material_boms" ADD CONSTRAINT "mmb_material_code_fk" FOREIGN KEY ("material_code") REFERENCES "public"."materials"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outsourcing_order_items" ADD CONSTRAINT "outsourcing_order_items_manufactured_material_code_materials_code_fk" FOREIGN KEY ("manufactured_material_code") REFERENCES "public"."materials"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outsourcing_order_items" ADD CONSTRAINT "osoi_oso_id_fk" FOREIGN KEY ("outsourcing_order_id") REFERENCES "public"."outsourcing_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outsourcing_orders" ADD CONSTRAINT "outsourcing_orders_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outsourcing_orders" ADD CONSTRAINT "outsourcing_orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outsourcing_receipt_items" ADD CONSTRAINT "osri_receipt_id_fk" FOREIGN KEY ("outsourcing_receipt_id") REFERENCES "public"."outsourcing_receipts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outsourcing_receipt_items" ADD CONSTRAINT "osri_osoi_id_fk" FOREIGN KEY ("outsourcing_order_item_id") REFERENCES "public"."outsourcing_order_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outsourcing_receipts" ADD CONSTRAINT "outsourcing_receipts_received_by_users_id_fk" FOREIGN KEY ("received_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outsourcing_receipts" ADD CONSTRAINT "outsourcing_receipts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outsourcing_receipts" ADD CONSTRAINT "osr_oso_id_fk" FOREIGN KEY ("outsourcing_order_id") REFERENCES "public"."outsourcing_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "manufactured_material_boms_manufactured_material_code_idx" ON "manufactured_material_boms" USING btree ("manufactured_material_code");--> statement-breakpoint
CREATE INDEX "manufactured_material_boms_material_code_idx" ON "manufactured_material_boms" USING btree ("material_code");--> statement-breakpoint
CREATE INDEX "osoi_oso_id_idx" ON "outsourcing_order_items" USING btree ("outsourcing_order_id");--> statement-breakpoint
CREATE INDEX "osoi_manufactured_material_code_idx" ON "outsourcing_order_items" USING btree ("manufactured_material_code");--> statement-breakpoint
CREATE INDEX "oso_vendor_id_idx" ON "outsourcing_orders" USING btree ("vendor_id");--> statement-breakpoint
CREATE INDEX "oso_completed_at_idx" ON "outsourcing_orders" USING btree ("completed_at");--> statement-breakpoint
CREATE INDEX "oso_cancelled_at_idx" ON "outsourcing_orders" USING btree ("cancelled_at");--> statement-breakpoint
CREATE INDEX "oso_created_at_idx" ON "outsourcing_orders" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "oso_created_by_idx" ON "outsourcing_orders" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "osri_receipt_id_idx" ON "outsourcing_receipt_items" USING btree ("outsourcing_receipt_id");--> statement-breakpoint
CREATE INDEX "osri_osoi_id_idx" ON "outsourcing_receipt_items" USING btree ("outsourcing_order_item_id");--> statement-breakpoint
CREATE INDEX "osr_oso_id_idx" ON "outsourcing_receipts" USING btree ("outsourcing_order_id");--> statement-breakpoint
CREATE INDEX "osr_received_at_idx" ON "outsourcing_receipts" USING btree ("received_at");--> statement-breakpoint
CREATE INDEX "osr_received_by_idx" ON "outsourcing_receipts" USING btree ("received_by");--> statement-breakpoint
CREATE INDEX "osr_created_by_idx" ON "outsourcing_receipts" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "osr_created_at_idx" ON "outsourcing_receipts" USING btree ("created_at");--> statement-breakpoint
ALTER TABLE "inventory_transaction_items" ADD CONSTRAINT "inv_tx_items_osoi_id_fk" FOREIGN KEY ("outsourcing_order_item_id") REFERENCES "public"."outsourcing_order_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transaction_items" ADD CONSTRAINT "inv_tx_items_osri_id_fk" FOREIGN KEY ("outsourcing_receipt_item_id") REFERENCES "public"."outsourcing_receipt_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inv_tx_items_osoi_id_idx" ON "inventory_transaction_items" USING btree ("outsourcing_order_item_id");--> statement-breakpoint
CREATE INDEX "inv_tx_items_osri_id_idx" ON "inventory_transaction_items" USING btree ("outsourcing_receipt_item_id");--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN "legacy_code";--> statement-breakpoint
ALTER TABLE "inventory_transaction_items" ADD CONSTRAINT "inv_tx_items_unit_price_positive" CHECK ("inventory_transaction_items"."unit_price" > 0);--> statement-breakpoint
ALTER TABLE "inventory_transaction_items" ADD CONSTRAINT "inv_tx_items_source_non_conflicting" CHECK (num_nonnulls("inventory_transaction_items"."material_purchase_receipt_item_id", "inventory_transaction_items"."production_plan_item_id", "inventory_transaction_items"."maintenance_order_spare_part_id", "inventory_transaction_items"."outsourcing_order_item_id", "inventory_transaction_items"."outsourcing_receipt_item_id") <= 1);--> statement-breakpoint
ALTER TABLE "material_purchase_order_items" ADD CONSTRAINT "mpoi_unit_price_positive" CHECK ("material_purchase_order_items"."unit_price" > 0);--> statement-breakpoint
ALTER TABLE "product_purchase_order_items" ADD CONSTRAINT "ppoi_unit_price_positive" CHECK ("product_purchase_order_items"."unit_price" > 0);