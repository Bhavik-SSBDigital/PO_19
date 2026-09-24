import express from "express";
import {
  getRcOverlapResults,
  getRcOverlapDetail,
  getRcOverlapSummary,
} from "./controller/rc-overlap-controller.js";
import { downloadRcOverlapReport } from "./controller/rc-overlap-export-controller.js";
import {
  login,
  signup,
  logout,
  getRoles,
  get_users,
  deleteUser,
  changePassword,
  editUser,
  forgotPassword,
} from "./controller/user-controller.js";

import { requireAnyOf, requireAuth } from "./middleware/requireAuth.js";
import {
  get_po_audit_results,
  get_po_audit_result,
  get_po_lines,
} from "./controller/po-controller.js";
import {
  getPoWiseExceptions,
  getPoHeaderWiseDetails,
  getPurchaseGroupsForFilter,
  getPoTypesForFilter,
  getPlantsForFilter,
} from "./controller/po-data-controller.js";
import {
  getExecutiveSummary,
  getFilterOptions,
  getExecutiveDrilldown,
  getExecutiveHeaderDrilldown,
  getExecutiveHeaderKpiDrilldown,
  getRemarksImpactSummary,
  getRemarksImpactList,
} from "./controller/dashboard-controller.js";

import {
  updateAuditPointSeverity,
  getAuditPointConfig,
  reloadPointConfig,
} from "./controller/risk-categorization-controller.js";

import {
  submitPoRemark,
  getPoRemarks,
  deletePoRemark,
  updatePoRemark,
  setAuditResultCheckedStatus,
  togglePointChecked,
} from "./controller/po-remarks-controller.js";

import {
  getPoRemarksReport,
  downloadPoRemarksReport,
  getPoRemarksReportFilters,
  downloadIssueTrackerReport,
} from "./controller/po-remarks-report-controller.js";

import {
  getPoHeaderSummary,
  getPoHeaderRemarks,
  submitPoHeaderRemark,
  updatePoHeaderRemark,
  deletePoHeaderRemark,
  setPoHeaderCheckedStatus,
  toggleHeaderPointChecked,
} from "./controller/po-header-controller.js";

// RC-LEVEL remarks (NEW) — mirrors po-remarks-controller.js / the header
// remark functions above, but scoped to a single RC Overlap record. See
// controller/rc-remarks-controller.js for the access-control notes.
import {
  submitRcRemark,
  updateRcRemark,
  getRcRemarks,
  deleteRcRemark,
  setRcCheckedStatus,
} from "./controller/rc-remarks-controller.js";

// "Accumulated" exports (full-table, unscoped) — see item 3 of the build
// spec / the file header comment in accumulated-export-controller.js.
import {
  downloadAccumulatedPoLineExport,
  downloadAccumulatedPoHeaderExport,
  downloadAccumulatedRcExport,
} from "./controller/accumulated-export-controller.js";

// Processing History (item 1) — read-only list of completed sync batches.
import { getProcessingHistory } from "./controller/processing-history-controller.js";

const router = express.Router();

// --- Auth ---
router.post("/signup", signup);
router.post("/signin", login);
router.post("/logout", logout);
router.post("/changePassword", changePassword);

router.put("/users/:id", requireAuth, requireAnyOf("isAdmin"), editUser);

// Forgot password.
// User must provide username + email.
// A new temporary password is generated and emailed.
router.post("/forgotPassword", forgotPassword);

// --- PO Audit ---
router.post("/getPOAuditResults", requireAuth, get_po_audit_results);
router.post("/getPOAuditResult", requireAuth, get_po_audit_result);

// --- Dashboard (Executive P2P Compliance Control Tower) ---
router.post("/reports/executive-summary", requireAuth, getExecutiveSummary);
router.post(
  "/reports/remarks-impact-summary",
  requireAuth,
  getRemarksImpactSummary,
);
router.post("/reports/remarks-impact-list", requireAuth, getRemarksImpactList);
router.post("/reports/filter-options", requireAuth, getFilterOptions);
router.post("/reports/executive-drilldown", requireAuth, getExecutiveDrilldown);
router.post(
  "/reports/executive-header-kpi-drilldown",
  requireAuth,
  getExecutiveHeaderKpiDrilldown,
);
router.post(
  "/reports/executive-header-drilldown",
  requireAuth,
  getExecutiveHeaderDrilldown,
);

router.get("/getRoles", getRoles);
router.get("/getUsers", get_users);

// --- PO Lines ---
// FIX: requireAuth was missing here, so req.user was always {} — the new
// buyer-remark visibility filtering in get_po_lines needs req.user to know
// who's asking.
router.post("/reports/po-lines", requireAuth, get_po_lines);

router.delete("/deleteUser/:id", deleteUser);

// --- PO Data / Advanced Filters ---
router.post(
  "/reports/po-data",
  requireAuth,
  requireAnyOf("isAdmin", "isBuyer", "isProcurementManager", "isSsbDigital"),
  getPoWiseExceptions,
);

router.post(
  "/reports/po-header-data",
  requireAuth,
  requireAnyOf("isAdmin", "isBuyer", "isProcurementManager", "isSsbDigital"),
  getPoHeaderWiseDetails,
);

router.post(
  "/reports/purchase-groups",
  requireAuth,
  requireAnyOf("isAdmin", "isProcurementManager", "isSsbDigital"),
  getPurchaseGroupsForFilter,
);

router.post(
  "/reports/po-types",
  requireAuth,
  requireAnyOf("isAdmin", "isBuyer", "isProcurementManager", "isSsbDigital"),
  getPoTypesForFilter,
);
router.post(
  "/reports/plants",
  requireAuth,
  requireAnyOf("isAdmin", "isBuyer", "isProcurementManager", "isSsbDigital"),
  getPlantsForFilter,
);

router.get("/reports/audit-point-config", getAuditPointConfig);
router.post("/reports/audit-point-config", getAuditPointConfig);
router.post("/risk-categorization/update-severity", updateAuditPointSeverity);
// Admin-only. Call after `node scripts/seed-point-definitions.js` so a
// running server picks up edited title/summary/logic text without a
// restart - see scripts/POINT_CHANGE_PROCESS.md.
router.post("/risk-categorization/reload-point-config", reloadPointConfig);

// --- Buyer point-level remarks (LINE-LEVEL) ---
router.post(
  "/po-remarks/search",
  requireAuth,
  requireAnyOf("isBuyer", "isAdmin", "isProcurementManager", "isSsbDigital"),
  getPoRemarks,
);

router.post(
  "/po-remarks",
  requireAuth,
  requireAnyOf("isBuyer"),
  submitPoRemark,
);
router.post(
  "/updatePoRemark",
  requireAuth,
  requireAnyOf("isBuyer"),
  updatePoRemark,
);
router.delete(
  "/po-remarks/:id",
  requireAuth,
  requireAnyOf("isBuyer"),
  deletePoRemark,
);

router.post(
  "/setAuditResultCheckedStatus",
  requireAuth,
  requireAnyOf("isBuyer", "isAdmin", "isProcurementManager"),
  setAuditResultCheckedStatus,
);

router.post(
  "/po-remarks/toggle-point-checked",
  requireAuth,
  requireAnyOf("isBuyer"),
  togglePointChecked,
);

router.post(
  "/po-header-remarks/toggle-point-checked",
  requireAuth,
  requireAnyOf("isBuyer"),
  toggleHeaderPointChecked,
);

router.post(
  "/reports/po-remarks-report/issue-tracker-download",
  requireAuth,
  requireAnyOf("isBuyer", "isAdmin", "isProcurementManager", "isSsbDigital"),
  downloadIssueTrackerReport,
);

// --- HEADER-LEVEL (PO-wide) system ---
router.post("/getPOHeaderSummary", requireAuth, getPoHeaderSummary);

router.post(
  "/po-header-remarks/search",
  requireAuth,
  requireAnyOf("isBuyer", "isAdmin", "isProcurementManager", "isSsbDigital"),
  getPoHeaderRemarks,
);
router.post(
  "/po-header-remarks",
  requireAuth,
  requireAnyOf("isBuyer"),
  submitPoHeaderRemark,
);
router.post(
  "/updatePoHeaderRemark",
  requireAuth,
  requireAnyOf("isBuyer"),
  updatePoHeaderRemark,
);
router.delete(
  "/po-header-remarks/:id",
  requireAuth,
  requireAnyOf("isBuyer"),
  deletePoHeaderRemark,
);
router.post(
  "/setPoHeaderCheckedStatus",
  requireAuth,
  requireAnyOf("isBuyer", "isAdmin", "isProcurementManager"),
  setPoHeaderCheckedStatus,
);

// --- RC Overlap ---
router.post("/reports/rc-overlap", requireAuth, getRcOverlapResults);
router.post("/reports/rc-overlap-detail", requireAuth, getRcOverlapDetail);
router.post("/reports/rc-overlap-summary", requireAuth, getRcOverlapSummary);
router.post(
  "/reports/rc-overlap/download",
  requireAuth,
  downloadRcOverlapReport,
);

// --- RC-LEVEL remarks (NEW) ---
// Matches the RcOverlapDetailDialog.jsx frontend, which calls these via
// the existing `post` axios helper only (including for delete), so there
// is no new axios helper to add on the frontend. deleteRcRemark also
// accepts the id from req.params if you'd rather call this with the
// DELETE method/:id style used by po-remarks/po-header-remarks below —
// both styles work against the same controller function.
router.post(
  "/rc-remarks",
  requireAuth,
  requireAnyOf("isBuyer", "isAdmin", "isProcurementManager", "isSsbDigital"),
  getRcRemarks,
);
router.post(
  "/rc-remarks/submit",
  requireAuth,
  requireAnyOf("isBuyer"),
  submitRcRemark,
);
router.post(
  "/rc-remarks/update",
  requireAuth,
  requireAnyOf("isBuyer"),
  updateRcRemark,
);
router.post(
  "/rc-remarks/delete",
  requireAuth,
  requireAnyOf("isBuyer"),
  deleteRcRemark,
);
router.post(
  "/rc-remarks/toggle-checked",
  requireAuth,
  requireAnyOf("isBuyer", "isAdmin", "isProcurementManager"),
  setRcCheckedStatus,
);

router.post(
  "/reports/po-remarks-report",
  requireAuth,
  requireAnyOf("isBuyer", "isAdmin", "isProcurementManager", "isSsbDigital"),
  getPoRemarksReport,
);
router.post(
  "/reports/po-remarks-report/filters",
  requireAuth,
  requireAnyOf("isBuyer", "isAdmin", "isProcurementManager", "isSsbDigital"),
  getPoRemarksReportFilters,
);
router.post(
  "/reports/po-remarks-report/download",
  requireAuth,
  requireAnyOf("isBuyer", "isAdmin", "isProcurementManager", "isSsbDigital"),
  downloadPoRemarksReport,
);

// --- Accumulated exports (item 3) ---
// Decision point from the build spec: Buyer/Procurement Manager are left
// OUT of these three on purpose (full, unscoped dump of the entire table -
// not something a purchase-group-restricted role should get). Add
// "isBuyer"/"isProcurementManager" here if that intent changes.
router.post(
  "/reports/accumulated/po-lines/download",
  requireAuth,
  requireAnyOf("isAdmin", "isSsbDigital"),
  downloadAccumulatedPoLineExport,
);
router.post(
  "/reports/accumulated/po-headers/download",
  requireAuth,
  requireAnyOf("isAdmin", "isSsbDigital"),
  downloadAccumulatedPoHeaderExport,
);
router.post(
  "/reports/accumulated/rc/download",
  requireAuth,
  requireAnyOf("isAdmin", "isSsbDigital"),
  downloadAccumulatedRcExport,
);

// --- Processing History (item 1) ---
// Read-only; same visibility as the accumulated exports above.
router.post(
  "/reports/processing-history",
  requireAuth,
  requireAnyOf("isAdmin", "isSsbDigital"),
  getProcessingHistory,
);

export default router;
