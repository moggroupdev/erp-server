ALTER TYPE "public"."permission" ADD VALUE 'read_supplier_invoices' BEFORE 'add_material_purchase_requisition';--> statement-breakpoint
ALTER TABLE "supplier_invoices" DROP CONSTRAINT "sinv_link_exclusive";--> statement-breakpoint
ALTER TABLE "supplier_invoices" ADD COLUMN "product_purchase_order_id" uuid;--> statement-breakpoint
ALTER TABLE "supplier_invoices" ADD CONSTRAINT "sinv_ppo_id_fk" FOREIGN KEY ("product_purchase_order_id") REFERENCES "public"."product_purchase_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sinv_ppo_id_idx" ON "supplier_invoices" USING btree ("product_purchase_order_id");--> statement-breakpoint
ALTER TABLE "supplier_invoices" ADD CONSTRAINT "sinv_link_exclusive" CHECK (num_nonnulls("supplier_invoices"."material_purchase_order_id", "supplier_invoices"."product_purchase_order_id", "supplier_invoices"."outsourcing_order_id") = 1);