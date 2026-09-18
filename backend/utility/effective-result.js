// utility/effective-result.js
//
// Single source of truth for the TWO derived dimensions that sit on top of
// a point's frozen system result + its remarks. Neither dimension EVER
// writes back to AuditResult.results / PoHeaderResult.results /
// RcOverlapResult.status - those stay exactly as the engine computed them,
// forever. Everything here is read-time derivation only.
//
// DIMENSION A - coverage (isPointCovered / isRcCovered):
//   Drives every "Not Verified" PENDING vs CLOSED count anywhere in the
//   app. A mandatory point is "closed" the instant it has ANY remark (or
//   is manually checked) against it - regardless of what the buyer's
//   opinion was. This is intentionally opinion-agnostic: agreeing with the
//   system, disagreeing with it, or leaving a purely informative note all
//   close the point equally. Do NOT gate this on isSystemResultWrong.
//
// DIMENSION B - "Is PO corrected?" (isPoCorrected):
//   A purely descriptive reporting label, meaningful only for points that
//   are ALREADY covered (Dimension A decided that independently). Answers
//   "did the buyer say the system's result was wrong and correct it
//   (Yes -> 'PO Corrected'), or did they just leave an informative remark
//   agreeing with the system (No -> 'System Altercation')?" This label
//   must never be summed into, or gate, any pending/closed count.
//
// Both helpers are thin wrappers around point-tally.js's own
// pointStatus()/computeTally() (Dimension A) and the isSystemResultWrong
// flag already stored on PoRemark/PoHeaderRemark/PoRcRemark (Dimension B)
// - they do not reimplement or duplicate that logic.

import { pointStatus } from "./point-tally.js";

/**
 * DIMENSION A - is this point "closed" (covered), independent of opinion?
 *
 * @param {number|string} pointNo
 * @param {number[]} checkedPoints
 * @param {number[]} remarkedPointNos - distinct pointNos that have >=1 remark
 * @returns {boolean}
 */
export function isPointCovered(
  pointNo,
  checkedPoints = [],
  remarkedPointNos = [],
) {
  return pointStatus(pointNo, checkedPoints, remarkedPointNos) !== "pending";
}

/**
 * DIMENSION A, RC variant - an RC has exactly one mandatory check, so
 * "covered" is simply: locked (auto-closed on remark, see
 * rc-remarks-controller.js) OR already has at least one remark.
 *
 * @param {{remarksLocked?: boolean}} rc
 * @param {number} remarkCountForRc
 * @returns {boolean}
 */
export function isRcCovered(rc, remarkCountForRc = 0) {
  return !!rc?.remarksLocked || remarkCountForRc > 0;
}

/**
 * DIMENSION B - was this point/RC's system result corrected by the buyer,
 * per the latest remark? Returns null if there is no remark yet (the
 * question doesn't apply until the point is covered).
 *
 * @param {Array<{isSystemResultWrong?: boolean, submittedAt?: Date|string}>} remarksForPoint
 *   Any order is fine - this picks the most recently submitted one.
 * @returns {boolean|null} true = "PO Corrected", false = "System Altercation",
 *   null = not yet covered / no remark
 */
export function isPoCorrected(remarksForPoint) {
  if (!remarksForPoint || remarksForPoint.length === 0) return null;
  const latest = [...remarksForPoint].sort(
    (a, b) => new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0),
  )[0];
  return !!latest.isSystemResultWrong;
}

/**
 * Human label for Dimension B, for direct use in report/export columns.
 * @param {Array} remarksForPoint
 * @returns {"PO Corrected"|"System Altercation"|null}
 */
export function poCorrectedLabel(remarksForPoint) {
  const corrected = isPoCorrected(remarksForPoint);
  if (corrected === null) return null;
  return corrected ? "PO Corrected" : "System Altercation";
}
