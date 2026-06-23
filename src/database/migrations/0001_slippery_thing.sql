ALTER TABLE "role_permissions" RENAME TO "permissions";--> statement-breakpoint
ALTER TABLE "permissions" DROP CONSTRAINT "role_permissions_role_id_roles_id_fk";
--> statement-breakpoint
ALTER TABLE "permissions" DROP CONSTRAINT "role_permissions_role_id_permission_pk";--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "password" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "permissions" ADD CONSTRAINT "permissions_role_id_permission_pk" PRIMARY KEY("role_id","permission");--> statement-breakpoint
ALTER TABLE "permissions" ADD CONSTRAINT "permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;