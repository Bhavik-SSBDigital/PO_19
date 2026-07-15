import express from "express";
import { login, signup, logout } from "./controller/user-controller.js";
import {
  get_po_audit_results,
  get_po_audit_result,
} from "./controller/po-controller.js";
import {
  getExecutiveSummary,
  getFilterOptions,
  getExecutiveDrilldown,
} from "./controller/dashboard-controller.js";
import {
  get_audit_results,
  get_audit_result,
} from "./controller/audit-controller.js";

const router = express.Router();

// --- Auth (minimal, see controller/user-controller.js header comment) ---
router.post("/signup", signup);
router.post("/signin", login);
router.post("/logout", logout);

// --- General audit results (any type: PO/BPV/PJV/NONPO) ---
router.post("/getAuditResults", get_audit_results);
router.post("/getAuditResult", get_audit_result);

// --- PO audit (the one converted controller) ---
router.post("/getPOAuditResults", get_po_audit_results);
router.post("/getPOAuditResult", get_po_audit_result);

// --- Dashboard (Executive P2P Compliance Control Tower - page 1 of 12) ---
router.post("/reports/executive-summary", getExecutiveSummary);
router.post("/reports/filter-options", getFilterOptions);
router.post("/reports/executive-drilldown", getExecutiveDrilldown);

// NOTE: this is a deliberately trimmed-down router for demo purposes. Your
// real routes.js wires up more controllers (non-po-controller,
// bpv-controller, points-controller, role-controller, and the other 11
// dashboard pages from Dashboard_Product_Design.docx) that haven't been
// converted to Prisma yet - hitting any of those routes against this
// backend will 404. Add each one back in here as you convert it, following
// the same import-and-mount pattern as the lines above.

export default router;
