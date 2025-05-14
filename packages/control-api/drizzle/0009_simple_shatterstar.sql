CREATE TYPE "public"."build_status" AS ENUM('pending', 'in_progress', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "build" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" text NOT NULL,
	"project_id" uuid NOT NULL,
	"deployment_id" uuid,
	"status" "build_status" DEFAULT 'pending' NOT NULL,
	"commit_sha" text NOT NULL,
	"branch" text NOT NULL,
	"logs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "github_config" DROP CONSTRAINT "github_config_project_id_project_id_fk";
--> statement-breakpoint
ALTER TABLE "build" ADD CONSTRAINT "build_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "build" ADD CONSTRAINT "build_deployment_id_deployment_id_fk" FOREIGN KEY ("deployment_id") REFERENCES "public"."deployment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_config" ADD CONSTRAINT "github_config_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE no action ON UPDATE no action;