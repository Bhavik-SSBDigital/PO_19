// utility/point-number-map.js
//
// SINGLE SOURCE OF TRUTH for the point-renumbering migration.
//
// OLD scheme (current production data): header points scattered at
// 7,8,9,11-15,19; line points at 1-6,10,16-18.
// NEW scheme (requested): header points = 1-9, line points = 10-19,
// relative order within each group preserved.
//
// Used by:
//   - scripts/migrate-point-numbers.js  (remaps already-stored DB data)
//   - scripts/seed-point-definitions.js (seeds AuditPointConfig content
//     under the NEW numbers)
//   - anything that needs to translate an OLD pointNo appearing in old
//     exports/backups to the NEW numbering.
//
// If audit_engine.py / addpo.js / addheader.js still emit OLD numbers
// after this migration, every future import will re-introduce old
// numbers. Those Python/loader files MUST be updated to emit NEW numbers
// BEFORE re-running any import job. (Not included here - I don't have
// those files. See chat message.)

export const OLD_TO_NEW_POINT_MAP = {
  // ---- former HEADER points (7,8,9,11-15,19) -> new 1-9 ----
  7: 1, // RC Released
  8: 2, // RC Assigned Consistently
  9: 3, // GST Tax Logic
  11: 4, // MSME Vendor Payment Term
  12: 5, // General Vendor Payment Term
  13: 6, // EYW Inco-Term Requires Freight Condition
  14: 7, // EXW/FCA Must NOT Carry Freight Condition
  15: 8, // Rate Approval by Authorised Approver
  19: 9, // Multiple POs to Same Vendor, Same Day

  // ---- former LINE points (1-6,10,16-18) -> new 10-19 ----
  1: 10, // Release Verification
  2: 11, // PR Assigned to PO Line
  3: 12, // PR Creation Date Within 6 Months of PO
  4: 13, // PR Date Precedes PO Date
  5: 14, // Delivery Date After PR Date
  6: 15, // PO Quantity vs PR Quantity (Tolerance)
  10: 16, // Vendor-Material Tax Code Consistency
  16: 17, // Service PO (ZSER) Item Category
  17: 18, // Service PO (ZCSR) Item Category
  18: 19, // ZLRM Must Not Use Service Item Category
};

// Sanity: bijection over 1..19
const _newVals = Object.values(OLD_TO_NEW_POINT_MAP);
if (
  Object.keys(OLD_TO_NEW_POINT_MAP).length !== 19 ||
  new Set(_newVals).size !== 19 ||
  Math.min(..._newVals) !== 1 ||
  Math.max(..._newVals) !== 19
) {
  throw new Error(
    "OLD_TO_NEW_POINT_MAP is not a valid 1:1 mapping over points 1-19 - fix before running any migration.",
  );
}

export function mapOldToNew(oldPointNo) {
  const n = Number(oldPointNo);
  if (!(n in OLD_TO_NEW_POINT_MAP)) {
    throw new Error(`No mapping defined for old pointNo=${oldPointNo}`);
  }
  return OLD_TO_NEW_POINT_MAP[n];
}
