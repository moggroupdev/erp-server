CREATE TYPE "public"."customer_classification" AS ENUM('restaurant', 'hotel', 'tourist_village', 'hospital', 'residential', 'cafe', 'bakery', 'factory', 'shopping_mall', 'sports_club', 'banquet_hall', 'supermarket', 'corporate');--> statement-breakpoint
CREATE TYPE "public"."supplier_classification" AS ENUM('aluminum', 'stainless_steel', 'sheet_steel', 'copper', 'plastic', 'glass', 'insulation', 'electrical', 'refrigeration', 'gas', 'hardware', 'coatings', 'spare_parts', 'imported_equipment', 'services', 'general');--> statement-breakpoint
ALTER TABLE "customers" RENAME COLUMN "deleted_at" TO "blacklisted_at";--> statement-breakpoint
ALTER TABLE "suppliers" RENAME COLUMN "deleted_at" TO "blacklisted_at";--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "classification" "customer_classification";--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "added_to_blacklist_by" uuid;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "tax_number" text;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "classification" "supplier_classification";--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "added_to_blacklist_by" uuid;--> statement-breakpoint
ALTER TABLE "material_purchase_requisition_items" ADD COLUMN "unit_of_measurement_selected" "material_unit" NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_added_to_blacklist_by_users_id_fk" FOREIGN KEY ("added_to_blacklist_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_added_to_blacklist_by_users_id_fk" FOREIGN KEY ("added_to_blacklist_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "customers_classification_idx" ON "customers" USING btree ("classification");--> statement-breakpoint
CREATE INDEX "customers_blacklisted_at_idx" ON "customers" USING btree ("blacklisted_at");--> statement-breakpoint
CREATE INDEX "customers_added_to_blacklist_by_idx" ON "customers" USING btree ("added_to_blacklist_by");--> statement-breakpoint
CREATE INDEX "suppliers_classification_idx" ON "suppliers" USING btree ("classification");--> statement-breakpoint
CREATE INDEX "suppliers_blacklisted_at_idx" ON "suppliers" USING btree ("blacklisted_at");--> statement-breakpoint
CREATE INDEX "suppliers_added_to_blacklist_by_idx" ON "suppliers" USING btree ("added_to_blacklist_by");--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_tax_number_unique" UNIQUE("tax_number");--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_blacklist_pair" CHECK (("customers"."blacklisted_at" IS NULL) = ("customers"."added_to_blacklist_by" IS NULL));--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_blacklist_pair" CHECK (("suppliers"."blacklisted_at" IS NULL) = ("suppliers"."added_to_blacklist_by" IS NULL));