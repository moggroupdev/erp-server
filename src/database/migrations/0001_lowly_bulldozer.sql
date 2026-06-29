ALTER TABLE "contract_items" ADD COLUMN "created_by" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "contract_items" ADD COLUMN "cancelled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "contract_items" ADD COLUMN "cancelled_by" uuid;--> statement-breakpoint
ALTER TABLE "contract_items" ADD COLUMN "cancellation_reason" text;--> statement-breakpoint
ALTER TABLE "contract_items" ADD COLUMN "previous_version_id" uuid;--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN "cancelled_by" uuid;--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN "cancellation_reason" text;--> statement-breakpoint
ALTER TABLE "production_plan_items" ADD COLUMN "cancelled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "product_units" ADD COLUMN "cancelled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "contract_items" ADD CONSTRAINT "contract_items_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_items" ADD CONSTRAINT "contract_items_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_items" ADD CONSTRAINT "contract_items_previous_version_id_contract_items_id_fk" FOREIGN KEY ("previous_version_id") REFERENCES "public"."contract_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contract_items_created_by_idx" ON "contract_items" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "contract_items_cancelled_at_idx" ON "contract_items" USING btree ("cancelled_at");--> statement-breakpoint
CREATE INDEX "contract_items_previous_version_id_idx" ON "contract_items" USING btree ("previous_version_id");--> statement-breakpoint
CREATE INDEX "production_plan_items_cancelled_at_idx" ON "production_plan_items" USING btree ("cancelled_at");--> statement-breakpoint
CREATE INDEX "product_units_cancelled_at_idx" ON "product_units" USING btree ("cancelled_at");--> statement-breakpoint
ALTER TABLE "production_plan_items" ADD CONSTRAINT "production_plan_items_completed_cancelled_exclusive" CHECK ("production_plan_items"."completed_at" IS NULL OR "production_plan_items"."cancelled_at" IS NULL);