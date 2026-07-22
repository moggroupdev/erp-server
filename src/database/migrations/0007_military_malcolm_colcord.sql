ALTER TYPE "public"."permission" ADD VALUE 'read_material_reports';--> statement-breakpoint
ALTER TYPE "public"."permission" ADD VALUE 'add_product';--> statement-breakpoint
ALTER TYPE "public"."permission" ADD VALUE 'read_products';--> statement-breakpoint
ALTER TYPE "public"."permission" ADD VALUE 'update_product';--> statement-breakpoint
ALTER TABLE "product_dimensions" RENAME COLUMN "width" TO "depth";--> statement-breakpoint
ALTER TABLE "product_dimensions" DROP CONSTRAINT "product_dimensions_width_non_negative";--> statement-breakpoint
ALTER TABLE "product_dimensions" ADD CONSTRAINT "product_dimensions_depth_non_negative" CHECK ("product_dimensions"."depth" >= 0);