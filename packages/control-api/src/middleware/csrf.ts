import type { Context, Next } from "hono";
import { getCookie } from "hono/cookie";

/**
 * CSRF protection middleware
 * Validates CSRF token on state-changing operations (POST, PUT, DELETE, PATCH)
 */
export const csrf = () => {
  return async (c: Context, next: Next) => {
    const method = c.req.method;

    // Only check CSRF for state-changing methods
    if (!["POST", "PUT", "DELETE", "PATCH"].includes(method)) {
      return next();
    }

    // Get CSRF token from cookie
    const csrfTokenCookie = getCookie(c, "csrf_token");

    // Get CSRF token from header
    const csrfTokenHeader = c.req.header("x-csrf-token");

    // Validate tokens exist and match
    if (!csrfTokenCookie || !csrfTokenHeader) {
      return c.json({ error: "CSRF token missing" }, 403);
    }

    if (csrfTokenCookie !== csrfTokenHeader) {
      return c.json({ error: "CSRF token mismatch" }, 403);
    }

    return next();
  };
};
