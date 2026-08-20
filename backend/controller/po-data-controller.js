import { prisma } from "../lib/prisma.js";
import {
  ensureSeverityLoaded,
  classifyPoint,
  severityOf,
} from "../utility/severity.js";
import { RC_PLACEHOLDER_PO_TYPES } from "../utility/rc-placeholder.js";
import {
  getVendorName,
  getVendorInfo,
  getPlantName,
  getPurchaseGroupName,
  getPurchaseGroupCode,
  getPurchaseGroupsList,
  searchPurchaseGroupCodes,
  getPaymentTermDescription,
  getPoTypeName,
  getPoTypesList,
  getPlantsList,
} from "../utility/master-data.js";

const parseNum = (v) => {
  if (v === null || v === undefined || v === "") return 0;
  const n = Number(String(v).replace(/,/g, ""));
  return isNaN(n) ? 0 : n;
};

const lineItemOf = (row) => {
  if (row.po_line_item) return row.po_line_item;
  if (row.po_material_number && row.po_material_number.includes("-")) {
    return row.po_material_number.split("-").slice(1).join("-");
  }
  return null;
};

const rowIsClosed = (row) => row.remarksLocked === true;

const ROW_SELECT = {
  id: true,
  po_number: true,
  po_line_item: true,
  po_material_number: true,
  purchase_req: true,
  po_type: true,
  po_created_date: true,
  plant: true,
  purchase_group: true,
  vendor_code: true,
  nameOfVendor: true,
  material_code: true,
  net_value: true,
  payment_term: true,
  results: true,
  tax_code: true,
  GSTInOfVendor: true,
  remarksLocked: true,
  remarksLockedBy: true,
  remarksLockedAt: true,
};

const HEADER_ROW_SELECT = {
  id: true,
  po_number: true,
  vendor_code: true,
  purchase_group: true,
  po_type: true,
  results: true,
  remarksLocked: true,
  remarksLockedBy: true,
  remarksLockedAt: true,
  auditedOn: true,
};

function buildBaseWhere(body = {}) {
  const where = { type: "PO", po_type: { notIn: RC_PLACEHOLDER_PO_TYPES } };

  if (body.poDateFrom || body.poDateTo) {
    where.po_created_date = {};
    if (body.poDateFrom) where.po_created_date.gte = new Date(body.poDateFrom);
    if (body.poDateTo) where.po_created_date.lte = new Date(body.poDateTo);
  }
  if (body.prDateFrom || body.prDateTo) {
    where.pr_create_date = {};
    if (body.prDateFrom) where.pr_create_date.gte = new Date(body.prDateFrom);
    if (body.prDateTo) where.pr_create_date.lte = new Date(body.prDateTo);
  }
  if (Array.isArray(body.poType) && body.poType.length) {
    where.po_type = { in: body.poType };
  }
  if (Array.isArray(body.plant) && body.plant.length) {
    where.plant = { in: body.plant };
  } else if (body.plant && typeof body.plant === "string") {
    where.plant = body.plant;
  }
  if (body.vendorCode) where.vendor_code = body.vendorCode;
  if (body.materialCode) where.material_code = body.materialCode;

  if (body.poNumberSearch) {
    where.po_number = { contains: body.poNumberSearch, mode: "insensitive" };
  }
  // Note: vendorSearch has been removed from Prisma's buildBaseWhere.
  // It is now handled cleanly as a post-filter once vendor names are mapped
  // from the master data.

  return where;
}

function rowHasException(row) {
  return (row.results || []).some((p) => classifyPoint(p) === "notVerified");
}

function pointMatchesAdvancedFilters(p, { severity, pointNo }) {
  if (classifyPoint(p) !== "notVerified") return false;
  if (pointNo && String(p.pointNo) !== String(pointNo)) return false;
  if (severity) {
    const wanted = String(severity)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (wanted.length && !wanted.includes(severityOf(p.pointNo))) return false;
  }
  return true;
}

function newBucket() {
  return {
    totalLines: 0,
    exceptionLines: 0,
    verifiedPoints: 0,
    notVerifiedPoints: 0,
    closedLines: 0,
    openLines: 0,
    lineItems: new Set(),
    lineItemDetails: [],
    prs: new Set(),
    taxCodes: new Set(),
    gstins: new Set(),
    valueExposure: 0,
    vendorCode: null,
    vendorName: null,
    poType: null,
    plant: null,
    purchaseGroup: null,
    paymentTerm: null,
  };
}

function compliancePctOf(b) {
  const denom = b.verifiedPoints + b.notVerifiedPoints;
  return denom > 0
    ? Number(((b.verifiedPoints / denom) * 100).toFixed(1))
    : null;
}

function closedPctOf(b) {
  return b.totalLines > 0
    ? Number(((b.closedLines / b.totalLines) * 100).toFixed(1))
    : null;
}

function reviewStatusOf(b) {
  if (b.totalLines === 0 || b.closedLines === 0) return "pending";
  if (b.closedLines === b.totalLines) return "reviewed";
  return "in_progress";
}

export const getPoWiseExceptions = async (req, res) => {
  try {
    await ensureSeverityLoaded();

    const body = req.body || {};
    const where = buildBaseWhere(body);
    const user = req.user || {};

    if (user.isAdmin || user.isProcurementManager) {
      const groupCodes = new Set();
      if (Array.isArray(body.purchaseGroup) && body.purchaseGroup.length) {
        body.purchaseGroup.forEach((c) =>
          groupCodes.add(String(c).toUpperCase()),
        );
      }
      if (body.purchaseGroupName) {
        searchPurchaseGroupCodes(body.purchaseGroupName).forEach((c) =>
          groupCodes.add(c),
        );
      }
      if (groupCodes.size) {
        where.purchase_group = { in: [...groupCodes] };
      }
    } else if (user.isBuyer) {
      where.purchase_group = getPurchaseGroupCode(user.username);
    } else {
      return res
        .status(403)
        .json({ message: "Not authorized to view PO data" });
    }

    const rows = await prisma.auditResult.findMany({
      where,
      select: ROW_SELECT,
    });

    const severity = body.severity;
    const pointNo = body.pointNo;
    const hasPointFilter = Boolean(severity || pointNo);

    const byPo = {};
    for (const row of rows) {
      if (hasPointFilter) {
        const anyMatch = (row.results || []).some((p) =>
          pointMatchesAdvancedFilters(p, { severity, pointNo }),
        );
        if (!anyMatch) continue;
      }

      const poKey = row.po_number || "Unassigned";
      const vendor = getVendorInfo(row.vendor_code);
      byPo[poKey] = byPo[poKey] || newBucket();
      const b = byPo[poKey];

      const closed = rowIsClosed(row);
      const hasException = rowHasException(row);

      b.totalLines += 1;
      if (hasException) b.exceptionLines += 1;
      if (closed) b.closedLines += 1;
      else b.openLines += 1;

      for (const p of row.results || []) {
        const status = classifyPoint(p);
        if (status === "verified") b.verifiedPoints += 1;
        else if (status === "notVerified") b.notVerifiedPoints += 1;
      }

      const li = lineItemOf(row);
      if (li) b.lineItems.add(li);

      b.lineItemDetails.push({
        lineItem: li || row.po_material_number || "—",
        poLineItem: row.po_line_item || null,
        materialCode: row.material_code || null,
        closed,
        hasException,
        remarksLockedAt: row.remarksLockedAt || null,
        netValue: parseNum(row.net_value),
      });

      if (row.purchase_req) b.prs.add(row.purchase_req);
      if (row.tax_code) b.taxCodes.add(row.tax_code);
      const gstin = row.GSTInOfVendor || vendor?.gstin || "";
      if (gstin) b.gstins.add(gstin);
      b.valueExposure += parseNum(row.net_value);
      b.vendorCode = b.vendorCode || row.vendor_code || null;
      b.vendorName = b.vendorName || row.nameOfVendor || vendor?.name || null;
      b.poType = b.poType || row.po_type || null;
      b.plant = b.plant || row.plant || null;
      b.purchaseGroup = b.purchaseGroup || row.purchase_group || null;
      b.paymentTerm = b.paymentTerm || row.payment_term || null;
    }

    let finalResults = Object.entries(byPo)
      .sort((a, b) => b[1].exceptionLines - a[1].exceptionLines)
      .map(([poNumber, v]) => ({
        poNumber,
        vendorCode: v.vendorCode,
        vendorName: v.vendorName || getVendorName(v.vendorCode),
        poType: v.poType,
        poTypeName: getPoTypeName(v.poType),
        plant: v.plant,
        plantName: getPlantName(v.plant),
        purchaseGroup: v.purchaseGroup,
        purchaseGroupName: getPurchaseGroupName(v.purchaseGroup),
        paymentTerm: v.paymentTerm,
        paymentTermDescription: getPaymentTermDescription(v.paymentTerm),
        totalLineCount: v.totalLines,
        exceptionLineCount: v.exceptionLines,
        compliancePct: compliancePctOf(v),
        closedLineCount: v.closedLines,
        openLineCount: v.openLines,
        closedPct: closedPctOf(v),
        reviewStatus: reviewStatusOf(v),
        isFullyClosed: v.totalLines > 0 && v.closedLines === v.totalLines,
        lineItemDetails: [...v.lineItemDetails].sort((a, c) =>
          String(a.lineItem).localeCompare(String(c.lineItem), undefined, {
            numeric: true,
          }),
        ),
        distinctLineItems: v.lineItems.size,
        lineItems: [...v.lineItems].sort(),
        purchase_req: [...v.prs].join(", "),
        taxCode: [...v.taxCodes].join(", "),
        vendorGstin: [...v.gstins].join(", "),
        valueExposure: Number(v.valueExposure.toFixed(2)),
      }));

    // Post-filter logic for Vendor Search (handles dynamic master data lookups)
    if (body.vendorSearch) {
      const vSearchLower = body.vendorSearch.toLowerCase();
      finalResults = finalResults.filter(
        (r) =>
          (r.vendorCode && r.vendorCode.toLowerCase().includes(vSearchLower)) ||
          (r.vendorName && r.vendorName.toLowerCase().includes(vSearchLower)),
      );
    }

    return res.status(200).json({
      total: finalResults.length,
      results: finalResults,
      scope:
        user.isBuyer && !(user.isAdmin || user.isProcurementManager)
          ? { restrictedToPurchaseGroup: user.username }
          : null,
    });
  } catch (error) {
    console.error("Error in getPoWiseExceptions:", error);
    return res.status(500).json({ message: "Failed to fetch PO data" });
  }
};

export const getPoHeaderWiseDetails = async (req, res) => {
  try {
    await ensureSeverityLoaded();

    const body = req.body || {};
    const user = req.user || {};
    const where = { po_type: { notIn: RC_PLACEHOLDER_PO_TYPES } };

    if (user.isAdmin || user.isProcurementManager) {
      const groupCodes = new Set();
      if (Array.isArray(body.purchaseGroup) && body.purchaseGroup.length) {
        body.purchaseGroup.forEach((c) =>
          groupCodes.add(String(c).toUpperCase()),
        );
      }
      if (groupCodes.size) {
        where.purchase_group = { in: [...groupCodes] };
      }
    } else if (user.isBuyer) {
      where.purchase_group = getPurchaseGroupCode(user.username);
    } else {
      return res
        .status(403)
        .json({ message: "Not authorized to view PO header data" });
    }

    if (body.poNumber) {
      where.po_number = body.poNumber;
    } else if (body.poNumberSearch) {
      where.po_number = { contains: body.poNumberSearch, mode: "insensitive" };
    }
    if (body.vendorCode) where.vendor_code = body.vendorCode;
    if (Array.isArray(body.poType) && body.poType.length) {
      where.po_type = {
        in: body.poType.filter((t) => !RC_PLACEHOLDER_PO_TYPES.includes(t)),
      };
    }

    const rows = await prisma.poHeaderResult.findMany({
      where,
      select: HEADER_ROW_SELECT,
      orderBy: { po_number: "asc" },
    });

    let results = rows.map((row) => {
      const verifiedPoints = (row.results || []).filter(
        (p) => classifyPoint(p) === "verified",
      ).length;
      const notVerifiedPoints = (row.results || []).filter(
        (p) => classifyPoint(p) === "notVerified",
      ).length;
      const denom = verifiedPoints + notVerifiedPoints;
      const vendor = getVendorInfo(row.vendor_code);

      return {
        poNumber: row.po_number,
        vendorCode: row.vendor_code,
        vendorName: vendor?.name || getVendorName(row.vendor_code),
        poType: row.po_type,
        poTypeName: getPoTypeName(row.po_type),
        purchaseGroup: row.purchase_group,
        purchaseGroupName: getPurchaseGroupName(row.purchase_group),
        points: (row.results || []).map((p) => ({
          pointNo: p.pointNo,
          status: classifyPoint(p),
          severity: severityOf(p.pointNo),
          remarks: p.remarks || [],
        })),
        verifiedPoints,
        notVerifiedPoints,
        compliancePct:
          denom > 0
            ? Number(((verifiedPoints / denom) * 100).toFixed(1))
            : null,
        closed: row.remarksLocked === true,
        closedBy: row.remarksLockedBy || null,
        closedAt: row.remarksLockedAt || null,
        auditedOn: row.auditedOn,
      };
    });

    // Post-filter logic added here as well, to keep both endpoints aligned
    if (body.vendorSearch) {
      const vSearchLower = body.vendorSearch.toLowerCase();
      results = results.filter(
        (r) =>
          (r.vendorCode && r.vendorCode.toLowerCase().includes(vSearchLower)) ||
          (r.vendorName && r.vendorName.toLowerCase().includes(vSearchLower)),
      );
    }

    return res.status(200).json({
      total: results.length,
      results,
      scope:
        user.isBuyer && !(user.isAdmin || user.isProcurementManager)
          ? { restrictedToPurchaseGroup: user.username }
          : null,
    });
  } catch (error) {
    console.error("Error in getPoHeaderWiseDetails:", error);
    return res.status(500).json({ message: "Failed to fetch PO header data" });
  }
};

export const getPurchaseGroupsForFilter = async (req, res) => {
  const user = req.user || {};
  if (!(user.isAdmin || user.isProcurementManager)) {
    return res.status(403).json({ message: "Not authorized" });
  }
  return res.status(200).json({ groups: getPurchaseGroupsList() });
};

export const getPoTypesForFilter = async (req, res) => {
  return res.status(200).json({ poTypes: getPoTypesList() });
};

export const getPlantsForFilter = async (req, res) => {
  return res.status(200).json({ plants: getPlantsList() });
};
