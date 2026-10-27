ALTER TABLE "contract_items" DROP CONSTRAINT "contract_items_unit_price_positive";--> statement-breakpoint
ALTER TABLE "contracts" DROP CONSTRAINT "contracts_total_amount_non_negative";--> statement-breakpoint
ALTER TABLE "contract_items" ALTER COLUMN "unit_price" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "contracts" ALTER COLUMN "total_amount" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "contract_items" ADD CONSTRAINT "contract_items_unit_price_positive" CHECK ("contract_items"."unit_price" IS NULL OR "contract_items"."unit_price" > 0);--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_total_amount_non_negative" CHECK ("contracts"."total_amount" IS NULL OR "contracts"."total_amount" >= 0);