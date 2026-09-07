ALTER TYPE "public"."permission" ADD VALUE 'print_supplier_quotation_request' BEFORE 'add_customer';--> statement-breakpoint
ALTER TABLE "product_dimensions" ADD COLUMN "notes" text;