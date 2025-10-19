import { z } from "zod";

export const oauthStateSchema = z.object({
  provider: z.literal("github"),
  type: z.enum(["cli", "web"]),
  sessionId: z.string().optional(),
  codeChallenge: z.string().optional(), // PKCE code_challenge for SPA
});

export const jwtPayloadSchema = z.object({
  userId: z.string(),
});
