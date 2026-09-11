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
import {
  ensurePointDefinitionsLoaded,
  getPointDefinition,
} from "../utility/point-definitions.js";
import {
  SYSTEM_RESULT_OPTIONS,
  systemResultLabel,
  findSystemPoint,
} from "../utility/system-result.js";

const SUBMITTER_SELECT = {
  id: true,
  username: true,
  firstName: true,
  lastName: true,
};

/**
 * ============================================================================
 * LINE-LEVEL (PoRemark) — unchanged behavior
 * ============================================================================
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

function buildLineReportRow(remark) {
  const ar = remark.auditResult || {};
  const vendor = getVendorInfo(ar.vendor_code);
  const point = findSystemPoint(ar.results, remark.pointNo);
  const pointDef = getPointDefinition(remark.pointNo);

  return {
    level: "line",
    poNumber: remark.po_number,
    lineItem: remark.po_line_item || ar.po_line_item || "",
    pointNo: remark.pointNo,
    pointTitle: pointDef?.title || "",

    buyerRemark: remark.remark,
    buyerResult: remark.buyerResult || "",
    resultAltered: remark.isSystemResultWrong
      ? "Yes — system result flagged wrong"
      : "No — informative only",

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
    issueStatus: ar.remarksLocked ? "Closed" : "Open",
  };
}

async function fetchLineRemarksAndRows(
  req,
  { paginate, pageKey = "page", pageSizeKey = "pageSize" },
) {
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

  if (hasSystemResultFilter) {
    const all = await prisma.poRemark.findMany({ ...queryArgs, take: 20000 });
    const allRows = all
      .map(buildLineReportRow)
      .filter((row) => row.systemResult === body.systemResult);

    if (!paginate) return { rows: allRows, total: allRows.length };

    const page = body[pageKey] ?? 1;
    const pageSize = body[pageSizeKey] ?? 25;
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
    const page = body[pageKey] ?? 1;
    const pageSize = body[pageSizeKey] ?? 25;
    const take = Math.min(Number(pageSize) || 25, 500);
    const skip = (Math.max(Number(page) || 1, 1) - 1) * take;
    const [remarks, total] = await Promise.all([
      prisma.poRemark.findMany({ ...queryArgs, take, skip }),
      prisma.poRemark.count({ where }),
    ]);
    return {
      rows: remarks.map(buildLineReportRow),
      total,
      page: Number(page),
      pageSize: take,
    };
  }

  const remarks = await prisma.poRemark.findMany({ ...queryArgs, take: 20000 });
  return { rows: remarks.map(buildLineReportRow), total: remarks.length };
}

/**
 * ============================================================================
 * HEADER-LEVEL (PoHeaderRemark) — NEW
 *
 * Same visibility + filter contract as line-level, but keyed by po_number
 * directly (no line item, no AuditResult). Scoped through the poHeaderResult
 * relation instead of auditResult. There is no "plant" on PoHeaderResult, so
 * a plant filter is a no-op here (header checks aren't plant-specific).
 * ============================================================================
 */
function buildScopedHeaderRemarkWhere(req, body = {}) {
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

  const headerResultAnd = [];
  if (body.vendorCode) headerResultAnd.push({ vendor_code: body.vendorCode });
  if (body.purchaseGroup)
    headerResultAnd.push({ purchase_group: body.purchaseGroup });
  if (body.poType) headerResultAnd.push({ po_type: body.poType });
  // NOTE: no plant filter here — PoHeaderResult has no plant field.
  if (headerResultAnd.length) {
    and.push({ poHeaderResult: { AND: headerResultAnd } });
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

function buildHeaderReportRow(remark) {
  const hr = remark.poHeaderResult || {};
  const vendor = getVendorInfo(hr.vendor_code);
  const point = findSystemPoint(hr.results, remark.pointNo);
  const pointDef = getPointDefinition(remark.pointNo);

  return {
    level: "header",
    poNumber: remark.po_number,
    lineItem: "(Header)",
    pointNo: remark.pointNo,
    pointTitle: pointDef?.title || "",

    buyerRemark: remark.remark,
    buyerResult: remark.buyerResult || "",
    resultAltered: remark.isSystemResultWrong
      ? "Yes — system result flagged wrong"
      : "No — informative only",

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

    vendorCode: hr.vendor_code || "",
    vendorName: vendor?.name || getVendorName(hr.vendor_code),
    vendorGstin: vendor?.gstin || "",
    plant: "",
    plantName: "",
    purchaseGroup: hr.purchase_group || "",
    purchaseGroupName: getPurchaseGroupName(hr.purchase_group),
    poType: hr.po_type || "",
    poTypeName: getPoTypeName(hr.po_type),
    paymentTerm: "",
    paymentTermDescription: "",
    materialCode: "",
    materialDesc: "",
    netValue: "",
    poStatus: "",
    remarksLocked: !!hr.remarksLocked,
    issueStatus: hr.remarksLocked ? "Closed" : "Open",
  };
}

async function fetchHeaderRemarksAndRows(
  req,
  { paginate, pageKey = "headerPage", pageSizeKey = "headerPageSize" },
) {
  const body = req.body || {};
  const where = buildScopedHeaderRemarkWhere(req, body);
  const hasSystemResultFilter = Boolean(body.systemResult);

  const orderBy =
    body.sort === "po"
      ? [{ po_number: "asc" }, { pointNo: "asc" }]
      : [{ submittedAt: "desc" }];

  const queryArgs = {
    where,
    include: { submitter: { select: SUBMITTER_SELECT }, poHeaderResult: true },
    orderBy,
  };

  if (hasSystemResultFilter) {
    const all = await prisma.poHeaderRemark.findMany({
      ...queryArgs,
      take: 20000,
    });
    const allRows = all
      .map(buildHeaderReportRow)
      .filter((row) => row.systemResult === body.systemResult);

    if (!paginate) return { rows: allRows, total: allRows.length };

    const page = body[pageKey] ?? 1;
    const pageSize = body[pageSizeKey] ?? 25;
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
    const page = body[pageKey] ?? 1;
    const pageSize = body[pageSizeKey] ?? 25;
    const take = Math.min(Number(pageSize) || 25, 500);
    const skip = (Math.max(Number(page) || 1, 1) - 1) * take;
    const [remarks, total] = await Promise.all([
      prisma.poHeaderRemark.findMany({ ...queryArgs, take, skip }),
      prisma.poHeaderRemark.count({ where }),
    ]);
    return {
      rows: remarks.map(buildHeaderReportRow),
      total,
      page: Number(page),
      pageSize: take,
    };
  }

  const remarks = await prisma.poHeaderRemark.findMany({
    ...queryArgs,
    take: 20000,
  });
  return { rows: remarks.map(buildHeaderReportRow), total: remarks.length };
}

/**
 * ============================================================================
 * Combined endpoint — returns BOTH sections. Each section has its own
 * page/pageSize so the two tables can paginate independently:
 *   body.page / body.pageSize             -> line-level section
 *   body.headerPage / body.headerPageSize -> header-level section
 * ============================================================================
 */
export const getPoRemarksReport = async (req, res) => {
  try {
    await ensureSeverityLoaded();
    await ensurePointDefinitionsLoaded();

    const [line, header] = await Promise.all([
      fetchLineRemarksAndRows(req, { paginate: true }),
      fetchHeaderRemarksAndRows(req, { paginate: true }),
    ]);

    return res.status(200).json({ line, header });
  } catch (error) {
    if (error.status)
      return res.status(error.status).json({ message: error.message });
    console.error("Error in getPoRemarksReport:", error);
    return res.status(500).json({ message: "Failed to fetch remarks report" });
  }
};

export const getPoRemarksReportFilters = async (req, res) => {
  try {
    await ensurePointDefinitionsLoaded();
    const user = req.user || {};
    if (!(user.isAdmin || user.isProcurementManager || user.isBuyer)) {
      return res.status(403).json({ message: "Not authorized" });
    }

    const isAdminOrPM = user.isAdmin || user.isProcurementManager;
    const lineScopeWhere = isAdminOrPM
      ? {}
      : { submittedBy: user.id || user.userId };
    const headerScopeWhere = isAdminOrPM
      ? {}
      : { submittedBy: user.id || user.userId };

    const [
      distinctLinePoints,
      distinctHeaderPoints,
      lineRemarksWithVendor,
      headerRemarksWithVendor,
      lineSubmitterRows,
      headerSubmitterRows,
    ] = await Promise.all([
      prisma.poRemark.findMany({
        where: lineScopeWhere,
        distinct: ["pointNo"],
        select: { pointNo: true },
        orderBy: { pointNo: "asc" },
      }),
      prisma.poHeaderRemark.findMany({
        where: headerScopeWhere,
        distinct: ["pointNo"],
        select: { pointNo: true },
        orderBy: { pointNo: "asc" },
      }),
      prisma.poRemark.findMany({
        where: lineScopeWhere,
        select: {
          auditResult: { select: { vendor_code: true, nameOfVendor: true } },
        },
      }),
      prisma.poHeaderRemark.findMany({
        where: headerScopeWhere,
        select: { poHeaderResult: { select: { vendor_code: true } } },
      }),
      isAdminOrPM
        ? prisma.poRemark.findMany({
            distinct: ["submittedBy"],
            select: { submitter: { select: SUBMITTER_SELECT } },
          })
        : Promise.resolve([]),
      isAdminOrPM
        ? prisma.poHeaderRemark.findMany({
            distinct: ["submittedBy"],
            select: { submitter: { select: SUBMITTER_SELECT } },
          })
        : Promise.resolve([]),
    ]);

    const toPointOption = (p) => {
      const def = getPointDefinition(p.pointNo);
      return {
        code: String(p.pointNo),
        label: def.title ? `#${p.pointNo} — ${def.title}` : `#${p.pointNo}`,
      };
    };
    const points = distinctLinePoints.map(toPointOption);
    const headerPoints = distinctHeaderPoints.map(toPointOption);

    const vendorMap = new Map();
    for (const r of lineRemarksWithVendor) {
      const code = r.auditResult?.vendor_code;
      if (!code || vendorMap.has(code)) continue;
      const name = r.auditResult?.nameOfVendor || getVendorName(code);
      vendorMap.set(code, { code, label: name ? `${code} — ${name}` : code });
    }
    for (const r of headerRemarksWithVendor) {
      const code = r.poHeaderResult?.vendor_code;
      if (!code || vendorMap.has(code)) continue;
      const name = getVendorName(code);
      vendorMap.set(code, { code, label: name ? `${code} — ${name}` : code });
    }
    const vendors = [...vendorMap.values()].sort((a, b) =>
      a.code.localeCompare(b.code),
    );

    const submitterMap = new Map();
    for (const r of [...lineSubmitterRows, ...headerSubmitterRows]) {
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
      headerPoints,
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
  ["Buyer's Result", "buyerResult"],
  ["Result Altered?", "resultAltered"],
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
  ["Issue Status", "issueStatus"],
];

function rowsToSheetData(columns, rows) {
  return [
    columns.map(([header]) => header),
    ...rows.map((row) =>
      columns.map(([, key]) => {
        const v = row[key];
        if (v instanceof Date) return v.toISOString();
        if (v === null || v === undefined) return "";
        return v;
      }),
    ),
  ];
}

function addSheet(workbook, columns, rows, sheetName) {
  const worksheet = XLSX.utils.aoa_to_sheet(rowsToSheetData(columns, rows));
  worksheet["!cols"] = columns.map(([header]) => ({
    wch: Math.max(12, header.length + 2),
  }));
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
}

export const downloadPoRemarksReport = async (req, res) => {
  try {
    await ensurePointDefinitionsLoaded();
    const [line, header] = await Promise.all([
      fetchLineRemarksAndRows(req, { paginate: false }),
      fetchHeaderRemarksAndRows(req, { paginate: false }),
    ]);

    const workbook = XLSX.utils.book_new();
    addSheet(workbook, REPORT_COLUMNS, line.rows, "Line-Level Remarks");
    addSheet(workbook, REPORT_COLUMNS, header.rows, "Header-Level Remarks");
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

const ISSUE_TRACKER_COLUMNS = [
  ["PO Number", "poNumber"],
  ["Line Item", "lineItem"],
  ["Point No", "pointNo"],
  ["Point Title", "pointTitle"],
  ["Issue Status", "issueStatus"],
  ["Buyer's Remark", "buyerRemark"],
  ["System Result", "systemResult"],
  ["Buyer's Result", "buyerResult"],
  ["Result Altered?", "resultAltered"],
  ["Submitted By", "submittedByName"],
  ["Submitted At", "submittedAt"],
  ["Vendor Name", "vendorName"],
  ["Purchase Group Name", "purchaseGroupName"],
  ["PO Type Name", "poTypeName"],
];

export const downloadIssueTrackerReport = async (req, res) => {
  try {
    await ensurePointDefinitionsLoaded();
    const [line, header] = await Promise.all([
      fetchLineRemarksAndRows(req, { paginate: false }),
      fetchHeaderRemarksAndRows(req, { paginate: false }),
    ]);

    const workbook = XLSX.utils.book_new();
    addSheet(workbook, ISSUE_TRACKER_COLUMNS, line.rows, "Line-Level Issues");
    addSheet(
      workbook,
      ISSUE_TRACKER_COLUMNS,
      header.rows,
      "Header-Level Issues",
    );
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

    const filename = `issue-tracker-${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.status(200).send(buffer);
  } catch (error) {
    if (error.status)
      return res.status(error.status).json({ message: error.message });
    console.error("Error in downloadIssueTrackerReport:", error);
    return res
      .status(500)
      .json({ message: "Failed to generate issue tracker" });
  }
};
