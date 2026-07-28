import { Navigate } from "react-router-dom";
import { getRbac } from "utils/session";

/**
 * Wrap a route element to gate it behind one or more RBAC flags from
 * getRbac() (isAdmin / isBuyer / isProcurementManager). If the user has
 * none of the listed flags, they're bounced to the dashboard.
 *
 * This is a UX convenience only - it hides pages the user shouldn't be
 * navigating to. It is NOT a security boundary; every corresponding API
 * endpoint (e.g. /reports/po-data, /manage-users) must independently
 * enforce the same rule server-side using the authenticated req.user.
 *
 * Usage in your routes config:
 *
 *   <Route
 *     path="/po-data"
 *     element={
 *       <RequireRbac anyOf={["isAdmin", "isBuyer", "isProcurementManager"]}>
 *         <PoDataPage />
 *       </RequireRbac>
 *     }
 *   />
 *   <Route
 *     path="/manage-users"
 *     element={<RequireRbac anyOf={["isAdmin"]}><UserManagementPage /></RequireRbac>}
 *   />
 */
const RequireRbac = ({ anyOf = [], children }) => {
  const rbac = getRbac();
  const allowed = anyOf.length === 0 || anyOf.some((flag) => rbac[flag]);
  if (!allowed) return <Navigate to="/" replace />;
  return children;
};

export default RequireRbac;
