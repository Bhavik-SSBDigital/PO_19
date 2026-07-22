// utility/master-data.js
import XLSX from "xlsx";
import fs from "fs";
import path from "path";

function resolveMastersDir() {
  const candidates = [
    process.env.MASTERS_DIR,
    path.resolve(process.cwd(), "SAP", "Masters"),
    path.resolve(process.cwd(), "..", "SAP", "Masters"),
    path.resolve(process.cwd(), "..", "..", "SAP", "Masters"),
    path.resolve(process.cwd(), "..", "procurement", "SAP", "Masters"),
    path.resolve(process.cwd(), "..", "..", "procurement", "SAP", "Masters"),
  ].filter(Boolean);
  for (const dir of candidates) if (fs.existsSync(dir)) return dir;
  console.warn(
    "[master-data] ⚠️ No SAP/Masters folder found. Tried:",
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

function normCode(value) {
  if (value === null || value === undefined) return "";
  let s = String(value).trim();
  if (/^\d+\.0$/.test(s)) s = s.slice(0, -2);
  s = s.replace(/^0+(?=\d)/, "");
  return s;
}
function normText(value) {
  return String(value ?? "").trim();
}

// --- THE KEY FIX -----------------------------------------------------------
// Instead of hardcoding one exact header string, we normalize every header
// (lowercase, strip spaces/dots/underscores) and match by *keyword regex*.
// This survives "Vendor", "Vendor Code", "Vendor No.", "Vendor  No", etc.
function normalizeHeader(h) {
  return String(h ?? "")
    .toLowerCase()
    .replace(/[\s_.\-]+/g, "");
}

// Returns the ACTUAL header key from `sampleRow` that matches one of the
// regex patterns, trying them in priority order. Logs what it picked.
function resolveColumn(sampleRow, patterns, label, fileLabel) {
  if (!sampleRow) return null;
  const headers = Object.keys(sampleRow);
  const normalizedMap = headers.map((h) => ({
    raw: h,
    norm: normalizeHeader(h),
  }));
  for (const pattern of patterns) {
    const hit = normalizedMap.find((h) => pattern.test(h.norm));
    if (hit) {
      console.log(
        `[master-data] ${fileLabel}: "${label}" -> matched column "${hit.raw}"`,
      );
      return hit.raw;
    }
  }
  console.warn(
    `[master-data] ❌ ${fileLabel}: could not find a column for "${label}". Available columns:`,
    headers,
  );
  return null;
}

// ---------------------------------------------------------------------------
// Vendor Master
// ---------------------------------------------------------------------------
function buildVendorMap() {
  const map = new Map();
  const filePath = findMasterFile(["vendormaster", "vendor master"]);
  if (!filePath) {
    console.warn("[master-data] ❌ Vendor Master file not found!");
    return map;
  }
  const rows = loadSheet(filePath);
  if (!rows.length) return map;

  const sample = rows[0];
  const codeCol = resolveColumn(
    sample,
    [/^vendor$/, /^account$/, /vendorcode/, /vendorno/, /^lifnr$/],
    "vendor code",
    "Vendor Master",
  );
  const nameCol = resolveColumn(
    sample,
    [/^name1$/, /^name$/, /vendorname/],
    "vendor name",
    "Vendor Master",
  );
  const name2Col = resolveColumn(
    sample,
    [/^name2$/],
    "vendor name2",
    "Vendor Master",
  );
  const gstinCol = resolveColumn(
    sample,
    [/taxnumber3/, /^gstin$/, /gstno/, /gstnumber/, /taxnumber1/, /gstinno/],
    "GSTIN",
    "Vendor Master",
  );
  const stateCodeCol = resolveColumn(
    sample,
    [/^rg$/, /^region$/],
    "state code",
    "Vendor Master",
  );
  const stateCol = resolveColumn(
    sample,
    [/region.*state/, /^state$/],
    "state",
    "Vendor Master",
  );
  const countryCol = resolveColumn(
    sample,
    [/countrykey/, /^country$/],
    "country",
    "Vendor Master",
  );
  const postalCol = resolveColumn(
    sample,
    [/postalcode/, /^pincode$/, /^zip$/],
    "postal code",
    "Vendor Master",
  );

  if (!codeCol) return map; // can't build map without a code column
  let missingGstin = 0;

  for (const r of rows) {
    const code = normCode(r[codeCol]);
    if (!code) continue;
    const gstin = gstinCol ? normText(r[gstinCol]) : "";
    if (!gstin) missingGstin++;
    map.set(code, {
      code,
      name: nameCol ? normText(r[nameCol]) : "",
      name2: name2Col ? normText(r[name2Col]) : "",
      stateCode: stateCodeCol ? normText(r[stateCodeCol]) : "",
      state: stateCol ? normText(r[stateCol]) : "",
      country: countryCol ? normText(r[countryCol]) : "",
      postalCode: postalCol ? normText(r[postalCol]) : "",
      gstin,
    });
  }
  console.log(
    `[master-data] ✅ Loaded ${map.size} vendors (${map.size - missingGstin} with GSTIN, ${missingGstin} missing GSTIN).`,
  );
  if (!gstinCol) {
    console.error(
      "[master-data] 🚨 GSTIN column was never found in Vendor Master — every vendor will show blank GSTIN. " +
        "Open the file and tell me the exact header text of the GST column so I can add it to the pattern list.",
    );
  }
  return map;
}

// ---------------------------------------------------------------------------
// Plant Master
// ---------------------------------------------------------------------------
function buildPlantMap() {
  const map = new Map();
  const filePath = findMasterFile(["plantmaster", "plant master"]);
  if (!filePath) {
    console.warn("[master-data] ❌ Plant Master file not found.");
    return map;
  }
  const rows = loadSheet(filePath);
  if (!rows.length) return map;
  const sample = rows[0];
  const codeCol = resolveColumn(
    sample,
    [/^plant$/, /^werks$/],
    "plant code",
    "Plant Master",
  );
  const nameCol = resolveColumn(
    sample,
    [/^name1$/, /^name$/],
    "plant name",
    "Plant Master",
  );
  const name2Col = resolveColumn(
    sample,
    [/^name2$/],
    "plant name2",
    "Plant Master",
  );
  const cityCol = resolveColumn(sample, [/^city$/], "city", "Plant Master");
  const regionCol = resolveColumn(
    sample,
    [/^region$/],
    "region",
    "Plant Master",
  );
  const countryCol = resolveColumn(
    sample,
    [/countrykey/, /^country$/],
    "country",
    "Plant Master",
  );
  const purchOrgCol = resolveColumn(
    sample,
    [/purch.*org/],
    "purch org",
    "Plant Master",
  );
  const bizPlaceCol = resolveColumn(
    sample,
    [/businessplace/],
    "business place",
    "Plant Master",
  );

  if (!codeCol) return map;
  for (const r of rows) {
    const code = normCode(r[codeCol]);
    if (!code) continue;
    map.set(code, {
      code,
      name: nameCol ? normText(r[nameCol]) : "",
      name2: name2Col ? normText(r[name2Col]) : "",
      city: cityCol ? normText(r[cityCol]) : "",
      region: regionCol ? normText(r[regionCol]) : "",
      country: countryCol ? normText(r[countryCol]) : "",
      purchOrg: purchOrgCol ? normText(r[purchOrgCol]) : "",
      businessPlace: bizPlaceCol ? normText(r[bizPlaceCol]) : "",
    });
  }
  console.log(`[master-data] ✅ Loaded ${map.size} plants.`);
  return map;
}

// ---------------------------------------------------------------------------
// Purchasing Group Master
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
  const rows = loadSheet(filePath);
  if (!rows.length) return map;
  const sample = rows[0];
  const codeCol = resolveColumn(
    sample,
    [/purgrp/, /purchasinggroup/, /^ekgrp$/],
    "pur. group code",
    "Purchasing Group Master",
  );
  const nameCol = resolveColumn(
    sample,
    [/^name$/, /description/, /buyer/],
    "pur. group name",
    "Purchasing Group Master",
  );
  if (!codeCol) return map;
  for (const r of rows) {
    const code = normText(r[codeCol]).toUpperCase();
    if (!code) continue;
    map.set(code, { code, name: nameCol ? normText(r[nameCol]) : "" });
  }
  console.log(`[master-data] ✅ Loaded ${map.size} purchasing groups.`);
  return map;
}

// ---------------------------------------------------------------------------
// Payment Terms
// ---------------------------------------------------------------------------
function buildPaymentTermMap() {
  const map = new Map();
  const filePath = findMasterFile(["paymentterms", "payment terms"]);
  if (!filePath) {
    console.warn("[master-data] ❌ Payment Terms file not found.");
    return map;
  }
  const rows = loadSheet(filePath, "Sheet1");
  if (!rows.length) return map;
  const sample = rows[0];
  const codeCol = resolveColumn(
    sample,
    [/paymentterm/, /^zterm$/],
    "payment term code",
    "Payment Terms",
  );
  const descCol = resolveColumn(
    sample,
    [/discription/, /description/],
    "payment term description",
    "Payment Terms",
  );
  const pctCol = resolveColumn(
    sample,
    [/^%$/, /percent/, /advance/],
    "advance %",
    "Payment Terms",
  );
  if (!codeCol) return map;
  for (const r of rows) {
    const code = normText(r[codeCol]).toUpperCase();
    if (!code) continue;
    map.set(code, {
      code,
      description: descCol ? normText(r[descCol]) : "",
      advancePct: pctCol && r[pctCol] !== "" ? Number(r[pctCol]) : null,
    });
  }
  console.log(`[master-data] ✅ Loaded ${map.size} payment terms.`);
  return map;
}

// ---------------------------------------------------------------------------
// Condition Type Master
// ---------------------------------------------------------------------------
function buildConditionTypeMap() {
  const map = new Map();
  const filePath = findMasterFile([
    "conditiontypemaster",
    "condition type master",
  ]);
  if (!filePath) return map;
  const rows = loadSheet(filePath);
  if (!rows.length) return map;
  const sample = rows[0];
  const codeCol = resolveColumn(
    sample,
    [/conditiontype/, /^ktart$/],
    "condition type code",
    "Condition Type Master",
  );
  const nameCol = resolveColumn(
    sample,
    [/^name$/, /description/],
    "condition type name",
    "Condition Type Master",
  );
  if (!codeCol) return map;
  for (const r of rows) {
    const code = normText(r[codeCol]).toUpperCase();
    if (!code || map.has(code)) continue;
    map.set(code, { code, name: nameCol ? normText(r[nameCol]) : "" });
  }
  return map;
}

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
  return { code: key, name: name || key, isAssumption: true };
}

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

// Diagnostic endpoint payload — hit this from Postman/browser to see exactly
// what got matched without digging through server logs.
export function getMasterDataStatus() {
  const sampleVendor = [...vendorMap.values()][0];
  return {
    mastersDir: MASTERS_DIR,
    vendors: vendorMap.size,
    vendorsWithGstin: [...vendorMap.values()].filter((v) => v.gstin).length,
    plants: plantMap.size,
    purchaseGroups: purchaseGroupMap.size,
    paymentTerms: paymentTermMap.size,
    conditionTypes: conditionTypeMap.size,
    sampleVendorRecord: sampleVendor || null,
  };
}

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
