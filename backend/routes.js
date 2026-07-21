import express from "express";
import { login, signup, logout } from "./controller/user-controller.js";
import {
  get_po_audit_results,
  get_po_audit_result,
  get_po_lines,
} from "./controller/po-controller.js";
import {
  getExecutiveSummary,
  getFilterOptions,
  getExecutiveDrilldown,
} from "./controller/dashboard-controller.js";

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
router.post("/reports/filter-options", getFilterOptions);
router.post("/reports/executive-drilldown", getExecutiveDrilldown);

// --- PO Lines (Moved to po-controller for consistency) ---
router.post("/reports/po-lines", get_po_lines);

export default router;
