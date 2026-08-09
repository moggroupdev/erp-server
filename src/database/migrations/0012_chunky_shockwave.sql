ALTER TYPE "public"."permission" ADD VALUE 'read_material_purchase_orders';--> statement-breakpoint
ALTER TABLE "maintenance_order_spare_parts" RENAME TO "maintenance_order_materials";--> statement-breakpoint
ALTER TABLE "inventory_transaction_items" RENAME COLUMN "maintenance_order_spare_part_id" TO "maintenance_order_material_id";--> statement-breakpoint
ALTER TABLE "inventory_transaction_items" DROP CONSTRAINT "inv_tx_items_source_non_conflicting";--> statement-breakpoint
ALTER TABLE "maintenance_order_materials" DROP CONSTRAINT "maintenance_order_spare_parts_quantity_positive";--> statement-breakpoint
ALTER TABLE "maintenance_order_materials" DROP CONSTRAINT "maintenance_order_spare_parts_unit_price_positive";--> statement-breakpoint
ALTER TABLE "inventory_transaction_items" DROP CONSTRAINT "inv_tx_items_mosp_id_fk";
--> statement-breakpoint
ALTER TABLE "maintenance_order_materials" DROP CONSTRAINT "maintenance_order_spare_parts_material_code_materials_code_fk";
--> statement-breakpoint
ALTER TABLE "maintenance_order_materials" DROP CONSTRAINT "mosp_mo_id_fk";
--> statement-breakpoint
DROP INDEX "inv_tx_items_mosp_id_idx";--> statement-breakpoint
DROP INDEX "maintenance_order_spare_parts_maintenance_order_id_idx";--> statement-breakpoint
DROP INDEX "maintenance_order_spare_parts_material_code_idx";--> statement-breakpoint
ALTER TABLE "inventory_transaction_items" ADD CONSTRAINT "inv_tx_items_mom_id_fk" FOREIGN KEY ("maintenance_order_material_id") REFERENCES "public"."maintenance_order_materials"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_order_materials" ADD CONSTRAINT "maintenance_order_materials_material_code_materials_code_fk" FOREIGN KEY ("material_code") REFERENCES "public"."materials"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_order_materials" ADD CONSTRAINT "mom_mo_id_fk" FOREIGN KEY ("maintenance_order_id") REFERENCES "public"."maintenance_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inv_tx_items_mom_id_idx" ON "inventory_transaction_items" USING btree ("maintenance_order_material_id");--> statement-breakpoint
CREATE INDEX "maintenance_order_materials_maintenance_order_id_idx" ON "maintenance_order_materials" USING btree ("maintenance_order_id");--> statement-breakpoint
CREATE INDEX "maintenance_order_materials_material_code_idx" ON "maintenance_order_materials" USING btree ("material_code");--> statement-breakpoint
ALTER TABLE "inventory_transaction_items" ADD CONSTRAINT "inv_tx_items_source_non_conflicting" CHECK (num_nonnulls("inventory_transaction_items"."material_purchase_receipt_item_id", "inventory_transaction_items"."production_plan_item_id", "inventory_transaction_items"."maintenance_order_material_id", "inventory_transaction_items"."outsourcing_order_item_id", "inventory_transaction_items"."outsourcing_receipt_item_id") <= 1);--> statement-breakpoint
ALTER TABLE "maintenance_order_materials" ADD CONSTRAINT "maintenance_order_materials_quantity_positive" CHECK ("maintenance_order_materials"."quantity" > 0);--> statement-breakpoint
ALTER TABLE "maintenance_order_materials" ADD CONSTRAINT "maintenance_order_materials_unit_price_positive" CHECK ("maintenance_order_materials"."unit_price" > 0);