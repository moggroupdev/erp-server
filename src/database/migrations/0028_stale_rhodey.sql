ALTER TYPE "public"."permission" ADD VALUE 'read_material_purchasing_reports' BEFORE 'add_product';--> statement-breakpoint
ALTER TABLE "material_purchase_orders" ADD COLUMN "legacy_invoice_issued_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "material_purchase_orders" ADD COLUMN "legacy_invoice_seller_tax_number" text;--> statement-breakpoint
ALTER TABLE "material_purchase_orders" ADD COLUMN "legacy_invoice_total_purchases" numeric(18, 6);--> statement-breakpoint
ALTER TABLE "material_purchase_orders" ADD COLUMN "legacy_invoice_total_discount" numeric(18, 6);--> statement-breakpoint
ALTER TABLE "material_purchase_orders" ADD COLUMN "legacy_invoice_vat_amount" numeric(18, 6);--> statement-breakpoint
ALTER TABLE "material_purchase_orders" ADD COLUMN "legacy_invoice_withholding_tax_amount" numeric(18, 6);--> statement-breakpoint
ALTER TABLE "material_purchase_orders" ADD COLUMN "legacy_invoice_total_amount" numeric(18, 6);--> statement-breakpoint
ALTER TABLE "material_purchase_orders" ADD CONSTRAINT "mpo_legacy_invoice_total_purchases_non_negative" CHECK ("material_purchase_orders"."legacy_invoice_total_purchases" IS NULL OR "material_purchase_orders"."legacy_invoice_total_purchases" >= 0);--> statement-breakpoint
ALTER TABLE "material_purchase_orders" ADD CONSTRAINT "mpo_legacy_invoice_total_discount_non_negative" CHECK ("material_purchase_orders"."legacy_invoice_total_discount" IS NULL OR "material_purchase_orders"."legacy_invoice_total_discount" >= 0);--> statement-breakpoint
ALTER TABLE "material_purchase_orders" ADD CONSTRAINT "mpo_legacy_invoice_vat_amount_non_negative" CHECK ("material_purchase_orders"."legacy_invoice_vat_amount" IS NULL OR "material_purchase_orders"."legacy_invoice_vat_amount" >= 0);--> statement-breakpoint
ALTER TABLE "material_purchase_orders" ADD CONSTRAINT "mpo_legacy_invoice_withholding_tax_amount_non_negative" CHECK ("material_purchase_orders"."legacy_invoice_withholding_tax_amount" IS NULL OR "material_purchase_orders"."legacy_invoice_withholding_tax_amount" >= 0);--> statement-breakpoint
ALTER TABLE "material_purchase_orders" ADD CONSTRAINT "mpo_legacy_invoice_total_amount_non_negative" CHECK ("material_purchase_orders"."legacy_invoice_total_amount" IS NULL OR "material_purchase_orders"."legacy_invoice_total_amount" >= 0);