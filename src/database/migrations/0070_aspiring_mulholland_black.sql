ALTER TYPE "public"."permission" ADD VALUE 'add_request_for_quotation' BEFORE 'add_legacy_issue_permit';--> statement-breakpoint
ALTER TYPE "public"."permission" ADD VALUE 'read_request_for_quotations' BEFORE 'add_legacy_issue_permit';--> statement-breakpoint
ALTER TYPE "public"."permission" ADD VALUE 'update_request_for_quotation' BEFORE 'add_legacy_issue_permit';--> statement-breakpoint
ALTER TABLE "request_for_quotations" DROP CONSTRAINT "rfq_deadline_required_when_issued";--> statement-breakpoint
ALTER TABLE "request_for_quotations" DROP CONSTRAINT "rfq_closed_requires_issued";--> statement-breakpoint
ALTER TABLE "supplier_quotations" DROP CONSTRAINT "sq_submitted_declined_exclusive";--> statement-breakpoint
ALTER TABLE "supplier_quotations" DROP CONSTRAINT "sq_declined_clears_commercial";--> statement-breakpoint
ALTER TABLE "supplier_quotations" DROP CONSTRAINT "sq_submitted_requires_commercial";--> statement-breakpoint
DROP INDEX "rfq_response_deadline_idx";--> statement-breakpoint
DROP INDEX "rfq_issued_at_idx";--> statement-breakpoint
DROP INDEX "sq_submitted_at_idx";--> statement-breakpoint
DROP INDEX "sq_declined_at_idx";--> statement-breakpoint
ALTER TABLE "request_for_quotations" DROP COLUMN "response_deadline";--> statement-breakpoint
ALTER TABLE "request_for_quotations" DROP COLUMN "issued_at";--> statement-breakpoint
ALTER TABLE "request_for_quotations" DROP COLUMN "updated_at";--> statement-breakpoint
ALTER TABLE "supplier_quotations" DROP COLUMN "submitted_at";--> statement-breakpoint
ALTER TABLE "supplier_quotations" DROP COLUMN "declined_at";--> statement-breakpoint
ALTER TABLE "supplier_quotations" DROP COLUMN "updated_at";