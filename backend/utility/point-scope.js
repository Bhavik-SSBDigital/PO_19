// utility/point-scope.js
//
// Single source of truth for which audit points are HEADER-LEVEL (apply to
// the whole PO, computed/closed once per PO) vs LINE-LEVEL (apply to one
// PO line item, computed/closed per line). po-controller.js,
// po-header-controller.js, and dashboard-controller.js all import this so
// the split can never drift between endpoints.
//
// UPDATED per the client's revised "Procurement audit points.xlsx"
// (column A, "Header/line item level"): rules 7 (RC Released), 8 (RC
// Consistency), and 19 (Multiple POs Same Day) are now HEADER-LEVEL - all
// three are genuinely PO-wide facts (RC status/consistency is a
// PO+material property; "same vendor/date/plant/purchasing-group" uses
// only PO-header fields, no line-item component at all). Previously these
// three were treated as line-level "Others".

export const HEADER_LEVEL_RULE_NOS = [7, 8, 9, 11, 12, 13, 14, 15, 19];
export const LINE_LEVEL_RULE_NOS = [1, 2, 3, 4, 5, 6, 10, 16, 17, 18];

// Everything that lives in AuditResult.results (the line-item table), in
// display order. Currently identical to LINE_LEVEL_RULE_NOS - kept as a
// separate export so callers that mean "what's on the line-item table"
// don't have to know that's the same set as "line-level classification"
// if that ever changes again.
export const LINE_TABLE_RULE_NOS = [...LINE_LEVEL_RULE_NOS];

const HEADER_SET = new Set(HEADER_LEVEL_RULE_NOS);

export function isHeaderLevelPoint(pointNo) {
  return HEADER_SET.has(Number(pointNo));
}
