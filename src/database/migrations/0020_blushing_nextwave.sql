CREATE TYPE "public"."legacy_work_order_type" AS ENUM('base_contract', 'in_warranty_maintenance', 'out_of_warranty_maintenance', 'service_contract');--> statement-breakpoint
CREATE TABLE "legacy_inventory_transaction_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legacy_transaction_id" uuid NOT NULL,
	"material_code" text NOT NULL,
	"unit_of_measurement_selected" "material_unit" NOT NULL,
	"quantity" numeric(18, 6) NOT NULL,
	"notes" text,
	CONSTRAINT "legacy_inv_tx_items_quantity_positive" CHECK ("legacy_inventory_transaction_items"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "legacy_inventory_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"issue_permit_number" text NOT NULL,
	"issue_order_number" text NOT NULL,
	"date" timestamp with time zone NOT NULL,
	"creator_id" uuid NOT NULL,
	"production_sub_department" "production_sub_department",
	"contract_number" text,
	"work_order_number" text,
	"work_order_number_type" "legacy_work_order_type" DEFAULT 'base_contract' NOT NULL,
	"is_cancelled" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "legacy_inventory_transactions_issue_permit_number_unique" UNIQUE("issue_permit_number")
);
--> statement-breakpoint
ALTER TABLE "legacy_inventory_transaction_items" ADD CONSTRAINT "legacy_inventory_transaction_items_material_code_materials_code_fk" FOREIGN KEY ("material_code") REFERENCES "public"."materials"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legacy_inventory_transaction_items" ADD CONSTRAINT "liti_legacy_tx_id_fk" FOREIGN KEY ("legacy_transaction_id") REFERENCES "public"."legacy_inventory_transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legacy_inventory_transactions" ADD CONSTRAINT "lit_creator_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legacy_inventory_transactions" ADD CONSTRAINT "lit_created_by_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "legacy_inv_tx_items_legacy_transaction_id_idx" ON "legacy_inventory_transaction_items" USING btree ("legacy_transaction_id");--> statement-breakpoint
CREATE INDEX "legacy_inv_tx_items_material_code_idx" ON "legacy_inventory_transaction_items" USING btree ("material_code");--> statement-breakpoint
CREATE INDEX "legacy_inv_tx_creator_id_idx" ON "legacy_inventory_transactions" USING btree ("creator_id");--> statement-breakpoint
CREATE INDEX "legacy_inv_tx_production_sub_department_idx" ON "legacy_inventory_transactions" USING btree ("production_sub_department");--> statement-breakpoint
CREATE INDEX "legacy_inv_tx_date_idx" ON "legacy_inventory_transactions" USING btree ("date");--> statement-breakpoint
CREATE INDEX "legacy_inv_tx_created_at_idx" ON "legacy_inventory_transactions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "legacy_inv_tx_created_by_idx" ON "legacy_inventory_transactions" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "legacy_inv_tx_work_order_number_type_idx" ON "legacy_inventory_transactions" USING btree ("work_order_number_type");