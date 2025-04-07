DROP TABLE "test"."counter" CASCADE;--> statement-breakpoint
ALTER TABLE "test"."deployment" SET SCHEMA "public";
--> statement-breakpoint
ALTER TABLE "test"."host" SET SCHEMA "public";
--> statement-breakpoint
DROP SCHEMA "test";
