// ---------------------------------------------------------------------------
// poListFilters.js - ONE place that decides "which POs match", used by:
//   - PoStatusSummaryTables (every number there opens a PO list)
//   - PoListDialog          (the drill-down list)
//   - PoWiseExceptionsTable (tabs, bifurcation and advanced filters)
// so a number on a card and the list behind it can never disagree.
//
// Input rows are the per-PO rows from /reports/po-status-summary (poRows) or
// /reports/po-data (results). Fields used:
//   poStatus: perfect | reviewed | in_review | pending
//   headerNotVerified / headerClosedPoints / headerPendingPoints / headerManualPoints
//   lineNotVerified   / lineClosedPoints   / linePendingPoints   / lineManualPoints
//   purchaseGroup, poNumber
// ---------------------------------------------------------------------------

export const CLOSED_STATUSES = ["perfect", "reviewed"];
export const OPEN_STATUSES = ["in_review", "pending"];

/**
- Where is the problem? (never both false for a non-auto-closed PO)
-   pending / in_review PO -> where the PENDING Not Verified points are
-   reviewed PO            -> where the (now closed) Not Verified points were
-   auto-closed PO         -> nowhere
 */
export function issueSide(r) {
  const open = OPEN_STATUSES.includes(r.poStatus);
  const header = open
    ? (r.headerPendingPoints || 0) > 0
    : (r.headerNotVerified || 0) > 0;
  const line = open
    ? (r.linePendingPoints || 0) > 0
    : (r.lineNotVerified || 0) > 0;
  if (r.poStatus === "perfect") return { header: false, line: false };
  return { header, line };
}

/** exclusive bucket: "header" (header only) | "line" (line only) | "both" | "none" */
export function issueBucket(r) {
  const { header, line } = issueSide(r);
  if (header && line) return "both";
  if (header) return "header";
  if (line) return "line";
  return "none";
}

const METRICS = {
  headerNv: (r) => (r.headerNotVerified || 0) > 0,
  lineNv: (r) => (r.lineNotVerified || 0) > 0,
  headerPtClosed: (r) => (r.headerClosedPoints || 0) > 0,
  linePtClosed: (r) => (r.lineClosedPoints || 0) > 0,
  headerPtPending: (r) => (r.headerPendingPoints || 0) > 0,
  linePtPending: (r) => (r.linePendingPoints || 0) > 0,
  anyNv: (r) => (r.headerNotVerified || 0) + (r.lineNotVerified || 0) > 0,
  anyPtClosed: (r) =>
    (r.headerClosedPoints || 0) + (r.lineClosedPoints || 0) > 0,
  anyPtPending: (r) =>
    (r.headerPendingPoints || 0) + (r.linePendingPoints || 0) > 0,
  headerManual: (r) => (r.headerManualPoints || 0) > 0,
  lineManual: (r) => (r.lineManualPoints || 0) > 0,
  headerClosed: (r) => (r.headerPendingPoints || 0) === 0,
  headerOpen: (r) => (r.headerPendingPoints || 0) > 0,
  lineClosed: (r) => (r.linePendingPoints || 0) === 0,
  lineOpen: (r) => (r.linePendingPoints || 0) > 0,
};

// ORIGINAL dropdown list - restored exactly as it was, so anything that
// already uses SIDE_OPTIONS (e.g. the PO Exception-Wise List) behaves
// exactly as before.
export const SIDE_OPTIONS = [
  { value: "any", label: "Any problem location" },
  { value: "headerAny", label: "Problem in Header (incl. both)" },
  { value: "lineAny", label: "Problem in Line items (incl. both)" },
  { value: "header", label: "Header only" },
  { value: "line", label: "Line items only" },
  { value: "both", label: "Header AND Line" },
];

// Short list, used ONLY by PoListDialog for now.
export const SIDE_OPTIONS_SIMPLE = [
  { value: "any", label: "All POs" },
  { value: "header", label: "Header only" },
  { value: "line", label: "Line only" },
  { value: "both", label: "Header + Line both" },
];

/**
- spec = {
-   status?: "all" | "pending" | "in_review" | "reviewed" | "perfect"
-          | "closed" (perfect+reviewed) | "open" (pending+in_review),
-   side?:   "any" | "headerAny" | "lineAny" | "header" | "line" | "both",
-   group?:  purchase group code ("Unassigned" = none),
-   metric?: key of METRICS above,
-   poNumbers?: string[]   (exact PO numbers; empty = all),
-   correctedPoNumbers?: string[] (array of exact PO numbers when metric = "poCorrected")
- }
 */
export function matchPo(r, spec = {}) {
  const { status = "all", side = "any", group, metric, poNumbers } = spec;

  if (status === "closed") {
    if (!CLOSED_STATUSES.includes(r.poStatus)) return false;
  } else if (status === "open") {
    if (!OPEN_STATUSES.includes(r.poStatus)) return false;
  } else if (status !== "all" && r.poStatus !== status) {
    return false;
  }

  if (group !== undefined && group !== null && group !== "") {
    const g = r.purchaseGroup || "Unassigned";
    if (g !== group) return false;
  }

  // Filter against exact array of corrected POs
  if (metric === "poCorrected") {
    const list = spec.correctedPoNumbers || [];
    if (!list.includes(String(r.poNumber || r.po_number))) return false;
  } else if (metric && METRICS[metric] && !METRICS[metric](r)) {
    return false;
  }

  if (side !== "any") {
    const s = issueSide(r);
    if (side === "headerAny" && !s.header) return false;
    if (side === "lineAny" && !s.line) return false;
    if (side === "header" && !(s.header && !s.line)) return false;
    if (side === "line" && !(s.line && !s.header)) return false;
    if (side === "both" && !(s.header && s.line)) return false;
  }

  if (poNumbers && poNumbers.length) {
    if (!poNumbers.includes(String(r.poNumber))) return false;
  }
  return true;
}

/** "4500001 4500002, 4500003\n4500004" -> ["4500001", ...] */
export function parsePoNumbers(text) {
  return [
    ...new Set(
      String(text || "")
        .split(/[\s,;]+/)
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ];
}

/** { total, header, line, both } counts of one status over the rows.
-  header / line / both are EXCLUSIVE, so header + line + both = total
-  (except Auto-Closed POs, which have no problem anywhere). */
export function bifurcate(rows, status) {
  const out = { total: 0, header: 0, line: 0, both: 0 };
  for (const r of rows) {
    if (!matchPo(r, { status })) continue;
    out.total += 1;
    const b = issueBucket(r);
    if (b !== "none") out[b] += 1;
  }
  return out;
}
