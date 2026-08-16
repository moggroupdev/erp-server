ALTER TABLE "legacy_issue_permit_items" DROP CONSTRAINT "legacy_issue_permit_items_quantity_positive";--> statement-breakpoint
ALTER TABLE "legacy_issue_permit_items" ALTER COLUMN "material_code" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "legacy_issue_permit_items" ALTER COLUMN "unit_of_measurement_selected" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "legacy_issue_permit_items" ALTER COLUMN "quantity" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "legacy_issue_permit_items" ADD CONSTRAINT "legacy_issue_permit_items_quantity_positive" CHECK ("legacy_issue_permit_items"."quantity" IS NULL OR "legacy_issue_permit_items"."quantity" > 0);