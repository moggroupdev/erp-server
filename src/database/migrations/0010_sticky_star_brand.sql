ALTER TYPE "public"."permission" ADD VALUE 'print_materials_list' BEFORE 'read_material_reports';--> statement-breakpoint
ALTER TYPE "public"."permission" ADD VALUE 'add_manufactured_material_bom' BEFORE 'read_material_reports';--> statement-breakpoint
ALTER TYPE "public"."permission" ADD VALUE 'read_manufactured_material_boms' BEFORE 'read_material_reports';--> statement-breakpoint
ALTER TYPE "public"."permission" ADD VALUE 'update_manufactured_material_bom' BEFORE 'read_material_reports';--> statement-breakpoint
ALTER TYPE "public"."permission" ADD VALUE 'print_products_list' BEFORE 'add_product_bom';--> statement-breakpoint
ALTER TABLE "product_dimensions" DROP CONSTRAINT "product_dimensions_length_non_negative";--> statement-breakpoint
ALTER TABLE "product_dimensions" DROP CONSTRAINT "product_dimensions_depth_non_negative";--> statement-breakpoint
ALTER TABLE "product_dimensions" ALTER COLUMN "length" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "product_dimensions" ALTER COLUMN "depth" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "product_dimensions" ADD COLUMN "diameter" numeric(15, 3);--> statement-breakpoint
ALTER TABLE "product_dimensions" DROP COLUMN "dimension_unit";--> statement-breakpoint
ALTER TABLE "product_dimensions" ADD CONSTRAINT "product_dimensions_diameter_non_negative" CHECK ("product_dimensions"."diameter" IS NULL OR "product_dimensions"."diameter" >= 0);--> statement-breakpoint
ALTER TABLE "product_dimensions" ADD CONSTRAINT "product_dimensions_length_depth_xor_diameter" CHECK (("product_dimensions"."length" IS NOT NULL AND "product_dimensions"."depth" IS NOT NULL AND "product_dimensions"."diameter" IS NULL)
          OR ("product_dimensions"."length" IS NULL AND "product_dimensions"."depth" IS NULL AND "product_dimensions"."diameter" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "product_dimensions" ADD CONSTRAINT "product_dimensions_length_non_negative" CHECK ("product_dimensions"."length" IS NULL OR "product_dimensions"."length" >= 0);--> statement-breakpoint
ALTER TABLE "product_dimensions" ADD CONSTRAINT "product_dimensions_depth_non_negative" CHECK ("product_dimensions"."depth" IS NULL OR "product_dimensions"."depth" >= 0);--> statement-breakpoint
DROP TYPE "public"."dimension_unit";