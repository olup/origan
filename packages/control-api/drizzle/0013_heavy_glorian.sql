ALTER TABLE "domain" DROP CONSTRAINT "domain_deployment_id_deployment_id_fk";
--> statement-breakpoint
ALTER TABLE "domain" DROP COLUMN "id";
ALTER TABLE "domain" ADD COLUMN "id" uuid PRIMARY KEY DEFAULT gen_random_uuid();
ALTER TABLE "domain" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "domain" ALTER COLUMN "deployment_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "domain" ADD COLUMN "project_id" uuid;--> statement-breakpoint

UPDATE "domain"
SET "project_id" = d."project_id"
FROM "deployment" d
WHERE "domain"."deployment_id" = d."id";

ALTER TABLE "domain" ALTER COLUMN "project_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "domain" ADD CONSTRAINT "domain_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain" ADD CONSTRAINT "domain_deployment_id_deployment_id_fk" FOREIGN KEY ("deployment_id") REFERENCES "public"."deployment"("id") ON DELETE no action ON UPDATE no action;