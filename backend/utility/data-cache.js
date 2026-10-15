/**
 * ============================================================================
 * data-cache.js  -  ONE shared, cached read of "everything about the POs in
 * scope", reused by:
 *   - getExecutiveSummary / getRemarksImpactSummary / drilldowns
 *   - getPoStatusSummary (dashboard PO status tables + PO rows)
 *   - getPoWiseExceptions (PO Data page)
 *
 * Why: before, every dashboard load made 4 separate full-table reads (each
 * pulling every audit row WITH its big `results` JSON). Now the first request
 * reads once and the other requests (they fire in parallel) share that same
 * read. Repeat loads are served from memory.
 *
 * Correctness: the cache is keyed by the exact `where` and tied to a cheap
 * "data fingerprint" (row count + newest updatedAt of the 6 tables that feed
 * the dashboard). The moment any audit row, header, RC, or any remark is
 * added / edited / deleted / checked, the fingerprint changes and the next
 * request reads fresh data. So counts still move instantly.
 *
 * NOTE: callers must treat the returned model as READ-ONLY.
 * ============================================================================
 */
import { prisma } from "../lib/prisma.js";
import { versionKey } from "./po-version.js";

const MAX_ENTRIES = 8;
const store = new Map(); // key -> { fp, promise }

// ---- fingerprint ----------------------------------------------------------
const agg = (model) =>
  model.aggregate({ _max: { updatedAt: true }, _count: { _all: true } });

async function computeFingerprint() {
  const parts = await Promise.all([
    agg(prisma.auditResult),
    agg(prisma.poHeaderResult),
    agg(prisma.rcOverlapResult),
    agg(prisma.poRemark),
    agg(prisma.poHeaderRemark),
    agg(prisma.poRcRemark),
  ]);
  return parts
    .map(
      (p) =>
        `${p._count._all}:${p._max.updatedAt ? p._max.updatedAt.getTime() : 0}`,
    )
    .join("|");
}

// Concurrent callers share one in-flight fingerprint query (no TTL, so a
// remark saved a moment ago is always seen by the next request).
let fpInFlight = null;
export function dataFingerprint() {
  if (!fpInFlight) {
    fpInFlight = computeFingerprint().finally(() => {
      fpInFlight = null;
    });
  }
  return fpInFlight;
}

// ---- selects --------------------------------------------------------------
// Superset of every field the dashboard / remarks-impact / PO list needs.
const LINE_SELECT = {
  id: true,
  po_number: true,
  po_line_item: true,
  source_file_ts: true,
  po_material_number: true,
  purchase_req: true,
  po_type: true,
  po_status: true,
  po_created_date: true,
  hold_due_date: true,
  plant: true,
  purchase_group: true,
  vendor_code: true,
  nameOfVendor: true,
  material_code: true,
  material_disc: true,
  net_value: true,
  payment_term: true,
  results: true,
  checkedPoints: true,
  tax_code: true,
  GSTInOfVendor: true,
};

const HEADER_SELECT = {
  id: true,
  po_number: true,
  source_file_ts: true,
  vendor_code: true,
  purchase_group: true,
  po_type: true,
  results: true,
  checkedPoints: true,
  auditedOn: true,
};

// rows arrive newest-first -> first one seen per point is the LATEST remark
function latestByPoint(remarkRows, keyOf) {
  const out = new Map(); // key -> Map(pointNo -> isSystemResultWrong)
  for (const r of remarkRows) {
    const key = keyOf(r);
    if (!out.has(key)) out.set(key, new Map());
    const byPt = out.get(key);
    const pt = Number(r.pointNo);
    if (!byPt.has(pt)) byPt.set(pt, !!r.isSystemResultWrong);
  }
  return out;
}

/** pointNos that have at least one remark, for one row/PO. */
export const remarkNos = (map, key) => [...(map.get(key)?.keys() ?? [])];

async function loadModel(where) {
  const lineRows = await prisma.auditResult.findMany({
    where,
    select: LINE_SELECT,
  });
  const poNumbers = [
    ...new Set(lineRows.map((r) => r.po_number).filter(Boolean)),
  ];

  const [headerRows, lineRemarkRows, headerRemarkRows] = await Promise.all([
    poNumbers.length
      ? prisma.poHeaderResult.findMany({
          where: { po_number: { in: poNumbers } },
          select: HEADER_SELECT,
        })
      : [],
    lineRows.length
      ? prisma.poRemark.findMany({
          where: { auditResultId: { in: lineRows.map((r) => r.id) } },
          orderBy: { submittedAt: "desc" },
          select: {
            auditResultId: true,
            pointNo: true,
            isSystemResultWrong: true,
          },
        })
      : [],
    poNumbers.length
      ? prisma.poHeaderRemark.findMany({
          where: { po_number: { in: poNumbers } },
          orderBy: { submittedAt: "desc" },
          select: {
            po_number: true,
            source_file_ts: true,
            pointNo: true,
            isSystemResultWrong: true,
          },
        })
      : [],
  ]);

  return {
    lineRows,
    headerRows,
    poNumbers,
    headerByPo: new Map(headerRows.map((h) => [versionKey(h.po_number, h.source_file_ts), h])),
    lineRemarks: latestByPoint(lineRemarkRows, (r) => r.auditResultId),
    headerRemarks: latestByPoint(headerRemarkRows, (r) => versionKey(r.po_number, r.source_file_ts)),
  };
}

export async function getScopedModel(where) {
  const key = JSON.stringify(where);

  let fp = null;
  try {
    fp = await dataFingerprint();
  } catch (err) {
    console.error("data fingerprint failed (reading without cache):", err);
  }

  if (fp) {
    const hit = store.get(key);
    if (hit && hit.fp === fp) {
      store.delete(key); // refresh LRU position
      store.set(key, hit);
      return hit.promise;
    }
  }

  const promise = loadModel(where);
  if (fp) {
    store.set(key, { fp, promise });
    promise.catch(() => {
      if (store.get(key)?.promise === promise) store.delete(key);
    });
    while (store.size > MAX_ENTRIES) store.delete(store.keys().next().value);
  }
  return promise;
}
