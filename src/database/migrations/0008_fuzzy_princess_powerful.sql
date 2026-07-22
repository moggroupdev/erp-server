ALTER TABLE "materials" RENAME COLUMN "unit" TO "unit_of_measurement";--> statement-breakpoint
ALTER TABLE "materials" RENAME COLUMN "unit_cost" TO "unit_price";--> statement-breakpoint
ALTER TABLE "materials" RENAME COLUMN "opening_unit_cost" TO "opening_unit_price";--> statement-breakpoint
ALTER TABLE "materials" DROP CONSTRAINT "materials_unit_cost_non_negative";--> statement-breakpoint
ALTER TABLE "materials" DROP CONSTRAINT "materials_opening_unit_cost_non_negative";--> statement-breakpoint
ALTER TABLE "materials" ADD CONSTRAINT "materials_unit_price_non_negative" CHECK ("materials"."unit_price" >= 0);--> statement-breakpoint
ALTER TABLE "materials" ADD CONSTRAINT "materials_opening_unit_price_non_negative" CHECK ("materials"."opening_unit_price" IS NULL OR "materials"."opening_unit_price" >= 0);