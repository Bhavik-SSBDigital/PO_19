import express from "express";
import {
  login,
  signup,
  logout,
  getRoles,
} from "./controller/user-controller.js";
import {
  get_po_audit_results,
  get_po_audit_result,
  get_po_lines,
} from "./controller/po-controller.js";
import {
  getExecutiveSummary,
  getFilterOptions,
  getExecutiveDrilldown,
  // getPointDefinitions,
} from "./controller/dashboard-controller.js";

import {
  getAuditPointConfig,
  updateAuditPointSeverity,
} from "./controller/risk-categorization-controller.js";

const router = express.Router();

// --- Auth ---
router.post("/signup", signup);
router.post("/signin", login);
router.post("/logout", logout);

// --- PO Audit ---
router.post("/getPOAuditResults", get_po_audit_results);
router.post("/getPOAuditResult", get_po_audit_result);

// --- Dashboard (Executive P2P Compliance Control Tower) ---
router.post("/reports/executive-summary", getExecutiveSummary);

router.get("/getRoles", getRoles);
router.post("/reports/filter-options", getFilterOptions);
router.post("/reports/executive-drilldown", getExecutiveDrilldown);
// New: audit-point reference (all 19 points' descriptions) + KPI/chart
// glossary (Hold PO Ageing, Exception Value Exposure, High-Risk Exceptions,
// etc.) for the frontend to render without hardcoding either.

// --- PO Lines (Moved to po-controller for consistency) ---
router.post("/reports/po-lines", get_po_lines);

router.get("/reports/audit-point-config", getAuditPointConfig);
router.post("/reports/audit-point-config", getAuditPointConfig);
router.post("/risk-categorization/update-severity", updateAuditPointSeverity);

export default router;
