// utility/point-scope.js
//
// Single source of truth for which audit points are HEADER-LEVEL (whole PO,
// computed/closed once per PO) vs LINE-LEVEL (one PO line item).
//
// RENUMBERED (per client request): after the migration, header points are
// CONTIGUOUS 1-9 and line points are CONTIGUOUS 10-19. This makes the
// check a simple range comparison, which is intentional - one less place
// for the two lists to drift apart. If you ever need the pre-migration
// (old) numbers, see utility/point-number-map.js - do NOT reuse this
// file's ranges against old data.
//
// po-controller.js, po-header-controller.js, and dashboard-controller.js
// all import this so the split can never drift between endpoints.

export const HEADER_LEVEL_RULE_NOS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
export const LINE_LEVEL_RULE_NOS = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19];

// Everything that lives in AuditResult.results (the line-item table), in
// display order. Kept as a separate export so callers that mean "what's on
// the line-item table" don't have to assume that's the same set as "line
// classification" if that ever changes again.
export const LINE_TABLE_RULE_NOS = [...LINE_LEVEL_RULE_NOS];

const HEADER_MIN = 1;
const HEADER_MAX = 9;

export function isHeaderLevelPoint(pointNo) {
  const n = Number(pointNo);
  return n >= HEADER_MIN && n <= HEADER_MAX;
}

export function isLineLevelPoint(pointNo) {
  return !isHeaderLevelPoint(pointNo);
}
