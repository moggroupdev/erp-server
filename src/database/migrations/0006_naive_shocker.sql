ALTER TYPE "public"."permission" ADD VALUE 'add_material';--> statement-breakpoint
ALTER TYPE "public"."permission" ADD VALUE 'read_materials';--> statement-breakpoint
ALTER TYPE "public"."permission" ADD VALUE 'update_material';--> statement-breakpoint
ALTER TABLE "materials" ALTER COLUMN "unit_cost" SET DEFAULT 0;