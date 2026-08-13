ALTER TYPE "public"."legacy_work_order_type" RENAME TO "legacy_issue_permit_work_order_type";--> statement-breakpoint
ALTER TABLE "legacy_inventory_transaction_items" RENAME TO "legacy_issue_permit_items";--> statement-breakpoint
ALTER TABLE "legacy_inventory_transactions" RENAME TO "legacy_issue_permits";--> statement-breakpoint
ALTER TABLE "legacy_issue_permit_items" RENAME COLUMN "legacy_transaction_id" TO "issue_permit_id";--> statement-breakpoint
ALTER TABLE "legacy_issue_permits" DROP CONSTRAINT "legacy_inventory_transactions_issue_permit_number_unique";--> statement-breakpoint
ALTER TABLE "legacy_issue_permit_items" DROP CONSTRAINT "legacy_inv_tx_items_quantity_positive";--> statement-breakpoint
ALTER TABLE "legacy_issue_permit_items" DROP CONSTRAINT "legacy_inventory_transaction_items_material_code_materials_code_fk";
--> statement-breakpoint
ALTER TABLE "legacy_issue_permit_items" DROP CONSTRAINT "liti_legacy_tx_id_fk";
--> statement-breakpoint
ALTER TABLE "legacy_issue_permits" DROP CONSTRAINT "lit_creator_id_fk";
--> statement-breakpoint
ALTER TABLE "legacy_issue_permits" DROP CONSTRAINT "lit_created_by_fk";
--> statement-breakpoint
ALTER TABLE "permissions" ALTER COLUMN "permission" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."permission";--> statement-breakpoint
CREATE TYPE "public"."permission" AS ENUM('add_user', 'read_users', 'update_user', 'delete_user', 'add_role', 'read_roles', 'update_role', 'delete_role', 'add_department', 'read_departments', 'update_department', 'add_supplier', 'read_suppliers', 'update_supplier', 'add_customer', 'read_customers', 'update_customer', 'add_material', 'read_materials', 'update_material', 'print_materials_list', 'add_manufactured_material_bom', 'read_manufactured_material_boms', 'update_manufactured_material_bom', 'read_material_reports', 'add_product', 'read_products', 'update_product', 'print_products_list', 'add_product_bom', 'read_product_boms', 'update_product_bom', 'read_inventory_transactions', 'read_material_purchase_orders', 'add_legacy_issue_permit', 'read_legacy_issue_permits', 'update_legacy_issue_permit');--> statement-breakpoint
ALTER TABLE "permissions" ALTER COLUMN "permission" SET DATA TYPE "public"."permission" USING "permission"::"public"."permission";--> statement-breakpoint
DROP INDEX "legacy_inv_tx_items_legacy_transaction_id_idx";--> statement-breakpoint
DROP INDEX "legacy_inv_tx_items_material_code_idx";--> statement-breakpoint
DROP INDEX "legacy_inv_tx_creator_id_idx";--> statement-breakpoint
DROP INDEX "legacy_inv_tx_production_sub_department_idx";--> statement-breakpoint
DROP INDEX "legacy_inv_tx_date_idx";--> statement-breakpoint
DROP INDEX "legacy_inv_tx_issue_order_date_idx";--> statement-breakpoint
DROP INDEX "legacy_inv_tx_created_at_idx";--> statement-breakpoint
DROP INDEX "legacy_inv_tx_created_by_idx";--> statement-breakpoint
DROP INDEX "legacy_inv_tx_work_order_number_type_idx";--> statement-breakpoint
ALTER TABLE "legacy_issue_permit_items" ADD CONSTRAINT "legacy_issue_permit_items_material_code_materials_code_fk" FOREIGN KEY ("material_code") REFERENCES "public"."materials"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legacy_issue_permit_items" ADD CONSTRAINT "lipi_issue_permit_id_fk" FOREIGN KEY ("issue_permit_id") REFERENCES "public"."legacy_issue_permits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legacy_issue_permits" ADD CONSTRAINT "lip_creator_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legacy_issue_permits" ADD CONSTRAINT "lip_created_by_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "legacy_issue_permit_items_issue_permit_id_idx" ON "legacy_issue_permit_items" USING btree ("issue_permit_id");--> statement-breakpoint
CREATE INDEX "legacy_issue_permit_items_material_code_idx" ON "legacy_issue_permit_items" USING btree ("material_code");--> statement-breakpoint
CREATE INDEX "legacy_issue_permit_creator_id_idx" ON "legacy_issue_permits" USING btree ("creator_id");--> statement-breakpoint
CREATE INDEX "legacy_issue_permit_production_sub_department_idx" ON "legacy_issue_permits" USING btree ("production_sub_department");--> statement-breakpoint
CREATE INDEX "legacy_issue_permit_date_idx" ON "legacy_issue_permits" USING btree ("date");--> statement-breakpoint
CREATE INDEX "legacy_issue_permit_issue_order_date_idx" ON "legacy_issue_permits" USING btree ("issue_order_date");--> statement-breakpoint
CREATE INDEX "legacy_issue_permit_created_at_idx" ON "legacy_issue_permits" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "legacy_issue_permit_created_by_idx" ON "legacy_issue_permits" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "legacy_issue_permit_work_order_number_type_idx" ON "legacy_issue_permits" USING btree ("work_order_number_type");--> statement-breakpoint
ALTER TABLE "legacy_issue_permits" ADD CONSTRAINT "legacy_issue_permits_issue_permit_number_unique" UNIQUE("issue_permit_number");--> statement-breakpoint
ALTER TABLE "legacy_issue_permit_items" ADD CONSTRAINT "legacy_issue_permit_items_quantity_positive" CHECK ("legacy_issue_permit_items"."quantity" > 0);