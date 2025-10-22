CREATE TYPE "public"."deployment_trigger_source" AS ENUM('integration.github', 'cli', 'api');--> statement-breakpoint
CREATE TABLE "deployment_github_integration" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deployment_id" uuid NOT NULL,
	"check_run_id" text,
	"commit_sha" text NOT NULL,
	"branch" text NOT NULL,
	"pr_number" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "deployment_github_integration_deployment_id_unique" UNIQUE("deployment_id")
);
--> statement-breakpoint
ALTER TABLE "deployment" ADD COLUMN "trigger_source" "deployment_trigger_source";--> statement-breakpoint
UPDATE "deployment" SET "trigger_source" = 'api' WHERE "trigger_source" IS NULL;--> statement-breakpoint
ALTER TABLE "deployment" ALTER COLUMN "trigger_source" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "deployment_github_integration" ADD CONSTRAINT "deployment_github_integration_deployment_id_deployment_id_fk" FOREIGN KEY ("deployment_id") REFERENCES "public"."deployment"("id") ON DELETE cascade ON UPDATE no action;
