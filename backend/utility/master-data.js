/**
 * master-data.js
 * ===============
 * Loads the SAP master files (Vendor Master, Plant Master, Purchasing Group
 * Master, Payment Terms, Condition Type Master) that live in your
 * `SAP/Masters` folder, and exposes lookup + enrichment helpers so the
 * dashboard/controllers can show real names instead of raw SAP codes:
 *
 *      209995        -> "MEHRU ELECTRICAL & MECHANICAL ENGINEERS(P) LTD"
 *      1019           -> "AIA ENGINEERING LTD. UNIT-19"
 *      P16            -> "Mahendra Patel"
 *      Z102           -> "45 DAYS CREDIT"
 *
 * WHY THIS EXISTS
 * ---------------
 * audit_results (and therefore every dashboard/table) only ever stored the
 * raw SAP codes (vendor_code, plant, purchase_group, payment_term, po_type).
 * The master files that translate those codes into human-readable names were
 * never joined in anywhere. This module does that join, at read time, so:
 *   1) nothing in audit_engine.py's rule logic changes (verified/not-verified
 *      classification is completely untouched),
 *   2) the master files stay the single source of truth - if HR renames a
 *      purchasing group or a vendor's name changes, the dashboard picks it up
 *      on next restart/refresh without re-running the audit.
 *
 * FILE DISCOVERY
 * --------------
 * Your local tree (from `ls`) is:
 *   procurement/SAP/Batch 1/POAUDIT.xlsx ...
 *   procurement/SAP/Masters/ Vendor Master.xlsx   <- note the leading space
 *   procurement/SAP/Masters/Plant master.xlsx
 *   procurement/SAP/Masters/Purchasing Group Master.xlsx
 *   procurement/SAP/Masters/Payment terms.xlsx
 *   procurement/SAP/Masters/Condition type Master.XLSX
 *   procurement/SAP/Masters/TAX code Master - Working.xlsx
 *
 * Rather than hardcode those exact (inconsistently-spaced/cased) filenames,
 * this module fuzzy-matches on a normalized filename (case/space/underscore/
 * hyphen-insensitive), so it keeps working whether files are named
 * "Vendor_Master.xlsx", "_Vendor_Master.xlsx", " Vendor Master.xlsx", etc.
 *
 * CONFIGURE THE FOLDER
 * ---------------------
 * Set an env var pointing at the Masters folder:
 *      MASTERS_DIR=/absolute/path/to/procurement/SAP/Masters
 * If unset, it defaults to "<project root>/SAP/Masters" and then falls back
 * to "<project root>/../SAP/Masters" (in case the server lives one level
 * below "procurement/").
 *
 * Requires the `xlsx` (SheetJS) package:  npm install xlsx
 */

import XLSX from "xlsx";
import fs from "fs";
import path from "path";

// ---------------------------------------------------------------------------
// Locate the Masters folder
// ---------------------------------------------------------------------------
function resolveMastersDir() {
  const candidates = [
    process.env.MASTERS_DIR,
    path.resolve(process.cwd(), "SAP", "Masters"),
    path.resolve(process.cwd(), "..", "SAP", "Masters"),
    path.resolve(process.cwd(), "..", "..", "SAP", "Masters"),
    // Added these to find the sibling 'procurement' folder automatically:
    path.resolve(process.cwd(), "..", "procurement", "SAP", "Masters"),
    path.resolve(process.cwd(), "..", "..", "procurement", "SAP", "Masters"),
  ].filter(Boolean);

  for (const dir of candidates) {
    if (fs.existsSync(dir)) return dir;
  }
  console.warn(
    "[master-data] ⚠️ Could not locate a SAP/Masters folder. Set the MASTERS_DIR " +
      "env var to the absolute path of your Masters folder. Tried:",
    candidates,
  );
  return candidates[0] || null;
}

const MASTERS_DIR = resolveMastersDir();

function normalizeFileKey(name) {
  return name.toLowerCase().replace(/[\s_\-]+/g, "");
}

function findMasterFile(patterns) {
  if (!MASTERS_DIR || !fs.existsSync(MASTERS_DIR)) return null;
  const files = fs.readdirSync(MASTERS_DIR);
  for (const pattern of patterns) {
    const target = normalizeFileKey(pattern);
    const match = files.find((f) => normalizeFileKey(f).includes(target));
    if (match) return path.join(MASTERS_DIR, match);
  }
  return null;
}

function loadSheet(filePath, sheetName) {
  if (!filePath) return [];
  try {
    const wb = XLSX.readFile(filePath, { cellDates: false });
    const sheet =
      sheetName && wb.SheetNames.includes(sheetName)
        ? sheetName
        : wb.SheetNames[0];
    return XLSX.utils.sheet_to_json(wb.Sheets[sheet], { defval: "" });
  } catch (err) {
    console.error(`[master-data] Failed to read ${filePath}:`, err.message);
    return [];
  }
}

// SAP/Excel round-trips a numeric code like vendor "209995" or plant "1019"
// as a float ("209995.0" or 209995.0) about as often as it comes back as a
// clean string - normalize both PO-side and master-side codes the same way
// so lookups always hit.
function normCode(value) {
  if (value === null || value === undefined) return "";
  let s = String(value).trim();
  // Remove .0 if Excel parsed it as a float
  if (/^\d+\.0$/.test(s)) s = s.slice(0, -2);
  // SAP FIX: Strip leading zeros so "0000209995" matches "209995"
  s = s.replace(/^0+(?=\d)/, "");
  return s;
}

function normText(value) {
  return String(value ?? "").trim();
}

// ---------------------------------------------------------------------------
// Vendor Master  (columns: CoCd, Vendor, Name 1, Name 2, Rg, Region..., ...)
// ---------------------------------------------------------------------------
function buildVendorMap() {
  const map = new Map();
  const filePath = findMasterFile(["vendormaster", "vendor master"]);
  if (!filePath) {
    console.warn("[master-data] ❌ Vendor Master file not found!");
    return map;
  }

  const rows = loadSheet(filePath);
  if (rows.length > 0) {
    console.log(
      "[master-data] ✅ Found Vendor Master. Columns are:",
      Object.keys(rows[0]),
    );
  }

  for (const r of rows) {
    // Check multiple possible column names for Vendor Code
    const rawCode = r["Vendor"] || r["Vendor Code"] || r["Account"];
    const code = normCode(rawCode);
    if (!code) continue;

    // Check multiple possible column names for Vendor Name
    const name = r["Name 1"] || r["Name"] || r["Name1"] || r["Vendor Name"];

    map.set(code, {
      code,
      name: normText(name),
      name2: normText(r["Name 2"]),
      stateCode: normText(r["Rg"]),
      state: normText(r["Region (State, Province, County)"]),
      country: normText(r["Country Key"]),
      postalCode: normText(r["PostalCode"]),
      gstin: normText(r["Tax Number 3"]),
    });
  }
  console.log(
    `[master-data] ✅ Successfully loaded ${map.size} vendors into memory.`,
  );
  return map;
}

// ---------------------------------------------------------------------------
// Plant Master  (columns: Plant, Name 1, Name 2, City, Region, ...)
// ---------------------------------------------------------------------------
function buildPlantMap() {
  const map = new Map();
  const filePath = findMasterFile(["plantmaster", "plant master"]);
  if (!filePath) {
    console.warn("[master-data] ❌ Plant Master file not found.");
    return map;
  }
  for (const r of loadSheet(filePath)) {
    const code = normCode(r["Plant"]);
    if (!code) continue;
    map.set(code, {
      code,
      name: normText(r["Name 1"]),
      name2: normText(r["Name 2"]),
      city: normText(r["City"]),
      region: normText(r["Region"]),
      country: normText(r["Country Key"]),
      purchOrg: normText(r["Purch. Organization"]),
      businessPlace: normText(r["Business Place"]),
    });
  }
  console.log(
    `[master-data] ✅ Successfully loaded ${map.size} plants into memory.`,
  );
  return map;
}

// ---------------------------------------------------------------------------
// Purchasing Group Master  (columns: Pur Grp, Name)  -> this is the BUYER name
// ---------------------------------------------------------------------------
function buildPurchaseGroupMap() {
  const map = new Map();
  const filePath = findMasterFile([
    "purchasinggroupmaster",
    "purchasing group master",
  ]);
  if (!filePath) {
    console.warn("[master-data] ❌ Purchasing Group Master file not found.");
    return map;
  }
  for (const r of loadSheet(filePath)) {
    const code = normText(r["Pur Grp"]).toUpperCase();
    if (!code) continue;
    map.set(code, { code, name: normText(r["Name"]) });
  }
  return map;
}

// ---------------------------------------------------------------------------
// Payment Terms  (columns: Payment term, Discription, %)
// ---------------------------------------------------------------------------
function buildPaymentTermMap() {
  const map = new Map();
  const filePath = findMasterFile(["paymentterms", "payment terms"]);
  if (!filePath) {
    console.warn("[master-data] ❌ Payment Terms file not found.");
    return map;
  }
  for (const r of loadSheet(filePath, "Sheet1")) {
    const code = normText(r["Payment term"]).toUpperCase();
    if (!code) continue;
    map.set(code, {
      code,
      description: normText(r["Discription"] ?? r["Description"]),
      advancePct: r["%"] === "" ? null : Number(r["%"]),
    });
  }
  return map;
}

// ---------------------------------------------------------------------------
// Condition Type Master  (columns: Condition type, Name)
// ---------------------------------------------------------------------------
function buildConditionTypeMap() {
  const map = new Map();
  const filePath = findMasterFile([
    "conditiontypemaster",
    "condition type master",
  ]);
  if (!filePath) return map;
  for (const r of loadSheet(filePath)) {
    const code = normText(r["Condition type"]).toUpperCase();
    if (!code || map.has(code)) continue;
    map.set(code, { code, name: normText(r["Name"]) });
  }
  return map;
}

// ---------------------------------------------------------------------------
// PO Type names - ASSUMPTION, no PO-Type master file was supplied.
// ---------------------------------------------------------------------------
const PO_TYPE_NAMES = {
  ZSER: "Service PO",
  ZLRM: "Local Raw Material",
  ZIRM: "Import Raw Material",
  ZJVW: "Job Work",
  ZSTO: "Stock Transport Order",
  ZLCP: "Local Capital Purchase",
  ZICP: "Import Capital Purchase",
  ZCSR: "Capital & Spares Requisition",
  ZTWK: "Third-Party Work",
  ZNVL: "Normal Value (Standard) PO",
};

function getPoTypeInfo(code) {
  const key = normText(code).toUpperCase();
  if (!key) return { code: key, name: "", isAssumption: false };
  const name = PO_TYPE_NAMES[key];
  return {
    code: key,
    name: name || key,
    isAssumption: true,
  };
}

// ---------------------------------------------------------------------------
// Build once, on module load
// ---------------------------------------------------------------------------
let vendorMap = buildVendorMap();
let plantMap = buildPlantMap();
let purchaseGroupMap = buildPurchaseGroupMap();
let paymentTermMap = buildPaymentTermMap();
let conditionTypeMap = buildConditionTypeMap();

export function reloadMasterData() {
  vendorMap = buildVendorMap();
  plantMap = buildPlantMap();
  purchaseGroupMap = buildPurchaseGroupMap();
  paymentTermMap = buildPaymentTermMap();
  conditionTypeMap = buildConditionTypeMap();
  return getMasterDataStatus();
}

export function getMasterDataStatus() {
  return {
    mastersDir: MASTERS_DIR,
    vendors: vendorMap.size,
    plants: plantMap.size,
    purchaseGroups: purchaseGroupMap.size,
    paymentTerms: paymentTermMap.size,
    conditionTypes: conditionTypeMap.size,
  };
}

// ---------------------------------------------------------------------------
// Single-field getters
// ---------------------------------------------------------------------------
export function getVendorInfo(vendorCode) {
  return vendorMap.get(normCode(vendorCode)) || null;
}
export function getVendorName(vendorCode) {
  return vendorMap.get(normCode(vendorCode))?.name || "";
}
export function getPlantInfo(plantCode) {
  return plantMap.get(normCode(plantCode)) || null;
}
export function getPlantName(plantCode) {
  return plantMap.get(normCode(plantCode))?.name || "";
}
export function getPurchaseGroupName(code) {
  return purchaseGroupMap.get(normText(code).toUpperCase())?.name || "";
}
export function getPaymentTermDescription(code) {
  return paymentTermMap.get(normText(code).toUpperCase())?.description || "";
}
export function getConditionTypeName(code) {
  return conditionTypeMap.get(normText(code).toUpperCase())?.name || "";
}
export function getPoTypeName(code) {
  return getPoTypeInfo(code).name;
}

// ---------------------------------------------------------------------------
// Row enrichment - the main entry point controllers should use.
// ---------------------------------------------------------------------------
export function enrichPoRow(row) {
  if (!row || typeof row !== "object") return row;

  const vendor = getVendorInfo(row.vendor_code);
  const plant = getPlantInfo(row.plant);
  const poType = getPoTypeInfo(row.po_type);

  return {
    ...row,
    vendorName: row.nameOfVendor || vendor?.name || "",
    vendorState: vendor?.state || "",
    vendorGstin: row.GSTInOfVendor || vendor?.gstin || "",
    plantName: plant?.name || "",
    plantCity: plant?.city || "",
    purchaseGroupName: getPurchaseGroupName(row.purchase_group),
    paymentTermDescription: getPaymentTermDescription(row.payment_term),
    poTypeName: poType.name,
    poTypeIsAssumption: poType.isAssumption,
  };
}

export function enrichByCode({
  vendorCode,
  plant,
  purchaseGroup,
  paymentTerm,
  poType,
} = {}) {
  return {
    vendorName: vendorCode ? getVendorName(vendorCode) : "",
    plantName: plant ? getPlantName(plant) : "",
    purchaseGroupName: purchaseGroup ? getPurchaseGroupName(purchaseGroup) : "",
    paymentTermDescription: paymentTerm
      ? getPaymentTermDescription(paymentTerm)
      : "",
    poTypeName: poType ? getPoTypeName(poType) : "",
    poTypeIsAssumption: !!poType,
  };
}

export const _internal = { MASTERS_DIR, PO_TYPE_NAMES };
