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
  getPoTypesForFilter, // NEW
  getPlantsForFilter, // NEW
} from "./controller/po-data-controller.js";
import {
  getExecutiveSummary,
  getFilterOptions,
  getExecutiveDrilldown,
  // getPointDefinitions,
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
//
// FIX: these three previously had NO requireAuth, so req.user was always
// undefined here - dashboard-controller.js's Buyer-vs-everyone-else
// purchase_group scoping silently never activated (a Buyer saw
// company-wide numbers and could drill into any PO, same bug that PO Data
// and RC Overlap were already fixed for).
//
// requireAuth ONLY (no requireAnyOf) is intentional: the Role model only
// tracks isAdmin/isBuyer/isProcurementManager, but the dashboard is also
// meant to stay reachable by other roles (head/auditor/executor/ssbd per
// the sidebar nav config) that have none of those three flags set. Gating
// with requireAnyOf(those three) would incorrectly 403 those roles.
// dashboard-controller.js's own logic already does the right thing once
// req.user is populated: only an actual Buyer gets scoped down; every
// other authenticated role (including ones with all three flags false)
// stays unrestricted, exactly as before.
router.post("/reports/executive-summary", requireAuth, getExecutiveSummary);
router.post("/reports/filter-options", requireAuth, getFilterOptions);
router.post("/reports/executive-drilldown", requireAuth, getExecutiveDrilldown);

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

// NEW — PO type and plant option lists for the advanced filter dropdowns.
// Not purchasing-group scoped, so any of the three PO-Data-page roles can
// fetch them.
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

// --- Buyer point-level remarks ---
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

// --- RC Overlap (Buyer scoped to own group via derived purchaseGroups[],
// PM + Admin see all) --- rc-overlap-controller.js does its own internal
// role checks (isAdmin/isBuyer/isProcurementManager) and 403s anyone else,
// so no requireAnyOf is needed here beyond requireAuth populating req.user.
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
