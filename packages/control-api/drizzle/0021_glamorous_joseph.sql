-- Create organization table
CREATE TABLE "organization" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" text NOT NULL,
	"name" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "organization_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint

-- Create organization membership table
CREATE TABLE "organization_membership" (
	"user_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "organization_membership_user_id_organization_id_pk" PRIMARY KEY("user_id","organization_id")
);
--> statement-breakpoint

-- Add creator_id column (keep user_id for now)
ALTER TABLE "project" ADD COLUMN "creator_id" uuid;
--> statement-breakpoint

-- Add organization_id column (nullable initially)
ALTER TABLE "project" ADD COLUMN "organization_id" uuid;
--> statement-breakpoint

-- Create default organizations for existing users
INSERT INTO "organization" ("reference", "name")
SELECT 
  CONCAT('org_', LOWER(REGEXP_REPLACE(username, '[^a-zA-Z0-9]', '-', 'g')), '_', SUBSTRING(id::text, 1, 8)),
  CONCAT(username, '''s Organization')
FROM "users"
WHERE "deleted_at" IS NULL;
--> statement-breakpoint

-- Create membership records for existing users
INSERT INTO "organization_membership" ("user_id", "organization_id")
SELECT 
  u.id,
  o.id
FROM "users" u
JOIN "organization" o ON o.reference = CONCAT('org_', LOWER(REGEXP_REPLACE(u.username, '[^a-zA-Z0-9]', '-', 'g')), '_', SUBSTRING(u.id::text, 1, 8))
WHERE u."deleted_at" IS NULL;
--> statement-breakpoint

-- Populate creator_id with existing user_id values
UPDATE "project" SET "creator_id" = "user_id" WHERE "user_id" IS NOT NULL;
--> statement-breakpoint

-- Link existing projects to user's organization
UPDATE "project" p
SET "organization_id" = o.id
FROM "users" u
JOIN "organization" o ON o.reference = CONCAT('org_', LOWER(REGEXP_REPLACE(u.username, '[^a-zA-Z0-9]', '-', 'g')), '_', SUBSTRING(u.id::text, 1, 8))
WHERE p."user_id" = u.id AND p."organization_id" IS NULL;
--> statement-breakpoint

-- Now make organization_id required
ALTER TABLE "project" ALTER COLUMN "organization_id" SET NOT NULL;
--> statement-breakpoint

-- Drop the old user_id column and its constraint
ALTER TABLE "project" DROP CONSTRAINT "project_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "project" DROP COLUMN "user_id";
--> statement-breakpoint

-- Add foreign key constraints
ALTER TABLE "organization_membership" ADD CONSTRAINT "organization_membership_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "organization_membership" ADD CONSTRAINT "organization_membership_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;