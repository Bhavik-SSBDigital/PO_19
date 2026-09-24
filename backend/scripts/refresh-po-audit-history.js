#!/usr/bin/env node
/**
 * scripts/refresh-po-audit-history.js
 * =====================================
 * ONE-TIME (repeatable) backfill/refresh tool. Two explicit rules, applied
 * together in a single pass over `audit_results`:
 *
 *   1. POINT 15 (RC-material-validity, rule_15c_rc_material_validity in
 *      engine.py) is recomputed and applied to EVERY row, locked or not.
 *      On a LOCKED row, ONLY the point-15 entry inside `results` is
 *      replaced — nothing else about that row is touched: no other point,
 *      no PoRemark, no checkedPoints, no remarksLocked*.
 *   2. Every OTHER point is recomputed and applied ONLY to rows that are
 *      NOT remarksLocked — a full refresh of `results`, exactly like the
 *      normal hourly sync would do if that PO reappeared in a new extract.
 *
 * This does NOT modify addpo.js / addheader.js / addrc.js / sync_and_run.py
 * / log-sync-batch.js. It is a standalone script with its own copy of the
 * (very small) merge logic needed for the two rules above.
 *
 * WHY REPLAYING ARCHIVED BATCHES, AND WHY THAT'S SAFE:
 * ------------------------------------------------------------------------
 * Point 15 only needs each PO line's own stored fields (PO Type, Material
 * Code, PO date — already in `audit_results`) plus the CURRENT cumulative
 * RC master (data/rc_master_cumulative.csv, already the fullest picture we
 * have). It does NOT need the archived batches at all.
 *
 * The OTHER points, if their underlying rule logic changed since a PO was
 * last processed, need that PO's ORIGINAL raw POAUDIT/POAUDITCND row —
 * which only exists in the archived batches under sync/processed/. This
 * script replays every archived batch through engine.py, OLDEST to
 * NEWEST (folder names sort correctly as strings — YYYYMMDD_HHMMSS). Since
 * an unlocked row's `results` gets fully overwritten every time its PO
 * appears in a batch, whichever batch most recently mentioned a given PO
 * line naturally "wins" just from chronological ordering — no separate
 * bookkeeping needed to find "the latest known raw data" for a PO that's
 * stopped appearing in recent extracts.
 *
 * SAFETY NOTES (read before running for real):
 *   - `--po9-history ""` is passed on every replay run. Passing an empty
 *     string makes engine.py's own load_po9_history()/save_po9_history()
 *     no-op entirely (verified in engine.py — `if not path` / `if
 *     po9_history_path:`), so this script NEVER reads or writes the real
 *     data/po9_history.csv that the hourly cron depends on. Point #9's
 *     result computed during this replay is therefore weaker (no
 *     cross-batch memory) for any UNLOCKED row this script touches — that
 *     self-corrects on the very next regular hourly sync, which does use
 *     the real history file.
 *   - `--dws` is not passed, so Point #8 will show Not Applicable for any
 *     UNLOCKED row this script refreshes — same self-correction on the
 *     next hourly sync (which does pass --dws).
 *   - `--header-json` / `--rc-json` are not passed, so this script never
 *     touches po_header_results or rc_overlap_results — Point 15 is a
 *     line-only rule (HEADER_LEVEL_RULE_NOS = {1..9} in engine.py), so
 *     that's exactly the intended scope.
 *   - ALWAYS run with --dry-run first and inspect the tally + spot-check
 *     a few rows before running for real.
 *
 * Usage (run from backend/):
 *   node scripts/refresh-po-audit-history.js --dry-run
 *   node scripts/refresh-po-audit-history.js
 *   node scripts/refresh-po-audit-history.js --since 20260915_000000   (skip older batches)
 */
import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import { prisma } from "../lib/prisma.js";
import dotenv from "dotenv";

dotenv.config();

const BACKEND_DIR = process.cwd(); // run this script from backend/
const SYNC_PROCESSED_DIR =
  process.env.SYNC_PROCESSED_DIR ||
  path.join(BACKEND_DIR, "..", "sync", "processed");
const RC_MASTER =
  process.env.RC_MASTER_CUMULATIVE_PATH ||
  path.join(BACKEND_DIR, "data", "rc_master_cumulative.csv");
const PYTHON_BIN = process.env.PYTHON_BIN || "python3";
const TMP_DIR = path.join(BACKEND_DIR, "scripts", "_refresh_tmp");

const dryRun = process.argv.includes("--dry-run");
const sinceIdx = process.argv.indexOf("--since");
const since = sinceIdx !== -1 ? process.argv[sinceIdx + 1] : null;

function listBatches() {
  if (!fs.existsSync(SYNC_PROCESSED_DIR)) {
    throw new Error(
      `sync/processed not found at ${SYNC_PROCESSED_DIR}. Set SYNC_PROCESSED_DIR env var if it lives elsewhere.`,
    );
  }
  return fs
    .readdirSync(SYNC_PROCESSED_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((name) => !since || name >= since)
    .sort(); // lexicographic sort == chronological for YYYYMMDD_HHMMSS
}

function findFile(dir, prefix) {
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.toUpperCase().startsWith(prefix));
  return files.length ? path.join(dir, files[0]) : null;
}

function runEngineForBatch(batchDir, batchId) {
  const poauditPath = findFile(batchDir, "POAUDIT_");
  const cndPath = findFile(batchDir, "POAUDITCND_");
  if (!poauditPath || !cndPath) {
    console.warn(
      `  ⚠️  ${batchId}: missing POAUDIT/POAUDITCND file(s) — skipping.`,
    );
    return null;
  }
  if (!fs.existsSync(RC_MASTER)) {
    throw new Error(
      `RC master not found at ${RC_MASTER}. Check RC_MASTER_CUMULATIVE_PATH.`,
    );
  }

  const outDir = path.join(TMP_DIR, batchId);
  fs.mkdirSync(outDir, { recursive: true });
  const addpoJson = path.join(outDir, "audit_results_for_db.json");

  try {
    execFileSync(
      PYTHON_BIN,
      [
        path.join(BACKEND_DIR, "engine.py"),
        "--poaudit",
        poauditPath,
        "--cnd",
        cndPath,
        "--rc",
        RC_MASTER,
        "--po9-history",
        "", // deliberately disabled — see file header
        "--out",
        path.join(outDir, "audit_results.xlsx"),
        "--addpo-json",
        addpoJson,
      ],
      { cwd: BACKEND_DIR, stdio: "pipe" },
    );
  } catch (err) {
    console.error(
      `  ❌ engine.py failed for ${batchId}:`,
      err.stderr?.toString() || err.message,
    );
    return null;
  }

  if (!fs.existsSync(addpoJson)) return null;
  return JSON.parse(fs.readFileSync(addpoJson, "utf8"));
}

function pointsByNo(results) {
  const map = new Map();
  for (const p of results || []) map.set(String(p.pointNo), p);
  return map;
}

async function applyRow(freshDoc) {
  if (!freshDoc.po_material_number) return { action: "skipped-no-key" };

  const existing = await prisma.auditResult.findFirst({
    where: { po_material_number: freshDoc.po_material_number },
  });
  if (!existing) return { action: "skipped-no-db-match" };

  const freshPoints = pointsByNo(freshDoc.results);
  const fresh15 = freshPoints.get("15");

  if (existing.remarksLocked) {
    if (!fresh15)
      return { action: "locked-skipped-no-point15-in-fresh-output" };

    const currentResults = existing.results || [];
    let replaced = false;
    const merged = currentResults.map((p) => {
      if (String(p.pointNo) === "15") {
        replaced = true;
        return fresh15;
      }
      return p;
    });
    if (!replaced) merged.push(fresh15);

    if (!dryRun) {
      await prisma.auditResult.update({
        where: { id: existing.id },
        data: { results: merged },
      });
    }
    return { action: "locked-point15-only-refreshed" };
  }

  // Not locked: full refresh of `results` (all points, including 15),
  // same as a normal unlocked hourly update would do.
  if (!dryRun) {
    await prisma.auditResult.update({
      where: { id: existing.id },
      data: { results: freshDoc.results },
    });
  }
  return { action: "unlocked-full-refresh" };
}

async function main() {
  const batches = listBatches();
  console.log(
    `Found ${batches.length} archived batch(es)${since ? ` since ${since}` : ""} to replay${
      dryRun ? " — DRY RUN, no writes will happen" : ""
    }.`,
  );

  const tally = {};
  let batchNum = 0;
  for (const batchId of batches) {
    batchNum++;
    const batchDir = path.join(SYNC_PROCESSED_DIR, batchId);
    console.log(`--- [${batchNum}/${batches.length}] Replaying ${batchId} ---`);
    const rows = runEngineForBatch(batchDir, batchId);
    if (!rows) continue;

    for (const row of rows) {
      const result = await applyRow(row);
      tally[result.action] = (tally[result.action] || 0) + 1;
    }
  }

  console.log("\n=== DONE ===");
  console.table(tally);
  if (dryRun) {
    console.log(
      "\nThis was a DRY RUN — nothing was written to the database. Re-run without --dry-run to apply.",
    );
  }

  fs.rmSync(TMP_DIR, { recursive: true, force: true });
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("Fatal error:", err);
  await prisma.$disconnect();
  process.exit(1);
});
