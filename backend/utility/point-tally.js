// utility/point-tally.js
//
// Single source of truth for the "tally" that drives auto-close, for BOTH
// the header section (1-9) and the line-item section (10-19). A point
// counts as COVERED once the buyer has either:
//   (a) marked it "Checked" (no remark needed), OR
//   (b) left at least one remark against it
// Union, not sum — a point marked checked AND later remarked only counts
// once. Auto-close fires the instant coveredCount === totalPoints.

export function computeTally(
  points,
  checkedPoints = [],
  remarkedPointNos = [],
) {
  const totalPoints = (points || []).length;
  const checkedSet = new Set((checkedPoints || []).map(Number));
  const remarkedSet = new Set((remarkedPointNos || []).map(Number));

  const coveredSet = new Set([...checkedSet, ...remarkedSet]);

  return {
    totalPoints,
    checkedCount: checkedSet.size,
    remarkedCount: remarkedSet.size,
    coveredCount: coveredSet.size,
    remainingCount: Math.max(totalPoints - coveredSet.size, 0),
    isComplete: totalPoints > 0 && coveredSet.size >= totalPoints,
    checkedPointNos: [...checkedSet],
    remarkedPointNos: [...remarkedSet],
  };
}

// Per-point status label used by the frontend to render each point's chip.
export function pointStatus(
  pointNo,
  checkedPoints = [],
  remarkedPointNos = [],
) {
  const n = Number(pointNo);
  if ((remarkedPointNos || []).map(Number).includes(n)) return "remarked";
  if ((checkedPoints || []).map(Number).includes(n)) return "checked";
  return "pending";
}
