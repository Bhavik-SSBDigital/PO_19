import { prisma } from "../lib/prisma.js";
import {
  SEVERITY_LEVELS,
  severityOf,
  classifyPoint,
  exceptionPointsOf,
  pointLabel,
} from "../utility/severity.js";

const PURCHASE_GROUPS = [
  "P02",
  "P09",
  "P13",
  "P14",
  "P15",
  "P16",
  "P43",
  "P46",
  "P55",
  "P60",
  "P61",
  "P62",
  "P64",
];

function buildWhere(body = {}) {
  const where = { type: "PO" };

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
  if (Array.isArray(body.purchaseGroup) && body.purchaseGroup.length) {
    where.purchase_group = { in: body.purchaseGroup };
  }
  if (Array.isArray(body.poType) && body.poType.length) {
    where.po_type = { in: body.poType };
  }
  if (body.plant) where.plant = body.plant;
  if (body.vendorCode) where.vendor_code = body.vendorCode;
  if (body.materialCode) where.material_code = body.materialCode;

  return where;
}

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

const uniqueKeyOf = (row) =>
  row.po_material_number || `${row.po_number}-${lineItemOf(row) ?? row.id}`;

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
  results: true,
};

export const getExecutiveSummary = async (req, res) => {
  try {
    const where = buildWhere(req.body || {});
    const rows = await prisma.auditResult.findMany({
      where,
      select: ROW_SELECT,
    });

    const poNumbers = new Set();
    const prNumbers = new Set();
    let verifiedCount = 0;
    let notVerifiedCount = 0;
    let naCount = 0;
    let manualCount = 0;
    let highRiskExceptions = 0;
    let exceptionValueExposure = 0;

    const controlWise = {};
    for (let i = 1; i <= 19; i++) {
      controlWise[String(i)] = {
        verified: 0,
        notVerified: 0,
        manual: 0,
        na: 0,
      };
    }
    const bySeverity = Object.fromEntries(SEVERITY_LEVELS.map((s) => [s, 0]));
    const byPurchaseGroup = {};
    const byPo = {};
    const byPlant = {};
    const byVendor = {};
    const byPoType = {};
    const byPoNumber = {};
    const monthlyExceptions = {};

    const holdPoNumbers = new Set();
    const holdAgeingBuckets = {
      "Not yet due": { count: 0, pos: new Set() },
      Overdue: { count: 0, pos: new Set() },
    };
    const today = new Date();

    for (const row of rows) {
      poNumbers.add(row.po_number);
      if (row.purchase_req) prNumbers.add(row.purchase_req);

      if (row.po_status === "H") {
        holdPoNumbers.add(row.po_number);
        if (row.hold_due_date) {
          const bucket =
            new Date(row.hold_due_date) < today ? "Overdue" : "Not yet due";
          holdAgeingBuckets[bucket].count += 1;
          holdAgeingBuckets[bucket].pos.add(row.po_number);
        }
      }

      let lineHasException = false;
      for (const point of row.results || []) {
        const pointNo = String(point.pointNo);
        controlWise[pointNo] = controlWise[pointNo] || {
          verified: 0,
          notVerified: 0,
          manual: 0,
          na: 0,
        };
        byPurchaseGroup[row.purchase_group || "Unassigned"] = byPurchaseGroup[
          row.purchase_group || "Unassigned"
        ] || { verified: 0, notVerified: 0 };
        byPoType[row.po_type || "Unknown"] = byPoType[
          row.po_type || "Unknown"
        ] || { verified: 0, notVerified: 0 };

        const status = classifyPoint(point);
        if (status === "na") {
          naCount++;
          controlWise[pointNo].na++;
        } else if (status === "manual") {
          manualCount++;
          controlWise[pointNo].manual++;
        } else if (status === "verified") {
          verifiedCount++;
          controlWise[pointNo].verified++;
          byPurchaseGroup[row.purchase_group || "Unassigned"].verified++;
          byPoType[row.po_type || "Unknown"].verified++;
        } else {
          notVerifiedCount++;
          lineHasException = true;
          controlWise[pointNo].notVerified++;
          byPurchaseGroup[row.purchase_group || "Unassigned"].notVerified++;
          byPoType[row.po_type || "Unknown"].notVerified++;

          const poKey = row.po_number || "Unassigned";

          byPoNumber[poKey] = byPoNumber[poKey] || {
            notVerifiedPoints: 0,
            lines: new Set(),
            valueExposure: 0,
          };

          byPoNumber[poKey].notVerifiedPoints++;
          byPoNumber[poKey].lines.add(uniqueKeyOf(row));
          byPoNumber[poKey].valueExposure += parseNum(row.net_value);

          const severity = severityOf(pointNo);
          bySeverity[severity] = (bySeverity[severity] || 0) + 1;
          if (severity === "Critical" || severity === "High")
            highRiskExceptions++;
        }
      }

      if (lineHasException) {
        exceptionValueExposure += parseNum(row.net_value);

        const poKey = row.po_number || "Unassigned";
        byPo[poKey] = byPo[poKey] || {
          count: 0,
          pos: new Set(),
          lineItems: new Set(),
          valueExposure: 0,
          vendorCode: row.vendor_code || null,
          vendorName: row.nameOfVendor || null,
          poType: row.po_type || null,
          plant: row.plant || null,
        };
        byPo[poKey].count += 1;
        byPo[poKey].pos.add(row.po_number);
        byPo[poKey].lineItems.add(uniqueKeyOf(row));
        byPo[poKey].valueExposure += parseNum(row.net_value);
        if (!byPo[poKey].vendorName && row.nameOfVendor)
          byPo[poKey].vendorName = row.nameOfVendor;
        if (!byPo[poKey].vendorCode && row.vendor_code)
          byPo[poKey].vendorCode = row.vendor_code;
        if (!byPo[poKey].poType && row.po_type)
          byPo[poKey].poType = row.po_type;
        if (!byPo[poKey].plant && row.plant) byPo[poKey].plant = row.plant;

        const plantKey = row.plant || "Unassigned";
        byPlant[plantKey] = byPlant[plantKey] || {
          count: 0,
          pos: new Set(),
          valueExposure: 0,
        };
        byPlant[plantKey].count += 1;
        byPlant[plantKey].pos.add(row.po_number);
        byPlant[plantKey].valueExposure += parseNum(row.net_value);

        const vendorKey = row.vendor_code || "Unassigned";
        byVendor[vendorKey] = byVendor[vendorKey] || {
          count: 0,
          pos: new Set(),
          valueExposure: 0,
          name: row.nameOfVendor,
        };
        byVendor[vendorKey].count += 1;
        byVendor[vendorKey].pos.add(row.po_number);
        byVendor[vendorKey].valueExposure += parseNum(row.net_value);
        if (!byVendor[vendorKey].name && row.nameOfVendor)
          byVendor[vendorKey].name = row.nameOfVendor;

        if (row.po_created_date) {
          const monthKey = new Date(row.po_created_date)
            .toISOString()
            .slice(0, 7);
          monthlyExceptions[monthKey] = monthlyExceptions[monthKey] || {
            count: 0,
            valueExposure: 0,
          };
          monthlyExceptions[monthKey].count += 1;
          monthlyExceptions[monthKey].valueExposure += parseNum(row.net_value);
        }
      }
    }

    const complianceScore =
      verifiedCount + notVerifiedCount > 0
        ? Number(
            (
              (verifiedCount / (verifiedCount + notVerifiedCount)) *
              100
            ).toFixed(1),
          )
        : null;

    const topN = (obj, n = 10) =>
      Object.entries(obj)
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, n)
        .map(([key, v]) => ({
          key,
          value: v.count,
          poCount: v.pos.size,
          valueExposure: Number(v.valueExposure.toFixed(2)),
          ...(v.name ? { name: v.name } : {}),
        }));

    const poWiseExceptionsAll = Object.entries(byPo)
      .sort((a, b) => b[1].count - a[1].count)
      .map(([poNumber, v]) => ({
        poNumber,
        vendorCode: v.vendorCode,
        vendorName: v.vendorName,
        poType: v.poType,
        plant: v.plant,
        exceptionLineCount: v.count,
        distinctLineItems: v.lineItems.size,
        valueExposure: Number(v.valueExposure.toFixed(2)),
      }));

    res.status(200).json({
      filtersApplied: req.body || {},
      validPurchaseGroups: PURCHASE_GROUPS,
      generatedAt: new Date().toISOString(),
      kpis: {
        totalPOCount: poNumbers.size,
        totalPOLineItems: rows.length,
        totalPRCount: prNumbers.size,
        verifiedCount,
        notVerifiedCount,
        notApplicableCount: naCount,
        manualReviewCount: manualCount,
        holdPOCount: holdPoNumbers.size,
        overallComplianceScore: complianceScore,
        highRiskExceptions,
        exceptionValueExposure: Number(exceptionValueExposure.toFixed(2)),
      },
      charts: {
        controlWiseCompliance: Object.entries(controlWise)
          .map(([pointNo, v]) => ({
            pointNo,
            severity: severityOf(pointNo),
            label: pointLabel(pointNo),
            compliancePct:
              v.verified + v.notVerified > 0
                ? Number(
                    ((v.verified / (v.verified + v.notVerified)) * 100).toFixed(
                      1,
                    ),
                  )
                : 0,
            verified: v.verified,
            notVerified: v.notVerified,
          }))
          .sort((a, b) => Number(a.pointNo) - Number(b.pointNo)),
        poWiseExceptions: poWiseExceptionsAll,
        exceptionBySeverity: SEVERITY_LEVELS.map((severity) => ({
          severity,
          count: bySeverity[severity] || 0,
          pct:
            notVerifiedCount > 0
              ? Number(
                  (
                    ((bySeverity[severity] || 0) / notVerifiedCount) *
                    100
                  ).toFixed(1),
                )
              : 0,
        })),
        purchaseGroupCompliance: Object.entries(byPurchaseGroup).map(
          ([group, v]) => ({
            purchaseGroup: group,
            compliancePct:
              v.verified + v.notVerified > 0
                ? Number(
                    ((v.verified / (v.verified + v.notVerified)) * 100).toFixed(
                      1,
                    ),
                  )
                : 0,
            verified: v.verified,
            notVerified: v.notVerified,
          }),
        ),
        plantWiseExceptions: topN(byPlant),
        poNumberWiseExceptions: Object.entries(byPoNumber)
          .sort((a, b) => b[1].notVerifiedPoints - a[1].notVerifiedPoints)
          .slice(0, 15)
          .map(([key, v]) => ({
            key,
            value: v.notVerifiedPoints,
            lineCount: v.lines.size,
            valueExposure: Number(v.valueExposure.toFixed(2)),
          })),
        vendorWiseTopExceptions: topN(byVendor),
        poTypeWiseCompliance: Object.entries(byPoType).map(([poType, v]) => ({
          poType,
          verified: v.verified,
          notVerified: v.notVerified,
          compliancePct:
            v.verified + v.notVerified > 0
              ? Number(
                  ((v.verified / (v.verified + v.notVerified)) * 100).toFixed(
                    1,
                  ),
                )
              : null,
        })),
        monthlyExceptionTrend: Object.entries(monthlyExceptions)
          .sort((a, b) => (a[0] < b[0] ? -1 : 1))
          .map(([month, v]) => ({
            month,
            count: v.count,
            valueExposure: Number(v.valueExposure.toFixed(2)),
          })),
        holdPoAgeing: Object.entries(holdAgeingBuckets).map(([bucket, v]) => ({
          bucket,
          count: v.count,
          poCount: v.pos.size,
        })),
      },
    });
  } catch (error) {
    console.error("Error in getExecutiveSummary:", error);
    res.status(500).json({ message: "Failed to compute executive summary" });
  }
};

export const getFilterOptions = async (req, res) => {
  try {
    const [plants, vendors, poTypes, groups] = await Promise.all([
      prisma.auditResult.groupBy({
        by: ["plant"],
        where: { type: "PO", plant: { not: null } },
      }),
      prisma.auditResult.groupBy({
        by: ["vendor_code", "nameOfVendor"],
        where: { type: "PO", vendor_code: { not: null } },
      }),
      prisma.auditResult.groupBy({
        by: ["po_type"],
        where: { type: "PO", po_type: { not: null } },
      }),
      prisma.auditResult.groupBy({
        by: ["purchase_group"],
        where: { type: "PO", purchase_group: { not: null } },
      }),
    ]);

    const vendorMap = new Map();
    for (const v of vendors) {
      if (!vendorMap.has(v.vendor_code))
        vendorMap.set(v.vendor_code, v.nameOfVendor || "");
    }

    res.status(200).json({
      plants: plants
        .map((p) => p.plant)
        .filter(Boolean)
        .sort(),
      vendors: [...vendorMap.entries()]
        .map(([code, name]) => ({ code, name }))
        .sort((a, b) => a.code.localeCompare(b.code)),
      poTypes: poTypes
        .map((p) => p.po_type)
        .filter(Boolean)
        .sort(),
      purchaseGroups: [
        ...new Set([
          ...PURCHASE_GROUPS,
          ...groups.map((g) => g.purchase_group).filter(Boolean),
        ]),
      ].sort(),
      severities: SEVERITY_LEVELS,
    });
  } catch (error) {
    console.error("Error in getFilterOptions:", error);
    res.status(500).json({ message: "Failed to load filter options" });
  }
};

export const getExecutiveDrilldown = async (req, res) => {
  try {
    const {
      dimension,
      value,
      statusFilter,
      page = 1,
      pageSize = 25,
      ...filterBody
    } = req.body || {};
    if (!dimension)
      return res.status(400).json({ message: "dimension is required" });

    const where = buildWhere(filterBody);
    const rows = await prisma.auditResult.findMany({
      where,
      select: ROW_SELECT,
      orderBy: { po_created_date: "desc" },
    });

    const today = new Date();
    const matchesDimension = (row) => {
      switch (dimension) {
        case "plant":
          return (row.plant || "Unassigned") === value && rowHasException(row);
        case "poNumber":
          return (
            (row.po_number || "Unassigned") === value && rowHasException(row)
          );
        case "vendor":
          return (
            (row.vendor_code || "Unassigned") === value && rowHasException(row)
          );
        case "purchaseGroup":
          return (row.purchase_group || "Unassigned") === value;
        case "poType":
          return (row.po_type || "Unknown") === value;
        case "severity": {
          const wanted = String(value)
            .split(",")
            .map((s) => s.trim());
          return (row.results || []).some(
            (p) =>
              classifyPoint(p) === "notVerified" &&
              wanted.includes(severityOf(p.pointNo)),
          );
        }
        case "pointNo":
          return (row.results || []).some(
            (p) =>
              String(p.pointNo) === String(value) &&
              classifyPoint(p) === "notVerified",
          );
        case "month":
          return (
            row.po_created_date &&
            new Date(row.po_created_date).toISOString().slice(0, 7) === value &&
            rowHasException(row)
          );
        case "hold":
          return row.po_status === "H";
        case "holdBucket": {
          if (row.po_status !== "H" || !row.hold_due_date) return false;
          const overdue = new Date(row.hold_due_date) < today;
          return value === "Overdue" ? overdue : !overdue;
        }
        case "anyException":
          return rowHasException(row);
        case "verifiedAny":
          return rowHasStatus(row, "verified");
        case "na":
          return rowHasStatus(row, "na");
        case "manual":
          return rowHasStatus(row, "manual");
        case "all":
        default:
          return true;
      }
    };

    const matchesStatusFilter = (row) =>
      !statusFilter || rowHasStatus(row, statusFilter);

    const filtered = rows.filter(
      (row) => matchesDimension(row) && matchesStatusFilter(row),
    );
    const take = Math.min(Number(pageSize) || 25, 200);
    const skip = (Math.max(Number(page) || 1, 1) - 1) * take;
    const paged = filtered.slice(skip, skip + take).map((r) => ({
      ...r,
      lineItemKey: uniqueKeyOf(r),
      lineItem: lineItemOf(r),
      exceptionPoints: exceptionPointsOf(r),
    }));

    res.status(200).json({
      results: paged,
      total: filtered.length,
      page: Number(page),
      pageSize: take,
      dimension,
      value,
    });
  } catch (error) {
    console.error("Error in getExecutiveDrilldown:", error);
    res.status(500).json({ message: "Failed to compute drilldown" });
  }
};

function rowHasException(row) {
  return (row.results || []).some((p) => classifyPoint(p) === "notVerified");
}

function rowHasStatus(row, status) {
  return (row.results || []).some((p) => classifyPoint(p) === status);
}
