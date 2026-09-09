ALTER TYPE "public"."permission" ADD VALUE 'read_production_department_managers' BEFORE 'add_supplier';--> statement-breakpoint
ALTER TYPE "public"."permission" ADD VALUE 'update_production_department_managers' BEFORE 'add_supplier';--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_login_enabled_check";--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_login_enabled_check" CHECK ((
        ("users"."is_login_enabled" = true AND "users"."password" IS NOT NULL AND ("users"."email" IS NOT NULL OR "users"."phone" IS NOT NULL))
        OR
        ("users"."is_login_enabled" = false AND "users"."password" IS NULL)
      ));