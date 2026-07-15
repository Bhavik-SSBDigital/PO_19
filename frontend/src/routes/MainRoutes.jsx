import { lazy } from "react";

// project imports
import Loadable from "components/Loadable";
import MainLayout from "layout/MainLayout";
import NotFound from "pages/404-page/NotFound";
import ChangePassword from "pages/authentication/ChangePassword";

// NOTE: the original "pages/dashboard" calls ~10 analytics endpoints that
// haven't been converted to Prisma yet (and imports "xlsx" which wasn't even
// in package.json) - it will not render against this backend. Executive
// Control Tower (below) replaces it on "/" and "/dashboard" since that's the
// one dashboard endpoint that's actually wired up end to end. Swap back to
// `import("pages/dashboard")` once you've converted the rest of
// dashboard-analytics-controller.js the same way.
const ExecutiveDashboard = Loadable(lazy(() => import("pages/executive-dashboard")));
const SearchAuditData = Loadable(lazy(() => import("pages/search-audit-data")));
const InvoiceList = Loadable(lazy(() => import("pages/invoice-po-list")));
const InvoiceListAuditor = Loadable(
  lazy(() => import("pages/invoice-po-list/auditor-view"))
);
const ManageUsers = Loadable(lazy(() => import("pages/users")));
const UserLogs = Loadable(lazy(() => import("pages/user-logs")));
const IssueTracker = Loadable(lazy(() => import("pages/issue-tracker")));
const RiskCategorization = Loadable(
  lazy(() => import("pages/risk-categorization"))
);
const VisibilitySettings = Loadable(
  lazy(() => import("pages/visibility-settings"))
);

// PO audit results (Postgres/Prisma demo page)
const PoAuditResults = Loadable(lazy(() => import("pages/po-audit-results")));

const MainRoutes = {
  path: "/",
  element: <MainLayout />,
  children: [
    { index: true, element: <ExecutiveDashboard /> },
    { path: "dashboard", element: <ExecutiveDashboard /> },
    { path: "search-data", element: <SearchAuditData /> },
    { path: "invoice-list", element: <InvoiceList /> },
    { path: "check-invoice-item", element: <InvoiceListAuditor /> },
    { path: "issue-tracker", element: <IssueTracker /> },
    { path: "manage-users", element: <ManageUsers /> },
    { path: "user-logs", element: <UserLogs /> },
    { path: "risk-categorization", element: <RiskCategorization /> },
    { path: "visibility-settings", element: <VisibilitySettings /> },
    { path: "change-password", element: <ChangePassword /> },
    // NEW
    { path: "po-audit-results", element: <PoAuditResults /> },
    { path: "*", element: <NotFound /> },
  ],
};

export default MainRoutes;
