import { prisma } from "../lib/prisma.js";
import { resolvePoHeader } from "../utility/po-version.js";
import { ensureSeverityLoaded, classifyPoint } from "../utility/severity.js";
import {
  getVendorInfo,
  getVendorName,
  getPlantName,
  getPurchaseGroupName,
  getPurchaseGroupCode,
  getPaymentTermDescription,
  getPoTypeName,
} from "../utility/master-data.js";
import { getHeaderForPo } from "../utility/header-results.js";
import { computeTally } from "../utility/point-tally.js";
import {
  findSystemPoint,
  normalizeBuyerResult,
} from "../utility/system-result.js";
// Closure tallies must only count the system's "Not Verified" points as
// mandatory - see utility/not-verified-scope.js.
import { getMandatoryPoints } from "../utility/not-verified-scope.js";

const SUBMITTER_SELECT = {
  id: true,
  username: true,
  firstName: true,
  lastName: true,
};

function canAccessHeader(user, headerRecord) {
  if (user.isAdmin || user.isProcurementManager || user.isSsbDigital)
    return true;
  if (user.isBuyer) {
    const ownGroup = getPurchaseGroupCode(user.username);
    return !!ownGroup && headerRecord.purchase_group === ownGroup;
  }
  return false;
}

function canWriteHeaderRemarks(user, headerRecord) {
  if (!user.isBuyer) return false;
  const ownGroup = getPurchaseGroupCode(user.username);
  return !!ownGroup && headerRecord.purchase_group === ownGroup;
}

// Header-level counterpart to recomputeAndMaybeAutoClose() in
// po-remarks-controller.js. Same rule: union of checkedPoints and
// distinct remarked pointNos must cover every MANDATORY point (the
// system's "Not Verified" subset - see utility/not-verified-scope.js) in
// PoHeaderResult.results before the PO's header auto-closes. A point the
// system already marked Verified/N-A/Manual Review never has to be
// touched by the buyer.
async function recomputeAndMaybeAutoCloseHeader(po_number, sourceFileTs, userId) {
  const fresh = await resolvePoHeader(po_number, sourceFileTs);
  if (!fresh) return null;

  const remarkedPointNos = (
    await prisma.poHeaderRemark.findMany({
      where: { po_number, source_file_ts: fresh.source_file_ts },
      distinct: ["pointNo"],
      select: { pointNo: true },
    })
  ).map((r) => r.pointNo);

  // Only the system's "Not Verified" points are mandatory for closure -
  // an already Verified/N-A/Manual Review point never blocks (or counts
  // toward) this tally. See utility/not-verified-scope.js.
  const tally = computeTally(
    getMandatoryPoints(fresh.results),
    fresh.checkedPoints,
    remarkedPointNos,
  );

  if (tally.isComplete && !fresh.remarksLocked) {
    await prisma.poHeaderResult.update({
      where: { id: fresh.id },
      data: {
        remarksLocked: true,
        remarksLockedBy: userId,
        remarksLockedAt: new Date(),
      },
    });
    return { ...tally, remarksLocked: true, autoClosed: true };
  }

  return { ...tally, remarksLocked: fresh.remarksLocked, autoClosed: false };
}

export const getPoHeaderSummary = async (req, res) => {
  try {
    await ensureSeverityLoaded();
    const user = req.user || {};
    const { po_number } = req.body || {};
    if (!po_number) {
      return res.status(400).json({ message: "po_number is required" });
    }

    const requestedTs = req.body?.source_file_ts ? new Date(req.body.source_file_ts) : null;
    if (requestedTs && Number.isNaN(requestedTs.getTime())) {
      return res.status(400).json({ message: "Invalid source_file_ts" });
    }

    // Return every version timestamp for the selector, while resolving the
    // requested snapshot (or latest snapshot when no timestamp was passed).
    const [auditVersions, headerVersions] = await Promise.all([
      prisma.auditResult.findMany({
        where: { type: "PO", po_number, source_file_ts: { not: null } },
        select: { source_file_ts: true },
        distinct: ["source_file_ts"],
        orderBy: { source_file_ts: "desc" },
      }),
      prisma.poHeaderResult.findMany({
        where: { po_number, source_file_ts: { not: null } },
        select: { source_file_ts: true },
        distinct: ["source_file_ts"],
        orderBy: { source_file_ts: "desc" },
      }),
    ]);
    const versionMap = new Map();
    for (const { source_file_ts } of [...auditVersions, ...headerVersions]) {
      if (source_file_ts) versionMap.set(source_file_ts.toISOString(), source_file_ts);
    }
    const availableSourceFileTimestamps = [...versionMap.values()].sort(
      (a, b) => b.getTime() - a.getTime(),
    );
    if (
      requestedTs &&
      !availableSourceFileTimestamps.some((ts) => ts.getTime() === requestedTs.getTime())
    ) {
      return res.status(404).json({ message: "PO version not found for that file timestamp" });
    }
    const sourceFileTs = requestedTs || availableSourceFileTimestamps[0] || null;
    const headerRecord = sourceFileTs
      ? await prisma.poHeaderResult.findFirst({ where: { po_number, source_file_ts: sourceFileTs } })
      : await resolvePoHeader(po_number);

    const lineRows = await prisma.auditResult.findMany({
      where: { type: "PO", po_number, ...(sourceFileTs ? { source_file_ts: sourceFileTs } : {}) },
      select: {
        id: true,
        source_file_ts: true,
        po_line_item: true,
        po_material_number: true,
        material_code: true,
        material_disc: true,
        net_value: true,
        results: true,
        remarksLocked: true,
        remarksLockedAt: true,
        vendor_code: true,
        purchase_group: true,
        po_type: true,
      },
      orderBy: [{ source_file_ts: "desc" }, { po_line_item: "asc" }],
    });

    if (!headerRecord && lineRows.length === 0) {
      return res.status(404).json({ message: "PO not found" });
    }

    const firstLine = lineRows[0];
    const scopeGroup = headerRecord?.purchase_group || firstLine?.purchase_group || null;
    if (
      !(user.isAdmin || user.isProcurementManager || user.isSsbDigital) &&
      (!user.isBuyer || getPurchaseGroupCode(user.username) !== scopeGroup)
    ) {
      return res
        .status(403)
        .json({ message: "Not authorized to view this PO" });
    }

    const header = await getHeaderForPo(po_number, user, sourceFileTs);
    const headerRemarksByPoint = header.headerRemarksByPoint;

    const vendor = getVendorInfo(firstLine?.vendor_code || headerRecord?.vendor_code);

    const lineItems = lineRows.map((row) => ({
      id: row.id,
      source_file_ts: row.source_file_ts?.toISOString?.() || null,
      lineItem:
        row.po_line_item ||
        row.po_material_number?.split("-").slice(1).join("-") ||
        "-",
      materialCode: row.material_code,
      materialDesc: row.material_disc,
      netValue: row.net_value,
      hasException: (row.results || []).some(
        (p) => classifyPoint(p) === "notVerified",
      ),
      closed: !!row.remarksLocked,
      closedAt: row.remarksLockedAt,
    }));

    return res.status(200).json({
      scope: "po-header",
      po_number,
      source_file_ts: sourceFileTs?.toISOString?.() || null,
      available_source_file_timestamps: availableSourceFileTimestamps.map((ts) => ts.toISOString()),
      vendorCode: headerRecord?.vendor_code || vendor?.code || null,
      vendorName: vendor?.name || getVendorName(headerRecord?.vendor_code),
      vendorGstin: vendor?.gstin || "",
      poType: headerRecord?.po_type || null,
      poTypeName: getPoTypeName(headerRecord?.po_type),
      purchaseGroup: scopeGroup,
      purchaseGroupName: getPurchaseGroupName(scopeGroup),
      header, // now also carries checkedPoints + tally (see header-results.js)
      headerRemarksByPoint,
      lineItemCount: lineItems.length,
      lineItems,
    });
  } catch (error) {
    console.error("Error in getPoHeaderSummary:", error);
    return res
      .status(500)
      .json({ message: "Failed to fetch PO header summary" });
  }
};

export const getPoHeaderRemarks = async (req, res) => {
  try {
    const user = req.user || {};
    if (
      !(
        user.isBuyer ||
        user.isAdmin ||
        user.isProcurementManager ||
        user.isSsbDigital
      )
    ) {
      return res.status(403).json({ message: "Not authorized" });
    }

    const { po_number, pointNo } = req.body || {};
    if (!po_number) {
      return res.status(400).json({ message: "po_number is required" });
    }

    const headerRecord = await resolvePoHeader(po_number, req.body?.source_file_ts);
    if (headerRecord && !canAccessHeader(user, headerRecord)) {
      return res
        .status(403)
        .json({ message: "Not authorized to view this PO's header remarks" });
    }

    const where = { po_number, ...(headerRecord?.source_file_ts ? { source_file_ts: headerRecord.source_file_ts } : {}) };
    if (pointNo !== undefined && pointNo !== null && pointNo !== "") {
      where.pointNo = Number(pointNo);
    }

    if (user.isBuyer && !(user.isAdmin || user.isProcurementManager)) {
      where.submittedBy = user.id || user.userId;
    }

    const remarks = await prisma.poHeaderRemark.findMany({
      where,
      include: { submitter: { select: SUBMITTER_SELECT } },
      orderBy: { submittedAt: "desc" },
    });

    let tally = null;
    if (headerRecord) {
      const remarkedPointNos = (
        await prisma.poHeaderRemark.findMany({
          where: { po_number, source_file_ts: headerRecord.source_file_ts },
          distinct: ["pointNo"],
          select: { pointNo: true },
        })
      ).map((r) => r.pointNo);
      tally = computeTally(
        getMandatoryPoints(headerRecord.results),
        headerRecord.checkedPoints,
        remarkedPointNos,
      );
    }

    return res.status(200).json({
      total: remarks.length,
      remarks,
      remarksLocked: headerRecord?.remarksLocked ?? false,
      canWrite: headerRecord
        ? canWriteHeaderRemarks(user, headerRecord)
        : false,
      checkedPoints: headerRecord?.checkedPoints ?? [],
      tally,
    });
  } catch (error) {
    console.error("Error in getPoHeaderRemarks:", error);
    return res.status(500).json({ message: "Failed to fetch header remarks" });
  }
};

export const submitPoHeaderRemark = async (req, res) => {
  try {
    const user = req.user || {};
    if (!user.isBuyer) {
      return res
        .status(403)
        .json({ message: "Only buyers can submit remarks" });
    }

    const { po_number, pointNo, remark, isSystemResultWrong, buyerResult } =
      req.body || {};
    if (!po_number) {
      return res.status(400).json({ message: "po_number is required" });
    }
    if (!remark || !String(remark).trim()) {
      return res.status(400).json({ message: "Remark text is required" });
    }
    if (pointNo === undefined || pointNo === null || pointNo === "") {
      return res.status(400).json({ message: "pointNo is required" });
    }

    const headerRecord = await resolvePoHeader(po_number, req.body?.source_file_ts);
    if (!headerRecord) {
      return res
        .status(404)
        .json({ message: "PO header record not found for this PO number" });
    }
    if (!canWriteHeaderRemarks(user, headerRecord)) {
      return res.status(403).json({
        message:
          "You can only submit header remarks for POs in your own purchasing group",
      });
    }
    if (headerRecord.remarksLocked) {
      return res.status(403).json({
        message:
          "This PO's header checks have been marked as checked. Remarks are locked.",
      });
    }

    const userId = user.id || user.userId;
    if (!userId) {
      return res
        .status(401)
        .json({ message: "Unable to identify submitting user" });
    }

    const existingOwn = await prisma.poHeaderRemark.findFirst({
      where: { po_number, source_file_ts: headerRecord.source_file_ts, pointNo: Number(pointNo), submittedBy: userId },
    });
    if (existingOwn) {
      return res.status(409).json({
        message:
          "You already have a remark on this point. Edit your existing remark instead.",
        remarkId: existingOwn.id,
      });
    }

    const systemPoint = findSystemPoint(headerRecord.results, pointNo);
    const resolvedBuyerResult = normalizeBuyerResult(buyerResult, systemPoint);
    const resolvedIsWrong = Boolean(isSystemResultWrong);

    const created = await prisma.poHeaderRemark.create({
      data: {
        po_number,
        source_file_ts: headerRecord.source_file_ts,
        pointNo: Number(pointNo),
        remark: String(remark).trim(),
        submittedBy: userId,
        isSystemResultWrong: resolvedIsWrong,
        buyerResult: resolvedBuyerResult,
      },
      include: { submitter: { select: SUBMITTER_SELECT } },
    });

    if ((headerRecord.checkedPoints || []).includes(Number(pointNo))) {
      await prisma.poHeaderResult.update({
        where: { id: headerRecord.id },
        data: {
          checkedPoints: headerRecord.checkedPoints.filter(
            (p) => p !== Number(pointNo),
          ),
        },
      });
    }

    const tally = await recomputeAndMaybeAutoCloseHeader(po_number, headerRecord.source_file_ts, userId);

    return res.status(201).json({
      message: tally?.autoClosed
        ? "Header remark submitted. Every header point on this PO is now covered — it has been closed automatically."
        : "Header remark submitted",
      remark: created,
      tally,
    });
  } catch (error) {
    console.error("Error in submitPoHeaderRemark:", error);
    return res.status(500).json({ message: "Failed to submit header remark" });
  }
};

export const updatePoHeaderRemark = async (req, res) => {
  try {
    const user = req.user || {};
    if (!user.isBuyer) {
      return res.status(403).json({ message: "Only buyers can edit remarks" });
    }

    const { id, remark, isSystemResultWrong, buyerResult } = req.body || {};
    if (!id) return res.status(400).json({ message: "Remark id is required" });
    if (!remark || !String(remark).trim()) {
      return res.status(400).json({ message: "Remark text is required" });
    }

    const existing = await prisma.poHeaderRemark.findUnique({
      where: { id },
      include: { poHeaderResult: true },
    });
    if (!existing) return res.status(404).json({ message: "Remark not found" });

    const userId = user.id || user.userId;
    if (existing.submittedBy !== userId) {
      return res
        .status(403)
        .json({ message: "You can only edit your own remark" });
    }
    if (!canWriteHeaderRemarks(user, existing.poHeaderResult)) {
      return res
        .status(403)
        .json({ message: "Not authorized for this PO's header" });
    }
    if (existing.poHeaderResult.remarksLocked) {
      return res.status(403).json({
        message:
          "This PO's header checks have been marked as checked. Remarks are locked.",
      });
    }

    const systemPoint = findSystemPoint(
      existing.poHeaderResult.results,
      existing.pointNo,
    );
    const data = { remark: String(remark).trim() };
    if (isSystemResultWrong !== undefined)
      data.isSystemResultWrong = Boolean(isSystemResultWrong);
    if (buyerResult !== undefined)
      data.buyerResult = normalizeBuyerResult(buyerResult, systemPoint);

    const updated = await prisma.poHeaderRemark.update({
      where: { id },
      data,
      include: { submitter: { select: SUBMITTER_SELECT } },
    });

    return res
      .status(200)
      .json({ message: "Header remark updated", remark: updated });
  } catch (error) {
    console.error("Error in updatePoHeaderRemark:", error);
    return res.status(500).json({ message: "Failed to update header remark" });
  }
};

export const deletePoHeaderRemark = async (req, res) => {
  try {
    const user = req.user || {};
    if (!user.isBuyer) {
      return res
        .status(403)
        .json({ message: "Only buyers can delete remarks" });
    }

    const { id } = req.params;
    if (!id) return res.status(400).json({ message: "Remark id is required" });

    const remark = await prisma.poHeaderRemark.findUnique({
      where: { id },
      include: { poHeaderResult: true },
    });
    if (!remark) return res.status(404).json({ message: "Remark not found" });

    if (remark.poHeaderResult.remarksLocked) {
      return res.status(403).json({
        message:
          "This PO's header checks have been marked as checked. Remarks are locked.",
      });
    }

    const userId = user.id || user.userId;
    if (remark.submittedBy !== userId) {
      return res
        .status(403)
        .json({ message: "You can only delete your own remark" });
    }

    await prisma.poHeaderRemark.delete({ where: { id } });
    return res.status(200).json({ message: "Header remark deleted" });
  } catch (error) {
    console.error("Error in deletePoHeaderRemark:", error);
    return res.status(500).json({ message: "Failed to delete header remark" });
  }
};

export const setPoHeaderCheckedStatus = async (req, res) => {
  try {
    const user = req.user || {};
    if (!(user.isBuyer || user.isAdmin || user.isProcurementManager)) {
      return res.status(403).json({ message: "Not authorized" });
    }

    const { po_number, checked } = req.body || {};
    if (!po_number) {
      return res.status(400).json({ message: "po_number is required" });
    }
    if (typeof checked !== "boolean") {
      return res.status(400).json({ message: "checked (boolean) is required" });
    }

    const headerRecord = await resolvePoHeader(po_number, req.body?.source_file_ts);
    if (!headerRecord) {
      return res
        .status(404)
        .json({ message: "PO header record not found for this PO number" });
    }
    if (!canAccessHeader(user, headerRecord)) {
      return res
        .status(403)
        .json({ message: "Not authorized for this PO's header" });
    }

    const userId = user.id || user.userId;
    const updated = await prisma.poHeaderResult.update({
      where: { id: headerRecord.id },
      data: checked
        ? {
            remarksLocked: true,
            remarksLockedBy: userId,
            remarksLockedAt: new Date(),
          }
        : {
            remarksLocked: false,
            remarksLockedBy: null,
            remarksLockedAt: null,
          },
    });

    return res.status(200).json({
      message: checked
        ? "PO header marked as checked. This applies to the whole PO — every line item will show it as closed."
        : "PO header reopened.",
      source_file_ts: updated.source_file_ts?.toISOString?.() || null,
      remarksLocked: updated.remarksLocked,
      remarksLockedAt: updated.remarksLockedAt,
    });
  } catch (error) {
    console.error("Error in setPoHeaderCheckedStatus:", error);
    return res
      .status(500)
      .json({ message: "Failed to update PO header checked status" });
  }
};

/**
 * POST /po-header-remarks/toggle-point-checked
 * Body: { po_number, pointNo, checked }
 * Header-level counterpart to togglePointChecked in po-remarks-controller.js.
 */
export const toggleHeaderPointChecked = async (req, res) => {
  try {
    const user = req.user || {};
    if (!user.isBuyer) {
      return res
        .status(403)
        .json({ message: "Only buyers can mark points as checked" });
    }

    const { po_number, pointNo, checked } = req.body || {};
    if (!po_number) {
      return res.status(400).json({ message: "po_number is required" });
    }
    if (pointNo === undefined || pointNo === null || pointNo === "") {
      return res.status(400).json({ message: "pointNo is required" });
    }
    if (typeof checked !== "boolean") {
      return res.status(400).json({ message: "checked (boolean) is required" });
    }

    const headerRecord = await resolvePoHeader(po_number, req.body?.source_file_ts);
    if (!headerRecord) {
      return res
        .status(404)
        .json({ message: "PO header record not found for this PO number" });
    }
    if (!canWriteHeaderRemarks(user, headerRecord)) {
      return res.status(403).json({
        message:
          "You can only check points for POs in your own purchasing group",
      });
    }
    if (headerRecord.remarksLocked) {
      return res.status(403).json({
        message: "This PO's header checks are already closed.",
      });
    }

    const n = Number(pointNo);
    const userId = user.id || user.userId;

    if (checked) {
      const hasRemark = await prisma.poHeaderRemark.findFirst({
        where: { po_number, source_file_ts: headerRecord.source_file_ts, pointNo: n },
      });
      if (hasRemark) {
        return res.status(409).json({
          message:
            "This point already has a remark. Delete the remark first if you want to mark it Checked instead.",
        });
      }
      if (!(headerRecord.checkedPoints || []).includes(n)) {
        await prisma.poHeaderResult.update({
          where: { id: headerRecord.id },
          data: { checkedPoints: { push: n } },
        });
      }
    } else {
      await prisma.poHeaderResult.update({
        where: { id: headerRecord.id },
        data: {
          checkedPoints: (headerRecord.checkedPoints || []).filter(
            (p) => p !== n,
          ),
        },
      });
    }

    const tally = await recomputeAndMaybeAutoCloseHeader(po_number, headerRecord.source_file_ts, userId);

    return res.status(200).json({
      message: tally?.autoClosed
        ? "Point marked as checked. Every header point on this PO is now covered — it has been closed automatically."
        : checked
          ? "Point marked as checked."
          : "Point unmarked.",
      checkedPoints: tally?.checkedPointNos ?? [],
      tally,
    });
  } catch (error) {
    console.error("Error in toggleHeaderPointChecked:", error);
    return res
      .status(500)
      .json({ message: "Failed to update point checked status" });
  }
};
