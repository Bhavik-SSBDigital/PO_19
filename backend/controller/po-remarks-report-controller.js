import XLSX from "xlsx";
import { prisma } from "../lib/prisma.js";
import { severityOf, ensureSeverityLoaded } from "../utility/severity.js";
import {
  getVendorInfo,
  getVendorName,
  getPlantName,
  getPurchaseGroupName,
  getPaymentTermDescription,
  getPoTypeName,
  getPurchaseGroupsList,
  getPoTypesList,
  getPlantsList,
} from "../utility/master-data.js";
import { POINT_DEFINITIONS_BY_NO } from "../utility/point-reference.js";

const SUBMITTER_SELECT = {
  id: true,
  username: true,
  firstName: true,
  lastName: true,
};

const SYSTEM_RESULT_OPTIONS = [
  "Verified",
  "Not Verified",
  "Not Applicable",
  "Manual Review Required",
];

/**
 * Buyer-entered remarks report.
 *
 * VISIBILITY RULE:
 *   - Admin / Procurement Manager: see every remark, from every buyer.
 *   - Buyer: sees ONLY remarks THEY personally submitted (submittedBy ===
 *     their own user id).
 *
 * FILTERS (all optional, all combinable):
 *   poNumber        - contains match
 *   pointNo         - exact match (single value)
 *   search          - free text over po_number + remark text
 *   dateFrom/dateTo - submittedAt range
 *   vendorCode      - exact match, from AuditResult
 *   plant           - exact match, from AuditResult
 *   purchaseGroup   - exact match, from AuditResult
 *   poType          - exact match, from AuditResult
 *   systemResult    - computed from the matching point inside
 *                      AuditResult.results, applied as a POST-fetch filter
 *   submittedBy     - admin/PM only: narrow to one buyer's remarks
 */
function buildScopedRemarkWhere(req, body = {}) {
  const user = req.user || {};
  const and = [];

  if (body.poNumber) {
    and.push({ po_number: { contains: body.poNumber, mode: "insensitive" } });
  }
  if (
    body.pointNo !== undefined &&
    body.pointNo !== null &&
    body.pointNo !== ""
  ) {
    and.push({ pointNo: Number(body.pointNo) });
  }
  if (body.search) {
    and.push({
      OR: [
        { po_number: { contains: body.search, mode: "insensitive" } },
        { remark: { contains: body.search, mode: "insensitive" } },
      ],
    });
  }
  if (body.dateFrom || body.dateTo) {
    const submittedAt = {};
    if (body.dateFrom) submittedAt.gte = new Date(body.dateFrom);
    if (body.dateTo) {
      const end = new Date(body.dateTo);
      end.setHours(23, 59, 59, 999);
      submittedAt.lte = end;
    }
    and.push({ submittedAt });
  }

  const auditResultAnd = [];
  if (body.vendorCode) auditResultAnd.push({ vendor_code: body.vendorCode });
  if (body.plant) auditResultAnd.push({ plant: body.plant });
  if (body.purchaseGroup)
    auditResultAnd.push({ purchase_group: body.purchaseGroup });
  if (body.poType) auditResultAnd.push({ po_type: body.poType });
  if (auditResultAnd.length) {
    and.push({ auditResult: { AND: auditResultAnd } });
  }

  if (user.isAdmin || user.isProcurementManager) {
    if (body.submittedBy) and.push({ submittedBy: body.submittedBy });
  } else if (user.isBuyer) {
    const userId = user.id || user.userId;
    and.push({ submittedBy: userId });
  } else {
    const err = new Error("Not authorized to view the remarks report");
    err.status = 403;
    throw err;
  }

  return and.length ? { AND: and } : {};
}

function systemResultLabel(point) {
  if (!point) return "Point not found on system result";
  if (point.not_applicable) return "Not Applicable";
  if (point.manual_verification) return "Manual Review Required";
  if (point.verified) return "Verified";
  return "Not Verified";
}

function findSystemPoint(auditResult, pointNo) {
  const results = auditResult?.results || [];
  return results.find((p) => String(p.pointNo) === String(pointNo)) || null;
}

function buildReportRow(remark) {
  const ar = remark.auditResult || {};
  const vendor = getVendorInfo(ar.vendor_code);
  const point = findSystemPoint(ar, remark.pointNo);
  const pointDef = POINT_DEFINITIONS_BY_NO[String(remark.pointNo)];

  return {
    poNumber: remark.po_number,
    lineItem: remark.po_line_item || ar.po_line_item || "",
    pointNo: remark.pointNo,
    pointTitle: pointDef?.title || "",

    buyerRemark: remark.remark,
    submittedById: remark.submittedBy,
    submittedByName:
      [remark.submitter?.firstName, remark.submitter?.lastName]
        .filter(Boolean)
        .join(" ") ||
      remark.submitter?.username ||
      "",
    submittedAt: remark.submittedAt,

    systemResult: systemResultLabel(point),
    systemSeverity: point ? severityOf(point.pointNo) : "",
    systemRemarks: point?.remarks?.length ? point.remarks.join("; ") : "",

    vendorCode: ar.vendor_code || "",
    vendorName:
      ar.nameOfVendor || vendor?.name || getVendorName(ar.vendor_code),
    vendorGstin: ar.GSTInOfVendor || vendor?.gstin || "",
    plant: ar.plant || "",
    plantName: getPlantName(ar.plant),
    purchaseGroup: ar.purchase_group || "",
    purchaseGroupName: getPurchaseGroupName(ar.purchase_group),
    poType: ar.po_type || "",
    poTypeName: getPoTypeName(ar.po_type),
    paymentTerm: ar.payment_term || "",
    paymentTermDescription: getPaymentTermDescription(ar.payment_term),
    materialCode: ar.material_code || "",
    materialDesc: ar.material_disc || "",
    netValue: ar.net_value || "",
    poStatus: ar.po_status || "",
    remarksLocked: !!ar.remarksLocked,
  };
}

async function fetchRemarksAndRows(req, { paginate }) {
  await ensureSeverityLoaded();
  const body = req.body || {};
  const where = buildScopedRemarkWhere(req, body);
  const hasSystemResultFilter = Boolean(body.systemResult);

  const orderBy =
    body.sort === "po"
      ? [{ po_number: "asc" }, { po_line_item: "asc" }, { pointNo: "asc" }]
      : [{ submittedAt: "desc" }];

  const queryArgs = {
    where,
    include: { submitter: { select: SUBMITTER_SELECT }, auditResult: true },
    orderBy,
  };

  // systemResult depends on JSON inside AuditResult.results, which Prisma
  // can't filter in SQL — so when it's requested we fetch everything in
  // scope, build rows, filter in JS, THEN paginate in memory. Same pattern
  // get_po_audit_results already uses for its severity filter.
  if (hasSystemResultFilter) {
    const all = await prisma.poRemark.findMany({ ...queryArgs, take: 20000 });
    const allRows = all
      .map(buildReportRow)
      .filter((row) => row.systemResult === body.systemResult);

    if (!paginate) return { rows: allRows, total: allRows.length };

    const { page = 1, pageSize = 25 } = body;
    const take = Math.min(Number(pageSize) || 25, 500);
    const skip = (Math.max(Number(page) || 1, 1) - 1) * take;
    return {
      rows: allRows.slice(skip, skip + take),
      total: allRows.length,
      page: Number(page),
      pageSize: take,
    };
  }

  if (paginate) {
    const { page = 1, pageSize = 25 } = body;
    const take = Math.min(Number(pageSize) || 25, 500);
    const skip = (Math.max(Number(page) || 1, 1) - 1) * take;
    const [remarks, total] = await Promise.all([
      prisma.poRemark.findMany({ ...queryArgs, take, skip }),
      prisma.poRemark.count({ where }),
    ]);
    return {
      rows: remarks.map(buildReportRow),
      total,
      page: Number(page),
      pageSize: take,
    };
  }

  const remarks = await prisma.poRemark.findMany({ ...queryArgs, take: 20000 });
  return { rows: remarks.map(buildReportRow), total: remarks.length };
}

export const getPoRemarksReport = async (req, res) => {
  try {
    const { rows, total, page, pageSize } = await fetchRemarksAndRows(req, {
      paginate: true,
    });
    return res.status(200).json({ total, page, pageSize, rows });
  } catch (error) {
    if (error.status)
      return res.status(error.status).json({ message: error.message });
    console.error("Error in getPoRemarksReport:", error);
    return res.status(500).json({ message: "Failed to fetch remarks report" });
  }
};

/**
 * Filter-option lists for the report's dropdowns. Everything here is
 * resolved through master-data.js so labels always match what the rest of
 * the app shows (same functions po-controller.js / po-data-controller.js
 * already use), plus two lists derived from the actual remark/audit data so
 * dropdowns never show options that would return zero results:
 *
 *   - points: every point number that has EVER been remarked on, labeled
 *     with its title from POINT_DEFINITIONS_BY_NO.
 *   - vendors: every vendor that has an audit result WITH a remark against
 *     it, labeled via master-data vendor lookup (falls back to the
 *     snapshot nameOfVendor on the audit result, same fallback chain used
 *     everywhere else in the app).
 *   - purchaseGroups / poTypes / plants: the FULL master lists (these are
 *     small, static option sets — same source as the PO Data page's
 *     filter bar, so labels are guaranteed consistent app-wide).
 *   - systemResults: static — the four possible classifications.
 *   - submitters: admin/PM only — every buyer who has ever submitted a
 *     remark. A Buyer calling this only gets themselves back.
 */
export const getPoRemarksReportFilters = async (req, res) => {
  try {
    const user = req.user || {};
    if (!(user.isAdmin || user.isProcurementManager || user.isBuyer)) {
      return res.status(403).json({ message: "Not authorized" });
    }

    const scopeWhere =
      user.isBuyer && !(user.isAdmin || user.isProcurementManager)
        ? { submittedBy: user.id || user.userId }
        : {};

    const [distinctPoints, remarksWithVendor, submitterRows] =
      await Promise.all([
        prisma.poRemark.findMany({
          where: scopeWhere,
          distinct: ["pointNo"],
          select: { pointNo: true },
          orderBy: { pointNo: "asc" },
        }),
        prisma.poRemark.findMany({
          where: scopeWhere,
          select: {
            auditResult: {
              select: { vendor_code: true, nameOfVendor: true },
            },
          },
        }),
        user.isAdmin || user.isProcurementManager
          ? prisma.poRemark.findMany({
              distinct: ["submittedBy"],
              select: { submitter: { select: SUBMITTER_SELECT } },
            })
          : Promise.resolve([]),
      ]);

    const points = distinctPoints.map((p) => ({
      code: String(p.pointNo),
      label: POINT_DEFINITIONS_BY_NO[String(p.pointNo)]?.title
        ? `#${p.pointNo} — ${POINT_DEFINITIONS_BY_NO[String(p.pointNo)].title}`
        : `#${p.pointNo}`,
    }));

    const vendorMap = new Map();
    for (const r of remarksWithVendor) {
      const code = r.auditResult?.vendor_code;
      if (!code || vendorMap.has(code)) continue;
      const name = r.auditResult?.nameOfVendor || getVendorName(code);
      vendorMap.set(code, {
        code,
        label: name ? `${code} — ${name}` : code,
      });
    }
    const vendors = [...vendorMap.values()].sort((a, b) =>
      a.code.localeCompare(b.code),
    );

    const submitterMap = new Map();
    for (const r of submitterRows) {
      const s = r.submitter;
      if (!s || submitterMap.has(s.id)) continue;
      const name =
        [s.firstName, s.lastName].filter(Boolean).join(" ") || s.username;
      submitterMap.set(s.id, { code: s.id, label: name });
    }
    const submitters = [...submitterMap.values()].sort((a, b) =>
      a.label.localeCompare(b.label),
    );

    return res.status(200).json({
      points,
      vendors,
      submitters,
      purchaseGroups: getPurchaseGroupsList().map((g) => ({
        code: g.code,
        label: g.name ? `${g.code} — ${g.name}` : g.code,
      })),
      poTypes: getPoTypesList().map((t) => ({
        code: t.code,
        label: t.name ? `${t.code} — ${t.name}` : t.code,
      })),
      plants: getPlantsList().map((p) => ({
        code: p.code,
        label: p.name ? `${p.code} — ${p.name}` : p.code,
      })),
      systemResults: SYSTEM_RESULT_OPTIONS.map((r) => ({ code: r, label: r })),
    });
  } catch (error) {
    console.error("Error in getPoRemarksReportFilters:", error);
    return res.status(500).json({ message: "Failed to fetch filter options" });
  }
};

const REPORT_COLUMNS = [
  ["PO Number", "poNumber"],
  ["Line Item", "lineItem"],
  ["Point No", "pointNo"],
  ["Point Title", "pointTitle"],
  ["Buyer's Remark", "buyerRemark"],
  ["Submitted By", "submittedByName"],
  ["Submitted At", "submittedAt"],
  ["System Result", "systemResult"],
  ["System Severity", "systemSeverity"],
  ["System Remarks", "systemRemarks"],
  ["Vendor Code", "vendorCode"],
  ["Vendor Name", "vendorName"],
  ["Vendor GSTIN", "vendorGstin"],
  ["Plant", "plant"],
  ["Plant Name", "plantName"],
  ["Purchase Group", "purchaseGroup"],
  ["Purchase Group Name", "purchaseGroupName"],
  ["PO Type", "poType"],
  ["PO Type Name", "poTypeName"],
  ["Payment Term", "paymentTerm"],
  ["Payment Term Description", "paymentTermDescription"],
  ["Material Code", "materialCode"],
  ["Material Description", "materialDesc"],
  ["Net Value", "netValue"],
  ["PO Status", "poStatus"],
  ["Remarks Locked", "remarksLocked"],
];

export const downloadPoRemarksReport = async (req, res) => {
  try {
    const { rows } = await fetchRemarksAndRows(req, { paginate: false });

    const sheetData = [
      REPORT_COLUMNS.map(([header]) => header),
      ...rows.map((row) =>
        REPORT_COLUMNS.map(([, key]) => {
          const v = row[key];
          if (v instanceof Date) return v.toISOString();
          if (v === null || v === undefined) return "";
          return v;
        }),
      ),
    ];

    const worksheet = XLSX.utils.aoa_to_sheet(sheetData);
    worksheet["!cols"] = REPORT_COLUMNS.map(([header]) => ({
      wch: Math.max(12, header.length + 2),
    }));

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Buyer Remarks Report");
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

    const filename = `buyer-remarks-report-${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.status(200).send(buffer);
  } catch (error) {
    if (error.status)
      return res.status(error.status).json({ message: error.message });
    console.error("Error in downloadPoRemarksReport:", error);
    return res
      .status(500)
      .json({ message: "Failed to generate remarks report" });
  }
};
