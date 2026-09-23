import fs from "fs";
import path from "path";
import db, { prisma } from "../lib/prisma.js";
import dotenv from "dotenv";

dotenv.config();

/* ----------------------------------------------------------------------
 * fix-rc-purchase-groups.js
 * ==========================
 * ONE-TIME (safely re-runnable) backfill for existing rc_overlap_results
 * rows whose `purchaseGroups` was derived the OLD, buggy way (by cross-
 * referencing whichever PO lines happened to be in one particular
 * POAUDIT batch). This script re-derives purchaseGroups the CORRECT way -
 * straight from the cumulative RC master's own "Purchase group" column -
 * and updates ONLY that single field on each existing DB row.
 *
 * It NEVER:
 *   - inserts new rc_overlap_results rows
 *   - deletes rows
 *   - touches status / remark / overlappingRcs / remarksLocked /
 *     remarksLockedBy / remarksLockedAt / vendorName / any other field
 *
 * Usage:
 *   node scripts/fix-rc-purchase-groups.js [path/to/rc_master_cumulative.csv] [--dry-run]
 *
 * Defaults to data/rc_master_cumulative.csv (same file engine.py's --rc
 * argument points at in production, per sync_and_run.py).
 * ------------------------------------------------------------------- */

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const csvArg = args.find((a) => !a.startsWith("--"));
const RC_MASTER_PATH = csvArg
  ? path.resolve(csvArg)
  : path.resolve(process.cwd(), "data", "rc_master_cumulative.csv");

if (!fs.existsSync(RC_MASTER_PATH)) {
  console.error(`RC master CSV not found at: ${RC_MASTER_PATH}`);
  console.error(
    "Pass the correct path: node scripts/fix-rc-purchase-groups.js <path> [--dry-run]",
  );
  process.exit(1);
}

/* ---------------- minimal CSV parser ----------------
 * Handles simple quoted fields (RFC4180-ish) without needing an external
 * dependency. Good enough for the flat POAUDITRC/merged-master format. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function loadRcMaster(csvPath) {
  const text = fs.readFileSync(csvPath, "latin1");
  const rows = parseCsv(text);
  if (!rows.length) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r) => {
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = (r[idx] ?? "").trim();
    });
    return obj;
  });
}

// Same leading-zero-stripping normalization master-data.js already uses
// for vendor codes, applied here purely as a FALLBACK matching key.
function normVendor(v) {
  const s = String(v || "").trim();
  const stripped = s.replace(/^0+(?=\d)/, "");
  return stripped || s;
}

function key(vendor, material, rcNo) {
  return `${vendor}\u0000${material}\u0000${rcNo}`;
}

async function main() {
  console.log(`Reading RC master: ${RC_MASTER_PATH}`);
  const rcRows = loadRcMaster(RC_MASTER_PATH);
  console.log(`  ${rcRows.length} row(s) loaded.`);

  // exact map: (raw vendor, material, rcNo) -> purchase group
  const exactMap = new Map();
  // normalized-vendor fallback map: (normVendor, material, rcNo) -> purchase group
  const normMap = new Map();

  let blankPg = 0;
  for (const r of rcRows) {
    const vendor = r["Vendor Code"];
    const material = r["RC Material Code"];
    const rcNo = r["RC number"];
    const pg = (r["Purchase group"] || "").toUpperCase();
    if (!vendor || !material || !rcNo) continue;
    if (!pg) {
      blankPg++;
      continue; // never overwrite a DB value with a blank derived from a blank master row
    }
    exactMap.set(key(vendor, material, rcNo), pg);
    normMap.set(key(normVendor(vendor), material, rcNo), pg);
  }
  console.log(
    `  Built lookup: ${exactMap.size} exact key(s), ${blankPg} row(s) skipped (blank Purchase group in master).`,
  );

  const existing = await prisma.rcOverlapResult.findMany({
    select: {
      id: true,
      vendorCode: true,
      rcMaterialCode: true,
      rcNumber: true,
      purchaseGroups: true,
    },
  });
  console.log(
    `Found ${existing.length} existing rc_overlap_results row(s) in the DB.\n`,
  );

  let updated = 0;
  let unchanged = 0;
  let noMatch = 0;
  const noMatchSamples = [];

  for (const row of existing) {
    const exactKey = key(row.vendorCode, row.rcMaterialCode, row.rcNumber);
    const normKey = key(
      normVendor(row.vendorCode),
      row.rcMaterialCode,
      row.rcNumber,
    );

    const pg = exactMap.get(exactKey) ?? normMap.get(normKey);

    if (pg === undefined) {
      noMatch++;
      if (noMatchSamples.length < 15) {
        noMatchSamples.push(
          `${row.vendorCode} / ${row.rcMaterialCode} / ${row.rcNumber} (current: ${JSON.stringify(row.purchaseGroups)})`,
        );
      }
      continue; // no positive match in the master - leave the existing value untouched
    }

    const desired = [pg];
    const same =
      Array.isArray(row.purchaseGroups) &&
      row.purchaseGroups.length === desired.length &&
      row.purchaseGroups[0] === desired[0];

    if (same) {
      unchanged++;
      continue;
    }

    console.log(
      `  ${dryRun ? "[dry-run] would update" : "Updating"} ${row.vendorCode}/${row.rcMaterialCode}/${row.rcNumber}: ` +
        `${JSON.stringify(row.purchaseGroups)} -> ${JSON.stringify(desired)}`,
    );

    if (!dryRun) {
      await prisma.rcOverlapResult.update({
        where: { id: row.id },
        data: { purchaseGroups: desired }, // ONLY this field is touched
      });
    }
    updated++;
  }

  console.log("\n---- Summary ----");
  console.log(`Updated:   ${updated}`);
  console.log(`Unchanged: ${unchanged}`);
  console.log(`No match in RC master (left untouched): ${noMatch}`);
  if (noMatchSamples.length) {
    console.log("  Sample unmatched rows (investigate if this list is large):");
    noMatchSamples.forEach((s) => console.log(`    - ${s}`));
  }
  if (dryRun) {
    console.log(
      "\nDRY RUN - no changes were written. Re-run without --dry-run to apply.",
    );
  }
}

db()
  .then(main)
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Fatal error:", err.message);
    process.exit(1);
  });
