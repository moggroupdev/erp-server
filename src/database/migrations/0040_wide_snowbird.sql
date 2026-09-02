ALTER TYPE "public"."permission" ADD VALUE 'set_material_market_price' BEFORE 'print_materials_list';--> statement-breakpoint
ALTER TABLE "materials" ADD COLUMN "market_unit_price" numeric(18, 6);--> statement-breakpoint
ALTER TABLE "materials" ADD COLUMN "market_unit_price_set_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "materials" ADD COLUMN "market_unit_price_set_by" uuid;--> statement-breakpoint
ALTER TABLE "materials" ADD CONSTRAINT "materials_market_unit_price_set_by_users_id_fk" FOREIGN KEY ("market_unit_price_set_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "materials" ADD CONSTRAINT "materials_market_unit_price_non_negative" CHECK ("materials"."market_unit_price" IS NULL OR "materials"."market_unit_price" >= 0);--> statement-breakpoint
ALTER TABLE "materials" ADD CONSTRAINT "materials_market_unit_price_pair" CHECK (("materials"."market_unit_price" IS NULL) = ("materials"."market_unit_price_set_at" IS NULL) AND ("materials"."market_unit_price_set_at" IS NULL) = ("materials"."market_unit_price_set_by" IS NULL));