ALTER TABLE "materials" RENAME COLUMN "initial_quantity" TO "opening_quantity";--> statement-breakpoint
ALTER TABLE "materials" DROP CONSTRAINT "materials_initial_quantity_non_negative";--> statement-breakpoint
ALTER TABLE "materials" ADD COLUMN "opening_unit_cost" numeric(15, 3) DEFAULT 0;--> statement-breakpoint
ALTER TABLE "materials" ADD CONSTRAINT "materials_opening_unit_cost_non_negative" CHECK ("materials"."opening_unit_cost" IS NULL OR "materials"."opening_unit_cost" >= 0);--> statement-breakpoint
ALTER TABLE "materials" ADD CONSTRAINT "materials_opening_quantity_non_negative" CHECK ("materials"."opening_quantity" IS NULL OR "materials"."opening_quantity" >= 0);