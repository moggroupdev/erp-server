ALTER TYPE "public"."permission" ADD VALUE 'add_material_category' BEFORE 'use_unit_conversion_tool';--> statement-breakpoint
ALTER TYPE "public"."permission" ADD VALUE 'update_material_category' BEFORE 'use_unit_conversion_tool';--> statement-breakpoint
ALTER TYPE "public"."permission" ADD VALUE 'add_material_unit_conversion' BEFORE 'use_unit_conversion_tool';--> statement-breakpoint
ALTER TYPE "public"."permission" ADD VALUE 'update_material_unit_conversion' BEFORE 'use_unit_conversion_tool';--> statement-breakpoint
ALTER TYPE "public"."permission" ADD VALUE 'add_product_category' BEFORE 'read_product_pricing_factor';--> statement-breakpoint
ALTER TYPE "public"."permission" ADD VALUE 'update_product_category' BEFORE 'read_product_pricing_factor';