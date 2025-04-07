CREATE TABLE "project" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" text NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "project_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
ALTER TABLE "host" DROP CONSTRAINT "host_deployment_id_deployment_id_fk";
--> statement-breakpoint
ALTER TABLE "deployment" ADD COLUMN "project_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "deployment" ADD CONSTRAINT "deployment_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "host" ADD CONSTRAINT "host_deployment_id_deployment_id_fk" FOREIGN KEY ("deployment_id") REFERENCES "public"."deployment"("id") ON DELETE cascade ON UPDATE no action;