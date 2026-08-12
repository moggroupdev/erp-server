ALTER TABLE "material_unit_conversions" ALTER COLUMN "unit" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "materials" ALTER COLUMN "unit_of_measurement" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."material_unit";--> statement-breakpoint
CREATE TYPE "public"."material_unit" AS ENUM('count', 'gram', 'kg', 'ton', 'cm', 'meter', 'square_meter', 'cubic_meter', 'liter');--> statement-breakpoint
ALTER TABLE "material_unit_conversions" ALTER COLUMN "unit" SET DATA TYPE "public"."material_unit" USING "unit"::"public"."material_unit";--> statement-breakpoint
ALTER TABLE "materials" ALTER COLUMN "unit_of_measurement" SET DATA TYPE "public"."material_unit" USING "unit_of_measurement"::"public"."material_unit";