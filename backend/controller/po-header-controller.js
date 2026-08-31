import { prisma } from "../lib/prisma.js";
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

/**
 * po-header-controller.js
 * ========================
 * Everything about the HEADER-LEVEL (PO-wide) audit system lives here.
 *
 * ACCESS CONTROL:
 *   - Admin / Procurement Manager: full access to every PO's header, and
 *     to every buyer's header remark on it.
 *   - Buyer: scoped to their own purchasing group for VIEWING the header
 *     at all; but for individual remark TEXT, a Buyer only ever sees
 *     remarks THEY personally submitted (see getPoHeaderRemarks and the
 *     headerRemarksByPoint block in getPoHeaderSummary below).
 *   - Anyone else: 403.
 */

const SUBMITTER_SELECT = {
  id: true,
  username: true,
  firstName: true,
  lastName: true,
};

function canAccessHeader(user, headerRecord) {
  if (user.isAdmin || user.isProcurementManager) return true;
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

/**
 * POST /getPOHeaderSummary
 * Body: { po_number }
 *
 * Returns the PO's header-level points + lock status, a lightweight list
 * of its line items, PLUS (new) headerRemarksByPoint — every header-level
 * buyer remark, grouped by pointNo, already filtered to what the caller
 * is allowed to see (Buyer: own remarks only; Admin/PM: everyone's).
 * This lets the frontend render remarks immediately without a follow-up
 * call to /po-header-remarks/search.
 */
export const getPoHeaderSummary = async (req, res) => {
  try {
    await ensureSeverityLoaded();
    const user = req.user || {};
    const { po_number } = req.body || {};
    if (!po_number) {
      return res.status(400).json({ message: "po_number is required" });
    }

    const headerRecord = await prisma.poHeaderResult.findUnique({
      where: { po_number },
    });

    const lineRows = await prisma.auditResult.findMany({
      where: { type: "PO", po_number },
      select: {
        id: true,
        po_line_item: true,
        po_material_number: true,
        material_code: true,
        material_disc: true,
        net_value: true,
        results: true,
        remarksLocked: true,
        remarksLockedAt: true,
      },
      orderBy: { po_line_item: "asc" },
    });

    if (!headerRecord && lineRows.length === 0) {
      return res.status(404).json({ message: "PO not found" });
    }

    let scopeGroup = headerRecord?.purchase_group || null;
    if (!scopeGroup && lineRows.length) {
      const firstLine = await prisma.auditResult.findFirst({
        where: { type: "PO", po_number },
        select: { purchase_group: true, vendor_code: true, po_type: true },
      });
      scopeGroup = firstLine?.purchase_group || null;
    }
    if (
      !(user.isAdmin || user.isProcurementManager) &&
      (!user.isBuyer || getPurchaseGroupCode(user.username) !== scopeGroup)
    ) {
      return res
        .status(403)
        .json({ message: "Not authorized to view this PO" });
    }

    const header = await getHeaderForPo(po_number);

    // NEW: header-level buyer remarks, grouped by pointNo, pre-filtered
    // to what this caller may see. Buyer -> own remarks only. Admin/PM
    // -> everyone's.
    const headerRemarkWhere = { po_number };
    if (user.isBuyer && !(user.isAdmin || user.isProcurementManager)) {
      headerRemarkWhere.submittedBy = user.id || user.userId;
    }
    const headerRemarkRows = await prisma.poHeaderRemark.findMany({
      where: headerRemarkWhere,
      include: { submitter: { select: SUBMITTER_SELECT } },
      orderBy: { submittedAt: "desc" },
    });
    const userId = user.id || user.userId;
    const headerRemarksByPoint = {};
    for (const r of headerRemarkRows) {
      const key = String(r.pointNo);
      if (!headerRemarksByPoint[key]) headerRemarksByPoint[key] = [];
      headerRemarksByPoint[key].push({
        id: r.id,
        remark: r.remark,
        submittedBy: r.submittedBy,
        submittedByName:
          [r.submitter?.firstName, r.submitter?.lastName]
            .filter(Boolean)
            .join(" ") ||
          r.submitter?.username ||
          "",
        submittedAt: r.submittedAt,
        isMine: userId != null && String(r.submittedBy) === String(userId),
      });
    }

    const firstLine = lineRows[0];
    const vendor = firstLine
      ? getVendorInfo(
          (
            await prisma.auditResult.findFirst({
              where: { type: "PO", po_number },
              select: { vendor_code: true },
            })
          )?.vendor_code,
        )
      : getVendorInfo(headerRecord?.vendor_code);

    const lineItems = lineRows.map((row) => ({
      id: row.id,
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
      vendorCode: headerRecord?.vendor_code || vendor?.code || null,
      vendorName: vendor?.name || getVendorName(headerRecord?.vendor_code),
      vendorGstin: vendor?.gstin || "",
      poType: headerRecord?.po_type || null,
      poTypeName: getPoTypeName(headerRecord?.po_type),
      purchaseGroup: scopeGroup,
      purchaseGroupName: getPurchaseGroupName(scopeGroup),
      header,
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

/**
 * POST /po-header-remarks/search
 *
 * Visibility rule: Admin / Procurement Manager see every header remark on
 * the PO. A Buyer sees ONLY the remarks THEY personally submitted.
 */
export const getPoHeaderRemarks = async (req, res) => {
  try {
    const user = req.user || {};
    if (!(user.isBuyer || user.isAdmin || user.isProcurementManager)) {
      return res.status(403).json({ message: "Not authorized" });
    }

    const { po_number, pointNo } = req.body || {};
    if (!po_number) {
      return res.status(400).json({ message: "po_number is required" });
    }

    const headerRecord = await prisma.poHeaderResult.findUnique({
      where: { po_number },
    });
    if (headerRecord && !canAccessHeader(user, headerRecord)) {
      return res
        .status(403)
        .json({ message: "Not authorized to view this PO's header remarks" });
    }

    const where = { po_number };
    if (pointNo !== undefined && pointNo !== null && pointNo !== "") {
      where.pointNo = Number(pointNo);
    }

    // Buyer -> restrict to remarks they authored. Admin / PM -> unrestricted.
    if (user.isBuyer && !(user.isAdmin || user.isProcurementManager)) {
      where.submittedBy = user.id || user.userId;
    }

    const remarks = await prisma.poHeaderRemark.findMany({
      where,
      include: { submitter: { select: SUBMITTER_SELECT } },
      orderBy: { submittedAt: "desc" },
    });

    return res.status(200).json({
      total: remarks.length,
      remarks,
      remarksLocked: headerRecord?.remarksLocked ?? false,
      canWrite: headerRecord
        ? canWriteHeaderRemarks(user, headerRecord)
        : false,
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

    const { po_number, pointNo, remark } = req.body || {};
    if (!po_number) {
      return res.status(400).json({ message: "po_number is required" });
    }
    if (!remark || !String(remark).trim()) {
      return res.status(400).json({ message: "Remark text is required" });
    }
    if (pointNo === undefined || pointNo === null || pointNo === "") {
      return res.status(400).json({ message: "pointNo is required" });
    }

    const headerRecord = await prisma.poHeaderResult.findUnique({
      where: { po_number },
    });
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
      where: { po_number, pointNo: Number(pointNo), submittedBy: userId },
    });
    if (existingOwn) {
      return res.status(409).json({
        message:
          "You already have a remark on this point. Edit your existing remark instead.",
        remarkId: existingOwn.id,
      });
    }

    const created = await prisma.poHeaderRemark.create({
      data: {
        po_number,
        pointNo: Number(pointNo),
        remark: String(remark).trim(),
        submittedBy: userId,
      },
      include: { submitter: { select: SUBMITTER_SELECT } },
    });

    return res
      .status(201)
      .json({ message: "Header remark submitted", remark: created });
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

    const { id, remark } = req.body || {};
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

    const updated = await prisma.poHeaderRemark.update({
      where: { id },
      data: { remark: String(remark).trim() },
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

/**
 * POST /setPoHeaderCheckedStatus
 * Body: { po_number, checked }
 * The PO-level close/reopen toggle. Completely separate from
 * setAuditResultCheckedStatus (line-level).
 */
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

    const headerRecord = await prisma.poHeaderResult.findUnique({
      where: { po_number },
    });
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
      where: { po_number },
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
