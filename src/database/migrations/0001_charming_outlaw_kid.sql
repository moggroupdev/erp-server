ALTER TABLE "product_production_routes" RENAME COLUMN "sub_department" TO "production_department";--> statement-breakpoint
ALTER TABLE "product_production_routes" DROP CONSTRAINT "product_production_routes_product_sub_dept_unique";--> statement-breakpoint
ALTER TABLE "product_production_routes" ALTER COLUMN "completion_percentage" SET DATA TYPE numeric(5, 2);--> statement-breakpoint
ALTER TABLE "roles" ADD COLUMN "max_discount_pct" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "roles" ADD COLUMN "department_id" uuid;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "pricing_factor" numeric(15, 3) NOT NULL;--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "roles_department_id_idx" ON "roles" USING btree ("department_id");--> statement-breakpoint
ALTER TABLE "product_production_routes" ADD CONSTRAINT "product_production_routes_product_production_dept_unique" UNIQUE("product_code","production_department");--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_max_discount_pct_check" CHECK ("roles"."max_discount_pct" IS NULL OR ("roles"."max_discount_pct" >= 0 AND "roles"."max_discount_pct" <= 100));--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_pricing_factor_positive" CHECK ("products"."pricing_factor" > 0);