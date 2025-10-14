import { TRPCError } from "@trpc/server";
import { and, desc, eq, ne } from "drizzle-orm";
import { db } from "../libs/db/index.js";
import {
  environmentsSchema,
  githubBranchRuleSchema,
  githubConfigSchema,
  projectSchema,
} from "../libs/db/schema.js";
import { sanitizeTrackName } from "../utils/track.js";

const REGEX_SPECIAL_CHARACTERS = /[.+^${}()|[\]\\]/g;

type BranchRuleInsert = typeof githubBranchRuleSchema.$inferInsert;
type BranchRuleSelect = typeof githubBranchRuleSchema.$inferSelect;

type CreateBranchRuleInput = {
  projectId: string;
  branchPattern: string;
  environmentId: string;
  enablePreviews?: boolean;
  isPrimary?: boolean;
};

type UpdateBranchRuleInput = Partial<
  Pick<
    BranchRuleInsert,
    "branchPattern" | "environmentId" | "enablePreviews" | "isPrimary"
  >
>;

export type BranchRuleResolution = {
  rule: BranchRuleSelect;
  trackName: string;
  branchName: string;
};

function normalizePattern(pattern: string) {
  const trimmed = pattern.trim();
  if (!trimmed) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Branch pattern cannot be empty",
    });
  }
  return trimmed;
}

async function assertProjectHasGithubConfig(projectId: string) {
  const githubConfig = await db.query.githubConfigSchema.findFirst({
    where: eq(githubConfigSchema.projectId, projectId),
  });

  if (!githubConfig) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "GitHub integration must be configured for this project",
    });
  }

  return githubConfig;
}

async function assertEnvironmentBelongsToProject(
  projectId: string,
  environmentId: string,
) {
  const environment = await db.query.environmentsSchema.findFirst({
    where: and(
      eq(environmentsSchema.id, environmentId),
      eq(environmentsSchema.projectId, projectId),
    ),
  });

  if (!environment) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Environment does not belong to this project",
    });
  }

  return environment;
}

export async function listBranchRules(projectId: string) {
  await assertProjectExists(projectId);

  return db.query.githubBranchRuleSchema.findMany({
    where: eq(githubBranchRuleSchema.projectId, projectId),
    orderBy: [desc(githubBranchRuleSchema.createdAt)],
    with: {
      environment: true,
    },
  });
}

async function assertProjectExists(projectId: string) {
  const project = await db.query.projectSchema.findFirst({
    where: eq(projectSchema.id, projectId),
  });

  if (!project) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Project not found",
    });
  }

  return project;
}

export async function createBranchRule({
  projectId,
  branchPattern,
  environmentId,
  enablePreviews = false,
  isPrimary = false,
}: CreateBranchRuleInput) {
  const normalizedPattern = normalizePattern(branchPattern);

  await assertProjectExists(projectId);
  const githubConfig = await assertProjectHasGithubConfig(projectId);
  await assertEnvironmentBelongsToProject(projectId, environmentId);

  if (isPrimary) {
    await db
      .update(githubBranchRuleSchema)
      .set({ isPrimary: false })
      .where(
        and(
          eq(githubBranchRuleSchema.projectId, projectId),
          eq(githubBranchRuleSchema.isPrimary, true),
        ),
      );
  }

  const [rule] = await db
    .insert(githubBranchRuleSchema)
    .values({
      projectId,
      githubConfigId: githubConfig.id,
      branchPattern: normalizedPattern,
      environmentId,
      enablePreviews,
      isPrimary,
    })
    .returning();

  return rule;
}

export async function updateBranchRule(
  projectId: string,
  ruleId: string,
  updates: UpdateBranchRuleInput,
) {
  const rule = await db.query.githubBranchRuleSchema.findFirst({
    where: and(
      eq(githubBranchRuleSchema.id, ruleId),
      eq(githubBranchRuleSchema.projectId, projectId),
    ),
  });

  if (!rule) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Branch rule not found",
    });
  }

  const formattedUpdates: UpdateBranchRuleInput = {};

  if (updates.branchPattern != null) {
    formattedUpdates.branchPattern = normalizePattern(updates.branchPattern);
  }

  if (updates.environmentId) {
    await assertEnvironmentBelongsToProject(projectId, updates.environmentId);
    formattedUpdates.environmentId = updates.environmentId;
  }

  if (updates.enablePreviews != null) {
    formattedUpdates.enablePreviews = updates.enablePreviews;
  }

  if (updates.isPrimary != null) {
    formattedUpdates.isPrimary = updates.isPrimary;
  }

  if (formattedUpdates.isPrimary) {
    await db
      .update(githubBranchRuleSchema)
      .set({ isPrimary: false })
      .where(
        and(
          eq(githubBranchRuleSchema.projectId, projectId),
          eq(githubBranchRuleSchema.isPrimary, true),
          ne(githubBranchRuleSchema.id, ruleId),
        ),
      );
  }

  const [updatedRule] = await db
    .update(githubBranchRuleSchema)
    .set(formattedUpdates)
    .where(eq(githubBranchRuleSchema.id, ruleId))
    .returning();

  return updatedRule;
}

export async function deleteBranchRule(projectId: string, ruleId: string) {
  const [deletedRule] = await db
    .delete(githubBranchRuleSchema)
    .where(
      and(
        eq(githubBranchRuleSchema.id, ruleId),
        eq(githubBranchRuleSchema.projectId, projectId),
      ),
    )
    .returning();

  if (!deletedRule) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Branch rule not found",
    });
  }

  return deletedRule;
}

function patternMatchesBranch(pattern: string, branch: string) {
  if (pattern === "*") {
    return true;
  }

  if (!pattern.includes("*") && !pattern.includes("?")) {
    return pattern === branch;
  }

  const regexSource = `^${pattern
    .replace(REGEX_SPECIAL_CHARACTERS, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".")}$`;
  const regex = new RegExp(regexSource);
  return regex.test(branch);
}

function computeSpecificity(pattern: string) {
  const wildcardCount =
    (pattern.match(/\*/g)?.length ?? 0) + (pattern.match(/\?/g)?.length ?? 0);
  return pattern.length - wildcardCount;
}

export async function resolveBranchRule(
  projectId: string,
  branchName: string,
): Promise<BranchRuleResolution | null> {
  const rules = await db.query.githubBranchRuleSchema.findMany({
    where: eq(githubBranchRuleSchema.projectId, projectId),
    orderBy: [
      desc(githubBranchRuleSchema.isPrimary),
      desc(githubBranchRuleSchema.createdAt),
    ],
  });

  if (!rules.length) {
    return null;
  }

  let bestRule: BranchRuleSelect | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const rule of rules) {
    if (!patternMatchesBranch(rule.branchPattern, branchName)) {
      continue;
    }

    const specificity = computeSpecificity(rule.branchPattern);
    const exactMatch = rule.branchPattern === branchName;
    const score =
      (rule.isPrimary ? 500 : 0) + (exactMatch ? 200 : 0) + specificity;

    if (score > bestScore) {
      bestScore = score;
      bestRule = rule;
    }
  }

  if (!bestRule) {
    return null;
  }

  return {
    rule: bestRule,
    trackName: sanitizeTrackName(branchName),
    branchName,
  };
}
