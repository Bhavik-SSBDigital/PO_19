import { prisma } from "../lib/prisma.js";
import {
  ensureSeverityLoaded,
  classifyPoint,
  severityOf,
} from "../utility/severity.js";
import {
  getVendorName,
  getVendorInfo,
  getPlantName,
  getPurchaseGroupName,
  getPurchaseGroupCode,
  getPurchaseGroupsList,
  searchPurchaseGroupCodes,
  getPaymentTermDescription,
  getPoTypeName,
  getPoTypesList,
  getPlantsList,
} from "../utility/master-data.js";

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

// A line item counts as CLOSED once `remarksLocked` is true on the
// AuditResult row itself — this is the actual "checked" flag the app sets
// (see schema comment: "Once true, no remarks can be added, edited, or
// deleted against ANY point on this line item"). NOTE: this deliberately
// does NOT look at `verificationWorkflow` — in real data that relation is
// consistently null (no VerificationWorkflow rows are being created), so
// keying off it made every PO permanently "open" regardless of how many
// lines were actually locked/reviewed. remarksLocked is the field that is
// actually populated and actually reflects reviewer sign-off.
const rowIsClosed = (row) => row.remarksLocked === true;

const ROW_SELECT = {
  id: true,
  po_number: true,
  po_line_item: true,
  po_material_number: true,
  purchase_req: true,
  po_type: true,
  po_created_date: true,
  plant: true,
  purchase_group: true,
  vendor_code: true,
  nameOfVendor: true,
  material_code: true,
  net_value: true,
  payment_term: true,
  results: true,
  tax_code: true,
  GSTInOfVendor: true,
  // This is what lets us tell CLOSED vs OPEN per line item, and roll that
  // up into a per-PO "3/8 closed" progress figure + line-item breakdown
  // below. See rowIsClosed above for why remarksLocked (not
  // verificationWorkflow) is the source.
  remarksLocked: true,
  remarksLockedBy: true,
  remarksLockedAt: true,
};

// Fields returned for the HEADER-LEVEL-ONLY endpoint. Deliberately does
// NOT include po_line_item, po_material_number, or anything else that
// identifies a specific line — header-level data is one row per PO
// NUMBER, full stop. See getPoHeaderWiseDetails below.
const HEADER_ROW_SELECT = {
  id: true,
  po_number: true,
  vendor_code: true,
  purchase_group: true,
  po_type: true,
  results: true,
  remarksLocked: true,
  remarksLockedBy: true,
  remarksLockedAt: true,
  auditedOn: true,
};

function buildBaseWhere(body = {}) {
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
  if (Array.isArray(body.poType) && body.poType.length) {
    where.po_type = { in: body.poType };
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
  if (body.vendorSearch) {
    where.OR = [
      ...(where.OR || []),
      { vendor_code: { contains: body.vendorSearch, mode: "insensitive" } },
      { nameOfVendor: { contains: body.vendorSearch, mode: "insensitive" } },
    ];
  }

  return where;
}

function rowHasException(row) {
  return (row.results || []).some((p) => classifyPoint(p) === "notVerified");
}

// Used ONLY when the advanced filter bar supplies a severity/pointNo — in
// that case we still only want to surface exception points matching that
// specific severity/point (that's the whole point of the filter), so a PO
// with no matching exception point correctly drops out even in "all POs"
// mode.
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

function newBucket() {
  return {
    totalLines: 0, // every PO line seen for this PO (compliant + exception)
    exceptionLines: 0, // lines with at least one notVerified point
    verifiedPoints: 0, // point-level tally, across every line, for compliance %
    notVerifiedPoints: 0,
    closedLines: 0, // lines whose remarksLocked === true
    openLines: 0, // every other line (remarksLocked !== true)
    lineItems: new Set(),
    // Per-line-item breakdown, so the frontend's "click PO -> see which
    // line item is closed and which isn't" dialog doesn't need a second
    // round-trip. One entry per AuditResult row folded into this PO.
    lineItemDetails: [],
    prs: new Set(),
    taxCodes: new Set(),
    gstins: new Set(),
    valueExposure: 0, // sum of net_value across ALL lines of this PO
    vendorCode: null,
    vendorName: null,
    poType: null,
    plant: null,
    purchaseGroup: null,
    paymentTerm: null,
  };
}

function compliancePctOf(b) {
  const denom = b.verifiedPoints + b.notVerifiedPoints;
  return denom > 0
    ? Number(((b.verifiedPoints / denom) * 100).toFixed(1))
    : null;
}

// Distinct from compliancePct (which is point-level "verified vs
// notVerified" across audit checks). This is the review/closure progress —
// how many of the PO's line items have remarksLocked === true — which is
// what the frontend's three tabs and progress bar are driven by.
function closedPctOf(b) {
  return b.totalLines > 0
    ? Number(((b.closedLines / b.totalLines) * 100).toFixed(1))
    : null;
}

// Three-way status for a PO, based on how many of its line items are
// closed (remarksLocked === true) out of its total line count:
//   - "pending"     : closedLines === 0        -> nothing started yet
//   - "in_progress" : 0 < closedLines < total   -> e.g. 3/8 closed
//   - "reviewed"    : closedLines === total     -> fully closed
// A PO with zero lines (shouldn't normally happen) falls back to "pending".
function reviewStatusOf(b) {
  if (b.totalLines === 0 || b.closedLines === 0) return "pending";
  if (b.closedLines === b.totalLines) return "reviewed";
  return "in_progress";
}

/**
 * PO-wise data for the standalone PO Data page (/po-data).
 *
 * Returns EVERY PO line under `where` — compliant or not — unlike the
 * dashboard's embedded table (fed separately by getExecutiveSummary's
 * `charts.poWiseExceptions`, which is untouched and still exception-only).
 * If the advanced filter bar sends a severity/pointNo, a PO is only kept
 * when it has a matching exception point (see pointMatchesAdvancedFilters);
 * with no such filter, every PO in scope is returned regardless of its
 * compliance status.
 *
 * This is the LINE-ITEM view — each PO carries lineItemDetails with a
 * po_line_item per entry. For a header-only view (no line item anywhere in
 * the response), use getPoHeaderWiseDetails below instead.
 */
export const getPoWiseExceptions = async (req, res) => {
  try {
    await ensureSeverityLoaded();

    const body = req.body || {};
    const where = buildBaseWhere(body);
    const user = req.user || {};

    if (user.isAdmin || user.isProcurementManager) {
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

    const rows = await prisma.auditResult.findMany({
      where,
      select: ROW_SELECT,
    });

    const severity = body.severity;
    const pointNo = body.pointNo;
    const hasPointFilter = Boolean(severity || pointNo);

    const byPo = {};
    for (const row of rows) {
      // Only skip a row when the user explicitly asked to filter by
      // severity/pointNo and this row has no exception point matching it.
      // Otherwise every row — compliant or not — is folded into its PO's
      // bucket, which is what makes this "all POs" instead of
      // "exceptions only".
      if (hasPointFilter) {
        const anyMatch = (row.results || []).some((p) =>
          pointMatchesAdvancedFilters(p, { severity, pointNo }),
        );
        if (!anyMatch) continue;
      }

      const poKey = row.po_number || "Unassigned";
      const vendor = getVendorInfo(row.vendor_code);
      byPo[poKey] = byPo[poKey] || newBucket();
      const b = byPo[poKey];

      const closed = rowIsClosed(row);
      const hasException = rowHasException(row);

      b.totalLines += 1;
      if (hasException) b.exceptionLines += 1;
      if (closed) b.closedLines += 1;
      else b.openLines += 1;

      for (const p of row.results || []) {
        const status = classifyPoint(p);
        if (status === "verified") b.verifiedPoints += 1;
        else if (status === "notVerified") b.notVerifiedPoints += 1;
      }

      const li = lineItemOf(row);
      if (li) b.lineItems.add(li);

      b.lineItemDetails.push({
        lineItem: li || row.po_material_number || "—",
        poLineItem: row.po_line_item || null,
        materialCode: row.material_code || null,
        closed,
        hasException,
        remarksLockedAt: row.remarksLockedAt || null,
        netValue: parseNum(row.net_value),
      });

      if (row.purchase_req) b.prs.add(row.purchase_req);
      if (row.tax_code) b.taxCodes.add(row.tax_code);
      const gstin = row.GSTInOfVendor || vendor?.gstin || "";
      if (gstin) b.gstins.add(gstin);
      b.valueExposure += parseNum(row.net_value);
      b.vendorCode = b.vendorCode || row.vendor_code || null;
      b.vendorName = b.vendorName || row.nameOfVendor || vendor?.name || null;
      b.poType = b.poType || row.po_type || null;
      b.plant = b.plant || row.plant || null;
      b.purchaseGroup = b.purchaseGroup || row.purchase_group || null;
      b.paymentTerm = b.paymentTerm || row.payment_term || null;
    }

    const results = Object.entries(byPo)
      // Worst-compliance / most-exceptions first, same ordering feel as
      // before, just no longer excluding clean POs.
      .sort((a, b) => b[1].exceptionLines - a[1].exceptionLines)
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
        totalLineCount: v.totalLines,
        exceptionLineCount: v.exceptionLines,
        compliancePct: compliancePctOf(v),
        // Review-workflow progress (per PO), NOT audit compliance:
        closedLineCount: v.closedLines,
        openLineCount: v.openLines,
        closedPct: closedPctOf(v),
        reviewStatus: reviewStatusOf(v), // "pending" | "in_progress" | "reviewed"
        isFullyClosed: v.totalLines > 0 && v.closedLines === v.totalLines, // back-compat alias
        lineItemDetails: [...v.lineItemDetails].sort((a, c) =>
          String(a.lineItem).localeCompare(String(c.lineItem), undefined, {
            numeric: true,
          }),
        ),
        distinctLineItems: v.lineItems.size,
        lineItems: [...v.lineItems].sort(),
        purchase_req: [...v.prs].join(", "),
        taxCode: [...v.taxCodes].join(", "),
        vendorGstin: [...v.gstins].join(", "),
        valueExposure: Number(v.valueExposure.toFixed(2)),
      }));

    return res.status(200).json({
      total: results.length,
      results,
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

/**
 * NEW — PO Header-Level Details, PO-Number-wise, with NO po_line_item
 * anywhere in the request or response. One row per PO number, sourced
 * entirely from PoHeaderResult (which is itself already one-row-per-PO —
 * see prisma schema). This is what the search page / any "header level"
 * navigation should call instead of getPoWiseExceptions whenever the user
 * is looking at header-level detail, so a line item can never leak in.
 *
 * Same purchase-group scoping rules as getPoWiseExceptions (Buyer locked
 * to own group; Admin/PM can see all or narrow by group).
 *
 * Body accepts: poNumber (exact or partial via poNumberSearch), vendorCode,
 * purchaseGroup[], poType[]. No line-item-shaped filters (materialCode,
 * poDateFrom/To acting on line data, etc.) are accepted here on purpose —
 * PoHeaderResult doesn't carry those columns. If you need date-range
 * filtering on header data, that requires adding those columns to
 * PoHeaderResult first (not present in the schema I was given).
 */
export const getPoHeaderWiseDetails = async (req, res) => {
  try {
    await ensureSeverityLoaded();

    const body = req.body || {};
    const user = req.user || {};
    const where = {};

    if (user.isAdmin || user.isProcurementManager) {
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
      where.po_number = body.poNumber; // exact match - header table is unique per po_number
    } else if (body.poNumberSearch) {
      where.po_number = { contains: body.poNumberSearch, mode: "insensitive" };
    }
    if (body.vendorCode) where.vendor_code = body.vendorCode;
    if (Array.isArray(body.poType) && body.poType.length) {
      where.po_type = { in: body.poType };
    }

    const rows = await prisma.poHeaderResult.findMany({
      where,
      select: HEADER_ROW_SELECT,
      orderBy: { po_number: "asc" },
    });

    const results = rows.map((row) => {
      const verifiedPoints = (row.results || []).filter(
        (p) => classifyPoint(p) === "verified",
      ).length;
      const notVerifiedPoints = (row.results || []).filter(
        (p) => classifyPoint(p) === "notVerified",
      ).length;
      const denom = verifiedPoints + notVerifiedPoints;
      const vendor = getVendorInfo(row.vendor_code);

      return {
        poNumber: row.po_number,
        vendorCode: row.vendor_code,
        vendorName: vendor?.name || getVendorName(row.vendor_code),
        poType: row.po_type,
        poTypeName: getPoTypeName(row.po_type),
        purchaseGroup: row.purchase_group,
        purchaseGroupName: getPurchaseGroupName(row.purchase_group),
        // Header-level points only (see utility/point-scope.js) - every
        // entry here already excludes any concept of a line item, because
        // PoHeaderResult.results only ever holds header points.
        points: (row.results || []).map((p) => ({
          pointNo: p.pointNo,
          status: classifyPoint(p),
          severity: severityOf(p.pointNo),
          remarks: p.remarks || [],
        })),
        verifiedPoints,
        notVerifiedPoints,
        compliancePct:
          denom > 0
            ? Number(((verifiedPoints / denom) * 100).toFixed(1))
            : null,
        closed: row.remarksLocked === true,
        closedBy: row.remarksLockedBy || null,
        closedAt: row.remarksLockedAt || null,
        auditedOn: row.auditedOn,
      };
    });

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

/**
 * Purchasing-group {code, name} list — Admin/PM only, feeds the group
 * Autocomplete. A Buyer's group is fixed server-side regardless, so they
 * have no use for (and shouldn't be able to enumerate) the full list.
 */
export const getPurchaseGroupsForFilter = async (req, res) => {
  const user = req.user || {};
  if (!(user.isAdmin || user.isProcurementManager)) {
    return res.status(403).json({ message: "Not authorized" });
  }
  return res.status(200).json({ groups: getPurchaseGroupsList() });
};

/**
 * PO Type {code, name} list, sourced from the real PO_TYPE_NAMES map in
 * master-data.js. Available to anyone who can reach the PO Data page
 * (Buyer/Admin/PM) since PO type isn't a scoped/sensitive dimension the
 * way purchasing group is.
 */
export const getPoTypesForFilter = async (req, res) => {
  return res.status(200).json({ poTypes: getPoTypesList() });
};

/**
 * Plant {code, name} list, sourced from the real Plant Master file. Same
 * availability as PO types — not scoped/sensitive.
 */
export const getPlantsForFilter = async (req, res) => {
  return res.status(200).json({ plants: getPlantsList() });
};
