import type { Context as HonoContext } from "hono";
import { getCookie } from "hono/cookie";
import jwt from "jsonwebtoken";
import type { z } from "zod";
import { env } from "../config.js";
import { getLogger } from "../instrumentation.js";
import { db } from "../libs/db/index.js";
import { jwtPayloadSchema } from "../schemas/auth.js";

export interface Context {
  userId: string | null;
  db: typeof db;
  honoCtx: HonoContext;
}

// Helper to verify access token
const verifyAccessToken = (
  token: string,
): z.infer<typeof jwtPayloadSchema> | null => {
  try {
    const rawPayload = jwt.verify(token, env.JWT_SECRET);
    const payload = jwtPayloadSchema.parse(rawPayload);
    return payload;
  } catch {
    return null;
  }
};

export async function createContext(opts: {
  c: HonoContext;
}): Promise<Context> {
  const log = getLogger();
  let userId: string | null = null;

  try {
    // Try to get token from Authorization header
    const authHeader = opts.c.req.header("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.substring(7);
      const payload = verifyAccessToken(token);
      if (payload) {
        userId = payload.userId;
      }
    }

    // If no token in header, try cookies (for web clients)
    if (!userId) {
      const accessToken = getCookie(opts.c, "accessToken");
      if (accessToken) {
        const payload = verifyAccessToken(accessToken);
        if (payload) {
          userId = payload.userId;
        }
      }
    }
  } catch (error) {
    log.withError(error).debug("Failed to verify access token in context");
    // Continue with null userId - publicProcedures will still work
  }

  return {
    userId,
    db,
    honoCtx: opts.c,
  };
}
