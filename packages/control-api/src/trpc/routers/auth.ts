import crypto from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { getCookie, setCookie } from "hono/cookie";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { env } from "../../config.js";
import { getLogger } from "../../instrumentation.js";
import { db } from "../../libs/db/index.js";
import {
  authSessionSchema,
  refreshTokenSchema,
  userSchema,
} from "../../libs/db/schema.js";
import { type jwtPayloadSchema, oauthStateSchema } from "../../schemas/auth.js";
import { createDefaultOrganization } from "../../service/organization.service.js";
import type { GitHubTokenResponse, GitHubUser } from "../../types/github.js";
import { protectedProcedure, publicProcedure, router } from "../init.js";

// Token expiry times
const ACCESS_TOKEN_EXPIRY = "15m";
const AUTH_SESSION_EXPIRY_MINUTES = 5;
const REFRESH_TOKEN_EXPIRY_DAYS = 30;

const generateRandomToken = () => crypto.randomBytes(32).toString("hex");
const hashToken = (token: string) =>
  crypto.createHash("sha256").update(token).digest("hex");

const generateTokens = async (
  userId: string,
  payload: z.infer<typeof jwtPayloadSchema>,
) => {
  const accessToken = jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: ACCESS_TOKEN_EXPIRY,
  });

  // Generate a random refresh token
  const refreshToken = generateRandomToken();
  const hashedToken = hashToken(refreshToken);

  // Store hashed refresh token in database
  await db.insert(refreshTokenSchema).values({
    userId,
    tokenHash: hashedToken,
    expiresAt: sql`CURRENT_TIMESTAMP + INTERVAL '${REFRESH_TOKEN_EXPIRY_DAYS} days'`,
  });

  return { accessToken, refreshToken };
};

export const authRouter = router({
  // Start OAuth flow - returns auth URL
  login: publicProcedure
    .input(
      z.object({
        type: z.enum(["cli", "web"]),
        sessionId: z.string().optional(),
      }),
    )
    .query(({ input }) => {
      const stateObject: z.infer<typeof oauthStateSchema> = {
        provider: "github",
        type: input.type,
        sessionId: input.sessionId,
      };

      const state = Buffer.from(JSON.stringify(stateObject)).toString("base64");

      const params = new URLSearchParams({
        client_id: env.GITHUB_CLIENT_ID,
        redirect_uri: `${env.ORIGAN_API_URL}/auth/github/callback`,
        scope: "read:user user:email",
        state,
      });

      const authUrl = `https://github.com/login/oauth/authorize?${params.toString()}`;

      return { authUrl };
    }),

  // GitHub OAuth callback handler
  githubCallback: publicProcedure
    .input(
      z.object({
        code: z.string(),
        state: z.string().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const log = getLogger();

      try {
        if (!input.code) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Missing authorization code",
          });
        }

        // Exchange code for access token
        const tokenResponse = await fetch(
          "https://github.com/login/oauth/access_token",
          {
            method: "POST",
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              client_id: env.GITHUB_CLIENT_ID,
              client_secret: env.GITHUB_CLIENT_SECRET,
              code: input.code,
            }),
          },
        );

        const tokenData = (await tokenResponse.json()) as GitHubTokenResponse;

        if (!tokenData.access_token) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "Failed to obtain access token",
          });
        }

        // Get user info
        const userResponse = await fetch("https://api.github.com/user", {
          headers: {
            Authorization: `Bearer ${tokenData.access_token}`,
            Accept: "application/json",
          },
        });

        const githubUser = (await userResponse.json()) as GitHubUser;

        // Get primary email
        const emailsResponse = await fetch(
          "https://api.github.com/user/emails",
          {
            headers: {
              Authorization: `Bearer ${tokenData.access_token}`,
              Accept: "application/json",
            },
          },
        );

        const emails = (await emailsResponse.json()) as Array<{
          email: string;
          primary: boolean;
          verified: boolean;
        }>;

        const primaryEmail = emails.find((e) => e.primary && e.verified)?.email;

        if (!primaryEmail) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "No verified primary email found",
          });
        }

        // Create or update user
        let user = await db.query.userSchema.findFirst({
          where: eq(
            userSchema.githubProviderReference,
            githubUser.id.toString(),
          ),
        });

        if (!user) {
          const [newUser] = await db
            .insert(userSchema)
            .values({
              username: githubUser.login,
              githubProviderReference: githubUser.id.toString(),
              contactEmail: primaryEmail,
            })
            .returning();
          user = newUser;

          if (user) {
            await createDefaultOrganization(user.id, user.username);
          }
        } else {
          // Update user info
          await db
            .update(userSchema)
            .set({
              username: githubUser.login,
              contactEmail: primaryEmail,
            })
            .where(eq(userSchema.id, user.id));
        }

        if (!user) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to create or update user",
          });
        }

        // Parse state if present
        let stateData: z.infer<typeof oauthStateSchema> | null = null;
        if (input.state) {
          try {
            const decoded = Buffer.from(input.state, "base64").toString();
            stateData = oauthStateSchema.parse(JSON.parse(decoded));
          } catch (e) {
            log.withError(e).warn("Failed to parse OAuth state");
          }
        }

        // Generate tokens
        const payload: z.infer<typeof jwtPayloadSchema> = {
          userId: user.id,
        };

        const tokens = await generateTokens(user.id, payload);

        // Handle CLI flow
        if (stateData?.type === "cli" && stateData.sessionId) {
          await db
            .update(authSessionSchema)
            .set({
              status: "completed",
              accessToken: tokens.accessToken,
              refreshToken: tokens.refreshToken,
            })
            .where(
              and(
                eq(authSessionSchema.id, stateData.sessionId),
                eq(authSessionSchema.status, "pending"),
              ),
            );

          return {
            type: "cli",
            redirectUrl: `${env.ORIGAN_ADMIN_PANEL_URL}/auth/cli/success`,
          };
        }

        // Web flow - set cookies and redirect
        if (ctx.honoCtx) {
          setCookie(ctx.honoCtx, "accessToken", tokens.accessToken, {
            httpOnly: true,
            secure: true,
            sameSite: "Lax",
            maxAge: 60 * 15, // 15 minutes
            path: "/",
          });

          setCookie(ctx.honoCtx, "refreshToken", tokens.refreshToken, {
            httpOnly: true,
            secure: true,
            sameSite: "Lax",
            maxAge: 60 * 60 * 24 * REFRESH_TOKEN_EXPIRY_DAYS,
            path: "/",
          });
        }

        return {
          type: "web",
          redirectUrl: env.ORIGAN_ADMIN_PANEL_URL,
        };
      } catch (error) {
        log.withError(error).error("GitHub OAuth callback failed");
        throw error instanceof TRPCError
          ? error
          : new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "Authentication failed",
            });
      }
    }),

  // Initialize CLI session
  initializeCLISession: publicProcedure.mutation(async () => {
    const sessionId = generateRandomToken();
    const expiresAt = new Date(
      Date.now() + AUTH_SESSION_EXPIRY_MINUTES * 60 * 1000,
    );

    await db.insert(authSessionSchema).values({
      sessionId: sessionId,
      status: "pending",
      expiresAt,
    });

    const authUrl = `${env.ORIGAN_API_URL}/auth/login?type=cli&sessionId=${sessionId}`;

    return {
      sessionId,
      authUrl,
      expiresIn: AUTH_SESSION_EXPIRY_MINUTES * 60,
    };
  }),

  // Check CLI session status
  checkCLISession: publicProcedure
    .input(z.object({ sessionId: z.string() }))
    .query(async ({ input }) => {
      const session = await db.query.authSessionSchema.findFirst({
        where: and(
          eq(authSessionSchema.sessionId, input.sessionId),
          gt(authSessionSchema.expiresAt, new Date()),
        ),
      });

      if (!session) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Session not found or expired",
        });
      }

      if (session.status === "pending") {
        return { status: "pending" as const };
      }

      // Session completed, return tokens and clean up
      await db
        .delete(authSessionSchema)
        .where(eq(authSessionSchema.id, session.id));

      return {
        status: "completed" as const,
        tokens: {
          accessToken: session.accessToken!,
          refreshToken: session.refreshToken!,
        },
      };
    }),

  // Refresh access token
  refreshToken: publicProcedure.mutation(async ({ ctx }) => {
    const _log = getLogger();
    const refreshToken = ctx.honoCtx
      ? getCookie(ctx.honoCtx, "refreshToken")
      : null;

    if (!refreshToken) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "No refresh token provided",
      });
    }

    const hashedToken = hashToken(refreshToken);

    // Find valid refresh token
    const tokenRecord = await db.query.refreshTokenSchema.findFirst({
      where: and(
        eq(refreshTokenSchema.tokenHash, hashedToken),
        gt(refreshTokenSchema.expiresAt, new Date()),
        isNull(refreshTokenSchema.rotatedAt),
      ),
    });

    if (!tokenRecord) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Invalid or expired refresh token",
      });
    }

    // Get user
    const user = await db.query.userSchema.findFirst({
      where: eq(userSchema.id, tokenRecord.userId),
    });

    if (!user) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "User not found",
      });
    }

    // Generate new access token
    const payload: z.infer<typeof jwtPayloadSchema> = {
      userId: user.id,
    };

    const accessToken = jwt.sign(payload, env.JWT_SECRET, {
      expiresIn: ACCESS_TOKEN_EXPIRY,
    });

    // Set cookie if in web context
    if (ctx.honoCtx) {
      setCookie(ctx.honoCtx, "accessToken", accessToken, {
        httpOnly: true,
        secure: true,
        sameSite: "Lax",
        maxAge: 60 * 15, // 15 minutes
        path: "/",
      });
    }

    return { accessToken };
  }),

  // Get current user
  me: protectedProcedure.query(async ({ ctx }) => {
    const user = await db.query.userSchema.findFirst({
      where: eq(userSchema.id, ctx.userId),
    });

    if (!user) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "User not found",
      });
    }

    return {
      id: user.id,
      username: user.username,
      contactEmail: user.contactEmail,
    };
  }),

  // Logout
  logout: publicProcedure.mutation(async ({ ctx }) => {
    const refreshToken = ctx.honoCtx
      ? getCookie(ctx.honoCtx, "refreshToken")
      : null;

    if (refreshToken) {
      const hashedToken = hashToken(refreshToken);

      // Revoke refresh token
      await db
        .update(refreshTokenSchema)
        .set({ rotatedAt: new Date() })
        .where(eq(refreshTokenSchema.tokenHash, hashedToken));
    }

    // Clear cookies if in web context
    if (ctx.honoCtx) {
      setCookie(ctx.honoCtx, "accessToken", "", {
        httpOnly: true,
        secure: true,
        sameSite: "Lax",
        maxAge: 0,
        path: "/",
      });

      setCookie(ctx.honoCtx, "refreshToken", "", {
        httpOnly: true,
        secure: true,
        sameSite: "Lax",
        maxAge: 0,
        path: "/",
      });
    }

    return { success: true };
  }),
});
