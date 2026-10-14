ALTER TYPE "public"."legacy_issue_permit_work_order_type" ADD VALUE 'sold_goods';--> statement-breakpoint
ALTER TYPE "public"."permission" ADD VALUE 'read_contracts' BEFORE 'add_material';