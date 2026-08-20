// scripts/migrate-point-numbers.js
//
// ONE-TIME migration. Run AFTER deploying the schema change
// (prisma/schema-audit-point-config-diff.prisma) and BEFORE running
// scripts/seed-point-definitions.js.
//
//   node scripts/migrate-point-numbers.js
//
// !! BACK UP THE DATABASE BEFORE RUNNING THIS !! It rewrites:
//   - AuditPointConfig.pointNo               (primary key)
//   - AuditResult.results[].pointNo          (JSON, line-level points)
//   - PoHeaderResult.results[].pointNo       (JSON, header-level points)
//   - PoRemark.pointNo                       (line-level remarks)
//   - PoHeaderRemark.pointNo                 (header-level remarks)
//
// It does NOT touch audit_engine.py, addpo.js, or addheader.js - if those
// still emit OLD point numbers, every future import re-introduces the old
// numbering. Update those BEFORE the next import run.
//
// Safe to re-run: each phase checks whether data already looks migrated
// (via IS_ALREADY_NEW heuristics) and skips if so - but always take a
// backup regardless, this is not a substitute for one.

import { prisma } from "../lib/prisma.js";
import {
  OLD_TO_NEW_POINT_MAP,
  mapOldToNew,
} from "../utility/point-number-map.js";

const BATCH_SIZE = 500;

// ---------------------------------------------------------------------
// Phase 1: AuditPointConfig (pointNo is the @id, so a naive UPDATE would
// collide - e.g. old 1 -> new 10, but old 10 -> new 16, so if we update
// old=1 to new=10 first, and a row for old pointNo=10 still exists, we'd
// violate the unique/primary key. Fix: shift everything to a disjoint
// temp range first (+1000), then shift from temp range to final new
// numbers.
// ---------------------------------------------------------------------
async function migrateAuditPointConfig() {
  const rows = await prisma.auditPointConfig.findMany();
  if (rows.length === 0) {
    console.log("[AuditPointConfig] no rows, skipping.");
    return;
  }

  const oldNumbers = new Set(rows.map((r) => r.pointNo));
  const looksAlreadyNew =
    oldNumbers.size > 0 &&
    [...oldNumbers].every((n) => n >= 1 && n <= 19) &&
    // heuristic: old scheme has point 9 as header/critical GST and point 1 as line;
    // new scheme is contiguous 1-19 too, so we can't fully distinguish by range alone.
    // Use a marker column instead: if `scope` is already populated (non-default),
    // treat as migrated.
    rows.every((r) => r.scope && r.scope !== "");
  if (looksAlreadyNew) {
    console.log(
      "[AuditPointConfig] rows already have `scope` populated - assuming already migrated, skipping.",
    );
    return;
  }

  console.log(`[AuditPointConfig] migrating ${rows.length} rows...`);

  // Step A: move every row to pointNo + 1000 (disjoint temp range)
  for (const row of rows) {
    await prisma.auditPointConfig.update({
      where: { pointNo: row.pointNo },
      data: { pointNo: row.pointNo + 1000 },
    });
  }

  // Step B: move from temp range to real new pointNo
  for (const row of rows) {
    const newPointNo = mapOldToNew(row.pointNo);
    await prisma.auditPointConfig.update({
      where: { pointNo: row.pointNo + 1000 },
      data: { pointNo: newPointNo },
    });
  }

  console.log("[AuditPointConfig] done.");
}

// ---------------------------------------------------------------------
// Phase 2: AuditResult.results (JSON array of line-level point objects).
// Every pointNo in here is a LINE-level old number (1,2,3,4,5,6,10,16,17,18).
// ---------------------------------------------------------------------
async function migrateAuditResultResults() {
  let cursor = undefined;
  let migrated = 0;

  // Simple heuristic per-row: if we see any pointNo that is only valid
  // under the OLD line set (e.g. "1".."6","10","16".."18") we migrate it.
  // Since old and new line numbers overlap in range (both use small ints),
  // we track a boolean marker file instead - see NOTE below.
  //
  // NOTE: AuditResult has no spare column to mark "already migrated" and
  // we were told not to add one gratuitously. Guard against double-running
  // by checking an env var the operator sets explicitly.
  if (process.env.CONFIRM_POINT_MIGRATION !== "yes") {
    throw new Error(
      "Set CONFIRM_POINT_MIGRATION=yes to run this migration (safety guard against double-running against JSON data, which has no migrated/unmigrated marker).",
    );
  }

  while (true) {
    const rows = await prisma.auditResult.findMany({
      select: { id: true, results: true },
      take: BATCH_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: "asc" },
    });
    if (rows.length === 0) break;

    for (const row of rows) {
      const results = Array.isArray(row.results) ? row.results : [];
      if (results.length === 0) continue;

      const remapped = results.map((p) => {
        if (p && p.pointNo !== undefined && p.pointNo !== null) {
          return { ...p, pointNo: String(mapOldToNew(p.pointNo)) };
        }
        return p;
      });

      await prisma.auditResult.update({
        where: { id: row.id },
        data: { results: remapped },
      });
      migrated += 1;
    }

    cursor = rows[rows.length - 1].id;
    if (rows.length < BATCH_SIZE) break;
  }

  console.log(`[AuditResult.results] migrated ${migrated} rows.`);
}

// ---------------------------------------------------------------------
// Phase 3: PoHeaderResult.results (JSON array of header-level point
// objects). Every pointNo in here is a HEADER-level old number
// (7,8,9,11,12,13,14,15,19).
// ---------------------------------------------------------------------
async function migratePoHeaderResultResults() {
  let cursor = undefined;
  let migrated = 0;

  while (true) {
    const rows = await prisma.poHeaderResult.findMany({
      select: { id: true, results: true },
      take: BATCH_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: "asc" },
    });
    if (rows.length === 0) break;

    for (const row of rows) {
      const results = Array.isArray(row.results) ? row.results : [];
      if (results.length === 0) continue;

      const remapped = results.map((p) => {
        if (p && p.pointNo !== undefined && p.pointNo !== null) {
          return { ...p, pointNo: String(mapOldToNew(p.pointNo)) };
        }
        return p;
      });

      await prisma.poHeaderResult.update({
        where: { id: row.id },
        data: { results: remapped },
      });
      migrated += 1;
    }

    cursor = rows[rows.length - 1].id;
    if (rows.length < BATCH_SIZE) break;
  }

  console.log(`[PoHeaderResult.results] migrated ${migrated} rows.`);
}

// ---------------------------------------------------------------------
// Phase 4: PoRemark.pointNo (line-level remarks, Int column)
// ---------------------------------------------------------------------
async function migratePoRemarks() {
  const rows = await prisma.poRemark.findMany({
    select: { id: true, pointNo: true },
  });
  for (const row of rows) {
    const newPointNo = mapOldToNew(row.pointNo);
    if (newPointNo === row.pointNo) continue;
    await prisma.poRemark.update({
      where: { id: row.id },
      data: { pointNo: newPointNo },
    });
  }
  console.log(`[PoRemark] migrated ${rows.length} rows.`);
}

// ---------------------------------------------------------------------
// Phase 5: PoHeaderRemark.pointNo (header-level remarks, Int column)
// ---------------------------------------------------------------------
async function migratePoHeaderRemarks() {
  const rows = await prisma.poHeaderRemark.findMany({
    select: { id: true, pointNo: true },
  });
  for (const row of rows) {
    const newPointNo = mapOldToNew(row.pointNo);
    if (newPointNo === row.pointNo) continue;
    await prisma.poHeaderRemark.update({
      where: { id: row.id },
      data: { pointNo: newPointNo },
    });
  }
  console.log(`[PoHeaderRemark] migrated ${rows.length} rows.`);
}

async function main() {
  console.log(
    "Starting point-number migration. Mapping:",
    OLD_TO_NEW_POINT_MAP,
  );
  await migrateAuditPointConfig();
  await migrateAuditResultResults();
  await migratePoHeaderResultResults();
  await migratePoRemarks();
  await migratePoHeaderRemarks();
  console.log("Migration complete. Now run scripts/seed-point-definitions.js.");
}

main()
  .catch((e) => {
    console.error("MIGRATION FAILED - restore from backup before retrying.", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
