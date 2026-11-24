ALTER TYPE "public"."permission" ADD VALUE 'print_users_list' BEFORE 'update_user';--> statement-breakpoint
ALTER TYPE "public"."permission" ADD VALUE 'print_customers_list' BEFORE 'read_contracts';