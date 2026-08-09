ALTER TYPE "public"."vendor_quotation_email_status" RENAME TO "supplier_quotation_email_status";--> statement-breakpoint
ALTER TABLE "vendor_addresses" RENAME TO "supplier_addresses";--> statement-breakpoint
ALTER TABLE "vendors" RENAME TO "suppliers";--> statement-breakpoint
ALTER TABLE "vendor_quotation_emails" RENAME TO "supplier_quotation_emails";--> statement-breakpoint
ALTER TABLE "supplier_addresses" RENAME COLUMN "vendor_id" TO "supplier_id";--> statement-breakpoint
ALTER TABLE "supplier_quotation_emails" RENAME COLUMN "vendor_id" TO "supplier_id";--> statement-breakpoint
ALTER TABLE "material_purchase_orders" RENAME COLUMN "vendor_id" TO "supplier_id";--> statement-breakpoint
ALTER TABLE "product_purchase_orders" RENAME COLUMN "vendor_id" TO "supplier_id";--> statement-breakpoint
ALTER TABLE "outsourcing_orders" RENAME COLUMN "vendor_id" TO "supplier_id";--> statement-breakpoint
ALTER TABLE "product_units" RENAME COLUMN "vendor_serial_number" TO "supplier_serial_number";--> statement-breakpoint
ALTER TABLE "suppliers" DROP CONSTRAINT "vendors_code_unique";--> statement-breakpoint
ALTER TABLE "suppliers" DROP CONSTRAINT "vendors_phone_unique";--> statement-breakpoint
ALTER TABLE "suppliers" DROP CONSTRAINT "vendors_email_unique";--> statement-breakpoint
ALTER TABLE "product_units" DROP CONSTRAINT "product_units_vendor_serial_number_unique";--> statement-breakpoint
ALTER TABLE "supplier_addresses" DROP CONSTRAINT "vendor_addresses_vendor_id_vendors_id_fk";
--> statement-breakpoint
ALTER TABLE "supplier_addresses" DROP CONSTRAINT "vendor_addresses_country_id_countries_id_fk";
--> statement-breakpoint
ALTER TABLE "supplier_addresses" DROP CONSTRAINT "vendor_addresses_city_id_cities_id_fk";
--> statement-breakpoint
ALTER TABLE "suppliers" DROP CONSTRAINT "vendors_created_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "supplier_quotation_emails" DROP CONSTRAINT "vendor_quotation_emails_vendor_id_vendors_id_fk";
--> statement-breakpoint
ALTER TABLE "supplier_quotation_emails" DROP CONSTRAINT "vendor_quotation_emails_created_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "material_purchase_orders" DROP CONSTRAINT "material_purchase_orders_vendor_id_vendors_id_fk";
--> statement-breakpoint
ALTER TABLE "product_purchase_orders" DROP CONSTRAINT "product_purchase_orders_vendor_id_vendors_id_fk";
--> statement-breakpoint
ALTER TABLE "outsourcing_orders" DROP CONSTRAINT "outsourcing_orders_vendor_id_vendors_id_fk";
--> statement-breakpoint
ALTER TABLE "permissions" ALTER COLUMN "permission" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."permission";--> statement-breakpoint
CREATE TYPE "public"."permission" AS ENUM('add_user', 'read_users', 'update_user', 'delete_user', 'add_role', 'read_roles', 'update_role', 'delete_role', 'add_department', 'read_departments', 'update_department', 'add_supplier', 'read_suppliers', 'update_supplier', 'add_customer', 'read_customers', 'update_customer', 'add_material', 'read_materials', 'update_material', 'print_materials_list', 'add_manufactured_material_bom', 'read_manufactured_material_boms', 'update_manufactured_material_bom', 'read_material_reports', 'add_product', 'read_products', 'update_product', 'print_products_list', 'add_product_bom', 'read_product_boms', 'update_product_bom', 'read_inventory_transactions', 'read_material_purchase_orders');--> statement-breakpoint
ALTER TABLE "permissions" ALTER COLUMN "permission" SET DATA TYPE "public"."permission" USING "permission"::"public"."permission";--> statement-breakpoint
DROP INDEX "vendor_addresses_vendor_id_idx";--> statement-breakpoint
DROP INDEX "vendor_addresses_city_id_idx";--> statement-breakpoint
DROP INDEX "vendor_addresses_country_id_idx";--> statement-breakpoint
DROP INDEX "vendor_addresses_one_default";--> statement-breakpoint
DROP INDEX "vendors_name_idx";--> statement-breakpoint
DROP INDEX "vendor_quotation_emails_vendor_id_idx";--> statement-breakpoint
DROP INDEX "vendor_quotation_emails_status_idx";--> statement-breakpoint
DROP INDEX "vendor_quotation_emails_created_at_idx";--> statement-breakpoint
DROP INDEX "vendor_quotation_emails_created_by_idx";--> statement-breakpoint
DROP INDEX "mpo_vendor_id_idx";--> statement-breakpoint
DROP INDEX "ppo_vendor_id_idx";--> statement-breakpoint
DROP INDEX "oso_vendor_id_idx";--> statement-breakpoint
ALTER TABLE "supplier_addresses" ADD CONSTRAINT "supplier_addresses_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_addresses" ADD CONSTRAINT "supplier_addresses_country_id_countries_id_fk" FOREIGN KEY ("country_id") REFERENCES "public"."countries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_addresses" ADD CONSTRAINT "supplier_addresses_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_quotation_emails" ADD CONSTRAINT "supplier_quotation_emails_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_quotation_emails" ADD CONSTRAINT "supplier_quotation_emails_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_purchase_orders" ADD CONSTRAINT "material_purchase_orders_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_purchase_orders" ADD CONSTRAINT "product_purchase_orders_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outsourcing_orders" ADD CONSTRAINT "outsourcing_orders_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "supplier_addresses_supplier_id_idx" ON "supplier_addresses" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "supplier_addresses_city_id_idx" ON "supplier_addresses" USING btree ("city_id");--> statement-breakpoint
CREATE INDEX "supplier_addresses_country_id_idx" ON "supplier_addresses" USING btree ("country_id");--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_addresses_one_default" ON "supplier_addresses" USING btree ("supplier_id") WHERE "supplier_addresses"."is_default" = true;--> statement-breakpoint
CREATE INDEX "suppliers_name_idx" ON "suppliers" USING btree ("name");--> statement-breakpoint
CREATE INDEX "supplier_quotation_emails_supplier_id_idx" ON "supplier_quotation_emails" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "supplier_quotation_emails_status_idx" ON "supplier_quotation_emails" USING btree ("status");--> statement-breakpoint
CREATE INDEX "supplier_quotation_emails_created_at_idx" ON "supplier_quotation_emails" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "supplier_quotation_emails_created_by_idx" ON "supplier_quotation_emails" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "mpo_supplier_id_idx" ON "material_purchase_orders" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "ppo_supplier_id_idx" ON "product_purchase_orders" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "oso_supplier_id_idx" ON "outsourcing_orders" USING btree ("supplier_id");--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_code_unique" UNIQUE("code");--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_phone_unique" UNIQUE("phone");--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_email_unique" UNIQUE("email");--> statement-breakpoint
ALTER TABLE "product_units" ADD CONSTRAINT "product_units_supplier_serial_number_unique" UNIQUE("supplier_serial_number");