import { prisma } from "../lib/prisma.js";
import { versionKey } from "../utility/po-version.js";
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
import { getScopedModel, remarkNos } from "../utility/data-cache.js";
import { analyseRecord, pendingPointsOf } from "../utility/po-status.js";

const PURCHASE_GROUPS = [
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

/**
- Dashboard scope. EXPORTED so po-status-controller.js reuses it 1:1.
 *
- IMPORTANT: this now excludes RC_PLACEHOLDER_PO_TYPES, exactly like the
- PO Data page always did. Before, the dashboard counted those POs and the
- PO list did not - that is why "Total POs" on the dashboard did not match
- the PO Data page. Both now use the same rule.
- (To count them everywhere instead, remove the exclusion here AND in
- po-data-controller.js buildBaseWhere.)
 */
export function buildWhere(body = {}, user = {}) {
  const where = { type: "PO", po_type: { notIn: RC_PLACEHOLDER_PO_TYPES } };

  // `poNumber` from the FilterBar is an exact-match filter.
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
    where.po_type = {
      in: body.poType.filter((t) => !RC_PLACEHOLDER_PO_TYPES.includes(t)),
    };
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

/**
- RC-level counterpart to buildWhere().
 *
- RcOverlapResult carries no po_number / po_created_date / plant /
- po_type of its own, so only the filters that DO exist on that table can
- narrow the RC section:
- purchaseGroup (RcOverlapResult.purchaseGroups is an array -> hasSome)
- vendorCode    (RcOverlapResult.vendorCode)
- materialCode  (RcOverlapResult.rcMaterialCode)
- PO number / PO date / PR date / plant / PO type filters from the filter
- bar have nothing on an RC to filter against and are intentionally
- ignored for RC figures.
 *
- A Buyer is always restricted to RCs that list their own purchase group,
- regardless of what's in the body (same rule as everywhere else here).
 */
function buildRcWhere(body = {}, user = {}) {
  const where = {};
  const isUnrestricted =
    user.isAdmin || user.isProcurementManager || !user.isBuyer;

  if (isUnrestricted) {
    if (Array.isArray(body.purchaseGroup) && body.purchaseGroup.length) {
      where.purchaseGroups = { hasSome: body.purchaseGroup };
    }
  } else {
    const ownGroup = getPurchaseGroupCode(user.username);
    where.purchaseGroups = { has: ownGroup || "__no_group_assigned__" };
  }

  if (body.vendorCode) where.vendorCode = body.vendorCode;
  if (body.materialCode) where.rcMaterialCode = body.materialCode;

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

    // One shared, cached read (also used by Remarks Impact / PO status / PO list)
    const model = await getScopedModel(where);
    const rows = model.lineRows;

    const poNumbers = new Set();
    const prNumbers = new Set();
    let verifiedCount = 0;
    let notVerifiedCount = 0;
    let naCount = 0;
    let manualCount = 0;
    let highRiskExceptions = 0;
    let exceptionValueExposure = 0;
    let exceptionLineCount = 0; // lines with >= 1 Not Verified check
    const exceptionPOSet = new Set(); // POs with >= 1 Not Verified line check
    let headerExceptionPOCount = 0; // POs with >= 1 Not Verified header check

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
        exceptionLineCount++;
        exceptionPOSet.add(row.po_number);
        exceptionValueExposure += parseNum(row.net_value);

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

    const headerRecords = model.headerRows;

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
    let headerClosedCount = 0; // POs with NO pending header point

    for (const hr of headerRecords) {
      // "Closed" = no pending header point (Not Verified without a check or
      // remark, or Manual). There is no lock concept any more.
      const hc = analyseRecord(
        hr.results,
        hr.checkedPoints,
        remarkNos(model.headerRemarks, versionKey(hr.po_number, hr.source_file_ts)),
      );
      if (pendingPointsOf(hc) === 0) headerClosedCount++;

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
        headerExceptionPOCount++;
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

    // ---- RC-LEVEL COMPLIANCE ---------------------------------------------
    // One check per RC (RC Overlap). Closed = a Not Verified RC that has been
    // checked off; Pending = a Not Verified RC still open.
    const isUnrestrictedUser = !scope;
    const rcRows = await prisma.rcOverlapResult.findMany({
      where: buildRcWhere(req.body || {}, user),
      select: {
        id: true,
        vendorCode: true,
        status: true,
        remarksLocked: true,
        purchaseGroups: true,
      },
    });

    const filterGroups =
      Array.isArray(req.body?.purchaseGroup) && req.body.purchaseGroup.length
        ? new Set(req.body.purchaseGroup)
        : null;

    let rcVerifiedCount = 0;
    let rcNotVerifiedCount = 0;
    let rcClosedCount = 0;
    const rcByGroup = {};
    const rcByVendor = {};

    for (const rc of rcRows) {
      const isVerified = rc.status === "Verified";
      const isNotVerified = rc.status === "Not Verified";
      if (!isVerified && !isNotVerified) continue;

      if (isVerified) rcVerifiedCount++;
      else {
        rcNotVerifiedCount++;
        if (rc.remarksLocked) rcClosedCount++;
      }

      const vKey = rc.vendorCode || "Unassigned";
      rcByVendor[vKey] = rcByVendor[vKey] || { verified: 0, notVerified: 0 };
      if (isVerified) rcByVendor[vKey].verified++;
      else rcByVendor[vKey].notVerified++;

      if (isUnrestrictedUser) {
        const groups = rc.purchaseGroups?.length
          ? rc.purchaseGroups
          : ["Unassigned"];
        for (const g of groups) {
          if (filterGroups && !filterGroups.has(g)) continue;
          rcByGroup[g] = rcByGroup[g] || { verified: 0, notVerified: 0 };
          if (isVerified) rcByGroup[g].verified++;
          else rcByGroup[g].notVerified++;
        }
      }
    }

    const rcCompliancePct = compliancePctOf({
      verified: rcVerifiedCount,
      notVerified: rcNotVerifiedCount,
    });

    const rcPurchaseGroupCompliance = Object.entries(rcByGroup)
      .map(([group, v]) => ({
        purchaseGroup: group,
        purchaseGroupName: getPurchaseGroupName(group),
        verified: v.verified,
        notVerified: v.notVerified,
        compliancePct: compliancePctOf(v),
      }))
      .sort((a, b) => (a.compliancePct ?? 101) - (b.compliancePct ?? 101));

    const rcVendorCompliance = Object.entries(rcByVendor)
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
      .filter((v) => v.notVerified > 0)
      .sort((a, b) => b.notVerified - a.notVerified)
      .slice(0, 15);

    const topN = (obj, n = 10) =>
      Object.entries(obj)
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, n)
        .map(([key, v]) => richBucketToJson(key, v));

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
        // POs in scope that have no header-audit record yet (drives the
        // yellow warning banner on the dashboard).
        missingHeaderDataCount: Math.max(
          poNumbers.size - headerRecords.length,
          0,
        ),
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
        // Cards that read these were empty because they were never sent.
        totalLineChecks:
          verifiedCount + notVerifiedCount + naCount + manualCount,
        applicableLineChecks: verifiedCount + notVerifiedCount,
        exceptionLineCount,
        exceptionPOCount: exceptionPOSet.size,
        header: {
          totalPOsWithHeaderData: headerRecords.length,
          verifiedCount: headerVerifiedCount,
          notVerifiedCount: headerNotVerifiedCount,
          notApplicableCount: headerNaCount,
          manualReviewCount: headerManualCount,
          overallComplianceScore: headerCompliancePct,
          totalChecks:
            headerVerifiedCount +
            headerNotVerifiedCount +
            headerNaCount +
            headerManualCount,
          applicableChecks: headerVerifiedCount + headerNotVerifiedCount,
          exceptionPOCount: headerExceptionPOCount,
          // POs whose header has no pending point / still has one
          closedPOCount: headerClosedCount,
          openPOCount: Math.max(headerRecords.length - headerClosedCount, 0),
        },
        rc: {
          totalRCCount: rcVerifiedCount + rcNotVerifiedCount,
          verifiedCount: rcVerifiedCount,
          notVerifiedCount: rcNotVerifiedCount,
          overallComplianceScore: rcCompliancePct,
          closedRCCount: rcClosedCount,
          pendingRCCount: Math.max(rcNotVerifiedCount - rcClosedCount, 0),
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
        rcPurchaseGroupCompliance,
        rcVendorCompliance,
        // NOTE: the PO-wise list is now served by /reports/po-status-summary
        // (poRows) - removed from here to keep this response small and fast.
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

    // Same placeholder exclusion as the rest of the dashboard, so a filter
    // value that can never return rows is not offered.
    const base = { type: "PO", ...scopeWhere };
    const notPlaceholder = { notIn: RC_PLACEHOLDER_PO_TYPES };

    const [plants, vendors, poTypes, groups] = await Promise.all([
      prisma.auditResult.groupBy({
        by: ["plant"],
        where: { ...base, po_type: notPlaceholder, plant: { not: null } },
      }),
      prisma.auditResult.groupBy({
        by: ["vendor_code", "nameOfVendor"],
        where: { ...base, po_type: notPlaceholder, vendor_code: { not: null } },
      }),
      prisma.auditResult.groupBy({
        by: ["po_type"],
        where: { ...base, po_type: { not: null, ...notPlaceholder } },
      }),
      prisma.auditResult.groupBy({
        by: ["purchase_group"],
        where: {
          ...base,
          po_type: notPlaceholder,
          purchase_group: { not: null },
        },
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
    const model = await getScopedModel(where);
    const rows = [...model.lineRows].sort(
      (a, b) =>
        new Date(b.po_created_date || 0) - new Date(a.po_created_date || 0),
    );

    const today = new Date();

    // Quick lookup sets for dimensions that require crossing over to header data
    const headerPoMap = new Set(model.headerRows.map((hr) => hr.po_number));

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
        case "missingHeaderData":
          return !headerPoMap.has(row.po_number);
        case "hasPR":
          return Boolean(row.purchase_req);
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
        source_file_ts: r.source_file_ts?.toISOString?.() || null,
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
    const model = await getScopedModel(where);

    if (!model.poNumbers.length) {
      return res.status(200).json({
        results: [],
        total: 0,
        page: Number(page),
        pageSize: Number(pageSize) || 25,
        pointNo,
        scope: scopeOf(user),
      });
    }

    const filtered = model.headerRows
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
      // "headerLocked" is kept as the field name only so the existing dialog
      // keeps working; it now simply means "this point is closed".
      const closed = isPointCovered(
        pointNo,
        hr.checkedPoints,
        remarkNos(model.headerRemarks, versionKey(hr.po_number, hr.source_file_ts)),
      );
      return {
        po_number: hr.po_number,
        source_file_ts: hr.source_file_ts?.toISOString?.() || null,
        vendorCode: hr.vendor_code,
        vendorName: vendor?.name || getVendorName(hr.vendor_code),
        poType: hr.po_type,
        poTypeName: getPoTypeName(hr.po_type),
        purchaseGroup: hr.purchase_group,
        purchaseGroupName: getPurchaseGroupName(hr.purchase_group),
        headerLocked: closed,
        headerLockedAt: null,
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
    const model = await getScopedModel(where);

    const poCreatedMonth = {};
    if (dimension === "month") {
      model.lineRows.forEach((r) => {
        if (r.po_created_date && !poCreatedMonth[r.po_number]) {
          poCreatedMonth[r.po_number] = new Date(r.po_created_date)
            .toISOString()
            .slice(0, 7);
        }
      });
    }

    if (!model.poNumbers.length) {
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

    // header closed = NO pending header point (no lock concept)
    const countsOf = (hr) =>
      analyseRecord(
        hr.results,
        hr.checkedPoints,
        remarkNos(model.headerRemarks, versionKey(hr.po_number, hr.source_file_ts)),
      );

    const matchesDimension = (hr) => {
      switch (dimension) {
        case "closed":
          return pendingPointsOf(countsOf(hr)) === 0;
        case "open":
          return pendingPointsOf(countsOf(hr)) > 0;
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

    const filtered = model.headerRows.filter(matchesDimension);

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
        source_file_ts: hr.source_file_ts?.toISOString?.() || null,
        vendorCode: hr.vendor_code,
        vendorName: vendor?.name || getVendorName(hr.vendor_code),
        poType: hr.po_type,
        poTypeName: getPoTypeName(hr.po_type),
        purchaseGroup: hr.purchase_group,
        purchaseGroupName: getPurchaseGroupName(hr.purchase_group),
        // field name kept for the existing dialog; now means "closed"
        headerLocked: pendingPointsOf(countsOf(hr)) === 0,
        headerLockedAt: null,
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

/**
- ============================================================================
- RC-LEVEL drilldown - the exact list behind any RC KPI card / RC chart
- segment on the Executive Dashboard. Each row is one Rate Contract
- (RcOverlapResult), not a PO.
 *
- body: { dimension, value?, statusFilter?, page, pageSize, ...filters }
-   dimension:
-     "all"           every RC in scope
-     "verified"      status === "Verified"
-     "notVerified"   status === "Not Verified"
-     "closed"        Not Verified AND checked off
-     "pending"       Not Verified AND NOT checked off
-     "purchaseGroup" RCs listing purchase group `value` ("Unassigned" =
-                     RCs listing none)
-     "vendor"        RCs for vendor code `value`
-   statusFilter (optional, "verified" | "notVerified"): narrows the
-     purchaseGroup / vendor dimensions to one side of the stacked bar.
 *
- Scoping is buildRcWhere(): a Buyer only ever sees RCs listing their own
- purchase group, regardless of the body.
- ============================================================================
 */
export const getExecutiveRcDrilldown = async (req, res) => {
  try {
    const user = req.user || {};
    const {
      dimension = "all",
      value,
      statusFilter,
      page = 1,
      pageSize = 25,
      ...filterBody
    } = req.body || {};

    const where = buildRcWhere(filterBody, user);
    const allRcs = await prisma.rcOverlapResult.findMany({
      where,
      orderBy: { rcNumber: "asc" },
    });

    const isVerified = (rc) => rc.status === "Verified";
    const isNotVerified = (rc) => rc.status === "Not Verified";

    const matchesStatusFilter = (rc) => {
      if (!statusFilter) return true;
      if (statusFilter === "verified") return isVerified(rc);
      if (statusFilter === "notVerified") return isNotVerified(rc);
      return true;
    };

    const matchesDimension = (rc) => {
      switch (dimension) {
        case "verified":
          return isVerified(rc);
        case "notVerified":
          return isNotVerified(rc);
        case "closed":
          return isNotVerified(rc) && !!rc.remarksLocked;
        case "pending":
          return isNotVerified(rc) && !rc.remarksLocked;
        case "purchaseGroup": {
          const groups = rc.purchaseGroups?.length
            ? rc.purchaseGroups
            : ["Unassigned"];
          return groups.includes(value);
        }
        case "vendor":
          return (rc.vendorCode || "Unassigned") === value;
        case "all":
        default:
          return true;
      }
    };

    const filtered = allRcs.filter(
      (rc) => matchesDimension(rc) && matchesStatusFilter(rc),
    );

    const take = Math.min(Number(pageSize) || 25, 200);
    const skip = (Math.max(Number(page) || 1, 1) - 1) * take;
    const pageRcs = filtered.slice(skip, skip + take);

    // Latest remark per RC, only for the rows on this page.
    const latestByRc = new Map();
    if (pageRcs.length) {
      const remarks = await prisma.poRcRemark.findMany({
        where: { rcOverlapResultId: { in: pageRcs.map((r) => r.id) } },
        orderBy: { submittedAt: "desc" },
      });
      for (const r of remarks) {
        if (!latestByRc.has(r.rcOverlapResultId))
          latestByRc.set(r.rcOverlapResultId, r);
      }
    }

    const fmtDate = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);

    const results = pageRcs.map((rc) => {
      const latest = latestByRc.get(rc.id);
      const vendor = getVendorInfo(rc.vendorCode);
      return {
        key: `rc-${rc.id}`,
        id: rc.id,
        rcNumber: rc.rcNumber,
        vendorCode: rc.vendorCode,
        vendorName: vendor?.name || getVendorName(rc.vendorCode),
        materialCode: rc.rcMaterialCode,
        validFrom: fmtDate(rc.validFrom),
        validTo: fmtDate(rc.validTo),
        purchaseGroups: (rc.purchaseGroups || []).join(", "),
        overlappingRcs: (rc.overlappingRcs || []).join(", "),
        result: rc.status,
        systemRemark: rc.remark || "",
        locked: !!rc.remarksLocked,
        lockedAt: rc.remarksLockedAt,
        latestRemark: latest?.remark || "",
        isPoCorrected: latest
          ? latest.isSystemResultWrong
            ? "PO Corrected"
            : "System Altercation"
          : "",
      };
    });

    return res.status(200).json({
      results,
      total: filtered.length,
      page: Number(page),
      pageSize: take,
      dimension,
      value,
      scope: scopeOf(user),
    });
  } catch (error) {
    console.error("Error in getExecutiveRcDrilldown:", error);
    return res.status(500).json({ message: "Failed to compute RC drilldown" });
  }
};

function rowHasException(row) {
  return (row.results || []).some((p) => classifyPoint(p) === "notVerified");
}

function rowHasStatus(row, status) {
  return (row.results || []).some((p) => classifyPoint(p) === status);
}

/**
- ============================================================================
- "Remarks Impact" dashboard cards - Header / Line / RC:
-     Not Verified (System Generated) = Not Verified (Pending) + Closed
 *
- A point counts as "Closed" the instant it has ANY remark or check against
- it (see utility/effective-result.js). Read-time derivation only - the
- stored system results are never rewritten.
 *
- Reads from the SAME shared model as the executive summary and the PO status
- tables, so all three can never disagree.
 *
- byPurchaseGroup: Admin / Procurement Manager / SSB Digital only.
- ============================================================================
 */
export const getRemarksImpactSummary = async (req, res) => {
  try {
    const user = req.user || {};
    const body = req.body || {};
    const isUnrestricted =
      user.isAdmin || user.isProcurementManager || !user.isBuyer;

    const byGroup = {};
    const ensureGroup = (g) => {
      const key = g || "Unassigned";
      if (!byGroup[key]) {
        byGroup[key] = {
          purchaseGroup: key,
          purchaseGroupName: getPurchaseGroupName(key),
          header: { systemGenerated: 0, closed: 0, poCorrected: 0 },
          line: { systemGenerated: 0, closed: 0, poCorrected: 0 },
          rc: { systemGenerated: 0, closed: 0, poCorrected: 0 },
          // unique PO numbers a buyer corrected in this group
          correctedPos: new Set(),
        };
      }
      return byGroup[key];
    };

    const model = await getScopedModel(buildWhere(body, user));

    // ---- LINE-LEVEL ----------------------------------------------------
    let lineSystemGenerated = 0;
    let lineClosed = 0;
    for (const row of model.lineRows) {
      const mandatory = getMandatoryPoints(row.results);
      lineSystemGenerated += mandatory.length;
      const remarkedMap = model.lineRemarks.get(row.id) || new Map();
      const remarkedNos = [...remarkedMap.keys()];
      let rowClosed = 0;
      let rowCorrected = 0;
      for (const p of mandatory) {
        if (isPointCovered(p.pointNo, row.checkedPoints, remarkedNos)) {
          lineClosed++;
          rowClosed++;
          if (remarkedMap.get(Number(p.pointNo))) rowCorrected++;
        }
      }
      if (isUnrestricted) {
        const g = ensureGroup(row.purchase_group);
        g.line.systemGenerated += mandatory.length;
        g.line.closed += rowClosed;
        g.line.poCorrected += rowCorrected;
        if (rowCorrected > 0) g.correctedPos.add(versionKey(row.po_number, row.source_file_ts));
      }
    }

    // ---- HEADER-LEVEL ---------------------------------------------------
    let headerSystemGenerated = 0;
    let headerClosed = 0;
    for (const row of model.headerRows) {
      const mandatory = getMandatoryPoints(row.results);
      headerSystemGenerated += mandatory.length;
      const remarkedMap = model.headerRemarks.get(versionKey(row.po_number, row.source_file_ts)) || new Map();
      const remarkedNos = [...remarkedMap.keys()];
      let rowClosed = 0;
      let rowCorrected = 0;
      for (const p of mandatory) {
        if (isPointCovered(p.pointNo, row.checkedPoints, remarkedNos)) {
          headerClosed++;
          rowClosed++;
          if (remarkedMap.get(Number(p.pointNo))) rowCorrected++;
        }
      }
      if (isUnrestricted) {
        const g = ensureGroup(row.purchase_group);
        g.header.systemGenerated += mandatory.length;
        g.header.closed += rowClosed;
        g.header.poCorrected += rowCorrected;
        if (rowCorrected > 0) g.correctedPos.add(versionKey(row.po_number, row.source_file_ts));
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

    const rcCorrectedIds = new Set();
    if (isUnrestricted && rcRows.length) {
      const rcRemarks = await prisma.poRcRemark.findMany({
        where: { rcOverlapResultId: { in: rcRows.map((r) => r.id) } },
        orderBy: { submittedAt: "desc" },
        select: { rcOverlapResultId: true, isSystemResultWrong: true },
      });
      const seen = new Set();
      for (const r of rcRemarks) {
        if (seen.has(r.rcOverlapResultId)) continue;
        seen.add(r.rcOverlapResultId);
        if (r.isSystemResultWrong) rcCorrectedIds.add(r.rcOverlapResultId);
      }
    }

    // An RC can list several purchase groups, so (unrestricted breakdown
    // only) it counts once toward each group it lists.
    if (isUnrestricted) {
      for (const rc of rcRows) {
        const groups = rc.purchaseGroups?.length
          ? rc.purchaseGroups
          : ["Unassigned"];
        for (const g of groups) {
          const bucket = ensureGroup(g);
          bucket.rc.systemGenerated += 1;
          if (rc.remarksLocked) {
            bucket.rc.closed += 1;
            if (rcCorrectedIds.has(rc.id)) bucket.rc.poCorrected += 1;
          }
        }
      }
    }

    const shape = (systemGenerated, closed, poCorrected) => ({
      systemGenerated,
      closed,
      pending: Math.max(systemGenerated - closed, 0),
      ...(poCorrected !== undefined && { poCorrected }),
    });

    const byPurchaseGroup = isUnrestricted
      ? Object.values(byGroup)
          .map((g) => {
            const totalSystemGenerated =
              g.header.systemGenerated +
              g.line.systemGenerated +
              g.rc.systemGenerated;
            const totalClosed = g.header.closed + g.line.closed + g.rc.closed;
            const totalCorrected =
              g.header.poCorrected + g.line.poCorrected + g.rc.poCorrected;
            return {
              purchaseGroup: g.purchaseGroup,
              purchaseGroupName: g.purchaseGroupName,
              header: shape(
                g.header.systemGenerated,
                g.header.closed,
                g.header.poCorrected,
              ),
              line: shape(
                g.line.systemGenerated,
                g.line.closed,
                g.line.poCorrected,
              ),
              rc: shape(g.rc.systemGenerated, g.rc.closed, g.rc.poCorrected),
              total: shape(totalSystemGenerated, totalClosed, totalCorrected),
              // "POs Corrected" column of the Purchase Group Compliance table:
              // UNIQUE POs (header + line) where a buyer answered
              // "Is PO corrected? = Yes". The poCorrected fields above still
              // count POINTS and are unchanged.
              posCorrected: g.correctedPos.size,
              // Send the exact array of PO numbers to the frontend so drilldowns work
              correctedPoNumbers: [...new Set(Array.from(g.correctedPos).map((key) => key.split("\u0000")[0]))],
              correctedPoVersions: Array.from(g.correctedPos).map((key) => {
                const [po_number, source_file_ts] = key.split("\u0000");
                return { po_number, source_file_ts: source_file_ts || null };
              }),
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
- ============================================================================
- The EXACT list behind any one of the 3 numbers on a "Remarks Impact" card
- (Total Not Verified / Pending / Closed), for header / line / rc. Same
- mandatory-points + coverage logic as getRemarksImpactSummary(), so the list
- always has exactly as many rows as the card says.
 *
- body: { section: "header"|"line"|"rc", bucket: "total"|"pending"|"closed",
-         isPoCorrected?: "corrected"|"altercation" (bucket="closed" only),
-         purchaseGroup?: string[], pointNo?, page, pageSize, ...filters }
- ============================================================================
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
    const model = await getScopedModel(buildWhere(body, user));
    const lineRows = model.lineRows;

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
            key: `line-${row.id}-${row.source_file_ts?.toISOString?.() || ""}-${p.pointNo}`,
            poNumber: row.po_number,
            source_file_ts: row.source_file_ts?.toISOString?.() || null,
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
    // PoHeaderResult has no PO date/plant/type of its own - borrow it from
    // any one of that PO's line rows.
    const repLineByPo = new Map();
    for (const r of lineRows) {
      if (!repLineByPo.has(r.po_number)) repLineByPo.set(r.po_number, r);
    }

    const headerRows = model.headerRows;
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
          key: `header-${row.po_number}-${row.source_file_ts?.toISOString?.() || ""}-${p.pointNo}`,
          poNumber: row.po_number,
          source_file_ts: row.source_file_ts?.toISOString?.() || null,
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
