import crypto from "node:crypto";
import { TRPCError } from "@trpc/server";
import { getCookie, setCookie } from "hono/cookie";
import { z } from "zod";
import { env } from "../../config.js";
import {
  AuthServiceError,
  createCliSession,
  exchangeRefreshToken,
  getCliSessionStatus,
  getUserProfile,
  revokeRefreshToken,
} from "../../service/auth.service.js";
import { protectedProcedure, publicProcedure, router } from "../init.js";

const translateAuthError = (error: unknown): never => {
  if (error instanceof AuthServiceError) {
    throw new TRPCError({ code: error.code, message: error.message });
  }

  throw error;
};

const cookieDomain = env.ORIGAN_COOKIE_DOMAIN;
const REFRESH_TOKEN_EXPIRY_DAYS = 30;
const generateRandomToken = () => crypto.randomBytes(32).toString("hex");

export const authRouter = router({
  // Initialize CLI session
  initializeCLISession: publicProcedure.mutation(async () => {
    try {
      return await createCliSession();
    } catch (error) {
      translateAuthError(error);
    }
  }),

  // Check CLI session status
  checkCLISession: publicProcedure
    .input(z.object({ sessionId: z.string() }))
    .query(async ({ input }) => {
      try {
        return await getCliSessionStatus(input.sessionId);
      } catch (error) {
        translateAuthError(error);
      }
    }),

  // Refresh access token (for web - uses cookies)
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

    try {
      const { accessToken, refreshToken: newRefreshToken } =
        await exchangeRefreshToken(refreshToken);

      if (ctx.honoCtx) {
        setCookie(ctx.honoCtx, "refreshToken", newRefreshToken, {
          httpOnly: true,
          secure: true,
          sameSite: "Lax",
          maxAge: 60 * 60 * 24 * REFRESH_TOKEN_EXPIRY_DAYS,
          path: "/",
          ...(cookieDomain ? { domain: cookieDomain } : {}),
        });

        const csrfToken = generateRandomToken();
        setCookie(ctx.honoCtx, "csrf_token", csrfToken, {
          httpOnly: false,
          secure: true,
          sameSite: "Strict",
          maxAge: 60 * 60 * 24 * REFRESH_TOKEN_EXPIRY_DAYS,
          path: "/",
          ...(cookieDomain ? { domain: cookieDomain } : {}),
        });
      }

      return { accessToken };
    } catch (error) {
      translateAuthError(error);
    }
  }),

  // Refresh access token for CLI (accepts token in body, returns new tokens with rotation)
  refreshTokenCLI: publicProcedure
    .input(z.object({ refreshToken: z.string() }))
    .mutation(async ({ input }) => {
      try {
        const {
          accessToken,
          expiresIn,
          refreshToken: newRefreshToken,
        } = await exchangeRefreshToken(input.refreshToken);

        return {
          accessToken,
          expiresIn,
          refreshToken: newRefreshToken,
        };
      } catch (error) {
        translateAuthError(error);
      }
    }),

  // Get current user
  me: protectedProcedure.query(async ({ ctx }) => {
    try {
      return await getUserProfile(ctx.userId);
    } catch (error) {
      translateAuthError(error);
    }
  }),

  // Logout
  logout: publicProcedure.mutation(async ({ ctx }) => {
    const refreshToken = ctx.honoCtx
      ? getCookie(ctx.honoCtx, "refreshToken")
      : null;

    if (refreshToken) {
      await revokeRefreshToken(refreshToken);
    }

    // Clear cookies if in web context
    if (ctx.honoCtx) {
      setCookie(ctx.honoCtx, "refreshToken", "", {
        httpOnly: true,
        secure: true,
        sameSite: "Lax",
        maxAge: 0,
        path: "/",
        ...(cookieDomain ? { domain: cookieDomain } : {}),
      });

      setCookie(ctx.honoCtx, "csrf_token", "", {
        httpOnly: false,
        secure: true,
        sameSite: "Strict",
        maxAge: 0,
        path: "/",
        ...(cookieDomain ? { domain: cookieDomain } : {}),
      });
    }

    return { success: true };
  }),
});
