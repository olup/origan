import { and, eq, gt, isNull } from "drizzle-orm";
import jwt from "jsonwebtoken";
import { env } from "../config.js";
import { db } from "../libs/db/index.js";
import {
  authSessionSchema,
  refreshTokenSchema,
  userSchema,
} from "../libs/db/schema.js";
import { generateSecureToken, hashTokenForLookup } from "../utils/crypto.js";

export type AuthErrorCode = "NOT_FOUND" | "UNAUTHORIZED";

export class AuthServiceError extends Error {
  public readonly code: AuthErrorCode;

  constructor(code: AuthErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "AuthServiceError";
  }
}

export const ACCESS_TOKEN_EXPIRY = "15m";
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const AUTH_SESSION_TTL_SECONDS = 5 * 60;

const createAccessToken = (userId: string) => {
  const token = jwt.sign({ userId }, env.JWT_SECRET, {
    expiresIn: ACCESS_TOKEN_EXPIRY,
  });

  return {
    token,
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
  };
};

export async function createCliSession() {
  const sessionId = generateSecureToken();
  const expiresAt = new Date(Date.now() + AUTH_SESSION_TTL_SECONDS * 1000);

  await db.insert(authSessionSchema).values({
    sessionId,
    status: "pending",
    expiresAt,
  });

  return {
    sessionId,
    authUrl: `${env.ORIGAN_API_URL}/auth/login?type=cli&sessionId=${sessionId}`,
    expiresIn: AUTH_SESSION_TTL_SECONDS,
  };
}

type CliSessionStatus =
  | { status: "pending" }
  | {
      status: "completed";
      tokens: { accessToken: string; refreshToken: string };
    };

export async function getCliSessionStatus(
  sessionId: string,
): Promise<CliSessionStatus> {
  const session = await db.query.authSessionSchema.findFirst({
    where: and(
      eq(authSessionSchema.sessionId, sessionId),
      gt(authSessionSchema.expiresAt, new Date()),
    ),
  });

  if (!session) {
    throw new AuthServiceError("NOT_FOUND", "Session not found or expired");
  }

  if (session.status === "pending") {
    return { status: "pending" };
  }

  if (!session.userId) {
    throw new AuthServiceError(
      "NOT_FOUND",
      "Session completed but no user ID found",
    );
  }

  // Generate fresh tokens for the user
  const { token: accessToken } = createAccessToken(session.userId);
  const refreshToken = generateSecureToken();
  const hashedRefreshToken = hashTokenForLookup(refreshToken);

  // Store refresh token in database
  await db.insert(refreshTokenSchema).values({
    userId: session.userId,
    tokenHash: hashedRefreshToken,
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
  });

  // Delete the session immediately after token generation
  await db
    .delete(authSessionSchema)
    .where(eq(authSessionSchema.id, session.id));

  return {
    status: "completed",
    tokens: {
      accessToken,
      refreshToken,
    },
  };
}

export async function exchangeRefreshToken(refreshToken: string) {
  const hashedToken = hashTokenForLookup(refreshToken);

  const tokenRecord = await db.query.refreshTokenSchema.findFirst({
    where: and(
      eq(refreshTokenSchema.tokenHash, hashedToken),
      gt(refreshTokenSchema.expiresAt, new Date()),
      isNull(refreshTokenSchema.rotatedAt),
    ),
  });

  if (!tokenRecord) {
    throw new AuthServiceError(
      "UNAUTHORIZED",
      "Invalid or expired refresh token",
    );
  }

  const user = await db.query.userSchema.findFirst({
    where: eq(userSchema.id, tokenRecord.userId),
  });

  if (!user) {
    throw new AuthServiceError("NOT_FOUND", "User not found");
  }

  // Mark old refresh token as rotated
  await db
    .update(refreshTokenSchema)
    .set({ rotatedAt: new Date() })
    .where(eq(refreshTokenSchema.id, tokenRecord.id));

  // Generate new access token
  const { token: accessToken, expiresIn } = createAccessToken(user.id);

  // Generate new refresh token (token rotation)
  const newRefreshToken = generateSecureToken();
  const hashedNewRefreshToken = hashTokenForLookup(newRefreshToken);

  await db.insert(refreshTokenSchema).values({
    userId: user.id,
    tokenHash: hashedNewRefreshToken,
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
  });

  return {
    accessToken,
    expiresIn,
    refreshToken: newRefreshToken, // Return new refresh token
  };
}

export async function getUserProfile(userId: string) {
  const user = await db.query.userSchema.findFirst({
    where: eq(userSchema.id, userId),
  });

  if (!user) {
    throw new AuthServiceError("NOT_FOUND", "User not found");
  }

  return {
    id: user.id,
    username: user.username,
    contactEmail: user.contactEmail,
  };
}

export async function revokeRefreshToken(refreshToken: string) {
  const hashedToken = hashTokenForLookup(refreshToken);

  await db
    .update(refreshTokenSchema)
    .set({ rotatedAt: new Date() })
    .where(eq(refreshTokenSchema.tokenHash, hashedToken));
}
