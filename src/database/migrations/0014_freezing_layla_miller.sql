ALTER TABLE "inventory_transactions" DROP CONSTRAINT "inventory_transactions_legacy_number_unique";--> statement-breakpoint
ALTER TABLE "inventory_transaction_items" DROP CONSTRAINT "inv_tx_items_source_non_conflicting";--> statement-breakpoint
ALTER TABLE "inventory_transaction_items" DROP CONSTRAINT "inv_tx_items_pp_item_id_fk";
--> statement-breakpoint
ALTER TABLE "inventory_transaction_items" DROP CONSTRAINT "inv_tx_items_mom_id_fk";
--> statement-breakpoint
ALTER TABLE "inventory_transaction_items" DROP CONSTRAINT "inv_tx_items_osoi_id_fk";
--> statement-breakpoint
ALTER TABLE "inventory_transaction_items" DROP CONSTRAINT "inv_tx_items_osri_id_fk";
--> statement-breakpoint
ALTER TABLE "inventory_transaction_items" DROP CONSTRAINT "inv_tx_items_mpri_id_fk";
--> statement-breakpoint
DROP INDEX "inv_tx_items_pp_item_id_idx";--> statement-breakpoint
DROP INDEX "inv_tx_items_mom_id_idx";--> statement-breakpoint
DROP INDEX "inv_tx_items_osoi_id_idx";--> statement-breakpoint
DROP INDEX "inv_tx_items_osri_id_idx";--> statement-breakpoint
DROP INDEX "inv_tx_items_mpri_id_idx";--> statement-breakpoint
ALTER TABLE "inventory_transactions" ADD COLUMN "material_purchase_receipt_id" uuid;--> statement-breakpoint
ALTER TABLE "inventory_transactions" ADD COLUMN "maintenance_order_id" uuid;--> statement-breakpoint
ALTER TABLE "inventory_transactions" ADD COLUMN "outsourcing_order_id" uuid;--> statement-breakpoint
ALTER TABLE "inventory_transactions" ADD COLUMN "outsourcing_receipt_id" uuid;--> statement-breakpoint
ALTER TABLE "inventory_transactions" ADD COLUMN "production_plan_item_id" uuid;--> statement-breakpoint
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inv_tx_mpr_id_fk" FOREIGN KEY ("material_purchase_receipt_id") REFERENCES "public"."material_purchase_receipts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inv_tx_mo_id_fk" FOREIGN KEY ("maintenance_order_id") REFERENCES "public"."maintenance_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inv_tx_oso_id_fk" FOREIGN KEY ("outsourcing_order_id") REFERENCES "public"."outsourcing_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inv_tx_osr_id_fk" FOREIGN KEY ("outsourcing_receipt_id") REFERENCES "public"."outsourcing_receipts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inv_tx_pp_item_id_fk" FOREIGN KEY ("production_plan_item_id") REFERENCES "public"."production_plan_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inventory_transactions_legacy_number_idx" ON "inventory_transactions" USING btree ("legacy_number");--> statement-breakpoint
CREATE INDEX "inv_tx_mpr_id_idx" ON "inventory_transactions" USING btree ("material_purchase_receipt_id");--> statement-breakpoint
CREATE INDEX "inv_tx_mo_id_idx" ON "inventory_transactions" USING btree ("maintenance_order_id");--> statement-breakpoint
CREATE INDEX "inv_tx_oso_id_idx" ON "inventory_transactions" USING btree ("outsourcing_order_id");--> statement-breakpoint
CREATE INDEX "inv_tx_osr_id_idx" ON "inventory_transactions" USING btree ("outsourcing_receipt_id");--> statement-breakpoint
CREATE INDEX "inv_tx_pp_item_id_idx" ON "inventory_transactions" USING btree ("production_plan_item_id");--> statement-breakpoint
ALTER TABLE "inventory_transaction_items" DROP COLUMN "production_plan_item_id";--> statement-breakpoint
ALTER TABLE "inventory_transaction_items" DROP COLUMN "maintenance_order_material_id";--> statement-breakpoint
ALTER TABLE "inventory_transaction_items" DROP COLUMN "outsourcing_order_item_id";--> statement-breakpoint
ALTER TABLE "inventory_transaction_items" DROP COLUMN "outsourcing_receipt_item_id";--> statement-breakpoint
ALTER TABLE "inventory_transaction_items" DROP COLUMN "material_purchase_receipt_item_id";--> statement-breakpoint
ALTER TABLE "maintenance_order_materials" ADD CONSTRAINT "mom_mo_material_unique" UNIQUE("maintenance_order_id","material_code");--> statement-breakpoint
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inv_tx_source_non_conflicting" CHECK (num_nonnulls("inventory_transactions"."material_purchase_receipt_id", "inventory_transactions"."maintenance_order_id", "inventory_transactions"."outsourcing_order_id", "inventory_transactions"."outsourcing_receipt_id", "inventory_transactions"."production_plan_item_id") <= 1);--> statement-breakpoint
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inv_tx_receipt_source_type_match" CHECK (num_nonnulls("inventory_transactions"."material_purchase_receipt_id", "inventory_transactions"."outsourcing_receipt_id") = 0 OR "inventory_transactions"."transaction_type" = 'receipt');--> statement-breakpoint
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inv_tx_issue_source_type_match" CHECK (num_nonnulls("inventory_transactions"."maintenance_order_id", "inventory_transactions"."outsourcing_order_id", "inventory_transactions"."production_plan_item_id") = 0 OR "inventory_transactions"."transaction_type" = 'issue');