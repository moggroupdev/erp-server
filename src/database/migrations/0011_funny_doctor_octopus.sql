ALTER TYPE "public"."permission" ADD VALUE 'read_inventory_transactions';--> statement-breakpoint
ALTER TABLE "inventory_transactions" ADD COLUMN "legacy_number" text;--> statement-breakpoint
ALTER TABLE "material_purchase_orders" ADD COLUMN "legacy_invoice_number" text;--> statement-breakpoint
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_legacy_number_unique" UNIQUE("legacy_number");