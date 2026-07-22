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
  getPlantName,
  getPurchaseGroupName,
  getPaymentTermDescription,
  getPoTypeName,
} from "../utility/master-data.js";
import { POINT_DEFINITIONS_BY_NO } from "../utility/point-reference.js";

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

// Attaches full audit-point reference (title/summary/logic + current
// severity) to EVERY point in a result set, not only the failing ones - so
// a full 19-point breakdown can show "what does this point check?"
// regardless of whether it passed.
function withPointReference(results) {
  return (results || []).map((p) => ({
    ...p,
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

// Enriches a row for frontend display. `po_status` is deliberately kept as
// raw data (some screens need it to compute the Hold badge/ageing) but it
// must never be rendered as a bare "Status" column showing values like
// "PO HOLD" - strip that column from any table consuming this.
const withExceptionPoints = (row) => ({
  ...row,
  lineItemKey:
    row.po_material_number || `${row.po_number}-${lineItemOf(row) ?? row.id}`,
  lineItem: lineItemOf(row),
  // FIX: results now carry title/summary/logic/severity for every one of
  // the 19 points (not just the failing ones) — this is what every
  // frontend table (search page, dashboard drilldown, auditor review) reads.
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
  vendorName: row.nameOfVendor || getVendorName(row.vendor_code),
  plantName: getPlantName(row.plant),
  poTypeName: getPoTypeName(row.po_type),
  purchaseGroupName: getPurchaseGroupName(row.purchase_group),
  paymentTermDescription: getPaymentTermDescription(row.payment_term),
});

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
      const rows = filtered.slice(skip, skip + take).map(withExceptionPoints);
      return res.status(200).json({
        results: rows,
        total: filtered.length,
        page: Number(page),
        pageSize: take,
      });
    }

    const [rows, total] = await Promise.all([
      prisma.auditResult.findMany({
        where,
        include: INCLUDE,
        orderBy: { po_created_date: "desc" },
        take,
        skip,
      }),
      prisma.auditResult.count({ where }),
    ]);

    return res.status(200).json({
      results: rows.map(withExceptionPoints),
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

    // 1. Exact Match (ID, Material Num, or PO + Line Item)
    if (id || poMaterialNumber || (po_number && po_line_item)) {
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
      if (result) return res.status(200).json(withExceptionPoints(result));

      if (po_line_item)
        return res.status(404).json({
          message: `Line item ${po_line_item} not found for PO ${po_number}`,
        });
    }

    // 2. Broad Search (Just PO Number)
    const where = { type: "PO", po_number };
    if (fiscalYear) where.fiscalYear = fiscalYear;

    const matches = await prisma.auditResult.findMany({
      where,
      include: RESULT_INCLUDE,
      orderBy: { po_line_item: "asc" },
    });

    if (matches.length === 0)
      return res.status(404).json({ message: "PO audit result not found" });
    if (matches.length === 1)
      return res.status(200).json(withExceptionPoints(matches[0]));

    // Multiple Matches found - Return array for Frontend Popup Modal
    return res.status(200).json({
      multipleMatches: true,
      total: matches.length,
      results: matches.map((r) => ({
        id: r.id,
        po_number: r.po_number,
        po_line_item: lineItemOf(r),
        po_material_number: r.po_material_number,
        material_code: r.material_code,
        material_disc: r.material_disc,
        plant: r.plant,
        plantName: getPlantName(r.plant),
        vendorName: r.nameOfVendor || getVendorName(r.vendor_code),
        poTypeName: getPoTypeName(r.po_type),
        purchaseGroupName: getPurchaseGroupName(r.purchase_group),
        net_value: r.net_value,
        fiscalYear: r.fiscalYear,
      })),
    });
  } catch (error) {
    console.error("Error in get_po_audit_result:", error);
    return res.status(500).json({ message: "Failed to fetch PO audit result" });
  }
};

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

    const lines = rows.map(withExceptionPoints);
    return res.status(200).json({ poNumber, total: lines.length, lines });
  } catch (error) {
    console.error("Error in get_po_lines:", error);
    return res.status(500).json({ message: "Failed to fetch PO lines" });
  }
};
