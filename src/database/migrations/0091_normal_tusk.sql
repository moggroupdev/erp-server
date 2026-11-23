ALTER TABLE "materials" ALTER COLUMN "material_type" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."material_type";--> statement-breakpoint
CREATE TYPE "public"."material_type" AS ENUM('raw_materials', 'manufactured_material', 'spare_parts', 'tools_and_equipment', 'supplied_products');--> statement-breakpoint
ALTER TABLE "materials" ALTER COLUMN "material_type" SET DATA TYPE "public"."material_type" USING "material_type"::"public"."material_type";