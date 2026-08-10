CREATE TABLE "material_unit_conversions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"material_code" text NOT NULL,
	"unit" "material_unit" NOT NULL,
	"conversion_factor_to_base" numeric(15, 3) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "muc_material_unit_unique" UNIQUE("material_code","unit"),
	CONSTRAINT "muc_conversion_factor_positive" CHECK ("material_unit_conversions"."conversion_factor_to_base" > 0)
);
--> statement-breakpoint
ALTER TABLE "material_unit_conversions" ADD CONSTRAINT "material_unit_conversions_material_code_materials_code_fk" FOREIGN KEY ("material_code") REFERENCES "public"."materials"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_unit_conversions" ADD CONSTRAINT "material_unit_conversions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "muc_material_code_idx" ON "material_unit_conversions" USING btree ("material_code");