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
  getVendorInfo,
  getPlantName,
  getPurchaseGroupName,
  getPaymentTermDescription,
  getPoTypeName,
} from "../utility/master-data.js";
import {
  ensurePointDefinitionsLoaded,
  getPointDefinition,
} from "../utility/point-definitions.js";
import { getHeaderForPo, getHeadersForPos } from "../utility/header-results.js";
import { getPoHeaderSummary } from "./po-header-controller.js";

const REMARK_SUBMITTER_SELECT = {
  id: true,
  username: true,
  firstName: true,
  lastName: true,
};

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
  GSTInOfVendor: true,
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

// ---------------------------------------------------------------------------
// Buyer-remark enrichment
// ---------------------------------------------------------------------------
// Visibility rule: Admin / Procurement Manager see every remark on a line
// item. A Buyer sees ONLY the remarks THEY personally submitted. Anyone
// else sees nothing. This is intentionally stricter than "same purchasing
// group" — a remark is private to its author until a manager looks at it.
function remarkVisibleTo(user, remark) {
  if (!user) return false;
  if (user.isAdmin || user.isProcurementManager) return true;
  if (user.isBuyer) {
    const userId = user.id || user.userId;
    return userId != null && String(remark.submittedBy) === String(userId);
  }
  return false;
}

function formatRemark(remark, user) {
  const userId = user?.id || user?.userId;
  return {
    id: remark.id,
    pointNo: remark.pointNo,
    remark: remark.remark,
    submittedBy: remark.submittedBy,
    submittedByName:
      [remark.submitter?.firstName, remark.submitter?.lastName]
        .filter(Boolean)
        .join(" ") ||
      remark.submitter?.username ||
      "",
    submittedAt: remark.submittedAt,
    isMine: userId != null && String(remark.submittedBy) === String(userId),
  };
}

// Fetches every PoRemark for a single AuditResult id and groups them by
// pointNo, already filtered down to what `user` is allowed to see.
async function getRemarksMapForAuditResult(auditResultId, user) {
  const remarks = await prisma.poRemark.findMany({
    where: { auditResultId },
    include: { submitter: { select: REMARK_SUBMITTER_SELECT } },
    orderBy: { submittedAt: "desc" },
  });

  const map = new Map();
  for (const r of remarks) {
    if (!remarkVisibleTo(user, r)) continue;
    const key = String(r.pointNo);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(formatRemark(r, user));
  }
  return map;
}

// Batch variant — one query for every row's remarks instead of N queries.
// Returns Map<auditResultId, Map<pointNo, remark[]>>.
async function getRemarksMapForAuditResults(auditResultIds, user) {
  if (!auditResultIds.length) return new Map();
  const remarks = await prisma.poRemark.findMany({
    where: { auditResultId: { in: auditResultIds } },
    include: { submitter: { select: REMARK_SUBMITTER_SELECT } },
    orderBy: { submittedAt: "desc" },
  });

  const byAuditResult = new Map();
  for (const r of remarks) {
    if (!remarkVisibleTo(user, r)) continue;
    if (!byAuditResult.has(r.auditResultId)) {
      byAuditResult.set(r.auditResultId, new Map());
    }
    const pointMap = byAuditResult.get(r.auditResultId);
    const key = String(r.pointNo);
    if (!pointMap.has(key)) pointMap.set(key, []);
    pointMap.get(key).push(formatRemark(r, user));
  }
  return byAuditResult;
}

// RENUMBERED: results in AuditResult.results are the 10 LINE-LEVEL points
// (new numbers 10-19). Now also attaches `buyerRemarks` per point, scoped
// to what the requesting user is allowed to see. getPointDefinition()
// always returns a usable fallback object even for an unseeded pointNo.
function withPointReference(results, remarksByPoint = new Map()) {
  return (results || []).map((p) => {
    const def = getPointDefinition(p.pointNo);
    return {
      ...p,
      scope: "line",
      severity: severityOf(p.pointNo),
      title: def.title,
      summary: def.summary,
      logic: def.logic,
      buyerRemarks: remarksByPoint.get(String(p.pointNo)) || [],
    };
  });
}

/**
 * `results` holds ONLY the 10 LINE-LEVEL points (new numbers 10-19) -
 * this is a LINE-ITEM view, and shows LINE-ITEM data only, per design.
 * The PO's header-level points (new numbers 1-9) are attached separately
 * as `header` - a compact status object, fetched ONCE for this PO number
 * regardless of which line item is being viewed.
 */
const withExceptionPoints = async (row, user) => {
  const vendor = getVendorInfo(row.vendor_code);
  const header = await getHeaderForPo(row.po_number);
  const remarksByPoint = await getRemarksMapForAuditResult(row.id, user);

  return {
    ...row,
    lineItemKey:
      row.po_material_number || `${row.po_number}-${lineItemOf(row) ?? row.id}`,
    lineItem: lineItemOf(row),
    results: withPointReference(row.results, remarksByPoint),
    header,
    exceptionPoints: exceptionPointsOf(row).map((ep) => {
      const def = getPointDefinition(ep.pointNo);
      return { ...ep, title: def.title, logic: def.logic };
    }),
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
// once, so header status AND buyer remarks are each fetched in a single
// query instead of once per row.
async function withExceptionPointsBatch(rows, user) {
  const headerMap = await getHeadersForPos(rows.map((r) => r.po_number));
  const remarksMap = await getRemarksMapForAuditResults(
    rows.map((r) => r.id),
    user,
  );

  return rows.map((row) => {
    const vendor = getVendorInfo(row.vendor_code);
    const remarksByPoint = remarksMap.get(row.id) || new Map();
    return {
      ...row,
      lineItemKey:
        row.po_material_number ||
        `${row.po_number}-${lineItemOf(row) ?? row.id}`,
      lineItem: lineItemOf(row),
      results: withPointReference(row.results, remarksByPoint),
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
      exceptionPoints: exceptionPointsOf(row).map((ep) => {
        const def = getPointDefinition(ep.pointNo);
        return { ...ep, title: def.title, logic: def.logic };
      }),
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
    await Promise.all([ensureSeverityLoaded(), ensurePointDefinitionsLoaded()]);
    const user = req.user || {};
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
      const rows = await withExceptionPointsBatch(pageRows, user);
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

    const rows = await withExceptionPointsBatch(pageRows, user);
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
 *   Returns line-item data - `results` (10 line-level points, each now
 *   carrying its own `buyerRemarks`), `exceptionPoints`, plus a compact
 *   `header` status object for this PO.
 *
 * PO-ONLY lookup (po_number given, no po_line_item, no id/material
 * number): delegates entirely to getPoHeaderSummary.
 */
export const get_po_audit_result = async (req, res) => {
  try {
    await Promise.all([ensureSeverityLoaded(), ensurePointDefinitionsLoaded()]);
    const user = req.user || {};
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

      const enriched = await withExceptionPoints(result, user);
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
 * Every line item of a PO, LINE-LEVEL data only. `header` is returned
 * ONCE at the top level of the response, not duplicated per line.
 */
export const get_po_lines = async (req, res) => {
  try {
    await Promise.all([ensureSeverityLoaded(), ensurePointDefinitionsLoaded()]);
    const user = req.user || {};
    const { poNumber } = req.body || {};
    if (!poNumber)
      return res.status(400).json({ message: "poNumber is required" });

    const rows = await prisma.auditResult.findMany({
      where: { type: "PO", po_number: poNumber },
      select: ROW_SELECT,
      orderBy: { po_line_item: "asc" },
    });

    const header = await getHeaderForPo(poNumber);
    const remarksMap = await getRemarksMapForAuditResults(
      rows.map((r) => r.id),
      user,
    );

    const lines = rows.map((row) => {
      const vendor = getVendorInfo(row.vendor_code);
      const remarksByPoint = remarksMap.get(row.id) || new Map();
      return {
        ...row,
        lineItemKey: uniqueKeyOf(row),
        lineItem: lineItemOf(row),
        results: withPointReference(row.results, remarksByPoint),
        exceptionPoints: exceptionPointsOf(row).map((ep) => {
          const def = getPointDefinition(ep.pointNo);
          return { ...ep, title: def.title, logic: def.logic };
        }),
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
