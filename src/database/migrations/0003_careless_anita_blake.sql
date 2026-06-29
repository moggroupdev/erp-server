ALTER TABLE "product_boms" RENAME TO "product_standard_boms";--> statement-breakpoint
ALTER TABLE "product_standard_boms" DROP CONSTRAINT "product_boms_product_material_unique";--> statement-breakpoint
ALTER TABLE "product_standard_boms" DROP CONSTRAINT "product_boms_quantity_required_positive";--> statement-breakpoint
ALTER TABLE "product_standard_boms" DROP CONSTRAINT "product_boms_product_code_products_code_fk";
--> statement-breakpoint
ALTER TABLE "product_standard_boms" DROP CONSTRAINT "product_boms_material_code_materials_code_fk";
--> statement-breakpoint
ALTER TABLE "product_standard_boms" DROP CONSTRAINT "product_boms_created_by_users_id_fk";
--> statement-breakpoint
DROP INDEX "product_boms_product_code_idx";--> statement-breakpoint
DROP INDEX "product_boms_material_code_idx";--> statement-breakpoint
ALTER TABLE "product_standard_boms" ADD CONSTRAINT "product_standard_boms_product_code_products_code_fk" FOREIGN KEY ("product_code") REFERENCES "public"."products"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_standard_boms" ADD CONSTRAINT "product_standard_boms_material_code_materials_code_fk" FOREIGN KEY ("material_code") REFERENCES "public"."materials"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_standard_boms" ADD CONSTRAINT "product_standard_boms_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "product_standard_boms_product_code_idx" ON "product_standard_boms" USING btree ("product_code");--> statement-breakpoint
CREATE INDEX "product_standard_boms_material_code_idx" ON "product_standard_boms" USING btree ("material_code");--> statement-breakpoint
ALTER TABLE "product_standard_boms" ADD CONSTRAINT "product_standard_boms_product_material_unique" UNIQUE("product_code","material_code");--> statement-breakpoint
ALTER TABLE "product_standard_boms" ADD CONSTRAINT "product_standard_boms_quantity_required_positive" CHECK ("product_standard_boms"."quantity_required" > 0);