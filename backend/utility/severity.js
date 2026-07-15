// ---------------------------------------------------------------------------
// ASSUMPTION (confirm with client): the dashboard design doc doesn't specify
// severity per audit point, only that severity exists (Critical/High/Medium/
// Low) as a KPI/filter dimension. This mapping is a reasonable business-risk
// judgement - statutory/tax/MSME issues rated Critical, approval/RC/quantity
// control issues High, date-sequencing/categorisation issues Medium, cosmetic
// freight-condition issues Low. Not authoritative.
//
// Single source of truth: dashboard-controller.js (aggregates) and
// po-controller.js (row-level severity/point filters) both import this file
// so a "Critical exception" means the exact same thing in every endpoint.
// ---------------------------------------------------------------------------
export const RULE_SEVERITY = {
  1: "High",
  2: "High",
  3: "Medium",
  4: "Medium",
  5: "Low",
  6: "High",
  7: "High",
  8: "Medium",
  9: "Critical",
  10: "Medium",
  11: "Critical",
  12: "Medium",
  13: "Low",
  14: "Low",
  15: "High",
  16: "Medium",
  17: "Medium",
  18: "Medium",
  19: "High", // RC overlap - same risk tier as other RC-integrity points (7, 8)
};

export const SEVERITY_LEVELS = ["Critical", "High", "Medium", "Low"];

export const severityOf = (pointNo) =>
  RULE_SEVERITY[String(pointNo)] || "Medium";

// ---------------------------------------------------------------------------
// There is no per-point rule-description dataset anywhere in this codebase
// (checked seed.js, addpo.js, the risk-categorization page, and every page
// that references `pointNo` - none of them carry actual rule text, only the
// point number). The risk-categorization page's table even has a
// `row.description` column with nothing behind it.
//
// So "point description" below is NOT the real audit-rule wording - it's
// just the severity category spelled out (the same assumption from the
// comment above, restated in the UI instead of hidden in code). Replace
// POINT_CATEGORY_LABEL / this function with real per-point text as soon as
// you have the actual 18 rule descriptions (e.g. from
// Dashboard_Product_Design.docx or your source-of-truth rule list) - every
// endpoint and every UI element that calls pointLabel() will pick it up
// automatically, nothing else needs to change.
// ---------------------------------------------------------------------------
const POINT_LABELS = {
  1: "PR Mandatory",
  2: "PR Linked",
  3: "PR Age Check",
  4: "PR Date Validation",
  5: "Delivery Date Validation",
  6: "PR Quantity Validation",
  7: "Rate Contract Assigned",
  8: "Rate Contract Price",
  9: "GST Validation",
  10: "Vendor-Material Tax Consistency",
  11: "MSME Payment Terms",
  12: "MSME Classification",
  13: "Inco Term Validation",
  14: "Freight Condition",
  15: "DWS Approval",
  16: "Service PO Validation",
  17: "Labour PO Validation",
  18: "Duplicate PO Check",
  19: "RC Validity Overlap Check",
};

export const pointLabel = (pointNo) =>
  POINT_LABELS[pointNo] || `Audit Point ${pointNo}`;
/**
 * Classifies a single audit-point result the same way everywhere:
 * "notVerified" | "verified" | "na" | "manual"
 */
export const classifyPoint = (point = {}) => {
  if (point.not_applicable) return "na";
  if (point.manual_verification || point.missing_data) return "manual";
  if (point.verified) return "verified";
  return "notVerified";
};

/** True if this PO line has at least one exception (notVerified point). */
export const rowHasException = (row) =>
  (row.results || []).some((p) => classifyPoint(p) === "notVerified");

/** The list of notVerified points on a row, annotated with severity - used to render "why did this fail" chips in the UI. */
export const exceptionPointsOf = (row) =>
  (row.results || [])
    .filter((p) => classifyPoint(p) === "notVerified")
    .map((p) => ({
      pointNo: p.pointNo,
      severity: severityOf(p.pointNo),
      label: pointLabel(p.pointNo),
      remarks: p.remarks || [],
    }));
