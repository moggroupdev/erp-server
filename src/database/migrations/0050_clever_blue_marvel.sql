ALTER TABLE "users" ALTER COLUMN "password" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "is_login_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_login_enabled_check" CHECK ("users"."is_login_enabled" = false OR ("users"."password" IS NOT NULL AND ("users"."email" IS NOT NULL OR "users"."phone" IS NOT NULL)));