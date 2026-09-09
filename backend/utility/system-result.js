// utility/system-result.js
//
// Single source of truth for turning one point's raw result object into
// the human label used everywhere: the remark-submission default, the
// Buyer Remarks Report, and the Issue Tracker export.

export const SYSTEM_RESULT_OPTIONS = [
  "Verified",
  "Not Verified",
  "Not Applicable",
  "Manual Review Required",
];

export function systemResultLabel(point) {
  if (!point) return "Point not found on system result";
  if (point.not_applicable) return "Not Applicable";
  if (point.manual_verification) return "Manual Review Required";
  if (point.verified) return "Verified";
  return "Not Verified";
}

export function findSystemPoint(pointsArray, pointNo) {
  return (
    (pointsArray || []).find((p) => String(p.pointNo) === String(pointNo)) ||
    null
  );
}

// Validates/normalizes whatever the buyer picked in the "Buyer's Result"
// dropdown. Falls back to the system's own label if nothing sane was sent.
export function normalizeBuyerResult(buyerResult, systemPoint) {
  const fallback = systemResultLabel(systemPoint);
  if (!buyerResult) return fallback;
  const trimmed = String(buyerResult).trim();
  return SYSTEM_RESULT_OPTIONS.includes(trimmed) ? trimmed : fallback;
}
