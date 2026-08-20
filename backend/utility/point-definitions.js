/**
 * utility/point-definitions.js
 * =============================
 * REPLACES point-reference.js. Title/summary/logic/dataPoints/scope for
 * each audit point now live in AuditPointConfig (DB), not a source file -
 * see prisma/schema-audit-point-config-diff.prisma and
 * scripts/seed-point-definitions.js (which is the ONE place the actual
 * English text is written down, and only to seed the DB - runtime code
 * never reads that script).
 *
 * Same caching pattern as utility/severity.js. Call
 * `await ensurePointDefinitionsLoaded()` once at the top of any request
 * handler before using the getters below.
 */
import { prisma } from "../lib/prisma.js";

let cache = null; // Map<number, {pointNo, title, summary, logic, dataPoints, scope, severity}>
let loadingPromise = null;

async function loadFromDb() {
  const rows = await prisma.auditPointConfig.findMany();
  const map = new Map();
  for (const row of rows) {
    map.set(row.pointNo, {
      pointNo: String(row.pointNo),
      title: row.title,
      summary: row.summary,
      logic: row.logic,
      dataPoints: row.dataPoints,
      scope: row.scope, // "header" | "line"
      severity: row.severity,
    });
  }
  cache = map;
  return cache;
}

export async function ensurePointDefinitionsLoaded() {
  if (cache) return cache;
  if (!loadingPromise) {
    loadingPromise = loadFromDb().finally(() => {
      loadingPromise = null;
    });
  }
  return loadingPromise;
}

export function invalidatePointDefinitionsCache() {
  cache = null;
}

export function getPointDefinition(pointNo) {
  const map = cache || new Map();
  return (
    map.get(Number(pointNo)) || {
      pointNo: String(pointNo),
      title: `Point ${pointNo}`,
      summary: "",
      logic: "",
      dataPoints: "",
      scope: Number(pointNo) <= 9 ? "header" : "line",
      severity: "Medium",
    }
  );
}

export function listPointDefinitions() {
  const map = cache || new Map();
  return [...map.values()].sort(
    (a, b) => Number(a.pointNo) - Number(b.pointNo),
  );
}

export function listHeaderPointDefinitions() {
  return listPointDefinitions().filter((p) => p.scope === "header");
}

export function listLinePointDefinitions() {
  return listPointDefinitions().filter((p) => p.scope === "line");
}

// KPI_DEFINITIONS / CHART_DEFINITIONS from the old point-reference.js were
// static UI copy, not "point" data - they can stay as plain exports here
// (or move into their own small file) since they don't have a pointNo and
// aren't part of what you asked to move into the DB.
export const KPI_DEFINITIONS = {
  totalPOCount:
    "Count of distinct PO numbers in the currently filtered extract.",
  totalPOLineItems:
    "Count of individual PO line items (one PO can have many lines).",
  totalPRCount:
    "Count of distinct Purchase Requisition numbers referenced by the filtered PO lines.",
  holdPOCount:
    "Count of distinct POs currently on SAP status 'Hold' (po_status = H).",
  exceptionValueExposure:
    "Sum of Net Value across every PO line that failed at least one audit point.",
  verifiedCount:
    "Total count of individual point-checks (across all lines) that came back Verified.",
  notVerifiedCount:
    "Total count of individual point-checks (across all lines) that came back Not Verified — i.e. exceptions.",
  notApplicableCount:
    "Total count of individual point-checks that were Not Applicable to that line.",
  manualReviewCount:
    "Total count of individual point-checks that need a human to review.",
  highRiskExceptions:
    "Count of Not Verified point-checks whose audit point is currently set to Critical or High criticality.",
  overallComplianceScore:
    "Verified ÷ (Verified + Not Verified), across every applicable point-check in the filtered extract.",
};

export const CHART_DEFINITIONS = {
  controlWiseCompliance:
    "For each of the 10 line-item audit points (10-19), the % of applicable checks that came back Verified.",
  headerControlWiseCompliance:
    "For each of the 9 header-level audit points (1-9), the % of applicable POs that came back Verified.",
  exceptionBySeverity:
    "All Not Verified point-checks grouped by the criticality currently assigned to their audit point.",
  poTypeWiseCompliance:
    "Verified vs Not Verified point-checks, grouped by PO Type.",
  monthlyExceptionTrend:
    "Count and value exposure of PO lines with at least one exception, by the PO's creation month.",
  plantWiseExceptions:
    "Top 10 plants by count of PO lines with at least one exception.",
  vendorWiseTopExceptions:
    "Top 10 vendors by count of PO lines with at least one exception.",
  holdPoAgeing:
    "Hold POs bucketed by whether they're still inside or past the 30-day-from-PO-date hold window.",
  poNumberWiseExceptions:
    "Top 15 PO numbers by count of Not Verified point-checks across their line items.",
};
