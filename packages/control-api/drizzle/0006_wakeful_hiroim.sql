ALTER TABLE "deployment" RENAME COLUMN "short_id" TO "reference";--> statement-breakpoint
ALTER TABLE "deployment" DROP CONSTRAINT "deployment_short_id_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "project_reference_idx" ON "deployment" USING btree ("project_id","reference");