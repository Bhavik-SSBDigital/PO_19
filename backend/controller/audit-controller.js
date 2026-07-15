import { prisma } from "../lib/prisma.js";

/**
 * POST /api/getAuditResults
 * Body (all optional): {
 *   auditedOnFrom, auditedOnTo,   // date range on audited_on
 *   manual,                       // true -> only rows flagged for manual entry
 *   completed,                    // true -> only rows whose workflow is "completed"
 *   assigned,                     // true -> only rows whose workflow is "assigned"
 *   type,                         // "PO" | "BPV" | "PJV" | "NONPO" - omit for all
 *   page, limit
 * }
 *
 * This is the general (not PO-specific) audit results list your frontend
 * calls on several pages. Filters are additive (AND'd together) and only
 * applied when truthy, matching how the request you showed sends
 * manual/completed/assigned as `false` to mean "don't filter on this".
 */
export const get_audit_results = async (req, res) => {
  try {
    const {
      auditedOnFrom,
      auditedOnTo,
      manual,
      completed,
      assigned,
      type,
      page = 1,
      limit = 30,
    } = req.body || {};

    const where = {};

    if (type) where.type = type;

    if (auditedOnFrom || auditedOnTo) {
      where.auditedOn = {};
      if (auditedOnFrom) where.auditedOn.gte = new Date(auditedOnFrom);
      if (auditedOnTo) where.auditedOn.lte = new Date(auditedOnTo);
    }

    if (manual === true || manual === "true") {
      where.manual = true;
    }

    if (completed === true || completed === "true") {
      where.verificationWorkflow = { ...(where.verificationWorkflow || {}), currentStatus: "completed" };
    }

    if (assigned === true || assigned === "true") {
      where.verificationWorkflow = { ...(where.verificationWorkflow || {}), currentStatus: "assigned" };
    }

    const take = Math.min(Number(limit) || 30, 200);
    const skip = (Math.max(Number(page) || 1, 1) - 1) * take;

    const [rows, total] = await Promise.all([
      prisma.auditResult.findMany({
        where,
        include: {
          verificationWorkflow: {
            include: { assignee: { select: { id: true, username: true, firstName: true, lastName: true } } },
          },
        },
        orderBy: { auditedOn: "desc" },
        take,
        skip,
      }),
      prisma.auditResult.count({ where }),
    ]);

    return res.status(200).json({ results: rows, total, page: Number(page), limit: take });
  } catch (error) {
    console.error("Error in get_audit_results:", error);
    return res.status(500).json({ message: "Failed to fetch audit results" });
  }
};

/**
 * POST /api/getAuditResult
 * Body: { id }
 * Single-record fetch, any type (not just PO) - the general counterpart to
 * controller/po-controller.js's get_po_audit_result.
 */
export const get_audit_result = async (req, res) => {
  try {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ message: "id is required" });

    const result = await prisma.auditResult.findUnique({
      where: { id },
      include: {
        verificationWorkflow: {
          include: {
            assignee: { select: { id: true, username: true, firstName: true, lastName: true } },
            closer: { select: { id: true, username: true, firstName: true, lastName: true } },
            workflowSteps: { orderBy: { timestamp: "asc" } },
          },
        },
      },
    });

    if (!result) return res.status(404).json({ message: "Audit result not found" });
    return res.status(200).json(result);
  } catch (error) {
    console.error("Error in get_audit_result:", error);
    return res.status(500).json({ message: "Failed to fetch audit result" });
  }
};
