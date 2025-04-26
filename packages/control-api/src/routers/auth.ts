import crypto from "node:crypto";
import { zValidator } from "@hono/zod-validator";
import { and, eq, gt, isNull, lt, sql } from "drizzle-orm";
import { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { env } from "../config.js";
import { db } from "../libs/db/index.js";
import {
  authSessionSchema,
  refreshTokenSchema,
  userSchema,
} from "../libs/db/schema.js";
import { auth } from "../middleware/auth.js";
import { type jwtPayloadSchema, oauthStateSchema } from "../schemas/auth.js";
import type { GitHubTokenResponse, GitHubUser } from "../types/github.js";

// Token expiry times
const ACCESS_TOKEN_EXPIRY = "15m"; // 15 minutes
const AUTH_SESSION_EXPIRY_MINUTES = 5;
const REFRESH_TOKEN_EXPIRY_DAYS = 30;

const generateRandomToken = () => crypto.randomBytes(32).toString("hex");
const hashToken = (token: string) =>
  crypto.createHash("sha256").update(token).digest("hex");

const generateTokens = async (
  userId: string,
  payload: z.infer<typeof jwtPayloadSchema>
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
    expiresAt: sql.raw(
      `CURRENT_TIMESTAMP + INTERVAL '${REFRESH_TOKEN_EXPIRY_DAYS} days'`
    ),
  });

  return { accessToken, refreshToken };
};

type AuthSessionStatusResponse =
  | { status: "pending" }
  | {
      status: "completed";
      tokens: { accessToken: string; refreshToken: string };
    };

export const authRouter = new Hono()
  // Start GitHub OAuth flow
  .get(
    "/login",
    zValidator(
      "query",
      z.object({
        sessionId: z.string().optional(),
        type: z.enum(["cli", "web"]),
      })
    ),
    async (c) => {
      const query = c.req.valid("query");

      const stateObject: z.infer<typeof oauthStateSchema> = {
        provider: "github",
        type: query.type,
        sessionId: query.sessionId,
      };

      const state = Buffer.from(JSON.stringify(stateObject)).toString("base64");

      const params = new URLSearchParams({
        client_id: env.GITHUB_CLIENT_ID,
        redirect_uri: `${env.ORIGAN_API_URL}/auth/github/callback`,
        scope: "read:user user:email",
        state,
      });

      return c.redirect(
        `https://github.com/login/oauth/authorize?${params.toString()}`
      );
    }
  )

  // GitHub OAuth callback
  .get("/github/callback", async (c) => {
    try {
      const code = c.req.query("code");
      const stateParam = c.req.query("state");

      if (!code || !stateParam) {
        return c.json({ error: "Missing code or state" }, 400);
      }

      // TODO throw
      const stateObject = JSON.parse(
        Buffer.from(stateParam, "base64").toString("utf-8")
      );
      const state = await oauthStateSchema.parse(stateObject);

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
            code,
          }),
        }
      );

      const tokenData = (await tokenResponse.json()) as GitHubTokenResponse;
      if (tokenData.error) {
        return c.json({ error: tokenData.error_description }, 400);
      }

      // Get user data from GitHub
      const userResponse = await fetch("https://api.github.com/user", {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          Accept: "application/json",
        },
      });

      const githubUser = (await userResponse.json()) as GitHubUser;

      // find user with githubProviderReference
      let user = await db.query.userSchema.findFirst({
        where: eq(userSchema.githubProviderReference, githubUser.id.toString()),
      });

      if (!user) {
        // get user email from GitHub api
        const emailResponse = await fetch(
          "https://api.github.com/user/emails",
          {
            headers: {
              Authorization: `Bearer ${tokenData.access_token}`,
              Accept: "application/json",
            },
          }
        );
        const emailsRaw = await emailResponse.json();
        const emails = z
          .array(
            z.object({
              email: z.string(),
              primary: z.boolean(),
              verified: z.boolean(),
              visibility: z.string().nullable(),
            })
          )
          .parse(emailsRaw);

        const primaryEmail = emails.find((email) => email.primary);
        if (!primaryEmail) {
          throw new Error("No primary email found");
        }

        // create the user
        const results = await db
          .insert(userSchema)
          .values({
            githubProviderReference: githubUser.id.toString(),
            username: githubUser.login,
            contactEmail: primaryEmail.email,
          })
          .returning();
        user = results[0];
      }

      const { accessToken, refreshToken } = await generateTokens(user.id, {
        userId: user.id,
      });

      // If this was initiated by CLI, update the session
      if (state.type === "cli") {
        if (!state.sessionId) {
          throw new Error("Session ID is required for CLI login");
        }

        const sessions = await db
          .update(authSessionSchema)
          .set({
            status: "completed",
            accessToken,
            refreshToken,
          })
          .where(
            and(
              eq(authSessionSchema.sessionId, state.sessionId),
              gt(authSessionSchema.expiresAt, sql`CURRENT_TIMESTAMP`)
            )
          )
          .returning();

        if (sessions.length === 0) {
          throw new Error("Session not found or expired");
        }

        // For CLI login, show success page
        return c.text("Login successful! You can now return to the CLI.", 200);
      }

      if (state.type === "web") {
        setCookie(c, "refreshToken", refreshToken, {
          httpOnly: true,
          secure: env.APP_ENV !== "development",
          sameSite: "Lax",
          maxAge: REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60,
        });
        return c.redirect(`${env.ORIGAN_ADMIN_PANEL_URL}`);
      }

      // TODO - handle callback for web login
      throw new Error("Only CLI login is supported at the moment.");
    } catch (error) {
      console.error("Error during GitHub OAuth callback:", error);
      // TODO: Consider more specific error handling based on error type
      return c.json(
        { error: "Internal server error during authentication." },
        500
      );
    }
  })
  // Initialize CLI device flow
  .post("/cli/session/initialize", async (c) => {
    const sessionId = generateRandomToken();

    await db.insert(authSessionSchema).values({
      sessionId,
      status: "pending",
      expiresAt: sql.raw(
        `CURRENT_TIMESTAMP + INTERVAL '${AUTH_SESSION_EXPIRY_MINUTES} minutes'`
      ),
    });

    // Return both session ID and login URL
    const params = new URLSearchParams({
      type: "cli",
      sessionId,
    });

    const loginUrl = `${env.ORIGAN_API_URL}/auth/login?${params.toString()}`;

    return c.json({ sessionId, loginUrl });
  })

  // Poll session status for CLI
  .get(
    "/cli/session/:id",
    zValidator("param", z.object({ id: z.string() })),
    async (c) => {
      const sessionId = c.req.param("id");

      const session = await db.query.authSessionSchema.findFirst({
        where: eq(authSessionSchema.sessionId, sessionId),
      });

      if (!session) {
        return c.json({ error: "Session not found" }, 404);
      }

      if (new Date() > session.expiresAt) {
        return c.json({ error: "Session expired" }, 403);
      }

      if (session.status === "pending") {
        return c.json({ status: "pending" } as AuthSessionStatusResponse);
      }

      // Session is completed, return tokens
      const tokens = {
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
      };

      if (!tokens.accessToken || !tokens.refreshToken) {
        return c.json({ error: "Tokens not found" }, 404);
      }

      // Delete the session after successful retrieval
      await db
        .delete(authSessionSchema)
        .where(eq(authSessionSchema.id, session.id));

      return c.json({
        status: "completed",
        tokens,
      } as AuthSessionStatusResponse);
    }
  )

  // Refresh access token
  .post("/refresh-token", async (c) => {
    const refreshToken = getCookie(c, "refreshToken");

    if (!refreshToken) {
      return c.json({ error: "No refresh token" }, 401);
    }

    const hashedToken = hashToken(refreshToken);

    console.log("Hashed token:", hashedToken);

    // Find and validate refresh token
    const tokenRecord = await db.query.refreshTokenSchema.findFirst({
      where: and(
        eq(refreshTokenSchema.tokenHash, hashedToken),
        lt(sql`CURRENT_TIMESTAMP`, refreshTokenSchema.expiresAt),
        isNull(refreshTokenSchema.rotatedAt)
      ),
    });

    console.log("Token record:", tokenRecord);

    if (!tokenRecord) {
      return c.json({ error: "Invalid refresh token" }, 401);
    }

    try {
      // Generate new tokens
      const { accessToken, refreshToken: newRefreshToken } =
        await generateTokens(tokenRecord.userId, {
          userId: tokenRecord.userId,
        });

      // Mark the old token as rotated
      await db
        .update(refreshTokenSchema)
        .set({
          rotatedAt: sql`CURRENT_TIMESTAMP`,
        })
        .where(
          and(
            eq(refreshTokenSchema.id, tokenRecord.id),
            eq(refreshTokenSchema.tokenHash, hashedToken)
          )
        );

      // Set new refresh token cookie
      setCookie(c, "refreshToken", newRefreshToken, {
        httpOnly: true,
        secure: env.APP_ENV !== "development",
        sameSite: "Lax",
        maxAge: REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60,
      });

      return c.json({
        accessToken,
        refreshToken: newRefreshToken,
      });
    } catch (error) {
      return c.json({ error: "Failed to refresh token" }, 500);
    }
  })

  // Get info about the logged-in user
  .get("/me", auth(), async (c) => {
    const userId = c.get("userId");
    const user = await db.query.userSchema.findFirst({
      where: eq(userSchema.id, userId),
      columns: {
        id: true,
        contactEmail: true,
        username: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!user) {
      return c.json({ error: "User not found" }, 404);
    }
    return c.json(user);
  });

// TODO - jobs for refresh-token and session cleanup
