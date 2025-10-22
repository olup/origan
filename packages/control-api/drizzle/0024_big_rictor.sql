CREATE TABLE "github_branch_rule" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"github_config_id" uuid NOT NULL,
	"branch_pattern" text NOT NULL,
	"environment_id" uuid NOT NULL,
	"enable_previews" boolean DEFAULT false NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "github_branch_rule" ADD CONSTRAINT "github_branch_rule_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_branch_rule" ADD CONSTRAINT "github_branch_rule_github_config_id_github_config_id_fk" FOREIGN KEY ("github_config_id") REFERENCES "public"."github_config"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_branch_rule" ADD CONSTRAINT "github_branch_rule_environment_id_environments_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."environments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "github_branch_rule_project_pattern_idx" ON "github_branch_rule" USING btree ("project_id","branch_pattern");--> statement-breakpoint
WITH configs AS (
  SELECT
    gc.id AS github_config_id,
    gc.project_id,
    gc.production_branch_name,
    COALESCE(prod_env.id, preview_env.id, any_env.id) AS target_environment_id
  FROM github_config gc
  LEFT JOIN environments prod_env
    ON prod_env.project_id = gc.project_id AND prod_env.name = 'production'
  LEFT JOIN environments preview_env
    ON preview_env.project_id = gc.project_id AND preview_env.name = 'preview'
  LEFT JOIN LATERAL (
    SELECT e.id
    FROM environments e
    WHERE e.project_id = gc.project_id
    ORDER BY e.created_at
    LIMIT 1
  ) any_env ON TRUE
)
INSERT INTO github_branch_rule (
  project_id,
  github_config_id,
  branch_pattern,
  environment_id,
  enable_previews,
  is_primary
)
SELECT
  c.project_id,
  c.github_config_id,
  c.production_branch_name,
  c.target_environment_id,
  FALSE,
  TRUE
FROM configs c
WHERE c.production_branch_name IS NOT NULL
  AND c.target_environment_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM github_branch_rule existing
    WHERE existing.project_id = c.project_id
      AND existing.branch_pattern = c.production_branch_name
  );--> statement-breakpoint
ALTER TABLE "github_config" DROP COLUMN "production_branch_name";
