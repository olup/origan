CREATE SCHEMA "test";
--> statement-breakpoint
CREATE TABLE "test"."counter" (
	"id" serial PRIMARY KEY NOT NULL,
	"counter" integer NOT NULL
);
