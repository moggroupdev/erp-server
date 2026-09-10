ALTER TYPE "public"."permission" ADD VALUE 'update_supplier_invoice' BEFORE 'add_material_purchase_requisition';--> statement-breakpoint
ALTER TABLE "supplier_invoices" ADD COLUMN "pdf_filename" text;