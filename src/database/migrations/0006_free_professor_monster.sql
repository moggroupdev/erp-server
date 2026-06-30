CREATE TABLE "product_dimensions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_code" text NOT NULL,
	"length" numeric(15, 3) NOT NULL,
	"width" numeric(15, 3) NOT NULL,
	"height" numeric(15, 3) NOT NULL,
	"dimension_unit" "dimension_unit" NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "product_dimensions_length_non_negative" CHECK ("product_dimensions"."length" >= 0),
	CONSTRAINT "product_dimensions_width_non_negative" CHECK ("product_dimensions"."width" >= 0),
	CONSTRAINT "product_dimensions_height_non_negative" CHECK ("product_dimensions"."height" >= 0)
);
--> statement-breakpoint
ALTER TABLE "contract_item_dimensions" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "preview_item_dimensions" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "contract_item_dimensions" CASCADE;--> statement-breakpoint
DROP TABLE "preview_item_dimensions" CASCADE;--> statement-breakpoint
ALTER TABLE "boms" RENAME TO "bom_cost_snapshots";--> statement-breakpoint
ALTER TABLE "bom_cost_snapshots" DROP CONSTRAINT "boms_product_unit_material_unique";--> statement-breakpoint
ALTER TABLE "product_standard_boms" DROP CONSTRAINT "product_standard_boms_product_material_unique";--> statement-breakpoint
ALTER TABLE "bom_cost_snapshots" DROP CONSTRAINT "boms_quantity_required_positive";--> statement-breakpoint
ALTER TABLE "bom_cost_snapshots" DROP CONSTRAINT "boms_unit_cost_positive";--> statement-breakpoint
ALTER TABLE "products" DROP CONSTRAINT "products_dimensions_all_or_none";--> statement-breakpoint
ALTER TABLE "products" DROP CONSTRAINT "products_length_non_negative";--> statement-breakpoint
ALTER TABLE "products" DROP CONSTRAINT "products_width_non_negative";--> statement-breakpoint
ALTER TABLE "products" DROP CONSTRAINT "products_height_non_negative";--> statement-breakpoint
ALTER TABLE "bom_cost_snapshots" DROP CONSTRAINT "boms_product_unit_id_product_units_id_fk";
--> statement-breakpoint
ALTER TABLE "bom_cost_snapshots" DROP CONSTRAINT "boms_material_code_materials_code_fk";
--> statement-breakpoint
ALTER TABLE "bom_cost_snapshots" DROP CONSTRAINT "boms_created_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "contract_items" DROP CONSTRAINT "contract_items_product_code_products_code_fk";
--> statement-breakpoint
ALTER TABLE "product_standard_boms" DROP CONSTRAINT "product_standard_boms_product_code_products_code_fk";
--> statement-breakpoint
ALTER TABLE "inquiry_items" DROP CONSTRAINT "inquiry_items_product_code_products_code_fk";
--> statement-breakpoint
ALTER TABLE "preview_items" DROP CONSTRAINT "preview_items_product_code_products_code_fk";
--> statement-breakpoint
ALTER TABLE "offer_items" DROP CONSTRAINT "offer_items_product_code_products_code_fk";
--> statement-breakpoint
DROP INDEX "boms_product_unit_id_idx";--> statement-breakpoint
DROP INDEX "boms_material_code_idx";--> statement-breakpoint
DROP INDEX "boms_created_by_idx";--> statement-breakpoint
DROP INDEX "product_standard_boms_product_code_idx";--> statement-breakpoint
ALTER TABLE "bom_cost_snapshots" ADD COLUMN "standard_bom_item_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "contract_items" ADD COLUMN "product_dimension_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "product_standard_boms" ADD COLUMN "product_dimension_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "inquiry_items" ADD COLUMN "product_dimension_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "preview_items" ADD COLUMN "product_dimension_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "offer_items" ADD COLUMN "product_dimension_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "product_dimensions" ADD CONSTRAINT "product_dimensions_product_code_products_code_fk" FOREIGN KEY ("product_code") REFERENCES "public"."products"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_dimensions" ADD CONSTRAINT "product_dimensions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "product_dimensions_product_code_idx" ON "product_dimensions" USING btree ("product_code");--> statement-breakpoint
CREATE UNIQUE INDEX "product_dimensions_default_per_product_idx" ON "product_dimensions" USING btree ("product_code") WHERE "product_dimensions"."is_default" = true;--> statement-breakpoint
ALTER TABLE "bom_cost_snapshots" ADD CONSTRAINT "bom_cost_snapshots_product_unit_id_product_units_id_fk" FOREIGN KEY ("product_unit_id") REFERENCES "public"."product_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bom_cost_snapshots" ADD CONSTRAINT "bom_cost_snapshots_standard_bom_item_id_product_standard_boms_id_fk" FOREIGN KEY ("standard_bom_item_id") REFERENCES "public"."product_standard_boms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bom_cost_snapshots" ADD CONSTRAINT "bom_cost_snapshots_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_items" ADD CONSTRAINT "contract_items_product_dimension_id_product_dimensions_id_fk" FOREIGN KEY ("product_dimension_id") REFERENCES "public"."product_dimensions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_standard_boms" ADD CONSTRAINT "product_standard_boms_product_dimension_id_product_dimensions_id_fk" FOREIGN KEY ("product_dimension_id") REFERENCES "public"."product_dimensions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiry_items" ADD CONSTRAINT "inquiry_items_product_dimension_id_product_dimensions_id_fk" FOREIGN KEY ("product_dimension_id") REFERENCES "public"."product_dimensions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preview_items" ADD CONSTRAINT "preview_items_product_dimension_id_product_dimensions_id_fk" FOREIGN KEY ("product_dimension_id") REFERENCES "public"."product_dimensions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_items" ADD CONSTRAINT "offer_items_product_dimension_id_product_dimensions_id_fk" FOREIGN KEY ("product_dimension_id") REFERENCES "public"."product_dimensions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bom_cost_snapshots_product_unit_id_idx" ON "bom_cost_snapshots" USING btree ("product_unit_id");--> statement-breakpoint
CREATE INDEX "bom_cost_snapshots_standard_bom_item_id_idx" ON "bom_cost_snapshots" USING btree ("standard_bom_item_id");--> statement-breakpoint
CREATE INDEX "bom_cost_snapshots_created_by_idx" ON "bom_cost_snapshots" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "contract_items_product_dimension_id_idx" ON "contract_items" USING btree ("product_dimension_id");--> statement-breakpoint
CREATE INDEX "product_standard_boms_product_dimension_id_idx" ON "product_standard_boms" USING btree ("product_dimension_id");--> statement-breakpoint
CREATE INDEX "inquiry_items_product_dimension_id_idx" ON "inquiry_items" USING btree ("product_dimension_id");--> statement-breakpoint
CREATE INDEX "preview_items_product_dimension_id_idx" ON "preview_items" USING btree ("product_dimension_id");--> statement-breakpoint
CREATE INDEX "offer_items_product_dimension_id_idx" ON "offer_items" USING btree ("product_dimension_id");--> statement-breakpoint
ALTER TABLE "bom_cost_snapshots" DROP COLUMN "material_code";--> statement-breakpoint
ALTER TABLE "bom_cost_snapshots" DROP COLUMN "quantity_required";--> statement-breakpoint
ALTER TABLE "product_standard_boms" DROP COLUMN "product_code";--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN "length";--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN "width";--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN "height";--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN "dimension_unit";--> statement-breakpoint
ALTER TABLE "bom_cost_snapshots" ADD CONSTRAINT "bom_cost_snapshots_product_unit_standard_bom_unique" UNIQUE("product_unit_id","standard_bom_item_id");--> statement-breakpoint
ALTER TABLE "product_standard_boms" ADD CONSTRAINT "product_standard_boms_dimension_material_unique" UNIQUE("product_dimension_id","material_code");--> statement-breakpoint
ALTER TABLE "bom_cost_snapshots" ADD CONSTRAINT "bom_cost_snapshots_unit_cost_positive" CHECK ("bom_cost_snapshots"."unit_cost" > 0);