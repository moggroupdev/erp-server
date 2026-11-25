ALTER TABLE "legacy_issue_permits" DROP CONSTRAINT "legacy_issue_permits_issue_permit_number_unique";--> statement-breakpoint
ALTER TABLE "legacy_issue_permits" ADD COLUMN "is_sst" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "lip_number_normal_uidx" ON "legacy_issue_permits" USING btree ("issue_permit_number") WHERE "legacy_issue_permits"."is_sst" = false;--> statement-breakpoint
CREATE UNIQUE INDEX "lip_number_sst_uidx" ON "legacy_issue_permits" USING btree ("issue_permit_number") WHERE "legacy_issue_permits"."is_sst" = true;