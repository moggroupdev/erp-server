CREATE TABLE "supplier_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_number" text NOT NULL,
	"issued_at" timestamp with time zone,
	"total_purchases" numeric(18, 6),
	"total_discount" numeric(18, 6),
	"vat_amount" numeric(18, 6),
	"withholding_tax_amount" numeric(18, 6),
	"total_amount" numeric(18, 6),
	"material_purchase_order_id" uuid,
	"outsourcing_order_id" uuid,
	"supplier_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "sinv_supplier_invoice_number_unique" UNIQUE("supplier_id","invoice_number"),
	CONSTRAINT "sinv_link_exclusive" CHECK (num_nonnulls("supplier_invoices"."material_purchase_order_id", "supplier_invoices"."outsourcing_order_id") = 1),
	CONSTRAINT "sinv_total_purchases_non_negative" CHECK ("supplier_invoices"."total_purchases" IS NULL OR "supplier_invoices"."total_purchases" >= 0),
	CONSTRAINT "sinv_total_discount_non_negative" CHECK ("supplier_invoices"."total_discount" IS NULL OR "supplier_invoices"."total_discount" >= 0),
	CONSTRAINT "sinv_vat_amount_non_negative" CHECK ("supplier_invoices"."vat_amount" IS NULL OR "supplier_invoices"."vat_amount" >= 0),
	CONSTRAINT "sinv_withholding_tax_amount_non_negative" CHECK ("supplier_invoices"."withholding_tax_amount" IS NULL OR "supplier_invoices"."withholding_tax_amount" >= 0),
	CONSTRAINT "sinv_total_amount_non_negative" CHECK ("supplier_invoices"."total_amount" IS NULL OR "supplier_invoices"."total_amount" >= 0)
);
--> statement-breakpoint
ALTER TABLE "material_purchase_orders" DROP CONSTRAINT "mpo_invoice_total_purchases_non_negative";--> statement-breakpoint
ALTER TABLE "material_purchase_orders" DROP CONSTRAINT "mpo_invoice_total_discount_non_negative";--> statement-breakpoint
ALTER TABLE "material_purchase_orders" DROP CONSTRAINT "mpo_invoice_vat_amount_non_negative";--> statement-breakpoint
ALTER TABLE "material_purchase_orders" DROP CONSTRAINT "mpo_invoice_withholding_tax_amount_non_negative";--> statement-breakpoint
ALTER TABLE "material_purchase_orders" DROP CONSTRAINT "mpo_invoice_total_amount_non_negative";--> statement-breakpoint
ALTER TABLE "supplier_invoices" ADD CONSTRAINT "supplier_invoices_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_invoices" ADD CONSTRAINT "supplier_invoices_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_invoices" ADD CONSTRAINT "sinv_mpo_id_fk" FOREIGN KEY ("material_purchase_order_id") REFERENCES "public"."material_purchase_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_invoices" ADD CONSTRAINT "sinv_oso_id_fk" FOREIGN KEY ("outsourcing_order_id") REFERENCES "public"."outsourcing_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sinv_mpo_id_idx" ON "supplier_invoices" USING btree ("material_purchase_order_id");--> statement-breakpoint
CREATE INDEX "sinv_oso_id_idx" ON "supplier_invoices" USING btree ("outsourcing_order_id");--> statement-breakpoint
CREATE INDEX "sinv_supplier_id_idx" ON "supplier_invoices" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "sinv_issued_at_idx" ON "supplier_invoices" USING btree ("issued_at");--> statement-breakpoint
CREATE INDEX "sinv_created_at_idx" ON "supplier_invoices" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "sinv_created_by_idx" ON "supplier_invoices" USING btree ("created_by");--> statement-breakpoint
ALTER TABLE "material_purchase_orders" DROP COLUMN "invoice_number";--> statement-breakpoint
ALTER TABLE "material_purchase_orders" DROP COLUMN "invoice_issued_at";--> statement-breakpoint
ALTER TABLE "material_purchase_orders" DROP COLUMN "invoice_total_purchases";--> statement-breakpoint
ALTER TABLE "material_purchase_orders" DROP COLUMN "invoice_total_discount";--> statement-breakpoint
ALTER TABLE "material_purchase_orders" DROP COLUMN "invoice_vat_amount";--> statement-breakpoint
ALTER TABLE "material_purchase_orders" DROP COLUMN "invoice_withholding_tax_amount";--> statement-breakpoint
ALTER TABLE "material_purchase_orders" DROP COLUMN "invoice_total_amount";