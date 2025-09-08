CREATE TABLE "environment_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"environment_id" uuid NOT NULL,
	"revision_number" integer NOT NULL,
	"variables" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "environments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "deployment" ADD COLUMN "environment_revision_id" uuid;--> statement-breakpoint
ALTER TABLE "track" ADD COLUMN "environment_id" uuid;--> statement-breakpoint
ALTER TABLE "environment_revisions" ADD CONSTRAINT "environment_revisions_environment_id_environments_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."environments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "environment_revisions" ADD CONSTRAINT "environment_revisions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "environments" ADD CONSTRAINT "environments_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "env_revision_idx" ON "environment_revisions" USING btree ("environment_id","revision_number");--> statement-breakpoint
CREATE UNIQUE INDEX "project_name_idx" ON "environments" USING btree ("project_id","name");--> statement-breakpoint
ALTER TABLE "deployment" ADD CONSTRAINT "deployment_environment_revision_id_environment_revisions_id_fk" FOREIGN KEY ("environment_revision_id") REFERENCES "public"."environment_revisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "track" ADD CONSTRAINT "track_environment_id_environments_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."environments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

-- Create default environments for existing projects
DO $$
DECLARE
    project_record RECORD;
    prod_env_id UUID;
    preview_env_id UUID;
BEGIN
    FOR project_record IN 
        SELECT id FROM project WHERE deleted_at IS NULL
    LOOP
        -- Create production environment
        INSERT INTO environments (project_id, name, is_system, is_default)
        VALUES (project_record.id, 'production', true, false)
        RETURNING id INTO prod_env_id;
        
        -- Create preview environment
        INSERT INTO environments (project_id, name, is_system, is_default)
        VALUES (project_record.id, 'preview', true, true)
        RETURNING id INTO preview_env_id;
        
        -- Create initial revisions for both environments
        INSERT INTO environment_revisions (environment_id, revision_number, variables)
        VALUES 
            (prod_env_id, 1, '{}'::jsonb),
            (preview_env_id, 1, '{}'::jsonb);
        
        -- Update production track to use production environment
        UPDATE track 
        SET environment_id = prod_env_id
        WHERE project_id = project_record.id 
        AND name = 'prod'
        AND is_system = true
        AND deleted_at IS NULL;
    END LOOP;
END $$;