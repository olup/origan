import { TRPCError } from "@trpc/server";
import { getCookie, setCookie } from "hono/cookie";
import { z } from "zod";
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
      const { accessToken, expiresIn } =
        await exchangeRefreshToken(refreshToken);

      if (ctx.honoCtx) {
        setCookie(ctx.honoCtx, "accessToken", accessToken, {
          httpOnly: true,
          secure: true,
          sameSite: "Lax",
          maxAge: expiresIn,
          path: "/",
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
