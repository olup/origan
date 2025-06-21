ALTER TABLE "host" RENAME TO "domain";--> statement-breakpoint
ALTER TABLE "domain" DROP CONSTRAINT "host_name_unique";--> statement-breakpoint
ALTER TABLE "domain" DROP CONSTRAINT "host_deployment_id_deployment_id_fk";
--> statement-breakpoint
ALTER TABLE "domain" ADD CONSTRAINT "domain_deployment_id_deployment_id_fk" FOREIGN KEY ("deployment_id") REFERENCES "public"."deployment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain" ADD CONSTRAINT "domain_name_unique" UNIQUE("name");