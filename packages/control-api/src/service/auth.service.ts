import crypto from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import jwt from "jsonwebtoken";
import { env } from "../config.js";
import { db } from "../libs/db/index.js";
import {
  authSessionSchema,
  refreshTokenSchema,
  userSchema,
} from "../libs/db/schema.js";

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

const generateRandomToken = () => crypto.randomBytes(32).toString("hex");

export const hashToken = (token: string) =>
  crypto.createHash("sha256").update(token).digest("hex");

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
  const sessionId = generateRandomToken();
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

  if (!session.accessToken || !session.refreshToken) {
    throw new AuthServiceError("NOT_FOUND", "Session tokens are not available");
  }

  await db
    .delete(authSessionSchema)
    .where(eq(authSessionSchema.id, session.id));

  return {
    status: "completed",
    tokens: {
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
    },
  };
}

export async function exchangeRefreshToken(refreshToken: string) {
  const hashedToken = hashToken(refreshToken);

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

  const { token, expiresIn } = createAccessToken(user.id);

  return {
    accessToken: token,
    expiresIn,
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
  const hashedToken = hashToken(refreshToken);

  await db
    .update(refreshTokenSchema)
    .set({ rotatedAt: new Date() })
    .where(eq(refreshTokenSchema.tokenHash, hashedToken));
}
