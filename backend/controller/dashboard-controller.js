import { prisma } from "../lib/prisma.js";
import {
  SEVERITY_LEVELS,
  severityOf,
  classifyPoint,
  exceptionPointsOf,
  pointLabel,
  ensureSeverityLoaded,
} from "../utility/severity.js";
import {
  getVendorName,
  getVendorInfo,
  getPlantName,
  getPurchaseGroupName,
  getPurchaseGroupCode,
  getPaymentTermDescription,
  getPoTypeName,
} from "../utility/master-data.js";
import { RC_PLACEHOLDER_PO_TYPES } from "../utility/rc-placeholder.js";
import {
  ensurePointDefinitionsLoaded,
  getPointDefinition,
  KPI_DEFINITIONS,
  CHART_DEFINITIONS,
} from "../utility/point-definitions.js";
import {
  HEADER_LEVEL_RULE_NOS,
  LINE_TABLE_RULE_NOS,
} from "../utility/point-scope.js";
import { getMandatoryPoints } from "../utility/not-verified-scope.js";
import { isPointCovered } from "../utility/effective-result.js";

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

function buildWhere(body = {}, user = {}) {
  const where = { type: "PO" };

  // FIX: `poNumber` was accepted by the frontend's FilterBar and sent in
  // every request body (see buildSummaryBody() in ExecutiveDashboard.jsx),
  // but this function never read it, so typing a PO number and hitting
  // Apply silently did nothing - every KPI, chart, and Remarks Impact
  // number ignored it. The FilterBar's label says "Exact match", so this
  // is an exact equality filter, not a partial/contains search.
  if (body.poNumber) where.po_number = body.poNumber;

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
  if (body.plant) where.plant = body.plant;
  if (body.vendorCode) where.vendor_code = body.vendorCode;
  if (body.materialCode) where.material_code = body.materialCode;

  const isUnrestricted =
    user.isAdmin || user.isProcurementManager || !user.isBuyer;

  if (isUnrestricted) {
    if (Array.isArray(body.purchaseGroup) && body.purchaseGroup.length) {
      where.purchase_group = { in: body.purchaseGroup };
    }
  } else {
    const ownGroup = getPurchaseGroupCode(user.username);
    where.purchase_group = ownGroup || "__no_group_assigned__";
  }

  return where;
}

function scopeOf(user = {}) {
  if (user.isAdmin || user.isProcurementManager || !user.isBuyer) return null;
  const ownGroup = getPurchaseGroupCode(user.username);
  return { restrictedToPurchaseGroup: ownGroup || user.username };
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
  payment_term: true,
  results: true,
  tax_code: true,
  GSTInOfVendor: true,
};

function newRichBucket() {
  return {
    count: 0,
    pos: new Set(),
    lineItems: new Set(),
    valueExposure: 0,
    vendorCode: null,
    vendorName: null,
    poType: null,
    plant: null,
    purchaseGroup: null,
    paymentTerm: null,
  };
}

function fillRichBucket(bucket, row) {
  bucket.count += 1;
  bucket.pos.add(row.po_number);
  if (lineItemOf(row)) bucket.lineItems.add(lineItemOf(row));
  bucket.valueExposure += parseNum(row.net_value);
  if (!bucket.vendorName && (row.nameOfVendor || row.vendor_code))
    bucket.vendorName = row.nameOfVendor || getVendorName(row.vendor_code);
  if (!bucket.vendorCode && row.vendor_code)
    bucket.vendorCode = row.vendor_code;
  if (!bucket.poType && row.po_type) bucket.poType = row.po_type;
  if (!bucket.plant && row.plant) bucket.plant = row.plant;
  if (!bucket.purchaseGroup && row.purchase_group)
    bucket.purchaseGroup = row.purchase_group;
  if (!bucket.paymentTerm && row.payment_term)
    bucket.paymentTerm = row.payment_term;
}

function richBucketToJson(key, bucket) {
  return {
    key,
    value: bucket.count,
    poCount: bucket.pos.size,
    lineItems: [...bucket.lineItems].sort(),
    distinctLineItems: bucket.lineItems.size,
    valueExposure: Number(bucket.valueExposure.toFixed(2)),
    vendorCode: bucket.vendorCode,
    vendorName: bucket.vendorName || getVendorName(bucket.vendorCode),
    poType: bucket.poType,
    poTypeName: getPoTypeName(bucket.poType),
    plant: bucket.plant,
    plantName: getPlantName(bucket.plant),
    purchaseGroup: bucket.purchaseGroup,
    purchaseGroupName: getPurchaseGroupName(bucket.purchaseGroup),
    paymentTerm: bucket.paymentTerm,
    paymentTermDescription: getPaymentTermDescription(bucket.paymentTerm),
  };
}

function compliancePctOf(v) {
  return v.verified + v.notVerified > 0
    ? Number(((v.verified / (v.verified + v.notVerified)) * 100).toFixed(1))
    : null;
}

export const getExecutiveSummary = async (req, res) => {
  try {
    await Promise.all([ensureSeverityLoaded(), ensurePointDefinitionsLoaded()]);

    const user = req.user || {};
    const where = buildWhere(req.body || {}, user);
    const scope = scopeOf(user);

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
    for (const pointNo of LINE_TABLE_RULE_NOS) {
      controlWise[String(pointNo)] = {
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

    const poCreatedMonth = {};
    const headerMonthlyExceptions = {};

    const byPlantCompliance = {};
    const byVendorCompliance = {};
    const byPoNumberCompliance = {};

    const holdPoNumbers = new Set();
    const holdAgeingBuckets = {
      "Not yet due": { count: 0, pos: new Set() },
      Overdue: { count: 0, pos: new Set() },
    };
    const today = new Date();

    for (const row of rows) {
      poNumbers.add(row.po_number);
      if (row.purchase_req) prNumbers.add(row.purchase_req);

      if (row.po_created_date && !poCreatedMonth[row.po_number]) {
        poCreatedMonth[row.po_number] = new Date(row.po_created_date)
          .toISOString()
          .slice(0, 7);
      }

      if (row.po_status === "H") {
        holdPoNumbers.add(row.po_number);
        if (row.hold_due_date) {
          const bucket =
            new Date(row.hold_due_date) < today ? "Overdue" : "Not yet due";
          holdAgeingBuckets[bucket].count += 1;
          holdAgeingBuckets[bucket].pos.add(row.po_number);
        }
      }

      const plantKey = row.plant || "Unassigned";
      const vendorKey = row.vendor_code || "Unassigned";
      const poNumKey = row.po_number || "Unassigned";
      byPlantCompliance[plantKey] = byPlantCompliance[plantKey] || {
        verified: 0,
        notVerified: 0,
      };
      byVendorCompliance[vendorKey] = byVendorCompliance[vendorKey] || {
        verified: 0,
        notVerified: 0,
      };
      byPoNumberCompliance[poNumKey] = byPoNumberCompliance[poNumKey] || {
        verified: 0,
        notVerified: 0,
      };

      let lineHasException = false;
      for (const point of row.results || []) {
        const pointNo = String(point.pointNo);
        if (HEADER_LEVEL_RULE_NOS.includes(Number(pointNo))) continue;

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
          byPlantCompliance[plantKey].verified++;
          byVendorCompliance[vendorKey].verified++;
          byPoNumberCompliance[poNumKey].verified++;
        } else {
          notVerifiedCount++;
          lineHasException = true;
          controlWise[pointNo].notVerified++;
          byPurchaseGroup[row.purchase_group || "Unassigned"].notVerified++;
          byPoType[row.po_type || "Unknown"].notVerified++;
          byPlantCompliance[plantKey].notVerified++;
          byVendorCompliance[vendorKey].notVerified++;
          byPoNumberCompliance[poNumKey].notVerified++;

          const poKey = row.po_number || "Unassigned";
          byPoNumber[poKey] = byPoNumber[poKey] || newRichBucket();
          fillRichBucket(byPoNumber[poKey], row);

          const severity = severityOf(pointNo);
          bySeverity[severity] = (bySeverity[severity] || 0) + 1;
          if (severity === "Critical" || severity === "High")
            highRiskExceptions++;
        }
      }

      if (lineHasException) {
        exceptionValueExposure += parseNum(row.net_value);

        const poKey = row.po_number || "Unassigned";

        const vendor = getVendorInfo(row.vendor_code);
        const gstin = row.GSTInOfVendor || vendor?.gstin || "";

        byPo[poKey] = byPo[poKey] || {
          count: 0,
          pos: new Set(),
          lineItems: new Set(),
          prs: new Set(),
          taxCodes: new Set(),
          gstins: new Set(),
          valueExposure: 0,
          vendorCode: row.vendor_code || null,
          vendorName: row.nameOfVendor || vendor?.name || null,
          poType: row.po_type || null,
          plant: row.plant || null,
          purchaseGroup: row.purchase_group || null,
          paymentTerm: row.payment_term || null,
        };

        byPo[poKey].count += 1;
        byPo[poKey].pos.add(row.po_number);
        const lineItem = lineItemOf(row);
        if (lineItem) {
          byPo[poKey].lineItems.add(lineItem);
        }
        if (row.purchase_req) byPo[poKey].prs.add(row.purchase_req);
        if (row.tax_code) byPo[poKey].taxCodes.add(row.tax_code);
        if (gstin) byPo[poKey].gstins.add(gstin);

        byPo[poKey].valueExposure += parseNum(row.net_value);
        if (!byPo[poKey].vendorName && (row.nameOfVendor || vendor?.name))
          byPo[poKey].vendorName = row.nameOfVendor || vendor?.name;
        if (!byPo[poKey].vendorCode && row.vendor_code)
          byPo[poKey].vendorCode = row.vendor_code;
        if (!byPo[poKey].poType && row.po_type)
          byPo[poKey].poType = row.po_type;
        if (!byPo[poKey].plant && row.plant) byPo[poKey].plant = row.plant;
        if (!byPo[poKey].purchaseGroup && row.purchase_group)
          byPo[poKey].purchaseGroup = row.purchase_group;
        if (!byPo[poKey].paymentTerm && row.payment_term)
          byPo[poKey].paymentTerm = row.payment_term;

        const plantExcKey = row.plant || "Unassigned";
        byPlant[plantExcKey] = byPlant[plantExcKey] || newRichBucket();
        fillRichBucket(byPlant[plantExcKey], row);

        const vendorExcKey = row.vendor_code || "Unassigned";
        byVendor[vendorExcKey] = byVendor[vendorExcKey] || newRichBucket();
        fillRichBucket(byVendor[vendorExcKey], row);

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

    const complianceScore = compliancePctOf({
      verified: verifiedCount,
      notVerified: notVerifiedCount,
    });

    const headerRecords = poNumbers.size
      ? await prisma.poHeaderResult.findMany({
          where: { po_number: { in: [...poNumbers] } },
        })
      : [];

    const headerControlWise = {};
    for (const pointNo of HEADER_LEVEL_RULE_NOS) {
      headerControlWise[String(pointNo)] = {
        verified: 0,
        notVerified: 0,
        manual: 0,
        na: 0,
      };
    }
    let headerVerifiedCount = 0;
    let headerNotVerifiedCount = 0;
    let headerNaCount = 0;
    let headerManualCount = 0;
    let headerClosedCount = 0;

    for (const hr of headerRecords) {
      if (hr.remarksLocked) headerClosedCount++;

      let headerHasException = false;

      for (const point of hr.results || []) {
        const pointNo = String(point.pointNo);
        if (!headerControlWise[pointNo]) continue;
        const status = classifyPoint(point);
        if (status === "na") {
          headerNaCount++;
          headerControlWise[pointNo].na++;
        } else if (status === "manual") {
          headerManualCount++;
          headerControlWise[pointNo].manual++;
        } else if (status === "verified") {
          headerVerifiedCount++;
          headerControlWise[pointNo].verified++;
        } else {
          headerNotVerifiedCount++;
          headerControlWise[pointNo].notVerified++;
          headerHasException = true;
        }
      }

      if (headerHasException) {
        const monthKey = poCreatedMonth[hr.po_number];
        if (monthKey) {
          headerMonthlyExceptions[monthKey] = headerMonthlyExceptions[
            monthKey
          ] || { count: 0 };
          headerMonthlyExceptions[monthKey].count += 1;
        }
      }
    }

    const headerControlWiseCompliance = Object.entries(headerControlWise)
      .map(([pointNo, v]) => {
        const def = getPointDefinition(pointNo);
        return {
          pointNo,
          scope: "header",
          severity: severityOf(pointNo),
          label: pointLabel(pointNo),
          title: def.title,
          summary: def.summary,
          compliancePct: compliancePctOf(v),
          verified: v.verified,
          notVerified: v.notVerified,
        };
      })
      .sort((a, b) => Number(a.pointNo) - Number(b.pointNo));

    const headerCompliancePct = compliancePctOf({
      verified: headerVerifiedCount,
      notVerified: headerNotVerifiedCount,
    });

    const topN = (obj, n = 10) =>
      Object.entries(obj)
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, n)
        .map(([key, v]) => richBucketToJson(key, v));

    const poWiseExceptionsAll = Object.entries(byPo)
      .sort((a, b) => b[1].count - a[1].count)
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
        exceptionLineCount: v.count,
        distinctLineItems: v.lineItems.size,
        lineItems: [...v.lineItems].sort(),
        purchase_req: [...v.prs].join(", "),
        taxCode: [...v.taxCodes].join(", "),
        vendorGstin: [...v.gstins].join(", "),
        valueExposure: Number(v.valueExposure.toFixed(2)),
      }));

    const plantWiseCompliance = Object.entries(byPlantCompliance)
      .map(([plant, v]) => ({
        plant,
        plantName: getPlantName(plant),
        verified: v.verified,
        notVerified: v.notVerified,
        compliancePct: compliancePctOf(v),
      }))
      .sort((a, b) => (a.compliancePct ?? 101) - (b.compliancePct ?? 101));

    const vendorWiseCompliance = Object.entries(byVendorCompliance)
      .map(([vendorCode, v]) => {
        const vendor = getVendorInfo(vendorCode);
        return {
          vendorCode,
          vendorName: vendor?.name || getVendorName(vendorCode),
          verified: v.verified,
          notVerified: v.notVerified,
          compliancePct: compliancePctOf(v),
        };
      })
      .sort((a, b) => b.notVerified - a.notVerified)
      .slice(0, 15);

    const poNumberWiseCompliance = Object.entries(byPoNumberCompliance)
      .map(([poNumber, v]) => ({
        poNumber,
        verified: v.verified,
        notVerified: v.notVerified,
        compliancePct: compliancePctOf(v),
      }))
      .sort((a, b) => b.notVerified - a.notVerified)
      .slice(0, 15);

    const purchaseGroupWiseCompliance = Object.entries(byPurchaseGroup)
      .map(([group, v]) => ({
        purchaseGroup: group,
        purchaseGroupName: getPurchaseGroupName(group),
        verified: v.verified,
        notVerified: v.notVerified,
        compliancePct: compliancePctOf(v),
      }))
      .sort((a, b) => (a.compliancePct ?? 101) - (b.compliancePct ?? 101));

    res.status(200).json({
      filtersApplied: req.body || {},
      validPurchaseGroups: PURCHASE_GROUPS,
      generatedAt: new Date().toISOString(),
      kpiDefinitions: KPI_DEFINITIONS,
      chartDefinitions: CHART_DEFINITIONS,
      scope,
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
        header: {
          totalPOsWithHeaderData: headerRecords.length,
          verifiedCount: headerVerifiedCount,
          notVerifiedCount: headerNotVerifiedCount,
          notApplicableCount: headerNaCount,
          manualReviewCount: headerManualCount,
          overallComplianceScore: headerCompliancePct,
          closedPOCount: headerClosedCount,
          openPOCount: Math.max(headerRecords.length - headerClosedCount, 0),
        },
      },
      charts: {
        controlWiseCompliance: Object.entries(controlWise)
          .map(([pointNo, v]) => {
            const def = getPointDefinition(pointNo);
            return {
              pointNo,
              scope: "line",
              severity: severityOf(pointNo),
              label: pointLabel(pointNo),
              title: def.title,
              summary: def.summary,
              compliancePct: compliancePctOf(v),
              verified: v.verified,
              notVerified: v.notVerified,
            };
          })
          .sort((a, b) => Number(a.pointNo) - Number(b.pointNo)),
        headerControlWiseCompliance,
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
            purchaseGroupName: getPurchaseGroupName(group),
            compliancePct: compliancePctOf(v),
            verified: v.verified,
            notVerified: v.notVerified,
          }),
        ),
        plantWiseExceptions: topN(byPlant, 10),
        poNumberWiseExceptions: Object.entries(byPoNumber)
          .sort((a, b) => b[1].count - a[1].count)
          .slice(0, 15)
          .map(([key, v]) => richBucketToJson(key, v)),
        vendorWiseTopExceptions: topN(byVendor, 10),
        poTypeWiseCompliance: Object.entries(byPoType).map(([poType, v]) => ({
          poType,
          poTypeName: getPoTypeName(poType),
          verified: v.verified,
          notVerified: v.notVerified,
          compliancePct: compliancePctOf(v),
        })),
        plantWiseCompliance,
        vendorWiseCompliance,
        poNumberWiseCompliance,
        purchaseGroupWiseCompliance,
        monthlyExceptionTrend: Object.entries(monthlyExceptions)
          .sort((a, b) => (a[0] < b[0] ? -1 : 1))
          .map(([month, v]) => ({
            month,
            count: v.count,
            valueExposure: Number(v.valueExposure.toFixed(2)),
          })),
        headerMonthlyExceptionTrend: Object.entries(headerMonthlyExceptions)
          .sort((a, b) => (a[0] < b[0] ? -1 : 1))
          .map(([month, v]) => ({
            month,
            count: v.count,
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
    const user = req.user || {};
    const isUnrestricted =
      user.isAdmin || user.isProcurementManager || !user.isBuyer;

    const scopeWhere = isUnrestricted
      ? {}
      : {
          purchase_group:
            getPurchaseGroupCode(user.username) || "__no_group_assigned__",
        };

    const [plants, vendors, poTypes, groups] = await Promise.all([
      prisma.auditResult.groupBy({
        by: ["plant"],
        where: { type: "PO", plant: { not: null }, ...scopeWhere },
      }),
      prisma.auditResult.groupBy({
        by: ["vendor_code", "nameOfVendor"],
        where: { type: "PO", vendor_code: { not: null }, ...scopeWhere },
      }),
      prisma.auditResult.groupBy({
        by: ["po_type"],
        where: { type: "PO", po_type: { not: null }, ...scopeWhere },
      }),
      prisma.auditResult.groupBy({
        by: ["purchase_group"],
        where: { type: "PO", purchase_group: { not: null }, ...scopeWhere },
      }),
    ]);

    const vendorMap = new Map();
    for (const v of vendors) {
      if (!vendorMap.has(v.vendor_code))
        vendorMap.set(
          v.vendor_code,
          v.nameOfVendor || getVendorName(v.vendor_code),
        );
    }

    const plantCodes = plants
      .map((p) => p.plant)
      .filter(Boolean)
      .sort();
    const poTypeCodes = poTypes
      .map((p) => p.po_type)
      .filter(Boolean)
      .sort();
    const purchaseGroupCodes = isUnrestricted
      ? [
          ...new Set([
            ...PURCHASE_GROUPS,
            ...groups.map((g) => g.purchase_group).filter(Boolean),
          ]),
        ].sort()
      : groups
          .map((g) => g.purchase_group)
          .filter(Boolean)
          .sort();

    res.status(200).json({
      plants: plantCodes,
      vendors: [...vendorMap.entries()]
        .map(([code, name]) => ({ code, name }))
        .sort((a, b) => a.code.localeCompare(b.code)),
      poTypes: poTypeCodes,
      purchaseGroups: purchaseGroupCodes,
      severities: SEVERITY_LEVELS,
      plantNames: Object.fromEntries(
        plantCodes.map((c) => [c, getPlantName(c)]),
      ),
      poTypeNames: Object.fromEntries(
        poTypeCodes.map((c) => [c, getPoTypeName(c)]),
      ),
      purchaseGroupNames: Object.fromEntries(
        purchaseGroupCodes.map((c) => [c, getPurchaseGroupName(c)]),
      ),
      poTypeNamesAreAssumptions: true,
    });
  } catch (error) {
    console.error("Error in getFilterOptions:", error);
    res.status(500).json({ message: "Failed to load filter options" });
  }
};

export const getExecutiveDrilldown = async (req, res) => {
  try {
    await Promise.all([ensureSeverityLoaded(), ensurePointDefinitionsLoaded()]);

    const user = req.user || {};
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

    const where = buildWhere(filterBody, user);
    const rows = await prisma.auditResult.findMany({
      where,
      select: ROW_SELECT,
      orderBy: { po_created_date: "desc" },
    });

    const today = new Date();
    const matchesDimension = (row) => {
      switch (dimension) {
        case "plant":
          return (
            (row.plant || "Unassigned") === value &&
            (statusFilter ? true : rowHasException(row))
          );
        case "poNumber":
          return (
            (row.po_number || "Unassigned") === value &&
            (statusFilter ? true : rowHasException(row))
          );
        case "vendor":
          return (
            (row.vendor_code || "Unassigned") === value &&
            (statusFilter ? true : rowHasException(row))
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

    const paged = filtered.slice(skip, skip + take).map((r) => {
      const exceptionPoints = exceptionPointsOf(r).map((ep) => {
        const def = getPointDefinition(ep.pointNo);
        return {
          ...ep,
          title: def.title,
          summary: def.summary,
          logic: def.logic,
        };
      });

      const vendor = getVendorInfo(r.vendor_code);

      return {
        id: r.id,
        po_number: r.po_number,
        lineItem: lineItemOf(r),
        lineItemKey: uniqueKeyOf(r),
        purchase_req: r.purchase_req,
        material_code: r.material_code,
        material_disc: r.material_disc,
        net_value: r.net_value,
        vendorCode: r.vendor_code,
        vendorName:
          r.nameOfVendor || vendor?.name || getVendorName(r.vendor_code),
        vendorGstin: r.GSTInOfVendor || vendor?.gstin || "",
        taxCode: r.tax_code,
        plant: r.plant,
        plantName: getPlantName(r.plant),
        poType: r.po_type,
        poTypeName: getPoTypeName(r.po_type),
        purchaseGroup: r.purchase_group,
        purchaseGroupName: getPurchaseGroupName(r.purchase_group),
        paymentTerm: r.payment_term,
        paymentTermDescription: getPaymentTermDescription(r.payment_term),
        po_created_date: r.po_created_date,
        exceptionPoints,
      };
    });

    res.status(200).json({
      results: paged,
      total: filtered.length,
      page: Number(page),
      pageSize: take,
      dimension,
      value,
      scope: scopeOf(user),
    });
  } catch (error) {
    console.error("Error in getExecutiveDrilldown:", error);
    res.status(500).json({ message: "Failed to compute drilldown" });
  }
};

export const getExecutiveHeaderDrilldown = async (req, res) => {
  try {
    await Promise.all([ensureSeverityLoaded(), ensurePointDefinitionsLoaded()]);
    const user = req.user || {};
    const {
      pointNo,
      statusFilter,
      page = 1,
      pageSize = 25,
      ...filterBody
    } = req.body || {};
    if (!pointNo)
      return res.status(400).json({ message: "pointNo is required" });

    const where = buildWhere(filterBody, user);
    const scopedRows = await prisma.auditResult.findMany({
      where,
      select: { po_number: true },
    });
    const poNumbers = [
      ...new Set(scopedRows.map((r) => r.po_number).filter(Boolean)),
    ];

    if (!poNumbers.length) {
      return res.status(200).json({
        results: [],
        total: 0,
        page: Number(page),
        pageSize: Number(pageSize) || 25,
        pointNo,
        scope: scopeOf(user),
      });
    }

    const headerRows = await prisma.poHeaderResult.findMany({
      where: { po_number: { in: poNumbers } },
    });

    const filtered = headerRows
      .map((hr) => {
        const point = (hr.results || []).find(
          (p) => String(p.pointNo) === String(pointNo),
        );
        return { hr, point };
      })
      .filter(({ point }) => {
        if (!point) return false;
        const status = classifyPoint(point);
        return statusFilter
          ? status === statusFilter
          : status === "notVerified";
      });

    const take = Math.min(Number(pageSize) || 25, 200);
    const skip = (Math.max(Number(page) || 1, 1) - 1) * take;

    const paged = filtered.slice(skip, skip + take).map(({ hr, point }) => {
      const vendor = getVendorInfo(hr.vendor_code);
      return {
        po_number: hr.po_number,
        vendorCode: hr.vendor_code,
        vendorName: vendor?.name || getVendorName(hr.vendor_code),
        poType: hr.po_type,
        poTypeName: getPoTypeName(hr.po_type),
        purchaseGroup: hr.purchase_group,
        purchaseGroupName: getPurchaseGroupName(hr.purchase_group),
        headerLocked: hr.remarksLocked,
        headerLockedAt: hr.remarksLockedAt,
        pointNo,
        title: getPointDefinition(pointNo).title,
        result: {
          ...point,
          severity: severityOf(pointNo),
        },
      };
    });

    return res.status(200).json({
      results: paged,
      total: filtered.length,
      page: Number(page),
      pageSize: take,
      pointNo,
      scope: scopeOf(user),
    });
  } catch (error) {
    console.error("Error in getExecutiveHeaderDrilldown:", error);
    return res
      .status(500)
      .json({ message: "Failed to compute header drilldown" });
  }
};

export const getExecutiveHeaderKpiDrilldown = async (req, res) => {
  try {
    await Promise.all([ensureSeverityLoaded(), ensurePointDefinitionsLoaded()]);
    const user = req.user || {};
    const {
      dimension = "all",
      value,
      page = 1,
      pageSize = 25,
      ...filterBody
    } = req.body || {};

    const where = buildWhere(filterBody, user);
    const scopedRows = await prisma.auditResult.findMany({
      where,
      select: { po_number: true, po_created_date: true },
    });

    const poNumbers = [
      ...new Set(scopedRows.map((r) => r.po_number).filter(Boolean)),
    ];

    const poCreatedMonth = {};
    if (dimension === "month") {
      scopedRows.forEach((r) => {
        if (r.po_created_date && !poCreatedMonth[r.po_number]) {
          poCreatedMonth[r.po_number] = new Date(r.po_created_date)
            .toISOString()
            .slice(0, 7);
        }
      });
    }

    if (!poNumbers.length) {
      return res.status(200).json({
        results: [],
        total: 0,
        page: Number(page),
        pageSize: Number(pageSize) || 25,
        dimension,
        value,
        scope: scopeOf(user),
      });
    }

    const headerRows = await prisma.poHeaderResult.findMany({
      where: { po_number: { in: poNumbers } },
    });

    const matchesDimension = (hr) => {
      switch (dimension) {
        case "closed":
          return hr.remarksLocked === true;
        case "open":
          return hr.remarksLocked !== true;
        case "verifiedAny":
          return (hr.results || []).some(
            (p) => classifyPoint(p) === "verified",
          );
        case "notVerifiedAny":
          return (hr.results || []).some(
            (p) => classifyPoint(p) === "notVerified",
          );
        case "month":
          return (
            (hr.results || []).some(
              (p) => classifyPoint(p) === "notVerified",
            ) && poCreatedMonth[hr.po_number] === value
          );
        case "all":
        default:
          return true;
      }
    };

    const filtered = headerRows.filter(matchesDimension);

    const take = Math.min(Number(pageSize) || 25, 200);
    const skip = (Math.max(Number(page) || 1, 1) - 1) * take;

    const paged = filtered.slice(skip, skip + take).map((hr) => {
      const verifiedCount = (hr.results || []).filter(
        (p) => classifyPoint(p) === "verified",
      ).length;
      const notVerifiedCount = (hr.results || []).filter(
        (p) => classifyPoint(p) === "notVerified",
      ).length;
      const vendor = getVendorInfo(hr.vendor_code);
      return {
        po_number: hr.po_number,
        vendorCode: hr.vendor_code,
        vendorName: vendor?.name || getVendorName(hr.vendor_code),
        poType: hr.po_type,
        poTypeName: getPoTypeName(hr.po_type),
        purchaseGroup: hr.purchase_group,
        purchaseGroupName: getPurchaseGroupName(hr.purchase_group),
        headerLocked: hr.remarksLocked,
        headerLockedAt: hr.remarksLockedAt,
        verifiedCount,
        notVerifiedCount,
        compliancePct:
          verifiedCount + notVerifiedCount > 0
            ? Number(
                (
                  (verifiedCount / (verifiedCount + notVerifiedCount)) *
                  100
                ).toFixed(1),
              )
            : null,
      };
    });

    return res.status(200).json({
      results: paged,
      total: filtered.length,
      page: Number(page),
      pageSize: take,
      dimension,
      value,
      scope: scopeOf(user),
    });
  } catch (error) {
    console.error("Error in getExecutiveHeaderKpiDrilldown:", error);
    return res
      .status(500)
      .json({ message: "Failed to compute header KPI drilldown" });
  }
};

function rowHasException(row) {
  return (row.results || []).some((p) => classifyPoint(p) === "notVerified");
}

function rowHasStatus(row, status) {
  return (row.results || []).some((p) => classifyPoint(p) === status);
}

/**
 * ============================================================================
 * "Remarks Impact" dashboard cards — Header / Line / RC, each showing the
 * required identity:
 *     Not Verified (System Generated) = Not Verified (Pending) + Closed
 *
 * DIMENSION A ONLY (coverage - see utility/effective-result.js). A point/RC
 * counts as "Closed" the instant it has ANY remark or check against it,
 * regardless of the buyer's opinion (agreed with the system, disputed it,
 * or just left an informative note) - so this reflects your "for each
 * remarks change, not verified count must be reduced, everywhere" rule
 * exactly: an add/edit/delete of a remark changes these NUMBERS via this
 * live read-time derivation, but NEVER touches AuditResult.results /
 * PoHeaderResult.results / RcOverlapResult.status themselves.
 *
 * Scoping matches getExecutiveSummary(): Admin/PM see everything (or the
 * purchaseGroup filter they picked); a Buyer is restricted to their own
 * purchasing group's PO numbers (and RCs referencing that group).
 *
 * NOTE ON RC SCOPE: RcOverlapResult carries no po_number / po_created_date
 * / plant / vendor fields of its own (see schema.prisma) - only
 * purchaseGroups - so date/plant/vendor/PO-number filters from the filter
 * bar cannot narrow the RC section the way they narrow header/line. This
 * is a data-model limitation, not a bug: there is nothing on RcOverlapResult
 * to filter those fields against.
 *
 * PER-PURCHASE-GROUP BREAKDOWN ("byPurchaseGroup" below): Admin /
 * Procurement Manager / SSB Digital only, driven by the same
 * `isUnrestricted` flag used everywhere else in this controller. A Buyer's
 * response simply never contains this key — it isn't computed for them at
 * all, so there's nothing to accidentally leak client-side. Combines
 * Header + Line + RC into one Total/Closed/Pending per purchasing group,
 * sorted worst (most pending) first, for the "Purchase Group Compliance"
 * table on the executive dashboard.
 * ============================================================================
 */
export const getRemarksImpactSummary = async (req, res) => {
  try {
    const user = req.user || {};
    const body = req.body || {};
    const isUnrestricted =
      user.isAdmin || user.isProcurementManager || !user.isBuyer;

    // Per-purchase-group accumulator. Only ever populated when
    // isUnrestricted — for a Buyer this stays empty and byPurchaseGroup
    // below becomes undefined, so the key is omitted from the JSON.
    const byGroup = {};
    const ensureGroup = (g) => {
      const key = g || "Unassigned";
      if (!byGroup[key]) {
        byGroup[key] = {
          purchaseGroup: key,
          purchaseGroupName: getPurchaseGroupName(key),
          header: { systemGenerated: 0, closed: 0 },
          line: { systemGenerated: 0, closed: 0 },
          rc: { systemGenerated: 0, closed: 0 },
        };
      }
      return byGroup[key];
    };

    // ---- LINE-LEVEL ----------------------------------------------------
    const lineWhere = buildWhere(body, user);
    const lineRows = await prisma.auditResult.findMany({
      where: lineWhere,
      select: {
        id: true,
        po_number: true,
        purchase_group: true,
        results: true,
        checkedPoints: true,
      },
    });
    const poNumbers = [...new Set(lineRows.map((r) => r.po_number))];

    const lineRemarks = lineRows.length
      ? await prisma.poRemark.findMany({
          where: { auditResultId: { in: lineRows.map((r) => r.id) } },
          distinct: ["auditResultId", "pointNo"],
          select: { auditResultId: true, pointNo: true },
        })
      : [];
    const lineRemarksByRow = new Map();
    for (const r of lineRemarks) {
      if (!lineRemarksByRow.has(r.auditResultId)) {
        lineRemarksByRow.set(r.auditResultId, new Set());
      }
      lineRemarksByRow.get(r.auditResultId).add(Number(r.pointNo));
    }

    let lineSystemGenerated = 0;
    let lineClosed = 0;
    for (const row of lineRows) {
      const mandatory = getMandatoryPoints(row.results);
      lineSystemGenerated += mandatory.length;
      const remarkedSet = lineRemarksByRow.get(row.id) || new Set();
      let rowClosed = 0;
      for (const p of mandatory) {
        if (isPointCovered(p.pointNo, row.checkedPoints, [...remarkedSet])) {
          lineClosed++;
          rowClosed++;
        }
      }
      if (isUnrestricted) {
        const g = ensureGroup(row.purchase_group);
        g.line.systemGenerated += mandatory.length;
        g.line.closed += rowClosed;
      }
    }

    // ---- HEADER-LEVEL ---------------------------------------------------
    // Scoped to the same PO numbers the line-level query already resolved
    // (which is itself purchase-group-scoped via buildWhere), so a Buyer
    // never sees header points for POs outside their own group.
    const headerRows = poNumbers.length
      ? await prisma.poHeaderResult.findMany({
          where: { po_number: { in: poNumbers } },
          select: {
            id: true,
            po_number: true,
            purchase_group: true,
            results: true,
            checkedPoints: true,
          },
        })
      : [];
    const headerRemarks = headerRows.length
      ? await prisma.poHeaderRemark.findMany({
          where: { po_number: { in: headerRows.map((r) => r.po_number) } },
          distinct: ["po_number", "pointNo"],
          select: { po_number: true, pointNo: true },
        })
      : [];
    const headerRemarksByPo = new Map();
    for (const r of headerRemarks) {
      if (!headerRemarksByPo.has(r.po_number)) {
        headerRemarksByPo.set(r.po_number, new Set());
      }
      headerRemarksByPo.get(r.po_number).add(Number(r.pointNo));
    }

    let headerSystemGenerated = 0;
    let headerClosed = 0;
    for (const row of headerRows) {
      const mandatory = getMandatoryPoints(row.results);
      headerSystemGenerated += mandatory.length;
      const remarkedSet = headerRemarksByPo.get(row.po_number) || new Set();
      let rowClosed = 0;
      for (const p of mandatory) {
        if (isPointCovered(p.pointNo, row.checkedPoints, [...remarkedSet])) {
          headerClosed++;
          rowClosed++;
        }
      }
      if (isUnrestricted) {
        const g = ensureGroup(row.purchase_group);
        g.header.systemGenerated += mandatory.length;
        g.header.closed += rowClosed;
      }
    }

    // ---- RC-LEVEL ---------------------------------------------------
    const rcWhere = { status: "Not Verified" };
    if (!isUnrestricted) {
      const ownGroup = getPurchaseGroupCode(user.username);
      rcWhere.purchaseGroups = { has: ownGroup || "__no_group_assigned__" };
    }
    const rcRows = await prisma.rcOverlapResult.findMany({
      where: rcWhere,
      select: { id: true, remarksLocked: true, purchaseGroups: true },
    });
    const rcSystemGenerated = rcRows.length;
    const rcClosed = rcRows.filter((r) => r.remarksLocked).length;

    // An RC can list several purchase groups (RcOverlapResult.purchaseGroups
    // is an array), so — for the unrestricted breakdown only — it counts
    // once toward each group it lists, same as the scoping filter above
    // treats "belongs to my group" as `purchaseGroups.has(ownGroup)`.
    if (isUnrestricted) {
      for (const rc of rcRows) {
        const groups = rc.purchaseGroups?.length
          ? rc.purchaseGroups
          : ["Unassigned"];
        for (const g of groups) {
          const bucket = ensureGroup(g);
          bucket.rc.systemGenerated += 1;
          if (rc.remarksLocked) bucket.rc.closed += 1;
        }
      }
    }

    const shape = (systemGenerated, closed) => ({
      systemGenerated,
      closed,
      pending: Math.max(systemGenerated - closed, 0),
    });

    // Combine Header + Line + RC per group into the totals the "Purchase
    // Group Compliance" table shows, worst (most pending) first.
    const byPurchaseGroup = isUnrestricted
      ? Object.values(byGroup)
          .map((g) => {
            const totalSystemGenerated =
              g.header.systemGenerated +
              g.line.systemGenerated +
              g.rc.systemGenerated;
            const totalClosed = g.header.closed + g.line.closed + g.rc.closed;
            return {
              purchaseGroup: g.purchaseGroup,
              purchaseGroupName: g.purchaseGroupName,
              header: shape(g.header.systemGenerated, g.header.closed),
              line: shape(g.line.systemGenerated, g.line.closed),
              rc: shape(g.rc.systemGenerated, g.rc.closed),
              total: shape(totalSystemGenerated, totalClosed),
            };
          })
          .sort((a, b) => b.total.pending - a.total.pending)
      : undefined;

    return res.status(200).json({
      header: shape(headerSystemGenerated, headerClosed),
      line: shape(lineSystemGenerated, lineClosed),
      rc: shape(rcSystemGenerated, rcClosed),
      byPurchaseGroup,
      scope: scopeOf(user),
    });
  } catch (error) {
    console.error("Error in getRemarksImpactSummary:", error);
    return res
      .status(500)
      .json({ message: "Failed to compute remarks impact summary" });
  }
};

/**
 * ============================================================================
 * The EXACT list behind any one of the 3 numbers on a "Remarks Impact"
 * card (Total Not Verified / Pending / Closed), for any of the 3 sections
 * (header/line/rc). This is what makes those numbers clickable-through:
 * every query here is the SAME mandatory-points + coverage logic
 * getRemarksImpactSummary() uses, so the list returned always has exactly
 * as many rows as the card said it would - no separate, looser
 * "approximately this many" drilldown that could disagree with the card.
 *
 * body: { section: "header"|"line"|"rc", bucket: "total"|"pending"|"closed",
 *         isPoCorrected?: "corrected"|"altercation" (bucket="closed" only),
 *         purchaseGroup?: string[] (optional single-group drilldown, e.g.
 *         from the "Purchase Group Compliance" table — for unrestricted
 *         roles only; a Buyer is already scoped to their own group by
 *         buildWhere()/the rcWhere branch below regardless of this field),
 *         page, pageSize, ...same scoping filters as getRemarksImpactSummary }
 * ============================================================================
 */
export const getRemarksImpactList = async (req, res) => {
  try {
    const user = req.user || {};
    const body = req.body || {};
    const section = body.section;
    const bucket = body.bucket || "pending";
    const page = Math.max(Number(body.page) || 1, 1);
    const pageSize = Math.min(Number(body.pageSize) || 25, 200);

    if (!["header", "line", "rc"].includes(section)) {
      return res
        .status(400)
        .json({ message: "section must be header, line, or rc" });
    }
    if (!["total", "pending", "closed"].includes(bucket)) {
      return res
        .status(400)
        .json({ message: "bucket must be total, pending, or closed" });
    }

    const matchesBucket = (covered) =>
      bucket === "total" ? true : bucket === "closed" ? covered : !covered;
    const pointNoFilter =
      body.pointNo !== undefined && body.pointNo !== null && body.pointNo !== ""
        ? Number(body.pointNo)
        : null;
    const fmtDate = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);

    if (section === "rc") {
      const isUnrestricted =
        user.isAdmin || user.isProcurementManager || !user.isBuyer;
      const rcWhere = { status: "Not Verified" };
      if (!isUnrestricted) {
        const ownGroup = getPurchaseGroupCode(user.username);
        rcWhere.purchaseGroups = { has: ownGroup || "__no_group_assigned__" };
      } else if (
        Array.isArray(body.purchaseGroup) &&
        body.purchaseGroup.length === 1
      ) {
        // Drilling into one specific purchase group's RC bucket (e.g. from
        // the "Purchase Group Compliance" table). Only reachable for
        // unrestricted roles — a Buyer already hits the branch above and
        // is scoped to their own group regardless of what's in the body.
        rcWhere.purchaseGroups = { has: body.purchaseGroup[0] };
      }
      const allRcs = await prisma.rcOverlapResult.findMany({
        where: rcWhere,
        orderBy: { rcNumber: "asc" },
      });
      const rcIds = allRcs.map((r) => r.id);
      const remarksByRc = new Map();
      if (rcIds.length) {
        const remarks = await prisma.poRcRemark.findMany({
          where: { rcOverlapResultId: { in: rcIds } },
          orderBy: { submittedAt: "desc" },
        });
        for (const r of remarks) {
          if (!remarksByRc.has(r.rcOverlapResultId))
            remarksByRc.set(r.rcOverlapResultId, r);
        }
      }

      let filtered = allRcs.filter((rc) => matchesBucket(!!rc.remarksLocked));
      if (bucket === "closed" && body.isPoCorrected) {
        filtered = filtered.filter((rc) => {
          const latest = remarksByRc.get(rc.id);
          const corrected = !!latest?.isSystemResultWrong;
          return body.isPoCorrected === "corrected" ? corrected : !corrected;
        });
      }

      const total = filtered.length;
      const paged = filtered.slice((page - 1) * pageSize, page * pageSize);
      const rows = paged.map((rc) => {
        const latest = remarksByRc.get(rc.id);
        const vendor = getVendorInfo(rc.vendorCode);
        return {
          key: `rc-${rc.id}`,
          rcNumber: rc.rcNumber,
          vendorCode: rc.vendorCode,
          vendorName: vendor?.name || getVendorName(rc.vendorCode),
          materialCode: rc.rcMaterialCode,
          validFrom: fmtDate(rc.validFrom),
          validTo: fmtDate(rc.validTo),
          purchaseGroups: (rc.purchaseGroups || []).join(", "),
          status: rc.remarksLocked ? "Closed" : "Pending",
          latestRemark: latest?.remark || "",
          isPoCorrected: latest
            ? latest.isSystemResultWrong
              ? "PO Corrected"
              : "System Altercation"
            : "",
        };
      });
      // RC has no "point number" concept - one check per RC - so
      // availablePoints is always empty here; the frontend hides the
      // point filter for this section accordingly.
      return res.status(200).json({
        rows,
        total,
        page,
        pageSize,
        section,
        bucket,
        availablePoints: [],
      });
    }

    // ---- header/line share the same shape ----------------------------
    const lineWhere = buildWhere(body, user);
    const lineRows = await prisma.auditResult.findMany({
      where: lineWhere,
      select: {
        id: true,
        po_number: true,
        po_line_item: true,
        results: true,
        checkedPoints: true,
        vendor_code: true,
        nameOfVendor: true,
        po_created_date: true,
        plant: true,
        po_type: true,
        purchase_group: true,
      },
    });
    const poNumbers = [...new Set(lineRows.map((r) => r.po_number))];

    if (section === "line") {
      const remarks = lineRows.length
        ? await prisma.poRemark.findMany({
            where: { auditResultId: { in: lineRows.map((r) => r.id) } },
            orderBy: { submittedAt: "desc" },
          })
        : [];
      const remarksByRow = new Map(); // auditResultId -> pointNo -> latest remark
      for (const r of remarks) {
        if (!remarksByRow.has(r.auditResultId))
          remarksByRow.set(r.auditResultId, new Map());
        const byPoint = remarksByRow.get(r.auditResultId);
        if (!byPoint.has(Number(r.pointNo))) byPoint.set(Number(r.pointNo), r);
      }

      const out = [];
      const availablePointsSet = new Set();
      for (const row of lineRows) {
        const mandatory = getMandatoryPoints(row.results);
        const byPoint = remarksByRow.get(row.id) || new Map();
        const remarkedNos = [...byPoint.keys()];
        for (const p of mandatory) {
          const covered = isPointCovered(
            p.pointNo,
            row.checkedPoints,
            remarkedNos,
          );
          if (!matchesBucket(covered)) continue;
          availablePointsSet.add(Number(p.pointNo));
          if (pointNoFilter !== null && Number(p.pointNo) !== pointNoFilter)
            continue;
          const latest = byPoint.get(Number(p.pointNo));
          if (bucket === "closed" && body.isPoCorrected) {
            const corrected = !!latest?.isSystemResultWrong;
            if (body.isPoCorrected === "corrected" ? !corrected : corrected)
              continue;
          }
          out.push({
            key: `line-${row.id}-${p.pointNo}`,
            poNumber: row.po_number,
            lineItem: row.po_line_item,
            poDate: fmtDate(row.po_created_date),
            poType: row.po_type,
            plant: row.plant,
            purchaseGroup: row.purchase_group,
            pointNo: Number(p.pointNo),
            pointTitle: getPointDefinition(p.pointNo)?.title || "",
            vendorCode: row.vendor_code,
            vendorName: row.nameOfVendor || getVendorName(row.vendor_code),
            status: covered ? "Closed" : "Pending",
            latestRemark: latest?.remark || "",
            isPoCorrected: latest
              ? latest.isSystemResultWrong
                ? "PO Corrected"
                : "System Altercation"
              : "",
          });
        }
      }
      const total = out.length;
      const paged = out.slice((page - 1) * pageSize, page * pageSize);
      const availablePoints = [...availablePointsSet]
        .sort((a, b) => a - b)
        .map((no) => ({
          pointNo: no,
          title: getPointDefinition(no)?.title || "",
        }));
      return res.status(200).json({
        rows: paged,
        total,
        page,
        pageSize,
        section,
        bucket,
        availablePoints,
      });
    }

    // section === "header"
    // PoHeaderResult has no PO date/plant/type of its own — borrow it
    // from any one of that PO's already-fetched line rows (same PO-level
    // metadata is duplicated onto every line at import time).
    const repLineByPo = new Map();
    for (const r of lineRows) {
      if (!repLineByPo.has(r.po_number)) repLineByPo.set(r.po_number, r);
    }

    const headerRows = poNumbers.length
      ? await prisma.poHeaderResult.findMany({
          where: { po_number: { in: poNumbers } },
          select: {
            id: true,
            po_number: true,
            results: true,
            checkedPoints: true,
            vendor_code: true,
            purchase_group: true,
            po_type: true,
          },
        })
      : [];
    const headerRemarks = headerRows.length
      ? await prisma.poHeaderRemark.findMany({
          where: { po_number: { in: headerRows.map((r) => r.po_number) } },
          orderBy: { submittedAt: "desc" },
        })
      : [];
    const headerRemarksByPo = new Map(); // po_number -> pointNo -> latest remark
    for (const r of headerRemarks) {
      if (!headerRemarksByPo.has(r.po_number))
        headerRemarksByPo.set(r.po_number, new Map());
      const byPoint = headerRemarksByPo.get(r.po_number);
      if (!byPoint.has(Number(r.pointNo))) byPoint.set(Number(r.pointNo), r);
    }

    const out = [];
    const availablePointsSet = new Set();
    for (const row of headerRows) {
      const mandatory = getMandatoryPoints(row.results);
      const byPoint = headerRemarksByPo.get(row.po_number) || new Map();
      const remarkedNos = [...byPoint.keys()];
      const repLine = repLineByPo.get(row.po_number);
      for (const p of mandatory) {
        const covered = isPointCovered(
          p.pointNo,
          row.checkedPoints,
          remarkedNos,
        );
        if (!matchesBucket(covered)) continue;
        availablePointsSet.add(Number(p.pointNo));
        if (pointNoFilter !== null && Number(p.pointNo) !== pointNoFilter)
          continue;
        const latest = byPoint.get(Number(p.pointNo));
        if (bucket === "closed" && body.isPoCorrected) {
          const corrected = !!latest?.isSystemResultWrong;
          if (body.isPoCorrected === "corrected" ? !corrected : corrected)
            continue;
        }
        out.push({
          key: `header-${row.po_number}-${p.pointNo}`,
          poNumber: row.po_number,
          poDate: fmtDate(repLine?.po_created_date),
          poType: row.po_type || repLine?.po_type,
          plant: repLine?.plant,
          purchaseGroup: row.purchase_group,
          pointNo: Number(p.pointNo),
          pointTitle: getPointDefinition(p.pointNo)?.title || "",
          vendorCode: row.vendor_code,
          vendorName: getVendorName(row.vendor_code),
          status: covered ? "Closed" : "Pending",
          latestRemark: latest?.remark || "",
          isPoCorrected: latest
            ? latest.isSystemResultWrong
              ? "PO Corrected"
              : "System Altercation"
            : "",
        });
      }
    }
    const total = out.length;
    const paged = out.slice((page - 1) * pageSize, page * pageSize);
    const availablePoints = [...availablePointsSet]
      .sort((a, b) => a - b)
      .map((no) => ({
        pointNo: no,
        title: getPointDefinition(no)?.title || "",
      }));
    return res.status(200).json({
      rows: paged,
      total,
      page,
      pageSize,
      section,
      bucket,
      availablePoints,
    });
  } catch (error) {
    console.error("Error in getRemarksImpactList:", error);
    return res
      .status(500)
      .json({ message: "Failed to load remarks impact list" });
  }
};
