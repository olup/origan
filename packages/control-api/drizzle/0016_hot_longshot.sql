CREATE TYPE "public"."deployment_status" AS ENUM('pending', 'building', 'deploying', 'success', 'error', 'canceled');--> statement-breakpoint
ALTER TABLE "build" DROP CONSTRAINT "build_deployment_id_deployment_id_fk";
--> statement-breakpoint
ALTER TABLE "deployment" ALTER COLUMN "config" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "deployment" ADD COLUMN "status" "deployment_status" DEFAULT 'pending' NOT NULL;--> statement-breakpoint

-- Set all existing deployments to 'success' status
UPDATE "deployment" SET "status" = 'success';--> statement-breakpoint

ALTER TABLE "deployment" ADD COLUMN "build_id" uuid;--> statement-breakpoint
ALTER TABLE "deployment" ADD CONSTRAINT "deployment_build_id_build_id_fk" FOREIGN KEY ("build_id") REFERENCES "public"."build"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

-- Migrate existing build.deployment_id to deployment.build_id
UPDATE "deployment"
SET "build_id" = "build"."id"
FROM "build"
WHERE "build"."deployment_id" = "deployment"."id";
--> statement-breakpoint

ALTER TABLE "build" DROP COLUMN "deployment_id";
