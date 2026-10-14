CREATE TABLE "customer_contact_persons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"name" text NOT NULL,
	"job_title" text,
	"phone" text,
	"email" text,
	"is_primary" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_contact_persons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier_id" uuid NOT NULL,
	"name" text NOT NULL,
	"job_title" text,
	"phone" text,
	"email" text,
	"is_primary" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "website" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "tax_number" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "commercial_registration_number" text;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "website" text;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "commercial_registration_number" text;--> statement-breakpoint
ALTER TABLE "customer_contact_persons" ADD CONSTRAINT "customer_contact_persons_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_contact_persons" ADD CONSTRAINT "supplier_contact_persons_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "customer_contact_persons_customer_id_idx" ON "customer_contact_persons" USING btree ("customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "customer_contact_persons_one_primary" ON "customer_contact_persons" USING btree ("customer_id") WHERE "customer_contact_persons"."is_primary" = true;--> statement-breakpoint
CREATE INDEX "supplier_contact_persons_supplier_id_idx" ON "supplier_contact_persons" USING btree ("supplier_id");--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_contact_persons_one_primary" ON "supplier_contact_persons" USING btree ("supplier_id") WHERE "supplier_contact_persons"."is_primary" = true;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_tax_number_unique" UNIQUE("tax_number");--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_commercial_registration_number_unique" UNIQUE("commercial_registration_number");--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_commercial_registration_number_unique" UNIQUE("commercial_registration_number");