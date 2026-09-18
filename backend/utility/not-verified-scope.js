// utility/not-verified-scope.js
//
// Single source of truth for "which points are MANDATORY for a section to
// auto-close". Only points the system originally classified "Not Verified"
// are mandatory — a point the system already marked Verified / Not
// Applicable / Manual Review Required was never something the buyer had to
// act on, and must never block (or count toward) a section's closure tally.
//
// This does NOT change what "covered" means (checked OR remarked — see
// point-tally.js) - it only changes WHICH points are counted at all. Every
// caller that used to pass a full `results`/`points` array into
// computeTally() must instead pass `getMandatoryPoints(results)` so the
// tally (and therefore auto-close) is scoped correctly for header, line,
// and (conceptually) RC checks alike.
//
// Works against the raw AuditResult.results / PoHeaderResult.results JSON
// (objects with .verified / .not_applicable / .manual_verification /
// .pointNo), i.e. BEFORE point-definitions.js enrichment - systemResultLabel
// from system-result.js only looks at those three booleans, so it works
// identically on raw or enriched points.

import { systemResultLabel } from "./system-result.js";

/**
 * @param {Array<object>} points - raw or enriched point result objects
 * @returns {Array<object>} only the points that are mandatory (system
 *   result = "Not Verified") for closure purposes
 */
export function getMandatoryPoints(points) {
  return (points || []).filter((p) => systemResultLabel(p) === "Not Verified");
}

/**
 * @param {object} point - a single raw/enriched point result object
 * @returns {boolean} true if this point is mandatory for closure
 */
export function isMandatoryPoint(point) {
  return systemResultLabel(point) === "Not Verified";
}

/**
 * Convenience: the set of pointNo values (Number) that are mandatory,
 * given the raw points array. Useful when a caller already has a separate
 * checkedPoints/remarkedPointNos list and just needs to know the mandatory
 * universe to intersect against (e.g. for building "system generated"
 * dashboard counts - see effective-result.js).
 */
export function getMandatoryPointNos(points) {
  return getMandatoryPoints(points).map((p) => Number(p.pointNo));
}
