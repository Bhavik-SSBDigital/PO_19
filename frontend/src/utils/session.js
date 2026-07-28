// Central place that knows how THIS app's login flow actually stores
// RBAC info in localStorage (confirmed via devtools):
//
//   role              -> a single string: "isAdmin" | "isBuyer" |
//                         "isProcurementManager" | legacy values like
//                         "isAuditHead" / "isAuditor" / "isExecutor" / "SSBD"
//   canViewDashboard  -> "true" | "false"
//   username          -> plain string, e.g. "admin"
//
// There is NOT a separate isAdmin/isBuyer/isProcurementManager key each -
// everything is derived from that one `role` string. Read RBAC state
// through `getRbac()` everywhere (Navigation, route guards, PO Data page)
// so there's a single place to update if the storage shape ever changes.

const flagsFromRole = (role) => ({
  isAdmin: role === "isAdmin",
  isBuyer: role === "isBuyer",
  isProcurementManager: role === "isProcurementManager",
});

export const getRbac = () => {
  const role = localStorage.getItem("role") || "";
  const canViewDashboardRaw = localStorage.getItem("canViewDashboard");

  return {
    ...flagsFromRole(role),
    role,
    // Existing app default: absent/null means "true" (matches the
    // original Navigation.jsx behavior - only an explicit "false" hides it).
    canViewDashboard: canViewDashboardRaw === "false" ? false : true,
    userName: localStorage.getItem("username") || "",
  };
};
