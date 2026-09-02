CREATE TABLE "material_purchase_order_item_requisition_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"material_purchase_order_item_id" uuid NOT NULL,
	"material_purchase_requisition_item_id" uuid NOT NULL,
	"quantity_allocated" numeric(18, 6) NOT NULL,
	CONSTRAINT "mpoirqi_mpoi_mprqi_unique" UNIQUE("material_purchase_order_item_id","material_purchase_requisition_item_id"),
	CONSTRAINT "mpoirqi_quantity_allocated_positive" CHECK ("material_purchase_order_item_requisition_items"."quantity_allocated" > 0)
);
--> statement-breakpoint
CREATE TABLE "material_purchase_requisition_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"material_purchase_requisition_id" uuid NOT NULL,
	"material_code" text NOT NULL,
	"quantity_requested" numeric(18, 6) NOT NULL,
	"notes" text,
	CONSTRAINT "mprqi_mprq_material_unique" UNIQUE("material_purchase_requisition_id","material_code"),
	CONSTRAINT "mprqi_quantity_requested_positive" CHECK ("material_purchase_requisition_items"."quantity_requested" > 0)
);
--> statement-breakpoint
CREATE TABLE "material_purchase_requisitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"production_sub_department" "production_sub_department" NOT NULL,
	"notes" text,
	"planning_approved_at" timestamp with time zone,
	"planning_approved_by" uuid,
	"purchasing_manager_approved_at" timestamp with time zone,
	"purchasing_manager_approved_by" uuid,
	"director_approved_at" timestamp with time zone,
	"director_approved_by" uuid,
	"rejected_at" timestamp with time zone,
	"rejected_by" uuid,
	"rejection_reason" text,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "material_purchase_requisitions_code_unique" UNIQUE("code"),
	CONSTRAINT "mprq_planning_approval_pair" CHECK (("material_purchase_requisitions"."planning_approved_at" IS NULL) = ("material_purchase_requisitions"."planning_approved_by" IS NULL)),
	CONSTRAINT "mprq_purchasing_manager_approval_pair" CHECK (("material_purchase_requisitions"."purchasing_manager_approved_at" IS NULL) = ("material_purchase_requisitions"."purchasing_manager_approved_by" IS NULL)),
	CONSTRAINT "mprq_director_approval_pair" CHECK (("material_purchase_requisitions"."director_approved_at" IS NULL) = ("material_purchase_requisitions"."director_approved_by" IS NULL)),
	CONSTRAINT "mprq_rejection_pair" CHECK (("material_purchase_requisitions"."rejected_at" IS NULL) = ("material_purchase_requisitions"."rejected_by" IS NULL)),
	CONSTRAINT "mprq_rejection_reason_required" CHECK (("material_purchase_requisitions"."rejected_at" IS NULL) = ("material_purchase_requisitions"."rejection_reason" IS NULL)),
	CONSTRAINT "mprq_cancelled_rejected_exclusive" CHECK ("material_purchase_requisitions"."cancelled_at" IS NULL OR "material_purchase_requisitions"."rejected_at" IS NULL)
);
--> statement-breakpoint
ALTER TABLE "material_purchase_order_item_requisition_items" ADD CONSTRAINT "mpoirqi_mpoi_id_fk" FOREIGN KEY ("material_purchase_order_item_id") REFERENCES "public"."material_purchase_order_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_purchase_order_item_requisition_items" ADD CONSTRAINT "mpoirqi_mprqi_id_fk" FOREIGN KEY ("material_purchase_requisition_item_id") REFERENCES "public"."material_purchase_requisition_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_purchase_requisition_items" ADD CONSTRAINT "mprqi_material_code_fk" FOREIGN KEY ("material_code") REFERENCES "public"."materials"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_purchase_requisition_items" ADD CONSTRAINT "mprqi_mprq_id_fk" FOREIGN KEY ("material_purchase_requisition_id") REFERENCES "public"."material_purchase_requisitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_purchase_requisitions" ADD CONSTRAINT "material_purchase_requisitions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_purchase_requisitions" ADD CONSTRAINT "mprq_planning_approved_by_fk" FOREIGN KEY ("planning_approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_purchase_requisitions" ADD CONSTRAINT "mprq_purchasing_manager_approved_by_fk" FOREIGN KEY ("purchasing_manager_approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_purchase_requisitions" ADD CONSTRAINT "mprq_director_approved_by_fk" FOREIGN KEY ("director_approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_purchase_requisitions" ADD CONSTRAINT "mprq_rejected_by_fk" FOREIGN KEY ("rejected_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mpoirqi_mpoi_id_idx" ON "material_purchase_order_item_requisition_items" USING btree ("material_purchase_order_item_id");--> statement-breakpoint
CREATE INDEX "mpoirqi_mprqi_id_idx" ON "material_purchase_order_item_requisition_items" USING btree ("material_purchase_requisition_item_id");--> statement-breakpoint
CREATE INDEX "mprqi_mprq_id_idx" ON "material_purchase_requisition_items" USING btree ("material_purchase_requisition_id");--> statement-breakpoint
CREATE INDEX "mprqi_material_code_idx" ON "material_purchase_requisition_items" USING btree ("material_code");--> statement-breakpoint
CREATE INDEX "mprq_production_sub_department_idx" ON "material_purchase_requisitions" USING btree ("production_sub_department");--> statement-breakpoint
CREATE INDEX "mprq_planning_approved_at_idx" ON "material_purchase_requisitions" USING btree ("planning_approved_at");--> statement-breakpoint
CREATE INDEX "mprq_purchasing_manager_approved_at_idx" ON "material_purchase_requisitions" USING btree ("purchasing_manager_approved_at");--> statement-breakpoint
CREATE INDEX "mprq_director_approved_at_idx" ON "material_purchase_requisitions" USING btree ("director_approved_at");--> statement-breakpoint
CREATE INDEX "mprq_rejected_at_idx" ON "material_purchase_requisitions" USING btree ("rejected_at");--> statement-breakpoint
CREATE INDEX "mprq_cancelled_at_idx" ON "material_purchase_requisitions" USING btree ("cancelled_at");--> statement-breakpoint
CREATE INDEX "mprq_created_at_idx" ON "material_purchase_requisitions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "mprq_created_by_idx" ON "material_purchase_requisitions" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "mprq_planning_approved_by_idx" ON "material_purchase_requisitions" USING btree ("planning_approved_by");--> statement-breakpoint
CREATE INDEX "mprq_purchasing_manager_approved_by_idx" ON "material_purchase_requisitions" USING btree ("purchasing_manager_approved_by");--> statement-breakpoint
CREATE INDEX "mprq_director_approved_by_idx" ON "material_purchase_requisitions" USING btree ("director_approved_by");--> statement-breakpoint
CREATE INDEX "mprq_rejected_by_idx" ON "material_purchase_requisitions" USING btree ("rejected_by");