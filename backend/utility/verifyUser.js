import { prisma } from "../lib/prisma.js";

/**
 * Verifies a bearer token against the `tokens` table and returns the
 * associated user (with role flags flattened on, matching what the login
 * response also returns) or the string "Unauthorized" - same contract
 * visibility-settings-handler.js already expects:
 *   const userData = await verifyUser(accessToken);
 *   if (userData === "Unauthorized") { ... }
 *
 * NOTE: I don't have your real utility/verifyUser.js source, so this is a
 * reconstruction based on how it's called from visibility-settings-handler.js
 * (pass a raw token string, get back either "Unauthorized" or an object with
 * at least `.userId`). Swap in your real implementation if it differs.
 */
export const verifyUser = async (accessToken) => {
  if (!accessToken) return "Unauthorized";

  const token = await prisma.token.findFirst({
    where: { token: accessToken },
    include: { user: { include: { role: true } } },
  });

  if (!token || !token.user) return "Unauthorized";
  if (token.expiresAt && token.expiresAt < new Date()) return "Unauthorized";

  const { user } = token;
  return {
    userId: user.id,
    username: user.username,
    firstName: user.firstName,
    lastName: user.lastName,
    roleId: user.roleId,
    isAuditHead: !!user.role?.isAuditHead,
    isAdmin: !!user.role?.isAdmin,
    isAuditor: !!user.role?.isAuditor,
    isExecutor: !!user.role?.isExecutor,
    fromSSBD: !!user.role?.fromSSBD,
  };
};
