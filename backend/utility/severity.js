/**
 * utility/severity.js
 * ====================
 * Severity ("criticality") of each of the 19 audit points is an
 * ADMIN-EDITABLE setting stored in the AuditPointConfig table (see
 * prisma/schema.prisma + controller/risk-categorization-controller.js).
 * This file is the single place every other module goes through to
 * classify a point result or look up its current severity.
 *
 * RENUMBERED: DEFAULT_SEVERITY keys below are the NEW point numbers
 * (header = 1-9, line = 10-19). This is ONLY a bootstrap fallback for a
 * pointNo that has no row in AuditPointConfig yet - run
 * scripts/seed-point-definitions.js after migrating so every point has a
 * real DB row and this fallback is never actually used in practice.
 *
 * Because dashboard/po controllers loop over rows synchronously and call
 * severityOf() per point, the DB-backed map is loaded into an in-memory
 * cache. Every controller that uses severityOf()/exceptionPointsOf() MUST
 * call `await ensureSeverityLoaded()` once at the top of the request
 * handler before using them.
 */
import { prisma } from "../lib/prisma.js";

export const SEVERITY_LEVELS = ["Critical", "High", "Medium", "Low"];

// Bootstrap-only defaults, keyed by NEW pointNo. See file header.
const DEFAULT_SEVERITY = {
  1: "High", // RC Released              (was 7)
  2: "High", // RC Consistency           (was 8)
  3: "Critical", // GST Tax Logic            (was 9)
  4: "Critical", // MSME Payment Term        (was 11)
  5: "Medium", // General Payment Term     (was 12)
  6: "Medium", // EYW Freight Condition    (was 13)
  7: "Medium", // EXW/FCA Freight Condition(was 14)
  8: "Critical", // Rate Approval            (was 15)
  9: "Critical", // Multiple POs Same Day    (was 19)
  10: "High", // Release Verification     (was 1)
  11: "Medium", // PR Assigned              (was 2)
  12: "Medium", // PR Creation Date         (was 3)
  13: "High", // PR Date Precedes PO      (was 4)
  14: "Medium", // Delivery Date After PR   (was 5)
  15: "High", // PO Qty vs PR Qty         (was 6)
  16: "Medium", // Vendor-Material Tax Code (was 10)
  17: "Medium", // ZSER Item Category       (was 16)
  18: "Medium", // ZCSR Item Category       (was 17)
  19: "Low", // ZLRM Item Category       (was 18)
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

export async function ensureSeverityLoaded() {
  if (cache) return cache;
  if (!loadingPromise) {
    loadingPromise = loadFromDb().finally(() => {
      loadingPromise = null;
    });
  }
  return loadingPromise;
}

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

// Fallback label when point-definitions.js has no DB row for a pointNo.
export function pointLabel(pointNo) {
  return `Point ${pointNo}`;
}
