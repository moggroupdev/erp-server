CREATE TYPE "public"."mpo_delivery_location" AS ENUM('our_10th_ramadan_factories', 'supplier_warehouses');--> statement-breakpoint
CREATE TYPE "public"."mpo_delivery_timing" AS ENUM('immediate', 'within_days');--> statement-breakpoint
CREATE TYPE "public"."mpo_payment_event" AS ENUM('advance', 'on_receipt', 'after_receipt', 'after_invoice');--> statement-breakpoint
CREATE TYPE "public"."mpo_payment_value_kind" AS ENUM('percentage', 'fixed_amount', 'remainder');--> statement-breakpoint
CREATE TABLE "material_purchase_order_payment_terms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"material_purchase_order_id" uuid NOT NULL,
	"sequence_order" integer NOT NULL,
	"event" "mpo_payment_event" NOT NULL,
	"offset_days" integer,
	"value_kind" "mpo_payment_value_kind" NOT NULL,
	"value" numeric(18, 6),
	CONSTRAINT "mpopt_mpo_sequence_unique" UNIQUE("material_purchase_order_id","sequence_order"),
	CONSTRAINT "mpopt_sequence_order_positive" CHECK ("material_purchase_order_payment_terms"."sequence_order" > 0),
	CONSTRAINT "mpopt_offset_days" CHECK ((
        "material_purchase_order_payment_terms"."event" IN ('advance', 'on_receipt') AND "material_purchase_order_payment_terms"."offset_days" IS NULL
      ) OR (
        "material_purchase_order_payment_terms"."event" IN ('after_receipt', 'after_invoice') AND "material_purchase_order_payment_terms"."offset_days" > 0
      )),
	CONSTRAINT "mpopt_value" CHECK ((
        "material_purchase_order_payment_terms"."value_kind" = 'remainder' AND "material_purchase_order_payment_terms"."value" IS NULL
      ) OR (
        "material_purchase_order_payment_terms"."value_kind" = 'percentage' AND "material_purchase_order_payment_terms"."value" > 0 AND "material_purchase_order_payment_terms"."value" <= 100
      ) OR (
        "material_purchase_order_payment_terms"."value_kind" = 'fixed_amount' AND "material_purchase_order_payment_terms"."value" > 0
      ))
);
--> statement-breakpoint
ALTER TABLE "material_purchase_orders" ADD COLUMN "delivery_location" "mpo_delivery_location";--> statement-breakpoint
ALTER TABLE "material_purchase_orders" ADD COLUMN "delivery_timing" "mpo_delivery_timing";--> statement-breakpoint
ALTER TABLE "material_purchase_orders" ADD COLUMN "delivery_period_days" integer;--> statement-breakpoint
ALTER TABLE "material_purchase_order_payment_terms" ADD CONSTRAINT "mpopt_mpo_id_fk" FOREIGN KEY ("material_purchase_order_id") REFERENCES "public"."material_purchase_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mpopt_mpo_id_idx" ON "material_purchase_order_payment_terms" USING btree ("material_purchase_order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "mpopt_one_advance" ON "material_purchase_order_payment_terms" USING btree ("material_purchase_order_id") WHERE "material_purchase_order_payment_terms"."event" = 'advance';--> statement-breakpoint
CREATE UNIQUE INDEX "mpopt_one_on_receipt" ON "material_purchase_order_payment_terms" USING btree ("material_purchase_order_id") WHERE "material_purchase_order_payment_terms"."event" = 'on_receipt';--> statement-breakpoint
CREATE UNIQUE INDEX "mpopt_one_remainder" ON "material_purchase_order_payment_terms" USING btree ("material_purchase_order_id") WHERE "material_purchase_order_payment_terms"."value_kind" = 'remainder';--> statement-breakpoint
CREATE UNIQUE INDEX "mpopt_after_receipt_offset_unique" ON "material_purchase_order_payment_terms" USING btree ("material_purchase_order_id","offset_days") WHERE "material_purchase_order_payment_terms"."event" = 'after_receipt';--> statement-breakpoint
CREATE UNIQUE INDEX "mpopt_after_invoice_offset_unique" ON "material_purchase_order_payment_terms" USING btree ("material_purchase_order_id","offset_days") WHERE "material_purchase_order_payment_terms"."event" = 'after_invoice';--> statement-breakpoint
ALTER TABLE "material_purchase_orders" ADD CONSTRAINT "mpo_delivery_terms_all_or_nothing" CHECK ((
        "material_purchase_orders"."delivery_location" IS NULL
        AND "material_purchase_orders"."delivery_timing" IS NULL
        AND "material_purchase_orders"."delivery_period_days" IS NULL
      ) OR (
        "material_purchase_orders"."delivery_location" IS NOT NULL
        AND "material_purchase_orders"."delivery_timing" IS NOT NULL
      ));--> statement-breakpoint
ALTER TABLE "material_purchase_orders" ADD CONSTRAINT "mpo_delivery_period_days" CHECK ((
        "material_purchase_orders"."delivery_timing" IS NULL AND "material_purchase_orders"."delivery_period_days" IS NULL
      ) OR (
        "material_purchase_orders"."delivery_timing" = 'immediate' AND "material_purchase_orders"."delivery_period_days" IS NULL
      ) OR (
        "material_purchase_orders"."delivery_timing" = 'within_days' AND "material_purchase_orders"."delivery_period_days" > 0
      ));