/**
 * po-rows.js - the ONE place that turns the scoped model into per-PO rows.
 * Both the dashboard (PO status tables + bottom list) and the PO Data page use
 * this, so a PO can never show different numbers in two places.
 *
 * There is NO "locked" concept here. Closed always means:
 *   a Verified / Not Applicable point, or a Not Verified point that has a
 *   check or a remark.   Pending = Not Verified without check/remark, or Manual.
 */
import {
  getVendorName,
  getVendorInfo,
  getPlantName,
  getPurchaseGroupName,
  getPaymentTermDescription,
  getPoTypeName,
} from "./master-data.js";
import { remarkNos } from "./data-cache.js";
import { versionKey } from "./po-version.js";
import {
  emptyCounts,
  addCounts,
  analyseRecord,
  pendingPointsOf,
  poStatusOf,
  pendingSourceOf,
} from "./po-status.js";

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

const pctOf = (verified, notVerified) =>
  verified + notVerified > 0
    ? Number(((verified / (verified + notVerified)) * 100).toFixed(1))
    : null;

// The PO Data page still has 3 tabs driven by `reviewStatus`
// (pending / in_progress / reviewed). Map the 4 statuses onto them so the tab
// counts add up to the SAME total as the dashboard.
const REVIEW_STATUS_OF = {
  pending: "pending",
  in_review: "in_progress",
  reviewed: "reviewed",
  perfect: "reviewed", // nothing to review = done
};

function newBucket() {
  return {
    totalLines: 0,
    exceptionLines: 0,
    closedLines: 0, // lines with NO pending point
    linesWithPending: 0,
    h: emptyCounts(),
    l: emptyCounts(),
    hasHeader: false,
    headerGroup: null,
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
    poDate: null,
  };
}

/**
 * @returns {{ rows: object[], headerTotals: object, lineTotals: object }}
 */
export function buildPoRows(model, { includeLineDetails = true } = {}) {
  const byPo = new Map();
  const headerTotals = emptyCounts();
  const lineTotals = emptyCounts();

  for (const row of model.lineRows) {
    const poKey = versionKey(row.po_number || "Unassigned", row.source_file_ts);
    let b = byPo.get(poKey);
    if (!b) {
      b = newBucket();
      const hr = model.headerByPo.get(versionKey(row.po_number, row.source_file_ts));
      if (hr) {
        b.hasHeader = true;
        b.headerGroup = hr.purchase_group || null;
        b.h = analyseRecord(
          hr.results,
          hr.checkedPoints,
          remarkNos(model.headerRemarks, versionKey(hr.po_number, hr.source_file_ts)),
        );
      }
      byPo.set(poKey, b);
    }

    const lc = analyseRecord(
      row.results,
      row.checkedPoints,
      remarkNos(model.lineRemarks, row.id),
    );
    addCounts(b.l, lc);

    const linePending = pendingPointsOf(lc);
    b.totalLines += 1;
    if (lc.notVerified > 0) b.exceptionLines += 1;
    if (linePending > 0) b.linesWithPending += 1;
    else b.closedLines += 1;

    const li = lineItemOf(row);
    if (li) b.lineItems.add(li);

    if (includeLineDetails) {
      b.lineItemDetails.push({
        lineItem: li || row.po_material_number || "—",
        poLineItem: row.po_line_item || null,
        source_file_ts: row.source_file_ts?.toISOString?.() || null,
        materialCode: row.material_code || null,
        closed: linePending === 0,
        hasException: lc.notVerified > 0,
        notVerifiedPoints: lc.notVerified,
        closedPoints: lc.nvClosed,
        pendingPoints: linePending,
        lineStatus: poStatusOf(emptyCounts(), lc),
        remarksLockedAt: null,
        netValue: parseNum(row.net_value),
      });
    }

    if (row.purchase_req) b.prs.add(row.purchase_req);
    if (row.tax_code) b.taxCodes.add(row.tax_code);
    const vendor = getVendorInfo(row.vendor_code);
    const gstin = row.GSTInOfVendor || vendor?.gstin || "";
    if (gstin) b.gstins.add(gstin);
    b.valueExposure += parseNum(row.net_value);
    b.vendorCode = b.vendorCode || row.vendor_code || null;
    b.vendorName = b.vendorName || row.nameOfVendor || vendor?.name || null;
    b.poType = b.poType || row.po_type || null;
    b.plant = b.plant || row.plant || null;
    b.purchaseGroup = b.purchaseGroup || row.purchase_group || null;
    b.paymentTerm = b.paymentTerm || row.payment_term || null;
    b.poDate = b.poDate || row.po_created_date || null;
  }

  const rows = [];
  for (const [rowKey, v] of byPo) {
    const sourceFileTs = rowKey.split("\u0000").slice(1).join("\u0000");
    const poNumber = rowKey.split("\u0000")[0];
    addCounts(headerTotals, v.h);
    addCounts(lineTotals, v.l);

    const headerPending = pendingPointsOf(v.h);
    const linePending = pendingPointsOf(v.l);
    const poStatus = poStatusOf(v.h, v.l);
    const group = v.purchaseGroup || v.headerGroup;

    const out = {
      poNumber,
      source_file_ts: sourceFileTs || null,
      poDate: v.poDate,
      vendorCode: v.vendorCode,
      vendorName: v.vendorName || getVendorName(v.vendorCode),
      poType: v.poType,
      poTypeName: getPoTypeName(v.poType),
      plant: v.plant,
      plantName: getPlantName(v.plant),
      purchaseGroup: group,
      purchaseGroupName: getPurchaseGroupName(group),
      paymentTerm: v.paymentTerm,
      paymentTermDescription: getPaymentTermDescription(v.paymentTerm),

      // ---- status + why --------------------------------------------------
      poStatus, // perfect | reviewed | in_review | pending
      pendingSource: pendingSourceOf(v.h, v.l), // header | line | both | none
      totalNotVerifiedPoints: v.h.notVerified + v.l.notVerified,
      totalClosedNotVerified: v.h.nvClosed + v.l.nvClosed,
      totalPendingPoints: headerPending + linePending,

      // ---- HEADER level --------------------------------------------------
      headerNotVerified: v.h.notVerified,
      headerClosedPoints: v.h.nvClosed,
      headerPendingPoints: headerPending,
      headerManualPoints: v.h.manual,
      headerVerifiedPoints: v.h.verified,
      headerCompliancePct: pctOf(v.h.verified, v.h.notVerified),
      headerClosed: v.hasHeader && headerPending === 0,
      // legacy alias for any screen still reading the old field; now simply
      // means "no pending header point" (no lock concept).
      headerLocked: v.hasHeader && headerPending === 0,
      hasHeaderData: v.hasHeader,

      // ---- LINE level ----------------------------------------------------
      lineNotVerified: v.l.notVerified,
      lineClosedPoints: v.l.nvClosed,
      linePendingPoints: linePending,
      lineManualPoints: v.l.manual,
      lineVerifiedPoints: v.l.verified,
      lineCompliancePct: pctOf(v.l.verified, v.l.notVerified),
      linesWithPendingCount: v.linesWithPending,

      // ---- legacy fields (same names, NO lock meaning any more) -----------
      totalLineCount: v.totalLines,
      exceptionLineCount: v.exceptionLines,
      compliancePct: pctOf(v.l.verified, v.l.notVerified),
      closedLineCount: v.closedLines,
      openLineCount: v.totalLines - v.closedLines,
      closedPct:
        v.totalLines > 0
          ? Number(((v.closedLines / v.totalLines) * 100).toFixed(1))
          : null,
      reviewStatus: REVIEW_STATUS_OF[poStatus],
      isFullyClosed: v.totalLines > 0 && v.closedLines === v.totalLines,
      distinctLineItems: v.lineItems.size,
      lineItems: [...v.lineItems].sort(),
      purchase_req: [...v.prs].join(", "),
      taxCode: [...v.taxCodes].join(", "),
      vendorGstin: [...v.gstins].join(", "),
      valueExposure: Number(v.valueExposure.toFixed(2)),
    };

    if (includeLineDetails) {
      out.lineItemDetails = [...v.lineItemDetails].sort((a, c) =>
        String(a.lineItem).localeCompare(String(c.lineItem), undefined, {
          numeric: true,
        }),
      );
    }
    rows.push(out);
  }

  return { rows, headerTotals, lineTotals };
}
