CREATE TABLE "customer_reception_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_reception_id" uuid NOT NULL,
	"product_unit_id" uuid NOT NULL,
	"notes" text,
	CONSTRAINT "customer_reception_items_product_unit_id_unique" UNIQUE("product_unit_id")
);
--> statement-breakpoint
CREATE TABLE "customer_receptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"customer_id" uuid NOT NULL,
	"delivery_id" uuid,
	"installation_id" uuid,
	"received_at" timestamp with time zone NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "customer_receptions_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "delivery_addresses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"delivery_id" uuid NOT NULL,
	"customer_address_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "installation_addresses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"installation_id" uuid NOT NULL,
	"customer_address_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "deliveries" DROP CONSTRAINT "deliveries_contract_id_contracts_id_fk";
--> statement-breakpoint
ALTER TABLE "installations" DROP CONSTRAINT "installations_contract_id_contracts_id_fk";
--> statement-breakpoint
DROP INDEX "deliveries_contract_id_idx";--> statement-breakpoint
DROP INDEX "installations_contract_id_idx";--> statement-breakpoint
ALTER TABLE "product_units" ADD COLUMN "warranty_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "customer_reception_items" ADD CONSTRAINT "customer_reception_items_customer_reception_id_customer_receptions_id_fk" FOREIGN KEY ("customer_reception_id") REFERENCES "public"."customer_receptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_reception_items" ADD CONSTRAINT "customer_reception_items_product_unit_id_product_units_id_fk" FOREIGN KEY ("product_unit_id") REFERENCES "public"."product_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_receptions" ADD CONSTRAINT "customer_receptions_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_receptions" ADD CONSTRAINT "customer_receptions_delivery_id_deliveries_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."deliveries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_receptions" ADD CONSTRAINT "customer_receptions_installation_id_installations_id_fk" FOREIGN KEY ("installation_id") REFERENCES "public"."installations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_receptions" ADD CONSTRAINT "customer_receptions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_addresses" ADD CONSTRAINT "delivery_addresses_delivery_id_deliveries_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."deliveries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_addresses" ADD CONSTRAINT "delivery_addresses_customer_address_id_customer_addresses_id_fk" FOREIGN KEY ("customer_address_id") REFERENCES "public"."customer_addresses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "installation_addresses" ADD CONSTRAINT "installation_addresses_installation_id_installations_id_fk" FOREIGN KEY ("installation_id") REFERENCES "public"."installations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "installation_addresses" ADD CONSTRAINT "installation_addresses_customer_address_id_customer_addresses_id_fk" FOREIGN KEY ("customer_address_id") REFERENCES "public"."customer_addresses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "customer_reception_items_reception_id_idx" ON "customer_reception_items" USING btree ("customer_reception_id");--> statement-breakpoint
CREATE INDEX "customer_receptions_code_idx" ON "customer_receptions" USING btree ("code");--> statement-breakpoint
CREATE INDEX "customer_receptions_customer_id_idx" ON "customer_receptions" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "customer_receptions_delivery_id_idx" ON "customer_receptions" USING btree ("delivery_id");--> statement-breakpoint
CREATE INDEX "customer_receptions_installation_id_idx" ON "customer_receptions" USING btree ("installation_id");--> statement-breakpoint
CREATE INDEX "customer_receptions_received_at_idx" ON "customer_receptions" USING btree ("received_at");--> statement-breakpoint
CREATE INDEX "delivery_addresses_delivery_id_idx" ON "delivery_addresses" USING btree ("delivery_id");--> statement-breakpoint
CREATE INDEX "delivery_addresses_customer_address_id_idx" ON "delivery_addresses" USING btree ("customer_address_id");--> statement-breakpoint
CREATE INDEX "installation_addresses_installation_id_idx" ON "installation_addresses" USING btree ("installation_id");--> statement-breakpoint
CREATE INDEX "installation_addresses_customer_address_id_idx" ON "installation_addresses" USING btree ("customer_address_id");--> statement-breakpoint
CREATE INDEX "product_units_warranty_started_at_idx" ON "product_units" USING btree ("warranty_started_at");--> statement-breakpoint
ALTER TABLE "deliveries" DROP COLUMN "contract_id";--> statement-breakpoint
ALTER TABLE "installations" DROP COLUMN "contract_id";