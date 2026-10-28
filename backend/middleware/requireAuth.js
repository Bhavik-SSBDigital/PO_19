import { prisma } from "../lib/prisma.js";
import { hashAccessToken } from "../utility/access-token.js";

/**
 * Looks up the bearer token created in user-controller.js's `login`, and
 * attaches the RBAC flags to req.user so every downstream controller can
 * make authorization decisions off a trusted, server-side source instead
 * of anything the client sends in the request body.
 *
 * Role data is reloaded from the database on every request so revoking a
 * role takes effect immediately. Expired sessions are never accepted.
 */
export const requireAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization || "";
    const [scheme, accessToken, ...extra] = authHeader.trim().split(/\s+/);

    if (
      scheme !== "Bearer" ||
      !accessToken ||
      extra.length ||
      accessToken.length > 256
    ) {
      return res.status(401).json({ message: "Missing access token" });
    }

    const tokenRow = await prisma.token.findFirst({
      where: {
        token: hashAccessToken(accessToken),
        expiresAt: { gt: new Date() },
      },
      include: { user: { include: { role: true } } },
    });

    if (!tokenRow?.user) {
      return res.status(401).json({ message: "Invalid or expired session" });
    }

    const u = tokenRow.user;
    req.user = {
      id: u.id,
      username: u.username,
      isAdmin: !!u.role?.isAdmin,
      isBuyer: !!u.role?.isBuyer,
      isProcurementManager: !!u.role?.isProcurementManager,
      isSsbDigital: !!u.role?.isSsbDigital,
    };

    if (!Object.values(req.user).some((value) => value === true)) {
      return res.status(403).json({ message: "Not authorized" });
    }

    next();
  } catch (error) {
    console.error("Error in requireAuth:", error);
    return res.status(500).json({ message: "Auth check failed" });
  }
};

/**
 * Route guard: `requireAnyOf("isAdmin", "isProcurementManager")` only lets
 * the request through if req.user has at least one of the named flags.
 * Always place `requireAuth` before this in the route's middleware chain.
 */
export const requireAnyOf =
  (...flags) =>
  (req, res, next) => {
    const user = req.user || {};
    const allowed = flags.some((f) => user[f]);
    if (!allowed) {
      return res.status(403).json({ message: "Not authorized" });
    }
    next();
  };
