CREATE TYPE "public"."approval_decision" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
ALTER TABLE "material_purchase_requisitions" DROP CONSTRAINT "mprq_planning_approval_pair";--> statement-breakpoint
ALTER TABLE "material_purchase_requisitions" DROP CONSTRAINT "mprq_purchasing_manager_approval_pair";--> statement-breakpoint
ALTER TABLE "material_purchase_requisitions" DROP CONSTRAINT "mprq_director_approval_pair";--> statement-breakpoint
ALTER TABLE "material_purchase_requisitions" DROP CONSTRAINT "mprq_rejection_pair";--> statement-breakpoint
ALTER TABLE "material_purchase_requisitions" DROP CONSTRAINT "mprq_rejection_reason_required";--> statement-breakpoint
ALTER TABLE "material_purchase_requisitions" DROP CONSTRAINT "mprq_cancelled_rejected_exclusive";--> statement-breakpoint
ALTER TABLE "material_purchase_requisitions" DROP CONSTRAINT "mprq_planning_approved_by_fk";
--> statement-breakpoint
ALTER TABLE "material_purchase_requisitions" DROP CONSTRAINT "mprq_purchasing_manager_approved_by_fk";
--> statement-breakpoint
ALTER TABLE "material_purchase_requisitions" DROP CONSTRAINT "mprq_director_approved_by_fk";
--> statement-breakpoint
ALTER TABLE "material_purchase_requisitions" DROP CONSTRAINT "mprq_rejected_by_fk";
--> statement-breakpoint
ALTER TABLE "permissions" ALTER COLUMN "permission" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."permission";--> statement-breakpoint
CREATE TYPE "public"."permission" AS ENUM('add_user', 'read_users', 'lookup_users', 'update_user', 'delete_user', 'add_role', 'read_roles', 'update_role', 'delete_role', 'add_department', 'read_departments', 'update_department', 'add_supplier', 'read_suppliers', 'update_supplier', 'print_suppliers_list', 'add_customer', 'read_customers', 'update_customer', 'add_material', 'read_materials', 'update_material', 'print_materials_list', 'add_manufactured_material_bom', 'read_manufactured_material_boms', 'update_manufactured_material_bom', 'read_material_reports', 'read_material_purchasing_reports', 'add_product', 'read_products', 'update_product', 'print_products_list', 'add_product_bom', 'read_product_boms', 'update_product_bom', 'read_inventory_transactions', 'read_material_purchase_orders', 'add_material_purchase_requisition', 'read_material_purchase_requisitions', 'update_material_purchase_requisition', 'approve_material_purchase_requisition_planning', 'approve_material_purchase_requisition_purchasing_manager', 'approve_material_purchase_requisition_manager', 'add_legacy_issue_permit', 'read_legacy_issue_permits', 'update_legacy_issue_permit');--> statement-breakpoint
ALTER TABLE "permissions" ALTER COLUMN "permission" SET DATA TYPE "public"."permission" USING "permission"::"public"."permission";--> statement-breakpoint
DROP INDEX "mprq_planning_approved_at_idx";--> statement-breakpoint
DROP INDEX "mprq_purchasing_manager_approved_at_idx";--> statement-breakpoint
DROP INDEX "mprq_director_approved_at_idx";--> statement-breakpoint
DROP INDEX "mprq_rejected_at_idx";--> statement-breakpoint
DROP INDEX "mprq_cancelled_at_idx";--> statement-breakpoint
DROP INDEX "mprq_planning_approved_by_idx";--> statement-breakpoint
DROP INDEX "mprq_purchasing_manager_approved_by_idx";--> statement-breakpoint
DROP INDEX "mprq_director_approved_by_idx";--> statement-breakpoint
DROP INDEX "mprq_rejected_by_idx";--> statement-breakpoint
ALTER TABLE "material_purchase_requisitions" ADD COLUMN "planning_decision" "approval_decision" DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "material_purchase_requisitions" ADD COLUMN "planning_decided_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "material_purchase_requisitions" ADD COLUMN "planning_decided_by" uuid;--> statement-breakpoint
ALTER TABLE "material_purchase_requisitions" ADD COLUMN "planning_reason" text;--> statement-breakpoint
ALTER TABLE "material_purchase_requisitions" ADD COLUMN "purchasing_manager_decision" "approval_decision" DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "material_purchase_requisitions" ADD COLUMN "purchasing_manager_decided_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "material_purchase_requisitions" ADD COLUMN "purchasing_manager_decided_by" uuid;--> statement-breakpoint
ALTER TABLE "material_purchase_requisitions" ADD COLUMN "purchasing_manager_reason" text;--> statement-breakpoint
ALTER TABLE "material_purchase_requisitions" ADD COLUMN "manager_decision" "approval_decision" DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "material_purchase_requisitions" ADD COLUMN "manager_decided_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "material_purchase_requisitions" ADD COLUMN "manager_decided_by" uuid;--> statement-breakpoint
ALTER TABLE "material_purchase_requisitions" ADD COLUMN "manager_reason" text;--> statement-breakpoint
ALTER TABLE "material_purchase_requisitions" ADD CONSTRAINT "mprq_planning_decided_by_fk" FOREIGN KEY ("planning_decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_purchase_requisitions" ADD CONSTRAINT "mprq_purchasing_manager_decided_by_fk" FOREIGN KEY ("purchasing_manager_decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_purchase_requisitions" ADD CONSTRAINT "mprq_manager_decided_by_fk" FOREIGN KEY ("manager_decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mprq_planning_decision_idx" ON "material_purchase_requisitions" USING btree ("planning_decision");--> statement-breakpoint
CREATE INDEX "mprq_planning_decided_at_idx" ON "material_purchase_requisitions" USING btree ("planning_decided_at");--> statement-breakpoint
CREATE INDEX "mprq_planning_decided_by_idx" ON "material_purchase_requisitions" USING btree ("planning_decided_by");--> statement-breakpoint
CREATE INDEX "mprq_purchasing_manager_decision_idx" ON "material_purchase_requisitions" USING btree ("purchasing_manager_decision");--> statement-breakpoint
CREATE INDEX "mprq_purchasing_manager_decided_at_idx" ON "material_purchase_requisitions" USING btree ("purchasing_manager_decided_at");--> statement-breakpoint
CREATE INDEX "mprq_purchasing_manager_decided_by_idx" ON "material_purchase_requisitions" USING btree ("purchasing_manager_decided_by");--> statement-breakpoint
CREATE INDEX "mprq_manager_decision_idx" ON "material_purchase_requisitions" USING btree ("manager_decision");--> statement-breakpoint
CREATE INDEX "mprq_manager_decided_at_idx" ON "material_purchase_requisitions" USING btree ("manager_decided_at");--> statement-breakpoint
CREATE INDEX "mprq_manager_decided_by_idx" ON "material_purchase_requisitions" USING btree ("manager_decided_by");--> statement-breakpoint
ALTER TABLE "material_purchase_requisitions" DROP COLUMN "planning_approved_at";--> statement-breakpoint
ALTER TABLE "material_purchase_requisitions" DROP COLUMN "planning_approved_by";--> statement-breakpoint
ALTER TABLE "material_purchase_requisitions" DROP COLUMN "purchasing_manager_approved_at";--> statement-breakpoint
ALTER TABLE "material_purchase_requisitions" DROP COLUMN "purchasing_manager_approved_by";--> statement-breakpoint
ALTER TABLE "material_purchase_requisitions" DROP COLUMN "director_approved_at";--> statement-breakpoint
ALTER TABLE "material_purchase_requisitions" DROP COLUMN "director_approved_by";--> statement-breakpoint
ALTER TABLE "material_purchase_requisitions" DROP COLUMN "rejected_at";--> statement-breakpoint
ALTER TABLE "material_purchase_requisitions" DROP COLUMN "rejected_by";--> statement-breakpoint
ALTER TABLE "material_purchase_requisitions" DROP COLUMN "rejection_reason";--> statement-breakpoint
ALTER TABLE "material_purchase_requisitions" DROP COLUMN "cancelled_at";--> statement-breakpoint
ALTER TABLE "material_purchase_requisitions" ADD CONSTRAINT "mprq_planning_pending_pair" CHECK (("material_purchase_requisitions"."planning_decision" = 'pending') = ("material_purchase_requisitions"."planning_decided_at" IS NULL) AND ("material_purchase_requisitions"."planning_decision" = 'pending') = ("material_purchase_requisitions"."planning_decided_by" IS NULL));--> statement-breakpoint
ALTER TABLE "material_purchase_requisitions" ADD CONSTRAINT "mprq_planning_reason_required" CHECK (("material_purchase_requisitions"."planning_decision" = 'rejected') = ("material_purchase_requisitions"."planning_reason" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "material_purchase_requisitions" ADD CONSTRAINT "mprq_purchasing_manager_pending_pair" CHECK (("material_purchase_requisitions"."purchasing_manager_decision" = 'pending') = ("material_purchase_requisitions"."purchasing_manager_decided_at" IS NULL) AND ("material_purchase_requisitions"."purchasing_manager_decision" = 'pending') = ("material_purchase_requisitions"."purchasing_manager_decided_by" IS NULL));--> statement-breakpoint
ALTER TABLE "material_purchase_requisitions" ADD CONSTRAINT "mprq_purchasing_manager_reason_required" CHECK (("material_purchase_requisitions"."purchasing_manager_decision" = 'rejected') = ("material_purchase_requisitions"."purchasing_manager_reason" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "material_purchase_requisitions" ADD CONSTRAINT "mprq_manager_pending_pair" CHECK (("material_purchase_requisitions"."manager_decision" = 'pending') = ("material_purchase_requisitions"."manager_decided_at" IS NULL) AND ("material_purchase_requisitions"."manager_decision" = 'pending') = ("material_purchase_requisitions"."manager_decided_by" IS NULL));--> statement-breakpoint
ALTER TABLE "material_purchase_requisitions" ADD CONSTRAINT "mprq_manager_reason_required" CHECK (("material_purchase_requisitions"."manager_decision" = 'rejected') = ("material_purchase_requisitions"."manager_reason" IS NOT NULL));