// frontend/src/utils/tally.js
//
// Pure, frontend-only mirror of the tally math the backend computes in
// utility/point-tally.js (computeTally). Used by SectionTallyBar so the
// buyer sees the count update the INSTANT they check a point or submit a
// remark, without waiting for a full section refetch.
//
// A point counts as "covered" if either:
//   - it has been explicitly marked "Checked" (no remark needed), or
//   - it has at least one buyer remark against it
// These two are mutually exclusive by design — the backend rejects
// checking a point that already has a remark, and vice versa (see
// togglePointChecked / toggleHeaderPointChecked).
//
// MANDATORY-POINTS SCOPING (mirrors backend/utility/not-verified-scope.js):
// only points the system originally flagged "Not Verified" are mandatory
// for closure — a point already Verified/N-A/Manual Review was never
// something the buyer had to touch, so it must never count toward
// `total`/`remaining` here. This used to count every point regardless of
// system result, which made this progress bar disagree with the actual
// auto-close condition the backend enforces (e.g. showing "3 of 9
// pending" when only those 3 were ever mandatory, so the section was
// really "3 of 3" and about to auto-close).
function isMandatoryPoint(p) {
  return !p.verified && !p.not_applicable && !p.manual_verification;
}

export function computeClientTally(points = []) {
  const mandatoryPoints = points.filter(isMandatoryPoint);
  const total = mandatoryPoints.length;
  let checkedCount = 0;
  let remarkedCount = 0;
  let alteredCount = 0;
  let informativeCount = 0;

  for (const p of mandatoryPoints) {
    const remarks = p.buyerRemarks || [];
    if (remarks.length > 0) {
      remarkedCount += 1;
      if (remarks.some((r) => r.isSystemResultWrong)) {
        alteredCount += 1;
      } else {
        informativeCount += 1;
      }
    } else if (p.checked) {
      checkedCount += 1;
    }
  }

  const covered = checkedCount + remarkedCount;
  const remaining = total - covered;

  return {
    total,
    covered,
    remaining,
    isComplete: total > 0 && remaining === 0,
    checkedCount,
    remarkedCount,
    alteredCount,
    informativeCount,
  };
}
