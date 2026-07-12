ALTER TABLE "permissions" ALTER COLUMN "permission" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."permission";--> statement-breakpoint
CREATE TYPE "public"."permission" AS ENUM('add_user', 'read_users', 'update_user', 'delete_user', 'add_role', 'read_roles', 'update_role', 'delete_role', 'add_vendor', 'read_vendors', 'update_vendor', 'add_department', 'read_departments', 'update_department');--> statement-breakpoint
ALTER TABLE "permissions" ALTER COLUMN "permission" SET DATA TYPE "public"."permission" USING "permission"::"public"."permission";--> statement-breakpoint
ALTER TABLE "customer_addresses" ALTER COLUMN "address_line" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "vendor_addresses" ALTER COLUMN "address_line" DROP NOT NULL;