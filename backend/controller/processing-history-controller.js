import { prisma } from "../lib/prisma.js";

/**
 * controller/processing-history-controller.js
 * =============================================
 * Processing History (item 1) — "when did the system last process this
 * data". Reads SyncBatchLog (written by scripts/log-sync-batch.js at the
 * end of sync/sync_and_run.py's run_batch()) and returns three plain
 * lists — one per entity type (PO line items, PO headers, RC records) —
 * of { batchId, date, count }. No dashboards, no charts, per the spec:
 * just the facts needed to answer "when did this last run, and how much
 * did it touch".
 */
export const getProcessingHistory = async (req, res) => {
  try {
    const body = req.body || {};
    const take = Math.min(Number(body.limit) || 200, 1000);

    const batches = await prisma.syncBatchLog.findMany({
      orderBy: { processedAt: "desc" },
      take,
    });

    const toRow = (b, countKey) => ({
      batchId: b.batchId,
      date: b.processedAt,
      count: b[countKey],
    });

    return res.status(200).json({
      lineItems: batches.map((b) => toRow(b, "lineItemCount")),
      headers: batches.map((b) => toRow(b, "headerCount")),
      rc: batches.map((b) => ({
        ...toRow(b, "rcCount"),
        rcCached: b.rcCached,
      })),
    });
  } catch (error) {
    console.error("Error in getProcessingHistory:", error);
    return res
      .status(500)
      .json({ message: "Failed to fetch processing history" });
  }
};
