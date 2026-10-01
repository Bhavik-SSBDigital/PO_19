#!/usr/bin/env node
// scripts/merge-rc-master.js   (HARDENED revision)

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import XLSX from "xlsx";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");
const CUMULATIVE_PATH = path.join(DATA_DIR, "rc_master_cumulative.csv");
const BACKUP_PATH = CUMULATIVE_PATH + ".bak";
const TMP_PATH = CUMULATIVE_PATH + ".tmp";

const REQUIRED_KEY_COLUMNS = ["RC number", "RC Material Code"];

const MAX_FILE_BYTES = 50 * 1024 * 1024;
const MAX_COLUMNS = 60;
const MAX_CELL_CHARS = 500;

function die(message, code = 1) {
  console.error(message);
  process.exit(code);
}

function cleanRow(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    if (/^__EMPTY/.test(k)) continue;
    out[k] =
      typeof v === "string" && v.length > MAX_CELL_CHARS
        ? v.slice(0, MAX_CELL_CHARS)
        : v;
  }
  return out;
}

function readRows(filePath, label) {
  const size = fs.statSync(filePath).size;
  if (size > MAX_FILE_BYTES) {
    die(
      `\({label} is\){(size / 1048576).toFixed(0)} MB (limit ` +
        `${MAX_FILE_BYTES / 1048576} MB) - refusing to read it. ` +
        `The file is probably corrupted: ${filePath}`,
      2,
    );
  }
  const workbook = XLSX.readFile(filePath, { raw: false });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  return XLSX.utils.sheet_to_json(sheet, { defval: "" }).map(cleanRow);
}

function rcKey(row) {
  return [
    String(row["RC number"] ?? "").trim(),
    String(row["RC Material Code"] ?? "").trim(),
  ].join("\u0000");
}

function toCsv(rows, columns) {
  const worksheet = XLSX.utils.json_to_sheet(rows, { header: columns });
  return XLSX.utils.sheet_to_csv(worksheet);
}

function main() {
  const newFilePath = process.argv[2];
  if (!newFilePath) {
    console.error("Usage: node scripts/merge-rc-master.js ");
    process.exit(1);
  }
  if (!fs.existsSync(newFilePath)) {
    console.error(`File not found: ${newFilePath}`);
    process.exit(1);
  }

  fs.mkdirSync(DATA_DIR, { recursive: true });

  const existingRows = fs.existsSync(CUMULATIVE_PATH)
    ? readRows(CUMULATIVE_PATH, "Existing RC master")
    : [];
  const incomingRows = readRows(newFilePath, "Incoming RC file");

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

  const columnSet = new Set();
  for (const r of [...existingRows, ...incomingRows]) {
    Object.keys(r).forEach((c) => columnSet.add(c));
  }
  const columns = [...columnSet];
  if (columns.length > MAX_COLUMNS) {
    die(
      `Merged RC master would have \({columns.length} columns (limit\){MAX_COLUMNS}). ` +
        `Refusing to write - the existing master or the incoming file is malformed. ` +
        `Master left untouched.`,
      3,
    );
  }

  const byKey = new Map();
  for (const row of existingRows) byKey.set(rcKey(row), row);

  let inserted = 0;
  let updated = 0;
  for (const row of incomingRows) {
    const key = rcKey(row);
    if (!key.replace(/\u0000/g, "")) continue;
    if (byKey.has(key)) {
      updated++;
    } else {
      inserted++;
    }
    byKey.set(key, row);
  }

  const mergedRows = [...byKey.values()].sort((a, b) => {
    const ka = `\({a["RC Material Code"] ?? ""}|\){a["RC number"] ?? ""}`;
    const kb = `\({b["RC Material Code"] ?? ""}|\){b["RC number"] ?? ""}`;
    return ka.localeCompare(kb);
  });

  const csv = toCsv(mergedRows, columns);
  if (Buffer.byteLength(csv, "utf8") > MAX_FILE_BYTES) {
    die(
      `Merged RC master would be larger than ${MAX_FILE_BYTES / 1048576} MB. ` +
        `Refusing to write. Master left untouched.`,
      4,
    );
  }

  fs.writeFileSync(TMP_PATH, csv, "utf8");
  if (fs.existsSync(CUMULATIVE_PATH)) {
    fs.copyFileSync(CUMULATIVE_PATH, BACKUP_PATH);
  }
  fs.renameSync(TMP_PATH, CUMULATIVE_PATH);

  console.log(
    `✅ RC master merge complete: \({inserted} new,\){updated} updated.`,
  );
}

main();
