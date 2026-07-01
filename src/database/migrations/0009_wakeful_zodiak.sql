CREATE TYPE "public"."production_sub_department" AS ENUM('cutting', 'bending', 'refrigeration', 'electricity', 'gas', 'injection', 'sheet_metal_neutral', 'sheet_metal_cold', 'sheet_metal_hot', 'blacksmithing');--> statement-breakpoint
CREATE TABLE "production_sub_department_managers" (
	"sub_department" "production_sub_department" PRIMARY KEY NOT NULL,
	"manager_id" uuid,
	"deputy_manager_id" uuid,
	CONSTRAINT "psdm_manager_deputy_distinct" CHECK ("production_sub_department_managers"."manager_id" IS NULL OR "production_sub_department_managers"."deputy_manager_id" IS NULL OR "production_sub_department_managers"."manager_id" <> "production_sub_department_managers"."deputy_manager_id")
);
--> statement-breakpoint
CREATE TABLE "product_production_routes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_code" text NOT NULL,
	"sub_department" "production_sub_department" NOT NULL,
	"sequence_order" integer NOT NULL,
	"completion_percentage" numeric(15, 3) NOT NULL,
	CONSTRAINT "product_production_routes_product_sub_dept_unique" UNIQUE("product_code","sub_department"),
	CONSTRAINT "product_production_routes_product_sequence_unique" UNIQUE("product_code","sequence_order"),
	CONSTRAINT "product_production_routes_sequence_order_positive" CHECK ("product_production_routes"."sequence_order" > 0),
	CONSTRAINT "product_production_routes_completion_percentage_range" CHECK ("product_production_routes"."completion_percentage" > 0 AND "product_production_routes"."completion_percentage" <= 100)
);
--> statement-breakpoint
ALTER TABLE "production_plan_items" DROP CONSTRAINT "production_plan_items_plan_unit_dept_unique";--> statement-breakpoint
ALTER TABLE "production_plan_items" DROP CONSTRAINT "ppi_prod_dept_id_fk";
--> statement-breakpoint
DROP INDEX "production_plan_items_production_department_id_idx";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "production_sub_department" "production_sub_department";--> statement-breakpoint
ALTER TABLE "production_plan_items" ADD COLUMN "production_stage" "production_sub_department" NOT NULL;--> statement-breakpoint
ALTER TABLE "production_sub_department_managers" ADD CONSTRAINT "psdm_manager_id_fk" FOREIGN KEY ("manager_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_sub_department_managers" ADD CONSTRAINT "psdm_deputy_manager_id_fk" FOREIGN KEY ("deputy_manager_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_production_routes" ADD CONSTRAINT "product_production_routes_product_code_products_code_fk" FOREIGN KEY ("product_code") REFERENCES "public"."products"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "psdm_manager_id_idx" ON "production_sub_department_managers" USING btree ("manager_id");--> statement-breakpoint
CREATE INDEX "psdm_deputy_manager_id_idx" ON "production_sub_department_managers" USING btree ("deputy_manager_id");--> statement-breakpoint
CREATE INDEX "product_production_routes_product_code_idx" ON "product_production_routes" USING btree ("product_code");--> statement-breakpoint
CREATE INDEX "users_production_sub_department_idx" ON "users" USING btree ("production_sub_department");--> statement-breakpoint
CREATE INDEX "production_plan_items_production_stage_idx" ON "production_plan_items" USING btree ("production_stage");--> statement-breakpoint
ALTER TABLE "production_plan_items" DROP COLUMN "production_department_id";--> statement-breakpoint
ALTER TABLE "production_plan_items" ADD CONSTRAINT "production_plan_items_plan_unit_stage_unique" UNIQUE("plan_id","product_unit_id","production_stage");