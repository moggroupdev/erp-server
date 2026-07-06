CREATE TYPE "public"."negotiation_party" AS ENUM('customer', 'company');--> statement-breakpoint
CREATE TABLE "offer_negotiations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"offer_id" uuid NOT NULL,
	"party" "negotiation_party" NOT NULL,
	"discount_pct" numeric(5, 2) NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "offer_negotiations_discount_pct_check" CHECK ("offer_negotiations"."discount_pct" >= 0 AND "offer_negotiations"."discount_pct" <= 100)
);
--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN "discount_pct" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "offers" ADD COLUMN "discount_pct" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "offer_negotiations" ADD CONSTRAINT "offer_negotiations_offer_id_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."offers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_negotiations" ADD CONSTRAINT "offer_negotiations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "offer_negotiations_offer_id_idx" ON "offer_negotiations" USING btree ("offer_id");--> statement-breakpoint
CREATE INDEX "offer_negotiations_created_by_idx" ON "offer_negotiations" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "offer_negotiations_created_at_idx" ON "offer_negotiations" USING btree ("created_at");--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_discount_pct_check" CHECK ("contracts"."discount_pct" IS NULL OR ("contracts"."discount_pct" >= 0 AND "contracts"."discount_pct" <= 100));--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_discount_pct_check" CHECK ("offers"."discount_pct" IS NULL OR ("offers"."discount_pct" >= 0 AND "offers"."discount_pct" <= 100));