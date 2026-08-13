ALTER TYPE "public"."permission" ADD VALUE 'add_legacy_inventory_transaction';--> statement-breakpoint
ALTER TYPE "public"."permission" ADD VALUE 'read_legacy_inventory_transactions';--> statement-breakpoint
ALTER TYPE "public"."permission" ADD VALUE 'update_legacy_inventory_transaction';--> statement-breakpoint
ALTER TABLE "legacy_inventory_transactions" ADD COLUMN "issue_order_date" timestamp with time zone NOT NULL;--> statement-breakpoint
CREATE INDEX "legacy_inv_tx_issue_order_date_idx" ON "legacy_inventory_transactions" USING btree ("issue_order_date");