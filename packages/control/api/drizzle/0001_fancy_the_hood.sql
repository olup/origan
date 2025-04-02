CREATE TABLE "test"."deployment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"short_id" text NOT NULL,
	"config" jsonb NOT NULL,
	CONSTRAINT "deployment_short_id_unique" UNIQUE("short_id")
);
--> statement-breakpoint
CREATE TABLE "test"."host" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"deployment_id" uuid NOT NULL,
	CONSTRAINT "host_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "test"."host" ADD CONSTRAINT "host_deployment_id_deployment_id_fk" FOREIGN KEY ("deployment_id") REFERENCES "test"."deployment"("id") ON DELETE no action ON UPDATE no action;