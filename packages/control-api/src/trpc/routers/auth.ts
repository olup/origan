import crypto from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, eq, gt, isNull } from "drizzle-orm";
import { getCookie, setCookie } from "hono/cookie";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { env } from "../../config.js";
import { db } from "../../libs/db/index.js";
import {
  authSessionSchema,
  refreshTokenSchema,
  userSchema,
} from "../../libs/db/schema.js";
import type { jwtPayloadSchema } from "../../schemas/auth.js";
import { protectedProcedure, publicProcedure, router } from "../init.js";

// Token expiry times
const ACCESS_TOKEN_EXPIRY = "15m";
const AUTH_SESSION_EXPIRY_MINUTES = 5;

const generateRandomToken = () => crypto.randomBytes(32).toString("hex");
const hashToken = (token: string) =>
  crypto.createHash("sha256").update(token).digest("hex");

export const authRouter = router({
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
