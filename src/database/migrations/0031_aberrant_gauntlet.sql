ALTER TYPE "public"."permission" ADD VALUE 'add_material_purchase_requisition' BEFORE 'add_legacy_issue_permit';--> statement-breakpoint
ALTER TYPE "public"."permission" ADD VALUE 'read_material_purchase_requisitions' BEFORE 'add_legacy_issue_permit';--> statement-breakpoint
ALTER TYPE "public"."permission" ADD VALUE 'update_material_purchase_requisition' BEFORE 'add_legacy_issue_permit';--> statement-breakpoint
ALTER TYPE "public"."permission" ADD VALUE 'cancel_material_purchase_requisition' BEFORE 'add_legacy_issue_permit';--> statement-breakpoint
ALTER TYPE "public"."permission" ADD VALUE 'approve_material_purchase_requisition_planning' BEFORE 'add_legacy_issue_permit';--> statement-breakpoint
ALTER TYPE "public"."permission" ADD VALUE 'approve_material_purchase_requisition_purchasing_manager' BEFORE 'add_legacy_issue_permit';--> statement-breakpoint
ALTER TYPE "public"."permission" ADD VALUE 'approve_material_purchase_requisition_director' BEFORE 'add_legacy_issue_permit';--> statement-breakpoint
ALTER TYPE "public"."permission" ADD VALUE 'reject_material_purchase_requisition' BEFORE 'add_legacy_issue_permit';