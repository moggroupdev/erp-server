CREATE TABLE "request_for_quotation_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_for_quotation_id" uuid NOT NULL,
	"material_code" text NOT NULL,
	"unit_of_measurement_selected" "material_unit" NOT NULL,
	"quantity_requested" numeric(18, 6) NOT NULL,
	"notes" text,
	CONSTRAINT "rfqi_rfq_material_unique" UNIQUE("request_for_quotation_id","material_code"),
	CONSTRAINT "rfqi_id_rfq_id_unique" UNIQUE("id","request_for_quotation_id"),
	CONSTRAINT "rfqi_id_material_unique" UNIQUE("id","material_code"),
	CONSTRAINT "rfqi_quantity_requested_positive" CHECK ("request_for_quotation_items"."quantity_requested" > 0)
);
--> statement-breakpoint
CREATE TABLE "request_for_quotations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"response_deadline" timestamp with time zone,
	"notes" text,
	"issued_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	CONSTRAINT "request_for_quotations_code_unique" UNIQUE("code"),
	CONSTRAINT "rfq_deadline_required_when_issued" CHECK ("request_for_quotations"."issued_at" IS NULL OR "request_for_quotations"."response_deadline" IS NOT NULL),
	CONSTRAINT "rfq_closed_requires_issued" CHECK ("request_for_quotations"."closed_at" IS NULL OR "request_for_quotations"."issued_at" IS NOT NULL),
	CONSTRAINT "rfq_closed_cancelled_exclusive" CHECK ("request_for_quotations"."closed_at" IS NULL OR "request_for_quotations"."cancelled_at" IS NULL)
);
--> statement-breakpoint
CREATE TABLE "supplier_quotation_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier_quotation_id" uuid NOT NULL,
	"request_for_quotation_item_id" uuid NOT NULL,
	"request_for_quotation_id" uuid NOT NULL,
	"material_code" text NOT NULL,
	"unit_of_measurement_selected" "material_unit" NOT NULL,
	"unit_price" numeric(18, 6) NOT NULL,
	"notes" text,
	CONSTRAINT "sqi_sq_rfqi_unique" UNIQUE("supplier_quotation_id","request_for_quotation_item_id"),
	CONSTRAINT "sqi_id_material_unique" UNIQUE("id","material_code"),
	CONSTRAINT "sqi_unit_price_positive" CHECK ("supplier_quotation_items"."unit_price" > 0)
);
--> statement-breakpoint
CREATE TABLE "supplier_quotations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_for_quotation_id" uuid NOT NULL,
	"supplier_id" uuid NOT NULL,
	"payment_terms" text,
	"delivery_terms" text,
	"delivery_period_days" integer,
	"valid_until" timestamp with time zone,
	"submitted_at" timestamp with time zone,
	"declined_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	CONSTRAINT "sq_rfq_supplier_unique" UNIQUE("request_for_quotation_id","supplier_id"),
	CONSTRAINT "sq_id_rfq_id_unique" UNIQUE("id","request_for_quotation_id"),
	CONSTRAINT "sq_id_supplier_id_unique" UNIQUE("id","supplier_id"),
	CONSTRAINT "sq_submitted_declined_exclusive" CHECK ("supplier_quotations"."submitted_at" IS NULL OR "supplier_quotations"."declined_at" IS NULL),
	CONSTRAINT "sq_declined_clears_commercial" CHECK ("supplier_quotations"."declined_at" IS NULL OR (
        "supplier_quotations"."payment_terms" IS NULL
        AND "supplier_quotations"."delivery_terms" IS NULL
        AND "supplier_quotations"."delivery_period_days" IS NULL
        AND "supplier_quotations"."valid_until" IS NULL
      )),
	CONSTRAINT "sq_submitted_requires_commercial" CHECK ("supplier_quotations"."submitted_at" IS NULL OR (
        "supplier_quotations"."valid_until" IS NOT NULL
        AND "supplier_quotations"."delivery_period_days" IS NOT NULL
      )),
	CONSTRAINT "sq_delivery_period_days_positive" CHECK ("supplier_quotations"."delivery_period_days" IS NULL OR "supplier_quotations"."delivery_period_days" > 0)
);
--> statement-breakpoint
ALTER TABLE "material_purchase_order_items" ADD COLUMN "supplier_quotation_item_id" uuid;--> statement-breakpoint
ALTER TABLE "request_for_quotation_items" ADD CONSTRAINT "rfqi_rfq_id_fk" FOREIGN KEY ("request_for_quotation_id") REFERENCES "public"."request_for_quotations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_for_quotation_items" ADD CONSTRAINT "rfqi_material_code_fk" FOREIGN KEY ("material_code") REFERENCES "public"."materials"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_for_quotations" ADD CONSTRAINT "request_for_quotations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_quotation_items" ADD CONSTRAINT "sqi_sq_rfq_fk" FOREIGN KEY ("supplier_quotation_id","request_for_quotation_id") REFERENCES "public"."supplier_quotations"("id","request_for_quotation_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_quotation_items" ADD CONSTRAINT "sqi_rfqi_rfq_fk" FOREIGN KEY ("request_for_quotation_item_id","request_for_quotation_id") REFERENCES "public"."request_for_quotation_items"("id","request_for_quotation_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_quotation_items" ADD CONSTRAINT "sqi_rfqi_material_fk" FOREIGN KEY ("request_for_quotation_item_id","material_code") REFERENCES "public"."request_for_quotation_items"("id","material_code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_quotations" ADD CONSTRAINT "supplier_quotations_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_quotations" ADD CONSTRAINT "supplier_quotations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_quotations" ADD CONSTRAINT "sq_rfq_id_fk" FOREIGN KEY ("request_for_quotation_id") REFERENCES "public"."request_for_quotations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rfqi_rfq_id_idx" ON "request_for_quotation_items" USING btree ("request_for_quotation_id");--> statement-breakpoint
CREATE INDEX "rfqi_material_code_idx" ON "request_for_quotation_items" USING btree ("material_code");--> statement-breakpoint
CREATE INDEX "rfq_response_deadline_idx" ON "request_for_quotations" USING btree ("response_deadline");--> statement-breakpoint
CREATE INDEX "rfq_issued_at_idx" ON "request_for_quotations" USING btree ("issued_at");--> statement-breakpoint
CREATE INDEX "rfq_closed_at_idx" ON "request_for_quotations" USING btree ("closed_at");--> statement-breakpoint
CREATE INDEX "rfq_cancelled_at_idx" ON "request_for_quotations" USING btree ("cancelled_at");--> statement-breakpoint
CREATE INDEX "rfq_created_at_idx" ON "request_for_quotations" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "rfq_created_by_idx" ON "request_for_quotations" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "sqi_sq_id_idx" ON "supplier_quotation_items" USING btree ("supplier_quotation_id");--> statement-breakpoint
CREATE INDEX "sqi_rfqi_id_idx" ON "supplier_quotation_items" USING btree ("request_for_quotation_item_id");--> statement-breakpoint
CREATE INDEX "sqi_rfq_id_idx" ON "supplier_quotation_items" USING btree ("request_for_quotation_id");--> statement-breakpoint
CREATE INDEX "sqi_material_code_idx" ON "supplier_quotation_items" USING btree ("material_code");--> statement-breakpoint
CREATE INDEX "sq_rfq_id_idx" ON "supplier_quotations" USING btree ("request_for_quotation_id");--> statement-breakpoint
CREATE INDEX "sq_supplier_id_idx" ON "supplier_quotations" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "sq_submitted_at_idx" ON "supplier_quotations" USING btree ("submitted_at");--> statement-breakpoint
CREATE INDEX "sq_declined_at_idx" ON "supplier_quotations" USING btree ("declined_at");--> statement-breakpoint
CREATE INDEX "sq_valid_until_idx" ON "supplier_quotations" USING btree ("valid_until");--> statement-breakpoint
CREATE INDEX "sq_created_at_idx" ON "supplier_quotations" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "sq_created_by_idx" ON "supplier_quotations" USING btree ("created_by");--> statement-breakpoint
ALTER TABLE "material_purchase_order_items" ADD CONSTRAINT "mpoi_sqi_material_fk" FOREIGN KEY ("supplier_quotation_item_id","material_code") REFERENCES "public"."supplier_quotation_items"("id","material_code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mpoi_sqi_id_idx" ON "material_purchase_order_items" USING btree ("supplier_quotation_item_id");