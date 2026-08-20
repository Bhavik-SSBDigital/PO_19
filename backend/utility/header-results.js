// utility/header-results.js
//
// Fetches a PO's header-level audit points (new numbers 1-9) plus its
// PO-LEVEL lock status from po_header_results, and enriches the points
// the same way po-controller.js already enriches line-level `results`
// (severity + title/summary/logic from the DB-backed point definitions -
// see utility/point-definitions.js).
//
// One row in po_header_results = one PO number, regardless of how many
// AuditResult line items that PO has. `locked` here is the SEPARATE,
// PO-level "checked" flag (see po-header-controller.js) - completely
// independent of any individual line item's own AuditResult.remarksLocked.
// Callers should fetch this ONCE per PO number and treat it as the single
// source of truth for "has this PO's header been reviewed", no matter
// which line item (or none) is currently being viewed.

import { prisma } from "../lib/prisma.js";
import { severityOf } from "./severity.js";
// CHANGED: point content now comes from the DB via point-definitions.js,
// not the file-based point-reference.js. ensurePointDefinitionsLoaded()
// is called INSIDE this module's exported functions (not left to callers
// to remember) so getHeaderForPo/getHeadersForPos are safe to call from
// anywhere without an extra setup step.
import {
  ensurePointDefinitionsLoaded,
  getPointDefinition,
} from "./point-definitions.js";

function enrichPoints(results) {
  return (results || []).map((p) => {
    const def = getPointDefinition(p.pointNo);
    return {
      ...p,
      scope: "header", // lets the frontend tell header vs line points apart
      severity: severityOf(p.pointNo),
      title: def.title,
      summary: def.summary,
      logic: def.logic,
    };
  });
}

// Shape returned to every caller - always has the same keys whether or not
// a po_header_results row exists yet, so the frontend never has to guard
// against `header` being undefined.
function shapeHeader(record, poNumber) {
  if (!record) {
    return {
      poNumber,
      points: [],
      totalPoints: 0,
      verifiedCount: 0,
      notVerifiedCount: 0,
      locked: false,
      lockedBy: null,
      lockedAt: null,
    };
  }
  const points = enrichPoints(record.results);
  return {
    poNumber: record.po_number,
    points,
    totalPoints: points.length,
    verifiedCount: points.filter((p) => p.verified).length,
    notVerifiedCount: points.filter(
      (p) => !p.verified && !p.not_applicable && !p.manual_verification,
    ).length,
    locked: !!record.remarksLocked,
    lockedBy: record.remarksLockedBy || null,
    lockedAt: record.remarksLockedAt || null,
  };
}

export async function getHeaderForPo(poNumber) {
  await ensurePointDefinitionsLoaded();
  if (!poNumber) return shapeHeader(null, poNumber);
  const record = await prisma.poHeaderResult.findUnique({
    where: { po_number: poNumber },
  });
  return shapeHeader(record, poNumber);
}

// Batch version - avoids N+1 queries when enriching a page of many PO
// lines at once. Returns a Map<po_number, shapedHeader>.
export async function getHeadersForPos(poNumbers) {
  await ensurePointDefinitionsLoaded();
  const uniqueNumbers = [...new Set((poNumbers || []).filter(Boolean))];
  const map = new Map();
  if (!uniqueNumbers.length) return map;

  const records = await prisma.poHeaderResult.findMany({
    where: { po_number: { in: uniqueNumbers } },
  });
  const byPo = new Map(records.map((r) => [r.po_number, r]));

  for (const poNumber of uniqueNumbers) {
    map.set(poNumber, shapeHeader(byPo.get(poNumber) || null, poNumber));
  }
  return map;
}
