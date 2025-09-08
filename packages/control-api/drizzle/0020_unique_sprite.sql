CREATE TABLE "github_app_installation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"github_installation_id" integer NOT NULL,
	"github_account_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "github_app_installation_github_installation_id_unique" UNIQUE("github_installation_id"),
	CONSTRAINT "github_app_installation_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "github_config" ADD COLUMN "github_app_installation_id" uuid;--> statement-breakpoint
ALTER TABLE "github_app_installation" ADD CONSTRAINT "github_app_installation_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

-- Data migration: Create github_app_installation records for existing users
INSERT INTO "github_app_installation" ("github_installation_id", "github_account_id", "user_id")
SELECT
	u."github_app_installation_id"::integer,
	u."github_provider_reference" as "github_account_id",
	u."id"
FROM "users" u
WHERE u."github_app_installation_id" IS NOT NULL
AND u."github_provider_reference" IS NOT NULL;
--> statement-breakpoint

-- Update github_config to reference the new github_app_installation records
UPDATE "github_config" gc
SET "github_app_installation_id" = (
    SELECT gai."id"
    FROM "github_app_installation" gai
    INNER JOIN "project" p ON p."id" = gc."project_id"
    WHERE gai."user_id" = p."user_id"
);
--> statement-breakpoint

ALTER TABLE "github_config" ALTER COLUMN "github_app_installation_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "github_config" ADD CONSTRAINT "github_config_github_app_installation_id_github_app_installation_id_fk" FOREIGN KEY ("github_app_installation_id") REFERENCES "public"."github_app_installation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "github_app_installation_id";