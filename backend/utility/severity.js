/**
 * utility/severity.js
 * ====================
 * Severity ("criticality") of each of the 19 audit points is now an
 * ADMIN-EDITABLE setting stored in the AuditPointConfig table (see
 * prisma/schema.prisma + controller/risk-categorization-controller.js), not
 * a hardcoded constant. This file is the single place every other module
 * (dashboard-controller.js, po-controller.js) goes through to classify a
 * point result or look up its current severity.
 *
 * Because dashboard/po controllers loop over rows synchronously and call
 * severityOf() per point, the DB-backed map is loaded into an in-memory
 * cache. Every controller that uses severityOf()/exceptionPointsOf() MUST
 * call `await ensureSeverityLoaded()` once at the top of the request
 * handler before using them (see updated controllers below).
 */
import { prisma } from "../lib/prisma.js";

export const SEVERITY_LEVELS = ["Critical", "High", "Medium", "Low"];

// Fallback defaults - only used the first time a point is seen, before an
// admin has ever touched the Risk Categorization Master. Once a row exists
// in AuditPointConfig for a point, the DB value always wins and these are
// ignored for that point.
const DEFAULT_SEVERITY = {
  1: "High",
  2: "Medium",
  3: "Medium",
  4: "High",
  5: "Medium",
  6: "High",
  7: "High",
  8: "High",
  9: "Critical",
  10: "Medium",
  11: "Critical",
  12: "Medium",
  13: "Medium",
  14: "Medium",
  15: "Critical",
  16: "Medium",
  17: "Medium",
  18: "Low",
  19: "Critical",
};

let cache = null;
let loadingPromise = null;

async function loadFromDb() {
  const rows = await prisma.auditPointConfig.findMany();
  const map = { ...DEFAULT_SEVERITY };
  for (const row of rows) {
    if (SEVERITY_LEVELS.includes(row.severity)) {
      map[String(row.pointNo)] = row.severity;
    }
  }
  cache = map;
  return cache;
}

// Call this once at the top of any request handler that will use
// severityOf() / classifyPoint()'s severity-dependent callers.
export async function ensureSeverityLoaded() {
  if (cache) return cache;
  if (!loadingPromise) {
    loadingPromise = loadFromDb().finally(() => {
      loadingPromise = null;
    });
  }
  return loadingPromise;
}

// Call after any admin update to AuditPointConfig so subsequent requests
// pick up the new value instead of a stale cache.
export function invalidateSeverityCache() {
  cache = null;
}

export function severityOf(pointNo) {
  const map = cache || DEFAULT_SEVERITY;
  return map[String(pointNo)] || "Medium";
}

export function classifyPoint(p) {
  if (!p) return "na";
  if (p.not_applicable) return "na";
  if (p.manual_verification || p.missing_data) return "manual";
  if (p.verified) return "verified";
  return "notVerified";
}

export function exceptionPointsOf(row) {
  return (row.results || [])
    .filter((p) => classifyPoint(p) === "notVerified")
    .map((p) => ({
      pointNo: p.pointNo,
      severity: severityOf(p.pointNo),
      remarks: p.remarks || [],
    }));
}

// Fallback label when POINT_DEFINITIONS_BY_NO has no entry for a pointNo.
export function pointLabel(pointNo) {
  return `Point ${pointNo}`;
}
