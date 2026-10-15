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
import { resolvePoHeader } from "./po-version.js";
import { severityOf } from "./severity.js";
// ADD near the top, alongside the other point-definitions import:
import { computeTally } from "./point-tally.js";
import { systemResultLabel } from "./system-result.js";
// Closure tallies (and therefore auto-close) must only ever count the
// system's "Not Verified" points as mandatory - see not-verified-scope.js.
import { getMandatoryPoints } from "./not-verified-scope.js";
// CHANGED: point content now comes from the DB via point-definitions.js,
// not the file-based point-reference.js. ensurePointDefinitionsLoaded()
// is called INSIDE this module's exported functions (not left to callers
// to remember) so getHeaderForPo/getHeadersForPos are safe to call from
// anywhere without an extra setup step.
import {
  ensurePointDefinitionsLoaded,
  getPointDefinition,
} from "./point-definitions.js";

const REMARK_SUBMITTER_SELECT = {
  id: true,
  username: true,
  firstName: true,
  lastName: true,
};

// Visibility rule, identical to the line-level one in po-controller.js:
// Admin / Procurement Manager see every header remark on a PO. A Buyer
// sees ONLY the remarks THEY personally submitted. Anyone else sees
// nothing.
function headerRemarkVisibleTo(user, remark) {
  if (!user) return false;
  if (user.isAdmin || user.isProcurementManager) return true;
  if (user.isBuyer) {
    const userId = user.id || user.userId;
    return userId != null && String(remark.submittedBy) === String(userId);
  }
  return false;
}

function formatHeaderRemark(remark, user) {
  const userId = user?.id || user?.userId;
  return {
    id: remark.id,
    pointNo: remark.pointNo,
    remark: remark.remark,
    submittedBy: remark.submittedBy,
    submittedByName:
      [remark.submitter?.firstName, remark.submitter?.lastName]
        .filter(Boolean)
        .join(" ") ||
      remark.submitter?.username ||
      "",
    submittedAt: remark.submittedAt,
    isMine: userId != null && String(remark.submittedBy) === String(userId),
    source_file_ts: remark.source_file_ts?.toISOString?.() || null,
  };
}

// THE single place that fetches PoHeaderRemarks and groups them by
// pointNo, already filtered to what `user` is allowed to see. Used by
// every caller of getHeaderForPo/getHeadersForPos below, AND by
// po-header-controller.js's getPoHeaderSummary, so a header's remark
// count/content can never disagree depending on which endpoint happened
// to load it.
async function getHeaderRemarksMap(poNumber, user, sourceFileTs) {
  if (!poNumber || !user) return new Map();
  const remarks = await prisma.poHeaderRemark.findMany({
    where: { po_number: poNumber, ...(sourceFileTs ? { source_file_ts: new Date(sourceFileTs) } : {}) },
    include: { submitter: { select: REMARK_SUBMITTER_SELECT } },
    orderBy: { submittedAt: "desc" },
  });
  const map = new Map();
  for (const r of remarks) {
    if (!headerRemarkVisibleTo(user, r)) continue;
    const key = String(r.pointNo);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(formatHeaderRemark(r, user));
  }
  return map;
}

// Batch variant - one query for every PO's header remarks instead of one
// query per PO. Returns Map<po_number, Map<pointNo, remark[]>>.
async function getHeaderRemarksMapBatch(poNumbers, user) {
  const uniqueNumbers = [...new Set((poNumbers || []).filter(Boolean))];
  if (!uniqueNumbers.length || !user) return new Map();
  const remarks = await prisma.poHeaderRemark.findMany({
    where: { po_number: { in: uniqueNumbers } },
    include: { submitter: { select: REMARK_SUBMITTER_SELECT } },
    orderBy: { submittedAt: "desc" },
  });
  const byPo = new Map();
  for (const r of remarks) {
    if (!headerRemarkVisibleTo(user, r)) continue;
    if (!byPo.has(r.po_number)) byPo.set(r.po_number, new Map());
    const pointMap = byPo.get(r.po_number);
    const key = String(r.pointNo);
    if (!pointMap.has(key)) pointMap.set(key, []);
    pointMap.get(key).push(formatHeaderRemark(r, user));
  }
  return byPo;
}

// Map<pointNo-as-string, remark[]> -> plain object, the shape the
// frontend consumes (JSON can't carry a Map).
function mapToObject(map) {
  return Object.fromEntries(map);
}

function enrichPoints(results, checkedPoints = []) {
  const checkedSet = new Set((checkedPoints || []).map(Number));
  return (results || []).map((p) => {
    const def = getPointDefinition(p.pointNo);
    return {
      ...p,
      scope: "header",
      severity: severityOf(p.pointNo),
      title: def.title,
      summary: def.summary,
      logic: def.logic,
      checked: checkedSet.has(Number(p.pointNo)),
      systemResultLabel: systemResultLabel(p),
    };
  });
}

// Shape returned to every caller - always has the same keys whether or not
// a po_header_results row exists yet, so the frontend never has to guard
// against `header` being undefined.
//
// `headerRemarksByPoint` (plain object, keyed by pointNo-as-string) is
// ALWAYS present here too - every caller gets it for free, whether they
// arrived via getHeaderForPo, getHeadersForPos, or getPoHeaderSummary, so
// a header remarks button can never render as "Add Remark" just because
// the endpoint that happened to load the page doesn't carry remark data.
function shapeHeader(record, poNumber, remarksByPoint = new Map()) {
  if (!record) {
    return {
      poNumber,
      source_file_ts: null,
      points: [],
      totalPoints: 0,
      verifiedCount: 0,
      notVerifiedCount: 0,
      locked: false,
      lockedBy: null,
      lockedAt: null,
      checkedPoints: [],
      tally: computeTally([], [], []),
      headerRemarksByPoint: mapToObject(remarksByPoint),
    };
  }
  const checkedPoints = record.checkedPoints || [];
  const points = enrichPoints(record.results, checkedPoints);
  const remarkedPointNos = [...remarksByPoint.keys()]
    .filter((k) => (remarksByPoint.get(k) || []).length > 0)
    .map(Number);

  // Auto-close scope fix: only the points the system flagged "Not
  // Verified" are mandatory. A point already Verified/N-A/Manual Review
  // was never something the buyer had to touch, so it must never block
  // (or count toward) the tally that drives auto-close. See
  // utility/not-verified-scope.js.
  const mandatoryPoints = getMandatoryPoints(record.results);

  return {
    poNumber: record.po_number,
    source_file_ts: record.source_file_ts?.toISOString?.() || null,
    points,
    totalPoints: points.length,
    verifiedCount: points.filter((p) => p.verified).length,
    notVerifiedCount: points.filter(
      (p) => !p.verified && !p.not_applicable && !p.manual_verification,
    ).length,
    locked: !!record.remarksLocked,
    lockedBy: record.remarksLockedBy || null,
    lockedAt: record.remarksLockedAt || null,
    checkedPoints,
    // { totalPoints, checkedCount, remarkedCount, coveredCount, remainingCount, isComplete }
    // totalPoints here is the MANDATORY (Not Verified) count only - not all
    // 9 header points. See not-verified-scope.js.
    tally: computeTally(mandatoryPoints, checkedPoints, remarkedPointNos),
    headerRemarksByPoint: mapToObject(remarksByPoint),
  };
}

// `user` is optional (defaults to no remarks attached) so existing
// internal callers that don't have a request user keep working, but every
// caller that has one should pass it through to get remarks seeded.
export async function getHeaderForPo(poNumber, user, sourceFileTs) {
  await ensurePointDefinitionsLoaded();
  if (!poNumber) return shapeHeader(null, poNumber);
  const record = await resolvePoHeader(poNumber, sourceFileTs);
  const remarksByPoint = await getHeaderRemarksMap(
    poNumber,
    user,
    record?.source_file_ts || sourceFileTs,
  );
  return shapeHeader(record, poNumber, remarksByPoint);
}

// Batch version - avoids N+1 queries when enriching a page of many PO
// lines at once. Returns a Map<po_number, shapedHeader>.
export async function getHeadersForPos(poRows, user) {
  await ensurePointDefinitionsLoaded();
  const rows = Array.isArray(poRows) ? poRows : [];
  const map = new Map();
  const unique = new Map();
  for (const row of rows) {
    const poNumber = typeof row === "string" ? row : row?.po_number;
    if (!poNumber) continue;
    const sourceFileTs = typeof row === "string" ? undefined : row.source_file_ts;
    unique.set(`${poNumber}\u0000${sourceFileTs?.toISOString?.() || sourceFileTs || ""}`, {poNumber, sourceFileTs});
  }
  await Promise.all([...unique.values()].map(async ({poNumber, sourceFileTs}) => {
    const record = await resolvePoHeader(poNumber, sourceFileTs);
    const remarks = await getHeaderRemarksMap(poNumber, user, record?.source_file_ts || sourceFileTs);
    map.set(`${poNumber}\u0000${record?.source_file_ts?.toISOString?.() || sourceFileTs?.toISOString?.() || sourceFileTs || ""}`, shapeHeader(record, poNumber, remarks));
  }));
  return map;
}
