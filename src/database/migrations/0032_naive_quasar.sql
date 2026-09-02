ALTER TABLE "material_purchase_orders" RENAME COLUMN "legacy_invoice_number" TO "invoice_number";--> statement-breakpoint
ALTER TABLE "material_purchase_orders" RENAME COLUMN "legacy_invoice_issued_at" TO "invoice_issued_at";--> statement-breakpoint
ALTER TABLE "material_purchase_orders" RENAME COLUMN "legacy_invoice_total_purchases" TO "invoice_total_purchases";--> statement-breakpoint
ALTER TABLE "material_purchase_orders" RENAME COLUMN "legacy_invoice_total_discount" TO "invoice_total_discount";--> statement-breakpoint
ALTER TABLE "material_purchase_orders" RENAME COLUMN "legacy_invoice_vat_amount" TO "invoice_vat_amount";--> statement-breakpoint
ALTER TABLE "material_purchase_orders" RENAME COLUMN "legacy_invoice_withholding_tax_amount" TO "invoice_withholding_tax_amount";--> statement-breakpoint
ALTER TABLE "material_purchase_orders" RENAME COLUMN "legacy_invoice_total_amount" TO "invoice_total_amount";--> statement-breakpoint
ALTER TABLE "material_purchase_orders" DROP CONSTRAINT "mpo_legacy_invoice_total_purchases_non_negative";--> statement-breakpoint
ALTER TABLE "material_purchase_orders" DROP CONSTRAINT "mpo_legacy_invoice_total_discount_non_negative";--> statement-breakpoint
ALTER TABLE "material_purchase_orders" DROP CONSTRAINT "mpo_legacy_invoice_vat_amount_non_negative";--> statement-breakpoint
ALTER TABLE "material_purchase_orders" DROP CONSTRAINT "mpo_legacy_invoice_withholding_tax_amount_non_negative";--> statement-breakpoint
ALTER TABLE "material_purchase_orders" DROP CONSTRAINT "mpo_legacy_invoice_total_amount_non_negative";--> statement-breakpoint
ALTER TABLE "material_purchase_orders" DROP COLUMN "legacy_invoice_seller_tax_number";--> statement-breakpoint
ALTER TABLE "material_purchase_orders" ADD CONSTRAINT "mpo_invoice_total_purchases_non_negative" CHECK ("material_purchase_orders"."invoice_total_purchases" IS NULL OR "material_purchase_orders"."invoice_total_purchases" >= 0);--> statement-breakpoint
ALTER TABLE "material_purchase_orders" ADD CONSTRAINT "mpo_invoice_total_discount_non_negative" CHECK ("material_purchase_orders"."invoice_total_discount" IS NULL OR "material_purchase_orders"."invoice_total_discount" >= 0);--> statement-breakpoint
ALTER TABLE "material_purchase_orders" ADD CONSTRAINT "mpo_invoice_vat_amount_non_negative" CHECK ("material_purchase_orders"."invoice_vat_amount" IS NULL OR "material_purchase_orders"."invoice_vat_amount" >= 0);--> statement-breakpoint
ALTER TABLE "material_purchase_orders" ADD CONSTRAINT "mpo_invoice_withholding_tax_amount_non_negative" CHECK ("material_purchase_orders"."invoice_withholding_tax_amount" IS NULL OR "material_purchase_orders"."invoice_withholding_tax_amount" >= 0);--> statement-breakpoint
ALTER TABLE "material_purchase_orders" ADD CONSTRAINT "mpo_invoice_total_amount_non_negative" CHECK ("material_purchase_orders"."invoice_total_amount" IS NULL OR "material_purchase_orders"."invoice_total_amount" >= 0);