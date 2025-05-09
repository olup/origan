import type { Context, Next } from "hono";
import jwt from "jsonwebtoken";
import { env } from "../config.js";
import { jwtPayloadSchema } from "../schemas/auth.js";

type Variables = {
  userId: string;
};

export const auth = () => {
  return async (c: Context<{ Variables: Variables }>, next: Next) => {
    const authHeader = c.req.header("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return c.json({ error: "Missing or invalid authorization header" }, 401);
    }

    try {
      const token = authHeader.split(" ")[1];
      const rawPayload = jwt.verify(token, env.JWT_SECRET);
      const payload = jwtPayloadSchema.parse(rawPayload);

      // Add user ID to context for route handlers
      c.set("userId", payload.userId);

      return next();
    } catch (_error) {
      return c.json({ error: "Unauthorized" }, 401);
    }
  };
};
