#!/usr/bin/env node
// scripts/merge-rc-master.js
//
// WHY THIS EXISTS
// ----------------
// engine.py's --rc argument reads a SINGLE file, fresh, on every run - it
// has no memory of previous runs (it's a stateless Python script, no DB
// access). The client's requirement is that the RC master must be
// CUMULATIVE / historical: "Every new RC data file received subsequently
// shall be added to the existing RC data... should not overwrite the
// previously received RC data", and this cumulative master is what Point
// 15 and RC Overlap must both validate against.
//
// This script is the piece that makes that true: it merges a newly
// received RC file into a persistent cumulative file on disk
// (backend/data/rc_master_cumulative.csv), UPSERTING by
// (RC number, RC Material Code) - NOT RC number alone. Verified against
// real sample data (2026-09-18): a single RC number legitimately covers
// MANY different materials (one RC in the sample had 13 separate
// material rows) - keying by RC number alone would silently collapse
// all of those down to one row and destroy the other 12. Vendor Code is
// deliberately NOT part of the key either: different RC file exports
// format it differently for the same vendor (e.g. "0000208190" vs
// "209092" for what is the same vendor), so including it would wrongly
// treat the same RC+material as two different records depending on
// which file it was last seen in.
//   - A brand-new RC+material combination is APPENDED.
//   - One seen before (same RC number + same Material Code) has its row
//     UPDATED in place (e.g. a corrected validity window) rather than
//     duplicated.
//   - Nothing already in the cumulative file is ever deleted just because
//     it's absent from the latest incoming file - that's the whole point.
//
// USAGE (run this BEFORE engine.py, every time a new RC file arrives):
//   node scripts/merge-rc-master.js <path-to-new-rc-file.csv|.xlsx>
//
// Then run engine.py with:
//   --rc backend/data/rc_master_cumulative.csv
// (NOT the raw incoming file directly - see engine.py's --rc help text
// and its top-of-file CHANGELOG entry for this revision.)
//
// Expected columns (matches what engine.py's build_context() reads from
// --rc): "Vendor Code", "RC Material Code", "RC number", "RC valid from",
// "RC valid to". Any additional columns present in the incoming file are
// preserved as-is (union of every column ever seen), so this doesn't need
// to know the FULL schema up front.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import XLSX from "xlsx";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");
const CUMULATIVE_PATH = path.join(DATA_DIR, "rc_master_cumulative.csv");

// Dedup key: RC number is the RC master's real primary key - each RC is
// one uniquely-numbered document, so this is the only field guaranteed
// to identify "the same RC" across different file exports. (Vendor Code
// alone is NOT safe to include in the key: different RC file sources
// format it differently - e.g. one export zero-pads to "0000208190",
// another gives the bare "209092" for the same vendor - so a compound
// key including Vendor Code would wrongly treat the same RC as two
// different records if it ever reappears from a different source file.)
const REQUIRED_KEY_COLUMNS = ["RC number", "RC Material Code"];

function readRows(filePath) {
  const workbook = XLSX.readFile(filePath, { raw: false });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  return XLSX.utils.sheet_to_json(sheet, { defval: "" });
}

function rcKey(row) {
  return [
    String(row["RC number"] ?? "").trim(),
    String(row["RC Material Code"] ?? "").trim(),
  ].join("\u0000");
}

function writeCsv(rows, columns, outPath) {
  const worksheet = XLSX.utils.json_to_sheet(rows, { header: columns });
  const csv = XLSX.utils.sheet_to_csv(worksheet);
  fs.writeFileSync(outPath, csv, "utf8");
}

function main() {
  const newFilePath = process.argv[2];
  if (!newFilePath) {
    console.error(
      "Usage: node scripts/merge-rc-master.js <path-to-new-rc-file.csv|.xlsx>",
    );
    process.exit(1);
  }
  if (!fs.existsSync(newFilePath)) {
    console.error(`File not found: ${newFilePath}`);
    process.exit(1);
  }

  fs.mkdirSync(DATA_DIR, { recursive: true });

  const existingRows = fs.existsSync(CUMULATIVE_PATH)
    ? readRows(CUMULATIVE_PATH)
    : [];
  const incomingRows = readRows(newFilePath);

  if (incomingRows.length === 0) {
    console.error("The incoming file has no rows - nothing to merge.");
    process.exit(1);
  }

  const missingCols = REQUIRED_KEY_COLUMNS.filter(
    (c) => !(c in incomingRows[0]),
  );
  if (missingCols.length > 0) {
    console.error(
      `Incoming file is missing required column(s): ${missingCols.join(", ")}. ` +
        `Found columns: ${Object.keys(incomingRows[0]).join(", ")}`,
    );
    process.exit(1);
  }

  // Union of every column ever seen, existing file first (keeps column
  // order stable across runs), then anything new the incoming file adds.
  const columnSet = new Set();
  for (const r of [...existingRows, ...incomingRows]) {
    Object.keys(r).forEach((c) => columnSet.add(c));
  }
  const columns = [...columnSet];

  const byKey = new Map();
  for (const row of existingRows) byKey.set(rcKey(row), row);

  let inserted = 0;
  let updated = 0;
  for (const row of incomingRows) {
    const key = rcKey(row);
    if (!key.replace(/\u0000/g, "")) continue; // skip rows with no RC number/material at all
    if (byKey.has(key)) {
      updated++;
    } else {
      inserted++;
    }
    byKey.set(key, row); // upsert - incoming data wins for this RC+material
  }

  const mergedRows = [...byKey.values()].sort((a, b) => {
    const ka = `${a["RC Material Code"] ?? ""}|${a["RC number"] ?? ""}`;
    const kb = `${b["RC Material Code"] ?? ""}|${b["RC number"] ?? ""}`;
    return ka.localeCompare(kb);
  });

  writeCsv(mergedRows, columns, CUMULATIVE_PATH);

  console.log(
    `✅ RC master merge complete: ${inserted} new RC record(s), ${updated} ` +
      `updated (same RC number + Material Code seen before), ` +
      `${mergedRows.length} total record(s) now in the cumulative master.`,
  );
  console.log(`   Cumulative file: ${CUMULATIVE_PATH}`);
  console.log(
    `   Nothing was deleted - records from earlier files not present in ` +
      `this incoming file are kept, per the cumulative-data requirement.`,
  );
  console.log(
    `\nNext: run engine.py with --rc ${CUMULATIVE_PATH} (not the raw file ` +
      `you just merged).`,
  );
}

main();
