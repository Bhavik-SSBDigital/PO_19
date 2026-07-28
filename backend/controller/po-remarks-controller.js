import { prisma } from "../lib/prisma.js";
import { getPurchaseGroupCode } from "../utility/master-data.js";

const SUBMITTER_SELECT = {
  id: true,
  username: true,
  firstName: true,
  lastName: true,
};

// VIEW access — who can see remarks on this line item at all.
function canAccessAuditResult(user, auditResult) {
  if (user.isAdmin || user.isProcurementManager) return true;
  if (user.isBuyer) {
    const ownGroup = getPurchaseGroupCode(user.username);
    return !!ownGroup && auditResult.purchase_group === ownGroup;
  }
  return false;
}

// WRITE access — Buyer only, and only within their own purchasing group.
function canWriteRemarks(user, auditResult) {
  if (!user.isBuyer) return false;
  const ownGroup = getPurchaseGroupCode(user.username);
  return !!ownGroup && auditResult.purchase_group === ownGroup;
}

async function resolveAuditResult({ auditResultId, poNumber, poLineItem }) {
  if (auditResultId) {
    return prisma.auditResult.findUnique({ where: { id: auditResultId } });
  }
  if (poNumber && poLineItem) {
    return prisma.auditResult.findFirst({
      where: { type: "PO", po_number: poNumber, po_line_item: poLineItem },
    });
  }
  return null;
}

export const submitPoRemark = async (req, res) => {
  try {
    const user = req.user || {};
    if (!user.isBuyer) {
      return res
        .status(403)
        .json({ message: "Only buyers can submit remarks" });
    }

    const { auditResultId, poNumber, poLineItem, pointNo, remark } =
      req.body || {};

    if (!remark || !String(remark).trim()) {
      return res.status(400).json({ message: "Remark text is required" });
    }
    if (pointNo === undefined || pointNo === null || pointNo === "") {
      return res.status(400).json({ message: "pointNo is required" });
    }
    if (!auditResultId && !(poNumber && poLineItem)) {
      return res.status(400).json({
        message:
          "Provide either auditResultId, or both poNumber and poLineItem",
      });
    }

    const auditResult = await resolveAuditResult({
      auditResultId,
      poNumber,
      poLineItem,
    });
    if (!auditResult) {
      return res.status(404).json({ message: "PO line item not found" });
    }

    if (!canWriteRemarks(user, auditResult)) {
      return res.status(403).json({
        message:
          "You can only submit remarks for PO line items in your own purchasing group",
      });
    }

    if (auditResult.remarksLocked) {
      return res.status(403).json({
        message:
          "This PO line item has been marked as checked. Remarks are locked.",
      });
    }

    const userId = user.id || user.userId;
    if (!userId) {
      return res
        .status(401)
        .json({ message: "Unable to identify submitting user" });
    }

    const existingOwn = await prisma.poRemark.findFirst({
      where: {
        auditResultId: auditResult.id,
        pointNo: Number(pointNo),
        submittedBy: userId,
      },
    });
    if (existingOwn) {
      return res.status(409).json({
        message:
          "You already have a remark on this point. Edit your existing remark instead.",
        remarkId: existingOwn.id,
      });
    }

    const created = await prisma.poRemark.create({
      data: {
        auditResultId: auditResult.id,
        po_number: auditResult.po_number,
        po_line_item: auditResult.po_line_item,
        pointNo: Number(pointNo),
        remark: String(remark).trim(),
        submittedBy: userId,
      },
      include: { submitter: { select: SUBMITTER_SELECT } },
    });

    return res
      .status(201)
      .json({ message: "Remark submitted", remark: created });
  } catch (error) {
    console.error("Error in submitPoRemark:", error);
    return res.status(500).json({ message: "Failed to submit remark" });
  }
};

export const updatePoRemark = async (req, res) => {
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

    const existing = await prisma.poRemark.findUnique({
      where: { id },
      include: { auditResult: true },
    });
    if (!existing) return res.status(404).json({ message: "Remark not found" });

    const userId = user.id || user.userId;
    if (existing.submittedBy !== userId) {
      return res
        .status(403)
        .json({ message: "You can only edit your own remark" });
    }
    if (!canWriteRemarks(user, existing.auditResult)) {
      return res
        .status(403)
        .json({ message: "Not authorized for this PO line item" });
    }
    if (existing.auditResult.remarksLocked) {
      return res.status(403).json({
        message:
          "This PO line item has been marked as checked. Remarks are locked.",
      });
    }

    const updated = await prisma.poRemark.update({
      where: { id },
      data: { remark: String(remark).trim() },
      include: { submitter: { select: SUBMITTER_SELECT } },
    });

    return res.status(200).json({ message: "Remark updated", remark: updated });
  } catch (error) {
    console.error("Error in updatePoRemark:", error);
    return res.status(500).json({ message: "Failed to update remark" });
  }
};

export const getPoRemarks = async (req, res) => {
  try {
    const user = req.user || {};
    if (!(user.isBuyer || user.isAdmin || user.isProcurementManager)) {
      return res.status(403).json({ message: "Not authorized" });
    }

    const { auditResultId, poNumber, poLineItem, pointNo } = req.body || {};
    const isScopedToLineItem = Boolean(
      auditResultId || (poNumber && poLineItem),
    );

    const where = {};
    let resolvedAuditResult = null;

    if (isScopedToLineItem) {
      resolvedAuditResult = await resolveAuditResult({
        auditResultId,
        poNumber,
        poLineItem,
      });
      if (!resolvedAuditResult) {
        return res.status(404).json({ message: "PO line item not found" });
      }
      if (!canAccessAuditResult(user, resolvedAuditResult)) {
        return res
          .status(403)
          .json({ message: "Not authorized to view these remarks" });
      }
      where.auditResultId = resolvedAuditResult.id;
    } else if (poNumber) {
      where.po_number = poNumber;
      if (user.isBuyer && !(user.isAdmin || user.isProcurementManager)) {
        const ownGroup = getPurchaseGroupCode(user.username);
        where.auditResult = { purchase_group: ownGroup };
      }
    } else {
      return res.status(400).json({
        message:
          "Provide auditResultId, poNumber+poLineItem, or at least poNumber",
      });
    }

    if (pointNo !== undefined && pointNo !== null && pointNo !== "") {
      where.pointNo = Number(pointNo);
    }

    const remarks = await prisma.poRemark.findMany({
      where,
      include: { submitter: { select: SUBMITTER_SELECT } },
      orderBy: { submittedAt: "desc" },
    });

    return res.status(200).json({
      total: remarks.length,
      remarks,
      remarksLocked: resolvedAuditResult?.remarksLocked ?? false,
      canWrite: resolvedAuditResult
        ? canWriteRemarks(user, resolvedAuditResult)
        : false,
    });
  } catch (error) {
    console.error("Error in getPoRemarks:", error);
    return res.status(500).json({ message: "Failed to fetch remarks" });
  }
};

export const deletePoRemark = async (req, res) => {
  try {
    const user = req.user || {};
    if (!user.isBuyer) {
      return res
        .status(403)
        .json({ message: "Only buyers can delete remarks" });
    }

    const { id } = req.params;
    if (!id) return res.status(400).json({ message: "Remark id is required" });

    const remark = await prisma.poRemark.findUnique({
      where: { id },
      include: { auditResult: true },
    });
    if (!remark) return res.status(404).json({ message: "Remark not found" });

    if (remark.auditResult.remarksLocked) {
      return res.status(403).json({
        message:
          "This PO line item has been marked as checked. Remarks are locked.",
      });
    }

    const userId = user.id || user.userId;
    if (remark.submittedBy !== userId) {
      return res
        .status(403)
        .json({ message: "You can only delete your own remark" });
    }

    await prisma.poRemark.delete({ where: { id } });
    return res.status(200).json({ message: "Remark deleted" });
  } catch (error) {
    console.error("Error in deletePoRemark:", error);
    return res.status(500).json({ message: "Failed to delete remark" });
  }
};

export const setAuditResultCheckedStatus = async (req, res) => {
  try {
    const user = req.user || {};
    if (!(user.isBuyer || user.isAdmin || user.isProcurementManager)) {
      return res.status(403).json({ message: "Not authorized" });
    }

    const { auditResultId, poNumber, poLineItem, checked } = req.body || {};
    if (typeof checked !== "boolean") {
      return res.status(400).json({ message: "checked (boolean) is required" });
    }
    if (!auditResultId && !(poNumber && poLineItem)) {
      return res.status(400).json({
        message:
          "Provide either auditResultId, or both poNumber and poLineItem",
      });
    }

    const auditResult = await resolveAuditResult({
      auditResultId,
      poNumber,
      poLineItem,
    });
    if (!auditResult)
      return res.status(404).json({ message: "PO line item not found" });
    if (!canAccessAuditResult(user, auditResult)) {
      return res
        .status(403)
        .json({ message: "Not authorized for this PO line item" });
    }

    const userId = user.id || user.userId;
    const updated = await prisma.auditResult.update({
      where: { id: auditResult.id },
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
        ? "Line item marked as checked. Remarks are now locked."
        : "Line item reopened.",
      remarksLocked: updated.remarksLocked,
      remarksLockedAt: updated.remarksLockedAt,
    });
  } catch (error) {
    console.error("Error in setAuditResultCheckedStatus:", error);
    return res.status(500).json({ message: "Failed to update checked status" });
  }
};
