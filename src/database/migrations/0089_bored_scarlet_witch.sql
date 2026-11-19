ALTER TYPE "public"."permission" ADD VALUE 'merge_customers' BEFORE 'read_contracts';--> statement-breakpoint
ALTER TYPE "public"."permission" ADD VALUE 'read_deleted_materials' BEFORE 'set_material_market_price';--> statement-breakpoint
ALTER TYPE "public"."permission" ADD VALUE 'restore_material' BEFORE 'set_material_market_price';--> statement-breakpoint
ALTER TYPE "public"."permission" ADD VALUE 'merge_materials' BEFORE 'set_material_market_price';