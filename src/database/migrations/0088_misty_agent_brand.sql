ALTER TYPE "public"."permission" ADD VALUE 'delete_material' BEFORE 'set_material_market_price';--> statement-breakpoint
ALTER TABLE "materials" ADD COLUMN "deleted_by" uuid;--> statement-breakpoint
ALTER TABLE "materials" ADD CONSTRAINT "materials_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "materials_deleted_by_idx" ON "materials" USING btree ("deleted_by");--> statement-breakpoint
ALTER TABLE "materials" ADD CONSTRAINT "materials_deleted_pair" CHECK (("materials"."deleted_at" IS NULL) = ("materials"."deleted_by" IS NULL));