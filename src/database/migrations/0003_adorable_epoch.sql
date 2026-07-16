ALTER TABLE "roles" ADD COLUMN "home_url" text;--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_home_url_check" CHECK ("roles"."home_url" IS NULL OR "roles"."home_url" ~ '^/');