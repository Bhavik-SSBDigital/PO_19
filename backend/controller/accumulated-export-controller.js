import fs from "fs";
import path from "path";
import XLSX from "xlsx";
import { prisma } from "../lib/prisma.js";
import {
  ensureSeverityLoaded,
  severityOf,
  classifyPoint,
  SEVERITY_LEVELS,
} from "../utility/severity.js";
import {
  getVendorInfo,
  getVendorName,
  getPlantName,
  getPurchaseGroupName,
  getPaymentTermDescription,
  getPoTypeName,
} from "../utility/master-data.js";

/**
 * controller/accumulated-export-controller.js
 * ============================================
 * "Accumulated" exports — three full-table dumps (not scoped, not
 * filtered by date/purchase-group/anything) for whoever has full-visibility
 * access to this system (Admin, SSBDigital). These are deliberately
 * separate from the existing exports in po-remarks-report-controller.js /
 * rc-overlap-export-controller.js, which are remark-driven and/or
 * purchase-group-scoped by design - the point of this file is the
 * opposite: every row in the underlying table, enriched the same way
 * (vendor/plant/purchase-group names via utility/master-data.js, severity
 * via utility/severity.js), reusing those same utilities rather than
 * duplicating lookup logic.
 *
 * Gated in routes.js by requireAnyOf("isAdmin", "isSsbDigital") only, per
 * the build spec's item 3 (Buyer/PM were flagged as a decision point and
 * are deliberately left out here - see routes.js comment above the three
 * routes if that needs to change later).
 *
 * All three write an .xlsx via the same `xlsx` package + column-mapping
 * pattern already used by rc-overlap-export-controller.js.
 */

function sheetFromRows(columns, rows) {
  const data = [
    columns.map(([header]) => header),
    ...rows.map((row) =>
      columns.map(([, key]) => {
        const v = row[key];
        if (v instanceof Date) return v.toISOString().slice(0, 10);
        if (v === null || v === undefined) return "";
        return v;
      }),
    ),
  ];
  const worksheet = XLSX.utils.aoa_to_sheet(data);
  worksheet["!cols"] = columns.map(([header]) => ({
    wch: Math.max(12, header.length + 2),
  }));
  return worksheet;
}

function sendWorkbook(res, worksheet, sheetName, filenamePrefix) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  const filename = `${filenamePrefix}-${new Date().toISOString().slice(0, 10)}.xlsx`;
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  return res.status(200).send(buffer);
}

/**
 * ============================================================================
 * 1. Accumulated PO file — LINE-ITEM level (one row per AuditResult)
 * ============================================================================
 */
const LINE_COLUMNS = [
  ["PO Number", "poNumber"],
  ["PO Line Item", "poLineItem"],
  ["PR Number", "purchaseReq"],
  ["PO Type", "poType"],
  ["PO Type Name", "poTypeName"],
  ["PO Created Date", "poCreatedDate"],
  ["PO Delivery Date", "poDeliveryDate"],
  ["Vendor Code", "vendorCode"],
  ["Vendor Name", "vendorName"],
  ["Vendor GSTIN", "vendorGstin"],
  ["Plant", "plant"],
  ["Plant Name", "plantName"],
  ["Purchase Group", "purchaseGroup"],
  ["Purchase Group Name", "purchaseGroupName"],
  ["Material Code", "materialCode"],
  ["Material Description", "materialDesc"],
  ["Net Value", "netValue"],
  ["Payment Term", "paymentTerm"],
  ["Payment Term Description", "paymentTermDescription"],
  ["Tax Code", "taxCode"],
  ["PO Status", "poStatus"],
  ["Audited On", "auditedOn"],
  ["Total Points", "totalPoints"],
  ["Not Verified Points", "notVerifiedPoints"],
  ["Highest Severity (Not Verified)", "highestSeverity"],
  ["Issue Status", "issueStatus"],
  ["Remarks Locked By", "remarksLockedBy"],
  ["Remarks Locked At", "remarksLockedAt"],
];

function highestSeverityOf(results) {
  let best = null;
  let bestRank = Infinity;
  for (const p of results || []) {
    if (classifyPoint(p) !== "notVerified") continue;
    const sev = severityOf(p.pointNo);
    const rank = SEVERITY_LEVELS.indexOf(sev);
    if (rank !== -1 && rank < bestRank) {
      bestRank = rank;
      best = sev;
    }
  }
  return best || "";
}

function buildAccumulatedLineRow(row) {
  const vendor = getVendorInfo(row.vendor_code);
  const notVerified = (row.results || []).filter(
    (p) => classifyPoint(p) === "notVerified",
  );

  return {
    poNumber: row.po_number || "",
    poLineItem: row.po_line_item || "",
    purchaseReq: row.purchase_req || "",
    poType: row.po_type || "",
    poTypeName: getPoTypeName(row.po_type),
    poCreatedDate: row.po_created_date,
    poDeliveryDate: row.po_delivery_date,
    vendorCode: row.vendor_code || "",
    vendorName:
      row.nameOfVendor || vendor?.name || getVendorName(row.vendor_code),
    vendorGstin: row.GSTInOfVendor || vendor?.gstin || "",
    plant: row.plant || "",
    plantName: getPlantName(row.plant),
    purchaseGroup: row.purchase_group || "",
    purchaseGroupName: getPurchaseGroupName(row.purchase_group),
    materialCode: row.material_code || "",
    materialDesc: row.material_disc || "",
    netValue: row.net_value || "",
    paymentTerm: row.payment_term || "",
    paymentTermDescription: getPaymentTermDescription(row.payment_term),
    taxCode: row.tax_code || "",
    poStatus: row.po_status || "",
    auditedOn: row.auditedOn,
    totalPoints: (row.results || []).length,
    notVerifiedPoints: notVerified.length,
    highestSeverity: highestSeverityOf(row.results),
    issueStatus: row.remarksLocked ? "Closed" : "Open",
    remarksLockedBy: row.remarksLockedBy || "",
    remarksLockedAt: row.remarksLockedAt,
  };
}

export const downloadAccumulatedPoLineExport = async (req, res) => {
  try {
    await ensureSeverityLoaded();

    // No where clause at all — this is the FULL AuditResult table,
    // deliberately unscoped/unfiltered (see file header comment).
    const rows = await prisma.auditResult.findMany({
      orderBy: [{ po_number: "asc" }, { po_line_item: "asc" }],
    });

    const worksheet = sheetFromRows(
      LINE_COLUMNS,
      rows.map(buildAccumulatedLineRow),
    );
    return sendWorkbook(
      res,
      worksheet,
      "Accumulated PO Lines",
      "accumulated-po-line-items",
    );
  } catch (error) {
    console.error("Error in downloadAccumulatedPoLineExport:", error);
    return res
      .status(500)
      .json({ message: "Failed to generate accumulated PO line-item export" });
  }
};

/**
 * ============================================================================
 * 2. Accumulated PO file — HEADER level, no line items (one row per PoHeaderResult)
 * ============================================================================
 */
const HEADER_COLUMNS = [
  ["PO Number", "poNumber"],
  ["Vendor Code", "vendorCode"],
  ["Vendor Name", "vendorName"],
  ["PO Type", "poType"],
  ["PO Type Name", "poTypeName"],
  ["Purchase Group", "purchaseGroup"],
  ["Purchase Group Name", "purchaseGroupName"],
  ["Audited On", "auditedOn"],
  ["Total Header Points", "totalPoints"],
  ["Not Verified Header Points", "notVerifiedPoints"],
  ["Highest Severity (Not Verified)", "highestSeverity"],
  ["Issue Status", "issueStatus"],
  ["Remarks Locked By", "remarksLockedBy"],
  ["Remarks Locked At", "remarksLockedAt"],
];

function buildAccumulatedHeaderRow(row) {
  const vendor = getVendorInfo(row.vendor_code);
  const notVerified = (row.results || []).filter(
    (p) => classifyPoint(p) === "notVerified",
  );

  return {
    poNumber: row.po_number || "",
    vendorCode: row.vendor_code || "",
    vendorName: vendor?.name || getVendorName(row.vendor_code),
    poType: row.po_type || "",
    poTypeName: getPoTypeName(row.po_type),
    purchaseGroup: row.purchase_group || "",
    purchaseGroupName: getPurchaseGroupName(row.purchase_group),
    auditedOn: row.auditedOn,
    totalPoints: (row.results || []).length,
    notVerifiedPoints: notVerified.length,
    highestSeverity: highestSeverityOf(row.results),
    issueStatus: row.remarksLocked ? "Closed" : "Open",
    remarksLockedBy: row.remarksLockedBy || "",
    remarksLockedAt: row.remarksLockedAt,
  };
}

export const downloadAccumulatedPoHeaderExport = async (req, res) => {
  try {
    await ensureSeverityLoaded();

    const rows = await prisma.poHeaderResult.findMany({
      orderBy: { po_number: "asc" },
    });

    const worksheet = sheetFromRows(
      HEADER_COLUMNS,
      rows.map(buildAccumulatedHeaderRow),
    );
    return sendWorkbook(
      res,
      worksheet,
      "Accumulated PO Headers",
      "accumulated-po-headers",
    );
  } catch (error) {
    console.error("Error in downloadAccumulatedPoHeaderExport:", error);
    return res
      .status(500)
      .json({ message: "Failed to generate accumulated PO header export" });
  }
};

/**
 * ============================================================================
 * 3. Accumulated RC file
 * ============================================================================
 * Two ways to get this, per the build spec - this implements the enriched
 * option (query param / body flag `raw: true` switches to serving
 * sync/scripts/merge-rc-master.js's data/rc_master_cumulative.csv directly,
 * for whoever wants the untouched sync master instead of an enriched
 * re-derivation). Default is the enriched RcOverlapResult export, using
 * the exact same column set + name-resolution helpers as
 * rc-overlap-export-controller.js's "all" export, just with NO
 * purchase-group scoping applied (every RcOverlapResult row, regardless
 * of purchaseGroups).
 */
const RC_COLUMNS = [
  ["RC Number", "rcNumber"],
  ["Vendor Code", "vendorCode"],
  ["Vendor Name", "vendorName"],
  ["Material Code", "rcMaterialCode"],
  ["Valid From", "validFrom"],
  ["Valid To", "validTo"],
  ["Status (System)", "status"],
  ["Purchase Group(s)", "purchaseGroups"],
  ["Issue Status", "issueStatus"],
  ["Remarks Locked By", "remarksLockedBy"],
  ["Remarks Locked At", "remarksLockedAt"],
];

function buildAccumulatedRcRow(rc) {
  const vendor = getVendorInfo(rc.vendorCode);
  return {
    rcNumber: rc.rcNumber,
    vendorCode: rc.vendorCode,
    vendorName: vendor?.name || getVendorName(rc.vendorCode) || "",
    rcMaterialCode: rc.rcMaterialCode,
    validFrom: rc.validFrom,
    validTo: rc.validTo,
    status: rc.status,
    purchaseGroups: (rc.purchaseGroups || [])
      .map((code) => getPurchaseGroupName(code) || code)
      .join(", "),
    issueStatus: rc.remarksLocked ? "Closed" : "Open",
    remarksLockedBy: rc.remarksLockedBy || "",
    remarksLockedAt: rc.remarksLockedAt,
  };
}

// Where the sync pipeline (sync/scripts/merge-rc-master.js, run out of
// APP_DIR by sync/sync_and_run.py) keeps the running RC master CSV.
// APP_DIR itself is only known to sync.env, not to the backend process,
// so this is deliberately a plain relative path from the backend's own
// working directory (matching how APP_DIR is normally the same checkout
// this backend runs from) - override with RC_MASTER_CUMULATIVE_PATH in
// backend/.env if your deployment keeps the sync/ tree elsewhere.
const RC_MASTER_CUMULATIVE_PATH =
  process.env.RC_MASTER_CUMULATIVE_PATH ||
  path.join(process.cwd(), "data", "rc_master_cumulative.csv");

export const downloadAccumulatedRcExport = async (req, res) => {
  try {
    const wantsRaw =
      req.body?.raw === true ||
      req.body?.raw === "true" ||
      req.query?.raw === "true";

    if (wantsRaw) {
      if (!fs.existsSync(RC_MASTER_CUMULATIVE_PATH)) {
        return res.status(404).json({
          message: `Raw RC master CSV not found at ${RC_MASTER_CUMULATIVE_PATH}. Set RC_MASTER_CUMULATIVE_PATH in backend/.env if the sync/ tree lives elsewhere, or omit "raw" for the enriched export instead.`,
        });
      }
      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="rc-master-cumulative-${new Date()
          .toISOString()
          .slice(0, 10)}.csv"`,
      );
      return fs.createReadStream(RC_MASTER_CUMULATIVE_PATH).pipe(res);
    }

    const rcs = await prisma.rcOverlapResult.findMany({
      orderBy: { rcNumber: "asc" },
    });

    const worksheet = sheetFromRows(RC_COLUMNS, rcs.map(buildAccumulatedRcRow));
    return sendWorkbook(res, worksheet, "Accumulated RC", "accumulated-rc");
  } catch (error) {
    console.error("Error in downloadAccumulatedRcExport:", error);
    return res
      .status(500)
      .json({ message: "Failed to generate accumulated RC export" });
  }
};
