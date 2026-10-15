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
  getPurchaseGroupName,
  getPurchaseGroupCode,
  getPurchaseGroupsList,
  searchPurchaseGroupCodes,
  getPoTypeName,
  getPoTypesList,
  getPlantsList,
} from "../utility/master-data.js";
import { analyseRecord, pendingPointsOf } from "../utility/po-status.js";
import { getScopedModel } from "../utility/data-cache.js";
import { buildPoRows } from "../utility/po-rows.js";

const HEADER_ROW_SELECT = {
  id: true,
  po_number: true,
  source_file_ts: true,
  vendor_code: true,
  purchase_group: true,
  po_type: true,
  results: true,
  checkedPoints: true,
  auditedOn: true,
};

// Same RC-placeholder exclusion the dashboard uses (see buildWhere in
// dashboard-controller.js) - this is what keeps the two totals identical.
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
    where.po_type = {
      in: body.poType.filter((t) => !RC_PLACEHOLDER_PO_TYPES.includes(t)),
    };
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

  return where;
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

export const getPoWiseExceptions = async (req, res) => {
  try {
    await ensureSeverityLoaded();

    const body = req.body || {};
    const where = buildBaseWhere(body);
    const user = req.user || {};

    if (user.isAdmin || user.isProcurementManager || user.isSsbDigital) {
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

    // One shared, cached read (same one the dashboard uses).
    const model = await getScopedModel(where);

    // With a severity / point filter keep a PO if ANY of its lines OR its
    // header matches - but its numbers still cover ALL its lines.
    const { severity, pointNo } = body;
    let matchedPos = null;
    if (severity || pointNo) {
      matchedPos = new Set();
      for (const row of model.lineRows) {
        if (
          (row.results || []).some((p) =>
            pointMatchesAdvancedFilters(p, { severity, pointNo }),
          )
        )
          matchedPos.add(row.po_number);
      }
      for (const h of model.headerRows) {
        if (
          (h.results || []).some((p) =>
            pointMatchesAdvancedFilters(p, { severity, pointNo }),
          )
        )
          matchedPos.add(h.po_number);
      }
    }

    // `lite: true` skips the per-line detail array (used when only the PO
    // rows are needed).
    const { rows: built } = buildPoRows(model, {
      includeLineDetails: body.lite !== true,
    });

    let finalResults = matchedPos
      ? built.filter((r) => matchedPos.has(r.poNumber))
      : built;

    finalResults.sort(
      (a, b) =>
        b.totalPendingPoints - a.totalPendingPoints ||
        b.exceptionLineCount - a.exceptionLineCount,
    );

    // Post-filter logic for Vendor Search
    if (body.vendorSearch) {
      const vSearchLower = body.vendorSearch.toLowerCase();
      finalResults = finalResults.filter(
        (r) =>
          (r.vendorCode && r.vendorCode.toLowerCase().includes(vSearchLower)) ||
          (r.vendorName && r.vendorName.toLowerCase().includes(vSearchLower)),
      );
    }

    // Optional status filter (pending | in_review | reviewed | perfect)
    if (body.poStatus) {
      const wanted = Array.isArray(body.poStatus)
        ? body.poStatus
        : [body.poStatus];
      finalResults = finalResults.filter((r) => wanted.includes(r.poStatus));
    }

    // Attach Remarks if specifically requested (used by Export to CSV)
    if (body.includeRemarks) {
      const poNumbers = finalResults.map((r) => r.poNumber);

      const lineRemarks = await prisma.poRemark.findMany({
        where: { po_number: { in: poNumbers } },
        include: {
          auditResult: { select: { source_file_ts: true } },
          submitter: {
            select: { firstName: true, lastName: true, username: true },
          },
        },
      });
      const headerRemarks = await prisma.poHeaderRemark.findMany({
        where: { po_number: { in: poNumbers } },
        include: {
          submitter: {
            select: { firstName: true, lastName: true, username: true },
          },
        },
      });

      const headerRemarksMap = {};
      const lineRemarksMap = {};

      const formatName = (s) =>
        s
          ? [s.firstName, s.lastName].filter(Boolean).join(" ") || s.username
          : "Unknown";

      headerRemarks.forEach((r) => {
        const key = `${r.po_number}_${r.source_file_ts?.toISOString?.() || ""}`;
        if (!headerRemarksMap[key]) headerRemarksMap[key] = [];
        headerRemarksMap[key].push(
          `[Pt ${r.pointNo}]: ${r.remark} (by ${formatName(r.submitter)})`,
        );
      });

      lineRemarks.forEach((r) => {
        const key = `${r.po_number}_${r.po_line_item || "Unknown"}_${r.auditResult?.source_file_ts?.toISOString?.() || ""}`;
        if (!lineRemarksMap[key]) lineRemarksMap[key] = [];
        lineRemarksMap[key].push(
          `[Pt ${r.pointNo}]: ${r.remark} (by ${formatName(r.submitter)})`,
        );
      });

      finalResults = finalResults.map((r) => ({
        ...r,
        headerRemarksText: headerRemarksMap[`${r.poNumber}_${r.source_file_ts || ""}`]
          ? headerRemarksMap[`${r.poNumber}_${r.source_file_ts || ""}`].join(" | ")
          : "",
        lineItemDetails: (r.lineItemDetails || []).map((li) => {
          const key = `${r.poNumber}_${li.poLineItem || "Unknown"}_${r.source_file_ts || ""}`;
          return {
            ...li,
            lineRemarksText: lineRemarksMap[key]
              ? lineRemarksMap[key].join(" | ")
              : "",
          };
        }),
      }));
    }

    const statusCounts = { perfect: 0, reviewed: 0, in_review: 0, pending: 0 };
    finalResults.forEach((r) => {
      statusCounts[r.poStatus] += 1;
    });

    return res.status(200).json({
      total: finalResults.length,
      statusCounts,
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

    if (user.isAdmin || user.isProcurementManager || user.isSsbDigital) {
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

    // "closed" = no pending header point (same rule as everywhere else)
    const remarkRows = rows.length
      ? await prisma.poHeaderRemark.findMany({
          where: { po_number: { in: rows.map((r) => r.po_number) } },
          select: { po_number: true, source_file_ts: true, pointNo: true },
        })
      : [];
    const remarkedByPo = new Map();
    for (const r of remarkRows) {
      const key = `${r.po_number}\u0000${r.source_file_ts?.toISOString?.() || ""}`;
      if (!remarkedByPo.has(key)) remarkedByPo.set(key, new Set());
      remarkedByPo.get(key).add(Number(r.pointNo));
    }

    let results = rows.map((row) => {
      const verifiedPoints = (row.results || []).filter(
        (p) => classifyPoint(p) === "verified",
      ).length;
      const notVerifiedPoints = (row.results || []).filter(
        (p) => classifyPoint(p) === "notVerified",
      ).length;
      const denom = verifiedPoints + notVerifiedPoints;
      const vendor = getVendorInfo(row.vendor_code);
      const versionKey = `${row.po_number}\u0000${row.source_file_ts?.toISOString?.() || ""}`;
      const counts = analyseRecord(row.results, row.checkedPoints, [
        ...(remarkedByPo.get(versionKey) || []),
      ]);

      return {
        poNumber: row.po_number,
        source_file_ts: row.source_file_ts?.toISOString?.() || null,
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
        pendingPoints: pendingPointsOf(counts),
        compliancePct:
          denom > 0
            ? Number(((verifiedPoints / denom) * 100).toFixed(1))
            : null,
        closed: pendingPointsOf(counts) === 0,
        closedBy: null,
        closedAt: null,
        auditedOn: row.auditedOn,
      };
    });

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
  if (!(user.isAdmin || user.isProcurementManager || user.isSsbDigital)) {
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
