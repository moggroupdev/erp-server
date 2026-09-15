CREATE TYPE "public"."audit_action" AS ENUM('insert', 'update', 'delete');--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"table_name" text NOT NULL,
	"record_id" text NOT NULL,
	"action" "audit_action" NOT NULL,
	"old_row" jsonb,
	"new_row" jsonb,
	"changed_columns" text[],
	"actor_user_id" uuid,
	"actor_name" text,
	"actor_is_admin" boolean,
	"actor_role_id" uuid,
	"actor_department_id" uuid,
	"operation_id" uuid,
	"ip_address" varchar(45),
	"user_agent" text,
	"parent_table_name" text,
	"parent_record_id" text,
	"root_table_name" text,
	"root_record_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "al_action_snapshots" CHECK ((
        ("audit_logs"."action" = 'insert' AND "audit_logs"."old_row" IS NULL AND "audit_logs"."new_row" IS NOT NULL AND "audit_logs"."changed_columns" IS NULL)
        OR ("audit_logs"."action" = 'delete' AND "audit_logs"."old_row" IS NOT NULL AND "audit_logs"."new_row" IS NULL AND "audit_logs"."changed_columns" IS NULL)
        OR (
          "audit_logs"."action" = 'update'
          AND "audit_logs"."old_row" IS NOT NULL
          AND "audit_logs"."new_row" IS NOT NULL
          AND "audit_logs"."changed_columns" IS NOT NULL
          AND cardinality("audit_logs"."changed_columns") > 0
        )
      )),
	CONSTRAINT "al_parent_pair" CHECK (("audit_logs"."parent_table_name" IS NULL) = ("audit_logs"."parent_record_id" IS NULL)),
	CONSTRAINT "al_root_pair" CHECK (("audit_logs"."root_table_name" IS NULL) = ("audit_logs"."root_record_id" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "al_table_record_created_idx" ON "audit_logs" USING btree ("table_name","record_id","created_at");--> statement-breakpoint
CREATE INDEX "al_actor_created_idx" ON "audit_logs" USING btree ("actor_user_id","created_at");--> statement-breakpoint
CREATE INDEX "al_created_at_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "al_parent_created_idx" ON "audit_logs" USING btree ("parent_table_name","parent_record_id","created_at");--> statement-breakpoint
CREATE INDEX "al_root_created_idx" ON "audit_logs" USING btree ("root_table_name","root_record_id","created_at");--> statement-breakpoint
CREATE INDEX "al_operation_id_idx" ON "audit_logs" USING btree ("operation_id");