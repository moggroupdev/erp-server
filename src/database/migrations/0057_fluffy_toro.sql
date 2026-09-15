ALTER TABLE "users" ALTER COLUMN "production_sub_department" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "production_sub_department_managers" ALTER COLUMN "sub_department" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "product_production_routes" ALTER COLUMN "production_sub_department" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "product_standard_boms" ALTER COLUMN "production_sub_department" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "production_plan_items" ALTER COLUMN "production_stage" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "legacy_issue_permits" ALTER COLUMN "production_sub_department" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "material_purchase_requisitions" ALTER COLUMN "production_sub_department" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."production_sub_department";--> statement-breakpoint
CREATE TYPE "public"."production_sub_department" AS ENUM('cutting', 'punch', 'bending', 'refrigeration', 'electricity', 'gas', 'injection', 'sheet_metal_neutral', 'sheet_metal_cold', 'sheet_metal_hot', 'kitchens', 'paints', 'blacksmithing');--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "production_sub_department" SET DATA TYPE "public"."production_sub_department" USING "production_sub_department"::"public"."production_sub_department";--> statement-breakpoint
ALTER TABLE "production_sub_department_managers" ALTER COLUMN "sub_department" SET DATA TYPE "public"."production_sub_department" USING "sub_department"::"public"."production_sub_department";--> statement-breakpoint
ALTER TABLE "product_production_routes" ALTER COLUMN "production_sub_department" SET DATA TYPE "public"."production_sub_department" USING "production_sub_department"::"public"."production_sub_department";--> statement-breakpoint
ALTER TABLE "product_standard_boms" ALTER COLUMN "production_sub_department" SET DATA TYPE "public"."production_sub_department" USING "production_sub_department"::"public"."production_sub_department";--> statement-breakpoint
ALTER TABLE "production_plan_items" ALTER COLUMN "production_stage" SET DATA TYPE "public"."production_sub_department" USING "production_stage"::"public"."production_sub_department";--> statement-breakpoint
ALTER TABLE "legacy_issue_permits" ALTER COLUMN "production_sub_department" SET DATA TYPE "public"."production_sub_department" USING "production_sub_department"::"public"."production_sub_department";--> statement-breakpoint
ALTER TABLE "material_purchase_requisitions" ALTER COLUMN "production_sub_department" SET DATA TYPE "public"."production_sub_department" USING "production_sub_department"::"public"."production_sub_department";