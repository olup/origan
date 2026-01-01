import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { and, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import jwt from "jsonwebtoken";
import type { z } from "zod";
import { env } from "../config.js";
import { getLogger } from "../instrumentation.js";
import { db } from "../libs/db/index.js";
import {
  authSessionSchema,
  refreshTokenSchema,
  userSchema,
} from "../libs/db/schema.js";
import { type jwtPayloadSchema, oauthStateSchema } from "../schemas/auth.js";
import { createDefaultOrganization } from "../service/organization.service.js";
import type { GitHubTokenResponse, GitHubUser } from "../types/github.js";

const REFRESH_TOKEN_EXPIRY_DAYS = 30;

const generateRandomToken = () => crypto.randomBytes(32).toString("hex");
const hashToken = (token: string) =>
  crypto.createHash("sha256").update(token).digest("hex");

const generateTokens = async (
  userId: string,
  payload: z.infer<typeof jwtPayloadSchema>,
) => {
  const accessToken = jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: "15m",
  });

  const refreshToken = generateRandomToken();
  const hashedToken = hashToken(refreshToken);

  await db.insert(refreshTokenSchema).values({
    userId,
    tokenHash: hashedToken,
    expiresAt: sql.raw(
      `CURRENT_TIMESTAMP + INTERVAL '${REFRESH_TOKEN_EXPIRY_DAYS} days'`,
    ),
  });

  return { accessToken, refreshToken };
};

const cookieDomain = env.ORIGAN_COOKIE_DOMAIN;

export const authRouter = new Hono();

// Start OAuth flow - Direct REST endpoint
authRouter.get("/login", async (c) => {
  const type = c.req.query("type") || "web";
  const sessionId = c.req.query("sessionId");
  const stateNonce = generateRandomToken();

  const stateObject: z.infer<typeof oauthStateSchema> = {
    provider: "github",
    type: type as "cli" | "web",
    sessionId,
    nonce: stateNonce,
  };

  const state = Buffer.from(JSON.stringify(stateObject)).toString("base64");

  const params = new URLSearchParams({
    client_id: env.GITHUB_CLIENT_ID,
    redirect_uri: `${env.ORIGAN_API_URL}/auth/github/callback`,
    scope: "read:user user:email",
    state,
  });

  const authUrl = `https://github.com/login/oauth/authorize?${params.toString()}`;

  setCookie(c, "oauth_state", stateNonce, {
    httpOnly: true,
    secure: true,
    sameSite: "Strict",
    maxAge: 60 * 10, // 10 minutes
    path: "/",
    ...(cookieDomain ? { domain: cookieDomain } : {}),
  });

  // Redirect directly to GitHub OAuth
  return c.redirect(authUrl);
});

// GitHub OAuth callback - Direct REST endpoint
authRouter.get("/github/callback", async (c) => {
  const log = getLogger();

  try {
    const code = c.req.query("code");
    const state = c.req.query("state");

    if (!code) {
      return c.json({ error: "Missing authorization code" }, 400);
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
          code,
        }),
      },
    );

    const tokenData = (await tokenResponse.json()) as GitHubTokenResponse;

    if (!tokenData.access_token) {
      return c.json({ error: "Failed to obtain access token" }, 401);
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
    const emailsResponse = await fetch("https://api.github.com/user/emails", {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        Accept: "application/json",
      },
    });

    const emails = (await emailsResponse.json()) as Array<{
      email: string;
      primary: boolean;
      verified: boolean;
    }>;

    const primaryEmail = emails.find((e) => e.primary && e.verified)?.email;

    if (!primaryEmail) {
      return c.json({ error: "No verified primary email found" }, 400);
    }

    // Create or update user
    let user = await db.query.userSchema.findFirst({
      where: eq(userSchema.githubProviderReference, githubUser.id.toString()),
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
      return c.json({ error: "Failed to create or update user" }, 500);
    }

    // Parse state if present
    let stateData: z.infer<typeof oauthStateSchema> | null = null;
    if (state) {
      try {
        const decoded = Buffer.from(state, "base64").toString();
        stateData = oauthStateSchema.parse(JSON.parse(decoded));
      } catch (e) {
        log.withError(e).warn("Failed to parse OAuth state");
      }
    }

    const stateNonceCookie = getCookie(c, "oauth_state");

    if (!stateData?.nonce || !stateNonceCookie) {
      log.warn("Missing OAuth state or nonce cookie");
      return c.json({ error: "Invalid OAuth state" }, 400);
    }

    if (stateData.nonce !== stateNonceCookie) {
      log.warn("OAuth state nonce mismatch");
      return c.json({ error: "Invalid OAuth state" }, 400);
    }

    // State verified, clear the nonce cookie
    setCookie(c, "oauth_state", "", {
      httpOnly: true,
      secure: true,
      sameSite: "Strict",
      maxAge: 0,
      path: "/",
      ...(cookieDomain ? { domain: cookieDomain } : {}),
    });

    // Handle CLI flow - store userId only, generate fresh tokens on retrieval
    if (stateData.type === "cli" && stateData.sessionId) {
      const updatedSessions = await db
        .update(authSessionSchema)
        .set({
          status: "completed",
          userId: user.id,
        })
        .where(
          and(
            eq(authSessionSchema.sessionId, stateData.sessionId),
            eq(authSessionSchema.status, "pending"),
          ),
        )
        .returning({ id: authSessionSchema.id });

      if (updatedSessions.length === 0) {
        log.warn(
          "CLI OAuth callback received invalid or expired session",
          stateData.sessionId,
        );
        return c.json({ error: "Session expired or invalid" }, 400);
      }

      // Serve CLI success page directly (no redirect)
      const htmlPath = path.join(
        import.meta.dirname,
        "../templates/cli-success.html",
      );
      const html = fs.readFileSync(htmlPath, "utf-8");
      return c.html(html);
    }

    // Web flow - generate tokens and set cookies
    const payload: z.infer<typeof jwtPayloadSchema> = {
      userId: user.id,
    };

    const tokens = await generateTokens(user.id, payload);

    setCookie(c, "refreshToken", tokens.refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
      maxAge: 60 * 60 * 24 * REFRESH_TOKEN_EXPIRY_DAYS,
      path: "/",
      ...(cookieDomain ? { domain: cookieDomain } : {}),
    });

    // Generate and set CSRF token (not httpOnly so SPA can read it)
    const csrfToken = generateRandomToken();
    setCookie(c, "csrf_token", csrfToken, {
      httpOnly: false, // SPA needs to read this
      secure: true,
      sameSite: "Strict",
      maxAge: 60 * 60 * 24 * REFRESH_TOKEN_EXPIRY_DAYS, // Same as refresh token
      path: "/",
      ...(cookieDomain ? { domain: cookieDomain } : {}),
    });

    // Redirect to admin panel
    return c.redirect(env.ORIGAN_ADMIN_PANEL_URL);
  } catch (error) {
    log.withError(error).error("GitHub OAuth callback failed");
    return c.json({ error: "Authentication failed" }, 500);
  }
});
