ALTER TABLE "contracts" ALTER COLUMN "inquiry_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "contracts" ALTER COLUMN "delivery_address_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN "legacy_number" text;--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN "legacy_work_order_number" text;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_legacy_number_unique" UNIQUE("legacy_number");--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_legacy_work_order_number_unique" UNIQUE("legacy_work_order_number");--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_null_inquiry_no_preview_offer" CHECK ("contracts"."inquiry_id" IS NOT NULL OR ("contracts"."preview_id" IS NULL AND "contracts"."offer_id" IS NULL));--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_legacy_number_nonblank" CHECK ("contracts"."legacy_number" IS NULL OR length(btrim("contracts"."legacy_number")) > 0);--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_legacy_wo_number_nonblank" CHECK ("contracts"."legacy_work_order_number" IS NULL OR length(btrim("contracts"."legacy_work_order_number")) > 0);