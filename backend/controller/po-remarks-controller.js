import { prisma } from "../lib/prisma.js";
import { getPurchaseGroupCode } from "../utility/master-data.js";
import { computeTally } from "../utility/point-tally.js";
import {
  systemResultLabel,
  findSystemPoint,
  normalizeBuyerResult,
} from "../utility/system-result.js";

const SUBMITTER_SELECT = {
  id: true,
  username: true,
  firstName: true,
  lastName: true,
};

function canAccessAuditResult(user, auditResult) {
  if (user.isAdmin || user.isProcurementManager) return true;
  if (user.isBuyer) {
    const ownGroup = getPurchaseGroupCode(user.username);
    return !!ownGroup && auditResult.purchase_group === ownGroup;
  }
  return false;
}

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

// Recomputes the line-item tally from the CURRENT state of the DB
// (fresh read, so this is always correct even under concurrent writes)
// and auto-locks the line item the instant every point is covered.
// Returns the tally so callers can hand it straight back to the frontend.
async function recomputeAndMaybeAutoClose(auditResultId, userId) {
  const fresh = await prisma.auditResult.findUnique({
    where: { id: auditResultId },
    select: { results: true, checkedPoints: true, remarksLocked: true },
  });
  if (!fresh) return null;

  const remarkedPointNos = (
    await prisma.poRemark.findMany({
      where: { auditResultId },
      distinct: ["pointNo"],
      select: { pointNo: true },
    })
  ).map((r) => r.pointNo);

  const tally = computeTally(
    fresh.results,
    fresh.checkedPoints,
    remarkedPointNos,
  );

  if (tally.isComplete && !fresh.remarksLocked) {
    await prisma.auditResult.update({
      where: { id: auditResultId },
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

export const submitPoRemark = async (req, res) => {
  try {
    const user = req.user || {};
    if (!user.isBuyer) {
      return res
        .status(403)
        .json({ message: "Only buyers can submit remarks" });
    }

    const {
      auditResultId,
      poNumber,
      poLineItem,
      pointNo,
      remark,
      isSystemResultWrong, // boolean — true = "system's result is wrong", false = "just informative"
      buyerResult, // what the buyer thinks the result should be (defaults to system's own result)
    } = req.body || {};

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

    const systemPoint = findSystemPoint(auditResult.results, pointNo);
    const resolvedBuyerResult = normalizeBuyerResult(buyerResult, systemPoint);
    const resolvedIsWrong = Boolean(isSystemResultWrong);

    const created = await prisma.poRemark.create({
      data: {
        auditResultId: auditResult.id,
        po_number: auditResult.po_number,
        po_line_item: auditResult.po_line_item,
        pointNo: Number(pointNo),
        remark: String(remark).trim(),
        submittedBy: userId,
        isSystemResultWrong: resolvedIsWrong,
        buyerResult: resolvedBuyerResult,
      },
      include: { submitter: { select: SUBMITTER_SELECT } },
    });

    // A remarked point is "covered" — drop it from the manual checked-list
    // if it happened to be sitting there (mutually exclusive bookkeeping).
    if ((auditResult.checkedPoints || []).includes(Number(pointNo))) {
      await prisma.auditResult.update({
        where: { id: auditResult.id },
        data: {
          checkedPoints: auditResult.checkedPoints.filter(
            (p) => p !== Number(pointNo),
          ),
        },
      });
    }

    const tally = await recomputeAndMaybeAutoClose(auditResult.id, userId);

    return res.status(201).json({
      message: tally?.autoClosed
        ? "Remark submitted. Every point on this line item is now covered — it has been closed automatically."
        : "Remark submitted",
      remark: created,
      tally,
    });
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

    const { id, remark, isSystemResultWrong, buyerResult } = req.body || {};
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

    const systemPoint = findSystemPoint(
      existing.auditResult.results,
      existing.pointNo,
    );
    const data = { remark: String(remark).trim() };
    if (isSystemResultWrong !== undefined)
      data.isSystemResultWrong = Boolean(isSystemResultWrong);
    if (buyerResult !== undefined)
      data.buyerResult = normalizeBuyerResult(buyerResult, systemPoint);

    const updated = await prisma.poRemark.update({
      where: { id },
      data,
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

    if (user.isBuyer && !(user.isAdmin || user.isProcurementManager)) {
      where.submittedBy = user.id || user.userId;
    }

    const remarks = await prisma.poRemark.findMany({
      where,
      include: { submitter: { select: SUBMITTER_SELECT } },
      orderBy: { submittedAt: "desc" },
    });

    // Tally is only meaningful once we're scoped to a single line item.
    let tally = null;
    if (resolvedAuditResult) {
      const remarkedPointNos = (
        await prisma.poRemark.findMany({
          where: { auditResultId: resolvedAuditResult.id },
          distinct: ["pointNo"],
          select: { pointNo: true },
        })
      ).map((r) => r.pointNo);
      tally = computeTally(
        resolvedAuditResult.results,
        resolvedAuditResult.checkedPoints,
        remarkedPointNos,
      );
    }

    return res.status(200).json({
      total: remarks.length,
      remarks,
      remarksLocked: resolvedAuditResult?.remarksLocked ?? false,
      canWrite: resolvedAuditResult
        ? canWriteRemarks(user, resolvedAuditResult)
        : false,
      checkedPoints: resolvedAuditResult?.checkedPoints ?? [],
      tally,
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

    const userId = remark.submittedBy;
    if (remark.submittedBy !== (req.user.id || req.user.userId)) {
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

/**
 * POST /po-remarks/toggle-point-checked
 * Body: { auditResultId | (poNumber + poLineItem), pointNo, checked }
 *
 * Buyer-only. Marks (or unmarks) ONE point as "reviewed, no remark
 * needed" — mutually exclusive with having a remark on that point (you
 * can't check AND remark the same point; remove the remark first).
 * Auto-closes the line item the instant every point is covered.
 */
export const togglePointChecked = async (req, res) => {
  try {
    const user = req.user || {};
    if (!user.isBuyer) {
      return res
        .status(403)
        .json({ message: "Only buyers can mark points as checked" });
    }

    const { auditResultId, poNumber, poLineItem, pointNo, checked } =
      req.body || {};
    if (pointNo === undefined || pointNo === null || pointNo === "") {
      return res.status(400).json({ message: "pointNo is required" });
    }
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
    if (!canWriteRemarks(user, auditResult)) {
      return res.status(403).json({
        message:
          "You can only check points for PO line items in your own purchasing group",
      });
    }
    if (auditResult.remarksLocked) {
      return res.status(403).json({
        message:
          "This PO line item has been marked as checked. It is already closed.",
      });
    }

    const n = Number(pointNo);
    const userId = user.id || user.userId;

    if (checked) {
      const hasRemark = await prisma.poRemark.findFirst({
        where: { auditResultId: auditResult.id, pointNo: n },
      });
      if (hasRemark) {
        return res.status(409).json({
          message:
            "This point already has a remark. Delete the remark first if you want to mark it Checked instead.",
        });
      }
      if (!(auditResult.checkedPoints || []).includes(n)) {
        await prisma.auditResult.update({
          where: { id: auditResult.id },
          data: { checkedPoints: { push: n } },
        });
      }
    } else {
      await prisma.auditResult.update({
        where: { id: auditResult.id },
        data: {
          checkedPoints: (auditResult.checkedPoints || []).filter(
            (p) => p !== n,
          ),
        },
      });
    }

    const tally = await recomputeAndMaybeAutoClose(auditResult.id, userId);

    return res.status(200).json({
      message: tally?.autoClosed
        ? "Point marked as checked. Every point on this line item is now covered — it has been closed automatically."
        : checked
          ? "Point marked as checked."
          : "Point unmarked.",
      checkedPoints: tally?.checkedPointNos ?? [],
      tally,
    });
  } catch (error) {
    console.error("Error in togglePointChecked:", error);
    return res
      .status(500)
      .json({ message: "Failed to update point checked status" });
  }
};
