ALTER TYPE "public"."material_unit" ADD VALUE 'packet';--> statement-breakpoint
ALTER TYPE "public"."material_unit" ADD VALUE 'box';--> statement-breakpoint
ALTER TYPE "public"."material_unit" ADD VALUE 'roll';--> statement-breakpoint
ALTER TYPE "public"."permission" ADD VALUE 'read_material_purchasing_average_price_gaps_report' BEFORE 'read_material_purchasing_requisition_follow_up_report';