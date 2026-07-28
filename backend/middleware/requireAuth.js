import { prisma } from "../lib/prisma.js";

/**
 * Looks up the bearer token created in auth.controller.js's `login`, and
 * attaches the RBAC flags to req.user so every downstream controller can
 * make authorization decisions off a trusted, server-side source instead
 * of anything the client sends in the request body.
 *
 * ADAPT ME: this assumes `prisma.token` has a relation back to `user`
 * (with `user.role` further relating to isAdmin/isBuyer/isProcurementManager,
 * exactly like login() in auth.controller.js already reads). Rename the
 * `include`/field below to match your actual Prisma schema if it differs.
 */
export const requireAuth = async (req, res, next) => {
  try {
    const accessToken = req.headers["authorization"]?.substring(7);
    if (!accessToken) {
      return res.status(401).json({ message: "Missing access token" });
    }

    const tokenRow = await prisma.token.findFirst({
      where: { token: accessToken },
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
    };

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
