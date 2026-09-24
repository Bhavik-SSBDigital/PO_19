import { prisma } from "../lib/prisma.js";
import { getPurchaseGroupCode } from "../utility/master-data.js";

/**
 * RC-LEVEL remarks controller.
 *
 * Mirrors po-remarks-controller.js (line-level) and the header-level remark
 * functions living alongside it, but scoped to a single RcOverlapResult row
 * instead of an AuditResult line item or a po_number "header".
 *
 * KEY DIFFERENCE FROM LINE/HEADER REMARKS: an RC only has ONE check (Rule 19
 * / RC Overlap) - there is no family of numbered points to remark against,
 * so there is no pointNo and no per-point tally. There IS still
 * auto-close, though, mirroring header/line: the instant a remark is
 * submitted against an RC whose status is "Not Verified" (the only status
 * that's ever mandatory - a "Verified" RC never needed a remark), the RC
 * auto-locks (remarksLocked=true) right here in submitRcRemark, exactly
 * like recomputeAndMaybeAutoClose()/recomputeAndMaybeAutoCloseHeader() do
 * for line/header. A buyer should never have to submit a remark AND
 * separately click "mark checked" - one action, one close. The manual
 * setRcCheckedStatus toggle below still exists for admin/PM override
 * (e.g. explicitly re-opening a closed RC, or closing one with zero
 * remarks), but is no longer the only way to close.
 *
 * ACCESS CONTROL mirrors rc-overlap-controller.js exactly:
 *   - Admin / Procurement Manager: full access to every RC.
 *   - Buyer: only RCs where their own purchasing group appears in
 *     RcOverlapResult.purchaseGroups (write access requires this too).
 *   - Anyone else: 403.
 *
 * WIRE-UP (routes file, not included here - add alongside your other
 * /po-remarks routes):
 *
 *   import {
 *     submitRcRemark,
 *     updateRcRemark,
 *     getRcRemarks,
 *     deleteRcRemark,
 *     setRcCheckedStatus,
 *   } from "../controller/rc-remarks-controller.js";
 *
 *   router.post("/rc-remarks/submit", authenticate, submitRcRemark);
 *   router.post("/rc-remarks/update", authenticate, updateRcRemark);
 *   router.post("/rc-remarks", authenticate, getRcRemarks);
 *   router.post("/rc-remarks/delete", authenticate, deleteRcRemark);
 *   router.post("/rc-remarks/toggle-checked", authenticate, setRcCheckedStatus);
 *
 * (All POST, including delete, so the frontend only ever needs your
 * existing `post` axios helper - no separate DELETE-method helper needed.)
 */

const SUBMITTER_SELECT = {
  id: true,
  username: true,
  firstName: true,
  lastName: true,
};

function canAccessRc(user, rc) {
  if (user.isAdmin || user.isProcurementManager || user.isSsbDigital)
    return true;
  if (user.isBuyer) {
    const ownGroup = getPurchaseGroupCode(user.username);
    return !!ownGroup && (rc.purchaseGroups || []).includes(ownGroup);
  }
  return false;
}

function canWriteRcRemarks(user, rc) {
  if (!user.isBuyer) return false;
  const ownGroup = getPurchaseGroupCode(user.username);
  return !!ownGroup && (rc.purchaseGroups || []).includes(ownGroup);
}

async function resolveRcOverlapResult({
  rcOverlapResultId,
  rcNumber,
  vendorCode,
  rcMaterialCode,
}) {
  if (rcOverlapResultId) {
    return prisma.rcOverlapResult.findUnique({
      where: { id: rcOverlapResultId },
    });
  }
  if (rcNumber) {
    return prisma.rcOverlapResult.findFirst({
      where: {
        rcNumber,
        ...(vendorCode ? { vendorCode } : {}),
        ...(rcMaterialCode ? { rcMaterialCode } : {}),
      },
    });
  }
  return null;
}

/**
 * POST /rc-remarks/submit
 * Body: { rcOverlapResultId | (rcNumber [+ vendorCode] [+ rcMaterialCode]),
 *         remark, isSystemResultWrong?, buyerResult? }
 * Buyer-only, one remark per user per RC (unique constraint backs this up).
 */
export const submitRcRemark = async (req, res) => {
  try {
    const user = req.user || {};
    if (!user.isBuyer) {
      return res
        .status(403)
        .json({ message: "Only buyers can submit remarks" });
    }

    const {
      rcOverlapResultId,
      rcNumber,
      vendorCode,
      rcMaterialCode,
      remark,
      isSystemResultWrong, // boolean — true = "the RC status is wrong", false = informative only
      buyerResult, // buyer's opinion of status: "Verified" | "Not Verified" (defaults to system's own status)
    } = req.body || {};

    if (!remark || !String(remark).trim()) {
      return res.status(400).json({ message: "Remark text is required" });
    }
    if (!rcOverlapResultId && !rcNumber) {
      return res.status(400).json({
        message:
          "Provide either rcOverlapResultId, or rcNumber (optionally with vendorCode/rcMaterialCode)",
      });
    }

    const rc = await resolveRcOverlapResult({
      rcOverlapResultId,
      rcNumber,
      vendorCode,
      rcMaterialCode,
    });
    if (!rc) {
      return res.status(404).json({ message: "RC Overlap record not found" });
    }

    if (!canWriteRcRemarks(user, rc)) {
      return res.status(403).json({
        message:
          "You can only submit remarks for RCs relevant to your own purchasing group",
      });
    }

    if (rc.remarksLocked) {
      return res.status(403).json({
        message: "This RC has been marked as checked. Remarks are locked.",
      });
    }

    const userId = user.id || user.userId;
    if (!userId) {
      return res
        .status(401)
        .json({ message: "Unable to identify submitting user" });
    }

    const existingOwn = await prisma.poRcRemark.findFirst({
      where: { rcOverlapResultId: rc.id, submittedBy: userId },
    });
    if (existingOwn) {
      return res.status(409).json({
        message:
          "You already have a remark on this RC. Edit your existing remark instead.",
        remarkId: existingOwn.id,
      });
    }

    const resolvedBuyerResult =
      buyerResult !== undefined && buyerResult !== null && buyerResult !== ""
        ? String(buyerResult)
        : rc.status;
    const resolvedIsWrong = Boolean(isSystemResultWrong);

    const created = await prisma.poRcRemark.create({
      data: {
        rcOverlapResultId: rc.id,
        vendorCode: rc.vendorCode,
        rcMaterialCode: rc.rcMaterialCode,
        rcNumber: rc.rcNumber,
        remark: String(remark).trim(),
        submittedBy: userId,
        isSystemResultWrong: resolvedIsWrong,
        buyerResult: resolvedBuyerResult,
      },
      include: { submitter: { select: SUBMITTER_SELECT } },
    });

    // Auto-close: an RC's only mandatory item is covered the instant it
    // has a remark, regardless of whether the buyer agreed or disputed
    // the system's status (same opinion-agnostic coverage rule as
    // header/line - see utility/effective-result.js). "Verified" RCs were
    // never mandatory in the first place, so this only fires for
    // "Not Verified" ones, and only once.
    let autoClosed = false;
    let lockedRc = rc;
    if (rc.status === "Not Verified" && !rc.remarksLocked) {
      lockedRc = await prisma.rcOverlapResult.update({
        where: { id: rc.id },
        data: {
          remarksLocked: true,
          remarksLockedBy: userId,
          remarksLockedAt: new Date(),
        },
      });
      autoClosed = true;
    }

    return res.status(201).json({
      message: "Remark submitted",
      remark: created,
      remarksLocked: lockedRc.remarksLocked,
      remarksLockedBy: lockedRc.remarksLockedBy,
      remarksLockedAt: lockedRc.remarksLockedAt,
      autoClosed,
    });
  } catch (error) {
    console.error("Error in submitRcRemark:", error);
    return res.status(500).json({ message: "Failed to submit remark" });
  }
};

/**
 * POST /rc-remarks/update
 * Body: { id, remark, isSystemResultWrong?, buyerResult? }
 * Buyer-only, own remark only.
 */
export const updateRcRemark = async (req, res) => {
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

    const existing = await prisma.poRcRemark.findUnique({
      where: { id },
      include: { rcOverlapResult: true },
    });
    if (!existing) return res.status(404).json({ message: "Remark not found" });

    const userId = user.id || user.userId;
    if (existing.submittedBy !== userId) {
      return res
        .status(403)
        .json({ message: "You can only edit your own remark" });
    }
    if (!canWriteRcRemarks(user, existing.rcOverlapResult)) {
      return res.status(403).json({ message: "Not authorized for this RC" });
    }
    if (existing.rcOverlapResult.remarksLocked) {
      return res.status(403).json({
        message: "This RC has been marked as checked. Remarks are locked.",
      });
    }

    const data = { remark: String(remark).trim() };
    if (isSystemResultWrong !== undefined)
      data.isSystemResultWrong = Boolean(isSystemResultWrong);
    if (buyerResult !== undefined) data.buyerResult = String(buyerResult);

    const updated = await prisma.poRcRemark.update({
      where: { id },
      data,
      include: { submitter: { select: SUBMITTER_SELECT } },
    });

    return res.status(200).json({ message: "Remark updated", remark: updated });
  } catch (error) {
    console.error("Error in updateRcRemark:", error);
    return res.status(500).json({ message: "Failed to update remark" });
  }
};

/**
 * POST /rc-remarks
 * Body: { rcOverlapResultId | (rcNumber [+ vendorCode] [+ rcMaterialCode]) }
 * Returns every remark on that RC, plus lock status and whether the
 * current user can write. Available to admin/PM/buyer (buyer scoped to
 * their own purchasing group via canAccessRc).
 */
export const getRcRemarks = async (req, res) => {
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

    const { rcOverlapResultId, rcNumber, vendorCode, rcMaterialCode } =
      req.body || {};
    if (!rcOverlapResultId && !rcNumber) {
      return res.status(400).json({
        message:
          "Provide either rcOverlapResultId, or rcNumber (optionally with vendorCode/rcMaterialCode)",
      });
    }

    const rc = await resolveRcOverlapResult({
      rcOverlapResultId,
      rcNumber,
      vendorCode,
      rcMaterialCode,
    });
    if (!rc) {
      return res.status(404).json({ message: "RC Overlap record not found" });
    }
    if (!canAccessRc(user, rc)) {
      return res
        .status(403)
        .json({ message: "Not authorized to view remarks for this RC" });
    }

    const remarks = await prisma.poRcRemark.findMany({
      where: { rcOverlapResultId: rc.id },
      include: { submitter: { select: SUBMITTER_SELECT } },
      orderBy: { submittedAt: "desc" },
    });

    return res.status(200).json({
      total: remarks.length,
      remarks,
      remarksLocked: rc.remarksLocked,
      remarksLockedBy: rc.remarksLockedBy,
      remarksLockedAt: rc.remarksLockedAt,
      canWrite: canWriteRcRemarks(user, rc),
      canManageLock: canAccessRc(user, rc),
    });
  } catch (error) {
    console.error("Error in getRcRemarks:", error);
    return res.status(500).json({ message: "Failed to fetch remarks" });
  }
};

/**
 * POST /rc-remarks/delete
 * Body: { id }
 * Buyer-only, own remark only. (POST rather than a DELETE route so the
 * frontend can reuse the same `post` helper as every other remarks call.)
 */
export const deleteRcRemark = async (req, res) => {
  try {
    const user = req.user || {};
    if (!user.isBuyer) {
      return res
        .status(403)
        .json({ message: "Only buyers can delete remarks" });
    }

    const id = req.body?.id || req.params?.id;
    if (!id) return res.status(400).json({ message: "Remark id is required" });

    const remark = await prisma.poRcRemark.findUnique({
      where: { id },
      include: { rcOverlapResult: true },
    });
    if (!remark) return res.status(404).json({ message: "Remark not found" });

    if (remark.rcOverlapResult.remarksLocked) {
      return res.status(403).json({
        message: "This RC has been marked as checked. Remarks are locked.",
      });
    }

    const userId = user.id || user.userId;
    if (remark.submittedBy !== userId) {
      return res
        .status(403)
        .json({ message: "You can only delete your own remark" });
    }

    await prisma.poRcRemark.delete({ where: { id } });
    return res.status(200).json({ message: "Remark deleted" });
  } catch (error) {
    console.error("Error in deleteRcRemark:", error);
    return res.status(500).json({ message: "Failed to delete remark" });
  }
};

/**
 * POST /rc-remarks/toggle-checked
 * Body: { rcOverlapResultId | (rcNumber [+ vendorCode] [+ rcMaterialCode]), checked }
 * Available to admin/PM/buyer (buyer scoped to own purchasing group), same
 * pattern as setAuditResultCheckedStatus (line-level "Mark as Checked").
 */
export const setRcCheckedStatus = async (req, res) => {
  try {
    const user = req.user || {};
    if (!(user.isBuyer || user.isAdmin || user.isProcurementManager)) {
      return res.status(403).json({ message: "Not authorized" });
    }

    const { rcOverlapResultId, rcNumber, vendorCode, rcMaterialCode, checked } =
      req.body || {};
    if (typeof checked !== "boolean") {
      return res.status(400).json({ message: "checked (boolean) is required" });
    }
    if (!rcOverlapResultId && !rcNumber) {
      return res.status(400).json({
        message:
          "Provide either rcOverlapResultId, or rcNumber (optionally with vendorCode/rcMaterialCode)",
      });
    }

    const rc = await resolveRcOverlapResult({
      rcOverlapResultId,
      rcNumber,
      vendorCode,
      rcMaterialCode,
    });
    if (!rc)
      return res.status(404).json({ message: "RC Overlap record not found" });
    if (!canAccessRc(user, rc)) {
      return res.status(403).json({ message: "Not authorized for this RC" });
    }

    const userId = user.id || user.userId;
    const updated = await prisma.rcOverlapResult.update({
      where: { id: rc.id },
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
        ? "RC marked as checked. Remarks are now locked."
        : "RC reopened.",
      remarksLocked: updated.remarksLocked,
      remarksLockedAt: updated.remarksLockedAt,
    });
  } catch (error) {
    console.error("Error in setRcCheckedStatus:", error);
    return res.status(500).json({ message: "Failed to update checked status" });
  }
};
