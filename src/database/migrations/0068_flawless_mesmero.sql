ALTER TYPE "public"."permission" ADD VALUE 'update_material_purchase_order' BEFORE 'add_material_purchase_receipt';--> statement-breakpoint
CREATE TABLE "material_purchase_requisition_item_contract_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"material_purchase_requisition_item_id" uuid NOT NULL,
	"contract_item_id" uuid NOT NULL,
	"quantity_allocated" numeric(18, 6),
	CONSTRAINT "mprqici_mprqi_contract_item_unique" UNIQUE("material_purchase_requisition_item_id","contract_item_id"),
	CONSTRAINT "mprqici_quantity_allocated_positive" CHECK ("material_purchase_requisition_item_contract_items"."quantity_allocated" IS NULL OR "material_purchase_requisition_item_contract_items"."quantity_allocated" > 0)
);
--> statement-breakpoint
DROP TABLE "material_purchase_order_item_contract_items" CASCADE;--> statement-breakpoint
ALTER TABLE "material_purchase_orders" ADD COLUMN "updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "material_purchase_requisition_item_contract_items" ADD CONSTRAINT "mprqici_mprqi_id_fk" FOREIGN KEY ("material_purchase_requisition_item_id") REFERENCES "public"."material_purchase_requisition_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_purchase_requisition_item_contract_items" ADD CONSTRAINT "mprqici_contract_item_id_fk" FOREIGN KEY ("contract_item_id") REFERENCES "public"."contract_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mprqici_mprqi_id_idx" ON "material_purchase_requisition_item_contract_items" USING btree ("material_purchase_requisition_item_id");--> statement-breakpoint
CREATE INDEX "mprqici_contract_item_id_idx" ON "material_purchase_requisition_item_contract_items" USING btree ("contract_item_id");