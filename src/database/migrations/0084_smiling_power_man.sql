CREATE TYPE "public"."legacy_issue_permit_type" AS ENUM('contract_review', 'maintenance_order', 'production_department', 'internal_use', 'executive_personal');--> statement-breakpoint
ALTER TYPE "public"."permission" ADD VALUE 'read_material_legacy_issue_permit_history_report' BEFORE 'read_material_purchasing_spending_summary_report';--> statement-breakpoint
ALTER TYPE "public"."permission" ADD VALUE 'read_material_purchasing_requisition_history_report' BEFORE 'add_product';--> statement-breakpoint
ALTER TABLE "legacy_issue_permits" ALTER COLUMN "work_order_number_type" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "legacy_issue_permits" ALTER COLUMN "work_order_number_type" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "legacy_issue_permits" RENAME COLUMN "work_order_number" TO "maintenance_order_number";--> statement-breakpoint
ALTER TABLE "legacy_issue_permits" RENAME COLUMN "work_order_number_type" TO "maintenance_order_type";--> statement-breakpoint
DROP INDEX "legacy_issue_permit_work_order_number_type_idx";--> statement-breakpoint
ALTER TABLE "legacy_issue_permits" ALTER COLUMN "issue_order_number" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "legacy_issue_permits" ALTER COLUMN "issue_order_date" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "legacy_issue_permits" ALTER COLUMN "maintenance_order_type" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "legacy_issue_permits" ADD COLUMN "permit_type" "legacy_issue_permit_type";--> statement-breakpoint
ALTER TABLE "legacy_issue_permits" ADD COLUMN "customer_id" uuid;--> statement-breakpoint
ALTER TABLE "legacy_issue_permits" ADD COLUMN "has_multiple_customers" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "legacy_issue_permits" SET "permit_type" = CASE WHEN "maintenance_order_type" = 'base_contract' THEN 'contract_review'::"public"."legacy_issue_permit_type" ELSE 'maintenance_order'::"public"."legacy_issue_permit_type" END;--> statement-breakpoint
UPDATE "legacy_issue_permits" SET "maintenance_order_type" = NULL, "maintenance_order_number" = NULL WHERE "permit_type" = 'contract_review';--> statement-breakpoint
UPDATE "legacy_issue_permits" SET "contract_number" = NULL WHERE "permit_type" = 'maintenance_order';--> statement-breakpoint
ALTER TABLE "legacy_issue_permits" ALTER COLUMN "permit_type" SET NOT NULL;--> statement-breakpoint
DROP TYPE "public"."legacy_issue_permit_work_order_type";--> statement-breakpoint
CREATE TYPE "public"."legacy_issue_permit_maintenance_order_type" AS ENUM('in_warranty_maintenance', 'out_of_warranty_maintenance', 'service_contract', 'sold_goods');--> statement-breakpoint
ALTER TABLE "legacy_issue_permits" ALTER COLUMN "maintenance_order_type" SET DATA TYPE "public"."legacy_issue_permit_maintenance_order_type" USING "maintenance_order_type"::"public"."legacy_issue_permit_maintenance_order_type";--> statement-breakpoint
ALTER TABLE "legacy_issue_permits" ADD CONSTRAINT "lip_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "legacy_issue_permit_permit_type_idx" ON "legacy_issue_permits" USING btree ("permit_type");--> statement-breakpoint
CREATE INDEX "legacy_issue_permit_customer_id_idx" ON "legacy_issue_permits" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "legacy_issue_permit_maintenance_order_type_idx" ON "legacy_issue_permits" USING btree ("maintenance_order_type");--> statement-breakpoint
ALTER TABLE "legacy_issue_permits" ADD CONSTRAINT "legacy_issue_permit_issue_order_pair" CHECK (("legacy_issue_permits"."issue_order_number" IS NULL) = ("legacy_issue_permits"."issue_order_date" IS NULL));--> statement-breakpoint
ALTER TABLE "legacy_issue_permits" ADD CONSTRAINT "legacy_issue_permit_contract_number_by_type" CHECK ("legacy_issue_permits"."contract_number" IS NULL OR "legacy_issue_permits"."permit_type" = 'contract_review');--> statement-breakpoint
ALTER TABLE "legacy_issue_permits" ADD CONSTRAINT "legacy_issue_permit_maintenance_fields_by_type" CHECK (("legacy_issue_permits"."maintenance_order_number" IS NULL AND "legacy_issue_permits"."maintenance_order_type" IS NULL) OR "legacy_issue_permits"."permit_type" = 'maintenance_order');--> statement-breakpoint
ALTER TABLE "legacy_issue_permits" ADD CONSTRAINT "legacy_issue_permit_customer_fields_by_type" CHECK ((
        "legacy_issue_permits"."customer_id" IS NULL
        AND "legacy_issue_permits"."has_multiple_customers" = false
      ) OR "legacy_issue_permits"."permit_type" IN ('contract_review', 'maintenance_order'));--> statement-breakpoint
ALTER TABLE "legacy_issue_permits" ADD CONSTRAINT "legacy_issue_permit_production_department_required" CHECK ("legacy_issue_permits"."permit_type" <> 'production_department' OR "legacy_issue_permits"."production_sub_department" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "legacy_issue_permits" ADD CONSTRAINT "legacy_issue_permit_multiple_customers_exclusive" CHECK ("legacy_issue_permits"."has_multiple_customers" = false OR (
        "legacy_issue_permits"."customer_id" IS NULL
        AND "legacy_issue_permits"."contract_number" IS NULL
        AND "legacy_issue_permits"."maintenance_order_number" IS NULL
      ));
