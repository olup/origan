import { z } from "zod";

export const oauthStateSchema = z.object({
  provider: z.literal("github"),
  type: z.enum(["cli", "web"]),
  sessionId: z.string().optional(),
  nonce: z.string().min(32),
});

export const jwtPayloadSchema = z.object({
  userId: z.string(),
});
