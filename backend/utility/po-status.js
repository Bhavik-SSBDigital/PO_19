/**
 * ============================================================================
 * po-status.js  -  ONE definition of "Closed / Pending / Status", shared by
 *   - the Executive Dashboard summary tables  (po-status-controller.js)
 *   - the PO-wise list                        (po-data-controller.js)
 * so the dashboard and the list can never disagree again.
 *
 * Per point (header or line):
 *   Verified        -> Closed  (nothing to do)
 *   Not Applicable  -> Closed  (nothing to do)
 *   Not Verified    -> Closed  if it is covered (checkedPoints OR any remark)
 *                      Pending otherwise            [same rule as Remarks Impact]
 *   Manual          -> never pending (it is not a Not Verified point; shown as its own row)
 *
 * Per PO (header + all its lines together):
 *   perfect    no Not Verified point anywhere
 *   reviewed   had Not Verified points, ALL addressed, nothing pending
 *   in_review  at least one point addressed, but something still pending
 *   pending    something pending and NOTHING addressed yet
 * ============================================================================
 */
import { classifyPoint } from "./severity.js";
import { getMandatoryPoints } from "./not-verified-scope.js";
import { isPointCovered } from "./effective-result.js";

export const emptyCounts = () => ({
  total: 0,
  verified: 0,
  notVerified: 0, // system-flagged (frozen) - same set Remarks Impact uses
  na: 0,
  manual: 0,
  nvClosed: 0, // Not Verified AND covered by a check/remark
  nvPending: 0, // Not Verified and still nobody acted
});

export function addCounts(target, c) {
  for (const k of Object.keys(target)) target[k] += c[k] || 0;
  return target;
}

/** Counts for ONE header record or ONE line row. */
export function analyseRecord(results, checkedPoints, remarkedNos = []) {
  const c = emptyCounts();
  for (const p of results || []) {
    const s = classifyPoint(p);
    if (s === "verified") c.verified++;
    else if (s === "na") c.na++;
    else if (s === "manual") c.manual++;
  }
  // Not Verified set = exactly what the Remarks Impact cards use.
  const mandatory = getMandatoryPoints(results);
  c.notVerified = mandatory.length;
  for (const p of mandatory) {
    if (isPointCovered(p.pointNo, checkedPoints, remarkedNos)) c.nvClosed++;
    else c.nvPending++;
  }
  c.total = c.verified + c.na + c.manual + c.notVerified;
  return c;
}

// Pending counts ONLY Not Verified points that nobody has checked or remarked.
// Manual points are not Not Verified, so they never make anything pending.
export const pendingPointsOf = (c) => c.nvPending;
// Manual points are neither closed nor pending: they are reported separately.
export const closedPointsOf = (c) => c.verified + c.na + c.nvClosed;

/** h = header counts, l = line counts (already summed over all lines). */
export function poStatusOf(h, l) {
  const nv = h.notVerified + l.notVerified;
  const closedNv = h.nvClosed + l.nvClosed;
  const pending = pendingPointsOf(h) + pendingPointsOf(l);
  if (nv === 0 && pending === 0) return "perfect";
  if (pending === 0) return "reviewed";
  return closedNv > 0 ? "in_review" : "pending";
}

/** WHY is a PO pending: header problem, line problem, or both. */
export function pendingSourceOf(h, l) {
  const hp = pendingPointsOf(h) > 0;
  const lp = pendingPointsOf(l) > 0;
  if (hp && lp) return "both";
  if (hp) return "header";
  if (lp) return "line";
  return "none";
}

/** rows -> Map(key -> unique pointNo[]) */
export function groupRemarkedPoints(remarkRows, keyOf) {
  const map = new Map();
  for (const r of remarkRows || []) {
    const key = keyOf(r);
    if (!map.has(key)) map.set(key, new Set());
    map.get(key).add(Number(r.pointNo));
  }
  const out = new Map();
  for (const [k, s] of map) out.set(k, [...s]);
  return out;
}

export const PO_STATUS_ORDER = ["pending", "in_review", "reviewed", "perfect"];
