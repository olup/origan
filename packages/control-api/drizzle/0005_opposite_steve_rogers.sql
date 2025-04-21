CREATE TYPE "public"."auth_session_status" AS ENUM('pending', 'completed');--> statement-breakpoint
CREATE TABLE "auth_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" text NOT NULL,
	"status" "auth_session_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"access_token" text,
	"refresh_token" text,
	CONSTRAINT "auth_sessions_session_id_unique" UNIQUE("session_id")
);
--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"rotated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"github_provider_reference" text,
	"username" text NOT NULL,
	"contact_email" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "users_github_provider_reference_unique" UNIQUE("github_provider_reference")
);
--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "user_id" uuid;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;

--> statement-breakpoint
--> Now that the foreign key constraints are in place, we need to link existing project to a dummy user in order to activate not null constraint

INSERT INTO users (github_provider_reference, username, contact_email) VALUES ('0', 'dummy', 'dmmy@origan.dev');
UPDATE project SET user_id = (SELECT id FROM users WHERE github_provider_reference = '0') WHERE user_id IS NULL;
ALTER TABLE "project" ALTER COLUMN "user_id" SET NOT NULL;