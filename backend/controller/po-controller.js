import { prisma } from "../lib/prisma.js";
import {
  SEVERITY_LEVELS,
  severityOf,
  classifyPoint,
  exceptionPointsOf,
  ensureSeverityLoaded,
} from "../utility/severity.js";
import {
  getVendorName,
  getVendorInfo, // Added VendorInfo import to retrieve GSTIN here too
  getPlantName,
  getPurchaseGroupName,
  getPaymentTermDescription,
  getPoTypeName,
} from "../utility/master-data.js";
import { POINT_DEFINITIONS_BY_NO } from "../utility/point-reference.js";
import { getHeaderForPo, getHeadersForPos } from "../utility/header-results.js";
import { getPoHeaderSummary } from "./po-header-controller.js";

function buildWhere(body = {}) {
  const and = [{ type: "PO" }];

  if (body.poNumber)
    and.push({ po_number: { contains: body.poNumber, mode: "insensitive" } });
  if (body.vendorCode) and.push({ vendor_code: body.vendorCode });
  if (body.fiscalYear) and.push({ fiscalYear: body.fiscalYear });
  if (body.poType) and.push({ po_type: body.poType });
  if (body.purchaseGroup) and.push({ purchase_group: body.purchaseGroup });
  if (body.plant) and.push({ plant: body.plant });

  if (body.holdOnly === true || body.holdOnly === "true") {
    and.push({ po_status: "H" });
    if (body.holdBucket === "overdue")
      and.push({ hold_due_date: { lt: new Date() } });
    if (body.holdBucket === "not_due")
      and.push({ hold_due_date: { gte: new Date() } });
  }

  if (body.month) {
    const [y, m] = body.month.split("-").map(Number);
    if (y && m) {
      const from = new Date(Date.UTC(y, m - 1, 1));
      const to = new Date(Date.UTC(y, m, 1));
      and.push({ po_created_date: { gte: from, lt: to } });
    }
  }

  if (body.status === "unassigned") {
    and.push({
      OR: [
        { verificationWorkflow: null },
        { verificationWorkflow: { currentStatus: "unassigned" } },
      ],
    });
  } else if (body.status) {
    and.push({ verificationWorkflow: { currentStatus: body.status } });
  }

  return { AND: and };
}

function matchesPointFilter(row, { severity, notVerifiedPointNo }) {
  if (!severity && !notVerifiedPointNo) return true;
  const wantedSeverities = severity
    ? String(severity)
        .split(",")
        .map((s) => s.trim())
    : null;
  return (row.results || []).some((p) => {
    if (classifyPoint(p) !== "notVerified") return false;
    if (notVerifiedPointNo && String(p.pointNo) !== String(notVerifiedPointNo))
      return false;
    if (wantedSeverities && !wantedSeverities.includes(severityOf(p.pointNo)))
      return false;
    return true;
  });
}

const INCLUDE = {
  verificationWorkflow: {
    include: {
      assignee: {
        select: { id: true, username: true, firstName: true, lastName: true },
      },
    },
  },
};

const RESULT_INCLUDE = {
  verificationWorkflow: {
    include: {
      assignee: {
        select: { id: true, username: true, firstName: true, lastName: true },
      },
      closer: {
        select: { id: true, username: true, firstName: true, lastName: true },
      },
      workflowSteps: { orderBy: { timestamp: "asc" } },
    },
  },
};

const ROW_SELECT = {
  id: true,
  po_number: true,
  po_line_item: true,
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
  tax_code: true,
  GSTInOfVendor: true, // Explicitly select to avoid undefined
};

const lineItemOf = (row) => {
  if (row.po_line_item) return row.po_line_item;
  if (row.po_material_number && row.po_material_number.includes("-")) {
    return row.po_material_number.split("-").slice(1).join("-");
  }
  return null;
};

const uniqueKeyOf = (row) =>
  row.po_material_number || `${row.po_number}-${lineItemOf(row) ?? row.id}`;

function withPointReference(results) {
  return (results || []).map((p) => ({
    ...p,
    scope: "line", // everything in AuditResult.results is line-level/"Others" now
    severity: severityOf(p.pointNo),
    ...(POINT_DEFINITIONS_BY_NO[String(p.pointNo)]
      ? {
          title: POINT_DEFINITIONS_BY_NO[String(p.pointNo)].title,
          summary: POINT_DEFINITIONS_BY_NO[String(p.pointNo)].summary,
          logic: POINT_DEFINITIONS_BY_NO[String(p.pointNo)].logic,
        }
      : {}),
  }));
}

/**
 * `results` holds ONLY the 13 line-level + "Others" points (1-8, 10,
 * 16-19) - this is a LINE-ITEM view, and shows LINE-ITEM data only, per
 * design. The PO's header-level points (9, 11, 12, 13, 14, 15) are
 * attached separately as `header` - a compact status object
 * ({ points, locked, lockedBy, lockedAt, verifiedCount, notVerifiedCount,
 * totalPoints }), fetched ONCE for this PO number regardless of which
 * line item is being viewed, and IDENTICAL across every line item of the
 * same PO. This is what lets the frontend show a small "Header Checks:
 * Closed" indicator on every line item without re-fetching/re-computing
 * anything, and without mixing header rows into the line-item table.
 */
const withExceptionPoints = async (row) => {
  const vendor = getVendorInfo(row.vendor_code);
  const header = await getHeaderForPo(row.po_number);

  return {
    ...row,
    lineItemKey:
      row.po_material_number || `${row.po_number}-${lineItemOf(row) ?? row.id}`,
    lineItem: lineItemOf(row),
    results: withPointReference(row.results),
    header,
    exceptionPoints: exceptionPointsOf(row).map((ep) => ({
      ...ep,
      ...(POINT_DEFINITIONS_BY_NO[String(ep.pointNo)]
        ? {
            title: POINT_DEFINITIONS_BY_NO[String(ep.pointNo)].title,
            logic: POINT_DEFINITIONS_BY_NO[String(ep.pointNo)].logic,
          }
        : {}),
    })),
    vendorName:
      row.nameOfVendor || vendor?.name || getVendorName(row.vendor_code),
    vendorGstin: row.GSTInOfVendor || vendor?.gstin || "",
    plantName: getPlantName(row.plant),
    poTypeName: getPoTypeName(row.po_type),
    purchaseGroupName: getPurchaseGroupName(row.purchase_group),
    paymentTermDescription: getPaymentTermDescription(row.payment_term),
  };
};

// Batch variant - used wherever a whole page of rows needs enriching at
// once, so header status is fetched in a single query (getHeadersForPos)
// instead of once per row, and each PO's header is computed once even if
// several of its lines appear on the same page.
async function withExceptionPointsBatch(rows) {
  const headerMap = await getHeadersForPos(rows.map((r) => r.po_number));
  return rows.map((row) => {
    const vendor = getVendorInfo(row.vendor_code);
    return {
      ...row,
      lineItemKey:
        row.po_material_number ||
        `${row.po_number}-${lineItemOf(row) ?? row.id}`,
      lineItem: lineItemOf(row),
      results: withPointReference(row.results),
      header: headerMap.get(row.po_number) || {
        poNumber: row.po_number,
        points: [],
        totalPoints: 0,
        verifiedCount: 0,
        notVerifiedCount: 0,
        locked: false,
        lockedBy: null,
        lockedAt: null,
      },
      exceptionPoints: exceptionPointsOf(row).map((ep) => ({
        ...ep,
        ...(POINT_DEFINITIONS_BY_NO[String(ep.pointNo)]
          ? {
              title: POINT_DEFINITIONS_BY_NO[String(ep.pointNo)].title,
              logic: POINT_DEFINITIONS_BY_NO[String(ep.pointNo)].logic,
            }
          : {}),
      })),
      vendorName:
        row.nameOfVendor || vendor?.name || getVendorName(row.vendor_code),
      vendorGstin: row.GSTInOfVendor || vendor?.gstin || "",
      plantName: getPlantName(row.plant),
      poTypeName: getPoTypeName(row.po_type),
      purchaseGroupName: getPurchaseGroupName(row.purchase_group),
      paymentTermDescription: getPaymentTermDescription(row.payment_term),
    };
  });
}

export const get_po_audit_results = async (req, res) => {
  try {
    await ensureSeverityLoaded();
    const {
      page = 1,
      pageSize = 25,
      severity,
      notVerifiedPointNo,
    } = req.body || {};
    const where = buildWhere(req.body || {});
    const take = Math.min(Number(pageSize) || 25, 200);
    const skip = (Math.max(Number(page) || 1, 1) - 1) * take;

    if (severity || notVerifiedPointNo) {
      const all = await prisma.auditResult.findMany({
        where,
        include: INCLUDE,
        orderBy: { po_created_date: "desc" },
      });
      const filtered = all.filter((row) =>
        matchesPointFilter(row, { severity, notVerifiedPointNo }),
      );
      const pageRows = filtered.slice(skip, skip + take);
      const rows = await withExceptionPointsBatch(pageRows);
      return res.status(200).json({
        results: rows,
        total: filtered.length,
        page: Number(page),
        pageSize: take,
      });
    }

    const [pageRows, total] = await Promise.all([
      prisma.auditResult.findMany({
        where,
        include: INCLUDE,
        orderBy: { po_created_date: "desc" },
        take,
        skip,
      }),
      prisma.auditResult.count({ where }),
    ]);

    const rows = await withExceptionPointsBatch(pageRows);
    return res.status(200).json({
      results: rows,
      total,
      page: Number(page),
      pageSize: take,
    });
  } catch (error) {
    console.error("Error in get_po_audit_results:", error);
    return res
      .status(500)
      .json({ message: "Failed to fetch PO audit results" });
  }
};

/**
 * POST /getPOAuditResult
 *
 * LINE-ITEM lookup (id, poMaterialNumber, or po_number + po_line_item):
 *   Returns line-item data - `results` (13 line-level points),
 *   `exceptionPoints`, plus a compact `header` status object for this
 *   PO. This response contains LINE-ITEM detail; it does not carry the
 *   full header points table by default beyond that compact status
 *   (the frontend's header panel component fetches full header detail
 *   itself, once, when the user expands it).
 *
 * PO-ONLY lookup (po_number given, no po_line_item, no id/material
 * number): delegates entirely to getPoHeaderSummary - the header-level
 * points + a line-item picker list, NOT a forced/guessed line item. This
 * replaces the old "multipleMatches" picker modal.
 */
export const get_po_audit_result = async (req, res) => {
  try {
    await ensureSeverityLoaded();
    const { poMaterialNumber, id, po_number, po_line_item, fiscalYear } =
      req.body || {};

    if (!id && !poMaterialNumber && !po_number) {
      return res
        .status(400)
        .json({ message: "id, poMaterialNumber, or po_number is required" });
    }

    const isLineItemLookup = Boolean(
      id || poMaterialNumber || (po_number && po_line_item),
    );

    if (isLineItemLookup) {
      const where = { type: "PO" };
      if (id) where.id = id;
      if (poMaterialNumber) where.po_material_number = poMaterialNumber;
      if (!id && !poMaterialNumber && po_number && po_line_item) {
        where.po_number = po_number;
        where.po_line_item = po_line_item;
      }
      if (fiscalYear) where.fiscalYear = fiscalYear;

      const result = await prisma.auditResult.findFirst({
        where,
        include: RESULT_INCLUDE,
      });

      if (!result) {
        return res.status(404).json({
          message: po_line_item
            ? `Line item ${po_line_item} not found for PO ${po_number}`
            : "PO audit result not found",
        });
      }

      const enriched = await withExceptionPoints(result);
      return res.status(200).json(enriched);
    }

    // PO-ONLY lookup - hand off entirely to the header-level system.
    req.body = { ...req.body, po_number };
    return getPoHeaderSummary(req, res);
  } catch (error) {
    console.error("Error in get_po_audit_result:", error);
    return res.status(500).json({ message: "Failed to fetch PO audit result" });
  }
};

/**
 * POST /reports/po-lines
 * Every line item of a PO, LINE-LEVEL data only (results = 13 line-level
 * points per line, no header points mixed in). `header` is returned ONCE
 * at the top level of the response, not duplicated per line - callers
 * that need "does this PO's header show closed" read `header.locked`
 * once, not per line item.
 */
export const get_po_lines = async (req, res) => {
  try {
    await ensureSeverityLoaded();
    const { poNumber } = req.body || {};
    if (!poNumber)
      return res.status(400).json({ message: "poNumber is required" });

    const rows = await prisma.auditResult.findMany({
      where: { type: "PO", po_number: poNumber },
      select: ROW_SELECT,
      orderBy: { po_line_item: "asc" },
    });

    const header = await getHeaderForPo(poNumber);

    const lines = rows.map((row) => {
      const vendor = getVendorInfo(row.vendor_code);
      return {
        ...row,
        lineItemKey: uniqueKeyOf(row),
        lineItem: lineItemOf(row),
        results: withPointReference(row.results),
        exceptionPoints: exceptionPointsOf(row).map((ep) => ({
          ...ep,
          ...(POINT_DEFINITIONS_BY_NO[String(ep.pointNo)]
            ? {
                title: POINT_DEFINITIONS_BY_NO[String(ep.pointNo)].title,
                logic: POINT_DEFINITIONS_BY_NO[String(ep.pointNo)].logic,
              }
            : {}),
        })),
        vendorName:
          row.nameOfVendor || vendor?.name || getVendorName(row.vendor_code),
        vendorGstin: row.GSTInOfVendor || vendor?.gstin || "",
        plantName: getPlantName(row.plant),
        poTypeName: getPoTypeName(row.po_type),
        purchaseGroupName: getPurchaseGroupName(row.purchase_group),
        paymentTermDescription: getPaymentTermDescription(row.payment_term),
      };
    });

    return res
      .status(200)
      .json({ poNumber, header, total: lines.length, lines });
  } catch (error) {
    console.error("Error in get_po_lines:", error);
    return res.status(500).json({ message: "Failed to fetch PO lines" });
  }
};
