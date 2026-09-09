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
export function computeClientTally(points = []) {
  const total = points.length;
  let checkedCount = 0;
  let remarkedCount = 0;
  let alteredCount = 0;
  let informativeCount = 0;

  for (const p of points) {
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
