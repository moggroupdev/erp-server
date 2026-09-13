ALTER TYPE "public"."permission" ADD VALUE 'read_product_pricing_factor' BEFORE 'add_product_bom';--> statement-breakpoint
ALTER TYPE "public"."permission" ADD VALUE 'set_product_pricing_factor' BEFORE 'add_product_bom';--> statement-breakpoint
ALTER TABLE "products" DROP CONSTRAINT "products_pricing_factor_positive";--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "pricing_factor" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_pricing_factor_positive" CHECK ("products"."pricing_factor" IS NULL OR "products"."pricing_factor" > 0);