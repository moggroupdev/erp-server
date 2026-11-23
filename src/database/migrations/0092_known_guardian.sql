ALTER TABLE "product_dimensions" RENAME COLUMN "is_default" TO "is_standard";--> statement-breakpoint
DROP INDEX "product_dimensions_default_per_product_idx";