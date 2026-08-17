import express from "express";
import {
  getRcOverlapResults,
  getRcOverlapDetail,
  getRcOverlapSummary,
} from "./controller/rc-overlap-controller.js";
import {
  login,
  signup,
  logout,
  getRoles,
  get_users,
  deleteUser,
  changePassword,
} from "./controller/user-controller.js";

import { requireAnyOf, requireAuth } from "./middleware/requireAuth.js";
import {
  get_po_audit_results,
  get_po_audit_result,
  get_po_lines,
} from "./controller/po-controller.js";
import {
  getPoWiseExceptions,
  getPurchaseGroupsForFilter,
  getPoTypesForFilter,
  getPlantsForFilter,
} from "./controller/po-data-controller.js";
import {
  getExecutiveSummary,
  getFilterOptions,
  getExecutiveDrilldown,
  getExecutiveHeaderDrilldown, // NEW - PO-level drilldown for the header chart
} from "./controller/dashboard-controller.js";

import {
  updateAuditPointSeverity,
  getAuditPointConfig,
} from "./controller/risk-categorization-controller.js";

import {
  submitPoRemark,
  getPoRemarks,
  deletePoRemark,
  updatePoRemark,
  setAuditResultCheckedStatus,
} from "./controller/po-remarks-controller.js";

import {
  getPoRemarksReport,
  downloadPoRemarksReport,
  getPoRemarksReportFilters,
} from "./controller/po-remarks-report-controller.js";

// NEW - the entire header-level (PO-wide) system: summary fetch, remarks
// CRUD, and the PO-level close/reopen toggle. See po-header-controller.js.
import {
  getPoHeaderSummary,
  getPoHeaderRemarks,
  submitPoHeaderRemark,
  updatePoHeaderRemark,
  deletePoHeaderRemark,
  setPoHeaderCheckedStatus,
} from "./controller/po-header-controller.js";

const router = express.Router();

// --- Auth ---
router.post("/signup", signup);
router.post("/signin", login);
router.post("/logout", logout);

router.post("/changePassword", changePassword);

// --- PO Audit ---
router.post("/getPOAuditResults", get_po_audit_results);
router.post("/getPOAuditResult", get_po_audit_result);

// --- Dashboard (Executive P2P Compliance Control Tower) ---
router.post("/reports/executive-summary", requireAuth, getExecutiveSummary);
router.post("/reports/filter-options", requireAuth, getFilterOptions);
router.post("/reports/executive-drilldown", requireAuth, getExecutiveDrilldown);
// NEW - PO-level drilldown behind the "PO Header-Level Compliance" chart.
// Separate from executive-drilldown on purpose: results here are PO
// numbers, not PO line items.
router.post(
  "/reports/executive-header-drilldown",
  requireAuth,
  getExecutiveHeaderDrilldown,
);

router.get("/getRoles", getRoles);
router.get("/getUsers", get_users);

// --- PO Lines ---
router.post("/reports/po-lines", get_po_lines);

router.delete("/deleteUser/:id", deleteUser);

// --- PO Data / Advanced Filters (Buyer scoped to own group, PM + Admin see all / narrow by group) ---
router.post(
  "/reports/po-data",
  requireAuth,
  requireAnyOf("isAdmin", "isBuyer", "isProcurementManager"),
  getPoWiseExceptions,
);

router.post(
  "/reports/purchase-groups",
  requireAuth,
  requireAnyOf("isAdmin", "isProcurementManager"),
  getPurchaseGroupsForFilter,
);

router.post(
  "/reports/po-types",
  requireAuth,
  requireAnyOf("isAdmin", "isBuyer", "isProcurementManager"),
  getPoTypesForFilter,
);
router.post(
  "/reports/plants",
  requireAuth,
  requireAnyOf("isAdmin", "isBuyer", "isProcurementManager"),
  getPlantsForFilter,
);

router.get("/reports/audit-point-config", getAuditPointConfig);
router.post("/reports/audit-point-config", getAuditPointConfig);
router.post("/risk-categorization/update-severity", updateAuditPointSeverity);

// --- Buyer point-level remarks (LINE-LEVEL) ---
router.post(
  "/po-remarks/search",
  requireAuth,
  requireAnyOf("isBuyer", "isAdmin", "isProcurementManager"),
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

// --- HEADER-LEVEL (PO-wide) system - NEW ---
// Completely separate closing/remarks system from the line-level one
// above. getPoHeaderSummary is what the search page calls when a PO
// number is searched WITHOUT a line item (header points + line-item
// picker list). setPoHeaderCheckedStatus is the PO-level close/reopen -
// independent of setAuditResultCheckedStatus (line-level) above.
router.post("/getPOHeaderSummary", requireAuth, getPoHeaderSummary);

router.post(
  "/po-header-remarks/search",
  requireAuth,
  requireAnyOf("isBuyer", "isAdmin", "isProcurementManager"),
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

// --- RC Overlap (Buyer scoped to own group via derived purchaseGroups[],
// PM + Admin see all) ---
router.post("/reports/rc-overlap", requireAuth, getRcOverlapResults);
router.post("/reports/rc-overlap-detail", requireAuth, getRcOverlapDetail);
router.post("/reports/rc-overlap-summary", requireAuth, getRcOverlapSummary);

router.post(
  "/reports/po-remarks-report",
  requireAuth,
  requireAnyOf("isBuyer", "isAdmin", "isProcurementManager"),
  getPoRemarksReport,
);
router.post(
  "/reports/po-remarks-report/filters",
  requireAuth,
  requireAnyOf("isBuyer", "isAdmin", "isProcurementManager"),
  getPoRemarksReportFilters,
);
router.post(
  "/reports/po-remarks-report/download",
  requireAuth,
  requireAnyOf("isBuyer", "isAdmin", "isProcurementManager"),
  downloadPoRemarksReport,
);

export default router;
