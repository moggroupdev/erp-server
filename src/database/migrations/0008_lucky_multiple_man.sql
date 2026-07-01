CREATE TABLE "material_purchase_order_item_contract_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"material_purchase_order_item_id" uuid NOT NULL,
	"contract_item_id" uuid NOT NULL,
	"quantity_allocated" numeric(15, 3),
	CONSTRAINT "mpoici_mpoi_contract_item_unique" UNIQUE("material_purchase_order_item_id","contract_item_id"),
	CONSTRAINT "mpoici_quantity_allocated_positive" CHECK ("material_purchase_order_item_contract_items"."quantity_allocated" IS NULL OR "material_purchase_order_item_contract_items"."quantity_allocated" > 0)
);
--> statement-breakpoint
ALTER TABLE "product_standard_boms" DROP CONSTRAINT "product_standard_boms_product_dimension_id_product_dimensions_id_fk";
--> statement-breakpoint
ALTER TABLE "production_plan_items" DROP CONSTRAINT "production_plan_items_production_department_id_departments_id_fk";
--> statement-breakpoint
ALTER TABLE "material_purchase_order_items" DROP CONSTRAINT "material_purchase_order_items_material_purchase_order_id_material_purchase_orders_id_fk";
--> statement-breakpoint
ALTER TABLE "material_purchase_receipts" DROP CONSTRAINT "material_purchase_receipts_material_purchase_order_id_material_purchase_orders_id_fk";
--> statement-breakpoint
ALTER TABLE "product_purchase_order_items" DROP CONSTRAINT "product_purchase_order_items_product_purchase_order_id_product_purchase_orders_id_fk";
--> statement-breakpoint
ALTER TABLE "product_purchase_order_items" DROP CONSTRAINT "product_purchase_order_items_contract_item_id_contract_items_id_fk";
--> statement-breakpoint
ALTER TABLE "product_purchase_receipt_items" DROP CONSTRAINT "product_purchase_receipt_items_product_unit_id_product_units_id_fk";
--> statement-breakpoint
ALTER TABLE "product_purchase_receipts" DROP CONSTRAINT "product_purchase_receipts_product_purchase_order_id_product_purchase_orders_id_fk";
--> statement-breakpoint
ALTER TABLE "material_purchase_order_item_contract_items" ADD CONSTRAINT "mpoici_mpoi_id_fk" FOREIGN KEY ("material_purchase_order_item_id") REFERENCES "public"."material_purchase_order_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_purchase_order_item_contract_items" ADD CONSTRAINT "mpoici_contract_item_id_fk" FOREIGN KEY ("contract_item_id") REFERENCES "public"."contract_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mpoici_mpoi_id_idx" ON "material_purchase_order_item_contract_items" USING btree ("material_purchase_order_item_id");--> statement-breakpoint
CREATE INDEX "mpoici_contract_item_id_idx" ON "material_purchase_order_item_contract_items" USING btree ("contract_item_id");--> statement-breakpoint
ALTER TABLE "contract_items" ADD CONSTRAINT "contract_items_product_code_products_code_fk" FOREIGN KEY ("product_code") REFERENCES "public"."products"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_standard_boms" ADD CONSTRAINT "psb_product_dimension_id_fk" FOREIGN KEY ("product_dimension_id") REFERENCES "public"."product_dimensions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiry_items" ADD CONSTRAINT "inquiry_items_product_code_products_code_fk" FOREIGN KEY ("product_code") REFERENCES "public"."products"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preview_items" ADD CONSTRAINT "preview_items_product_code_products_code_fk" FOREIGN KEY ("product_code") REFERENCES "public"."products"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_items" ADD CONSTRAINT "offer_items_product_code_products_code_fk" FOREIGN KEY ("product_code") REFERENCES "public"."products"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_plan_items" ADD CONSTRAINT "ppi_prod_dept_id_fk" FOREIGN KEY ("production_department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_purchase_order_items" ADD CONSTRAINT "mpoi_mpo_id_fk" FOREIGN KEY ("material_purchase_order_id") REFERENCES "public"."material_purchase_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_purchase_receipts" ADD CONSTRAINT "mpr_mpo_id_fk" FOREIGN KEY ("material_purchase_order_id") REFERENCES "public"."material_purchase_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_purchase_order_items" ADD CONSTRAINT "ppoi_ppo_id_fk" FOREIGN KEY ("product_purchase_order_id") REFERENCES "public"."product_purchase_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_purchase_order_items" ADD CONSTRAINT "ppoi_contract_item_id_fk" FOREIGN KEY ("contract_item_id") REFERENCES "public"."contract_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_purchase_receipt_items" ADD CONSTRAINT "ppri_product_unit_id_fk" FOREIGN KEY ("product_unit_id") REFERENCES "public"."product_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_purchase_receipts" ADD CONSTRAINT "ppr_ppo_id_fk" FOREIGN KEY ("product_purchase_order_id") REFERENCES "public"."product_purchase_orders"("id") ON DELETE no action ON UPDATE no action;