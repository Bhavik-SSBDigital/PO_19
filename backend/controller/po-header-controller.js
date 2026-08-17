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
 * Everything about the HEADER-LEVEL (PO-wide) audit system lives here,
 * mirroring po-remarks-controller.js's shape but keyed at PO level instead
 * of line-item level:
 *
 *   - getPoHeaderSummary   : one PO's header points + lock status + a
 *                            lightweight list of its line items (used by
 *                            the search page when only a PO number, no
 *                            line item, is searched).
 *   - getPoHeaderRemarks   : buyer remarks against header-level points.
 *   - submitPoHeaderRemark / updatePoHeaderRemark / deletePoHeaderRemark
 *   - setPoHeaderCheckedStatus : the PO-LEVEL close/reopen toggle. This is
 *     a SEPARATE system from setAuditResultCheckedStatus (line-level) -
 *     closing the header never touches any line item, and closing a line
 *     item never touches the header.
 *
 * ACCESS CONTROL mirrors po-remarks-controller.js / po-data-controller.js:
 *   - Admin / Procurement Manager: full access to every PO's header.
 *   - Buyer: scoped to their own purchasing group (PoHeaderResult.purchase_group).
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
 * Returns the PO's header-level points + lock status, PLUS a lightweight
 * list of its line items (line item no., material, whether that line has
 * a line-level exception, whether that line is closed). This is what the
 * search page renders when the user searches a PO NUMBER without a line
 * item - a full header panel, and a picker to drill into one line.
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

    // Even with no header record yet (e.g. header import hasn't run), we
    // still want to show line items - so only 404 if NEITHER exists.
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

    // Access check - use header's purchase_group if we have it, else fall
    // back to the first line item's purchase_group.
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
 *
 * THE PO-LEVEL close/reopen toggle. Completely separate from
 * setAuditResultCheckedStatus (line-level, in po-remarks-controller.js) -
 * this never touches any AuditResult row. Once checked=true, the header
 * is locked for remarks, and every line item of this PO (viewed via
 * get_po_audit_result / get_po_lines) reports header.locked = true without
 * needing to be reviewed again.
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
