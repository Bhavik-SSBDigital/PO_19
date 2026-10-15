import { prisma } from "../lib/prisma.js";
import {
  ensureSeverityLoaded,
  classifyPoint,
  severityOf,
} from "../utility/severity.js";
import {
  ensurePointDefinitionsLoaded,
  getPointDefinition,
} from "../utility/point-definitions.js";
import { getMandatoryPoints } from "../utility/not-verified-scope.js";
import { isPointCovered } from "../utility/effective-result.js";
import { getPurchaseGroupName } from "../utility/master-data.js";
import { RC_PLACEHOLDER_PO_TYPES } from "../utility/rc-placeholder.js";
import {
  HEADER_LEVEL_RULE_NOS,
  LINE_TABLE_RULE_NOS,
} from "../utility/point-scope.js";
import {
  closedPointsOf,
  pendingPointsOf,
  analyseRecord,
  poStatusOf,
  emptyCounts,
} from "../utility/po-status.js";
import { getScopedModel } from "../utility/data-cache.js";
import { buildPoRows } from "../utility/po-rows.js";
// Same filters + same buyer scoping + same RC-placeholder exclusion as every
// other dashboard number.
import { buildWhere } from "./dashboard-controller.js";

const pointRows = (c) => [
  {
    key: "verified",
    label: "Verified",
    total: c.verified,
    closed: c.verified,
    pending: 0,
    manual: 0,
  },
  {
    key: "notVerified",
    label: "Not Verified",
    total: c.notVerified,
    closed: c.nvClosed,
    pending: c.nvPending,
    manual: 0,
  },
  {
    key: "na",
    label: "Not Applicable",
    total: c.na,
    closed: c.na,
    pending: 0,
    manual: 0,
  },
  {
    key: "manual",
    label: "Manual review",
    total: c.manual,
    closed: 0,
    pending: 0,
    manual: c.manual,
  },
];

const pointTotal = (c) => ({
  total: c.total,
  closed: closedPointsOf(c),
  pending: pendingPointsOf(c),
  manual: c.manual, // not closed, not pending: needs a human, tracked on its own
});

/**
 * POST /reports/po-status-summary
 *
 * One response feeds the whole "PO Status Summary" block AND the PO list at
 * the bottom of the dashboard, all from one cached read of the data.
 */
export const getPoStatusSummary = async (req, res) => {
  try {
    await ensureSeverityLoaded();
    const user = req.user || {};
    const where = buildWhere(req.body || {}, user);
    const isUnrestricted =
      user.isAdmin || user.isProcurementManager || !user.isBuyer;

    const model = await getScopedModel(where);
    const { rows, headerTotals, lineTotals } = buildPoRows(model, {
      includeLineDetails: false,
    });

    // ---- PO level -------------------------------------------------------
    const statusCounts = { perfect: 0, reviewed: 0, in_review: 0, pending: 0 };
    let headerPendingPOs = 0;
    let linePendingPOs = 0;
    let bothPending = 0;
    const groups = new Map();

    for (const r of rows) {
      statusCounts[r.poStatus] += 1;
      const hp = r.headerPendingPoints > 0;
      const lp = r.linePendingPoints > 0;
      if (hp) headerPendingPOs++;
      if (lp) linePendingPOs++;
      if (hp && lp) bothPending++;

      if (isUnrestricted) {
        const key = r.purchaseGroup || "Unassigned";
        if (!groups.has(key)) {
          groups.set(key, {
            purchaseGroup: key,
            purchaseGroupName: getPurchaseGroupName(key),
            totalPOs: 0,
            perfect: 0,
            reviewed: 0,
            inReview: 0,
            pending: 0,
            headerPendingPOs: 0,
            linePendingPOs: 0,
            nvPoints: 0,
            nvClosedPoints: 0,
            nvPendingPoints: 0,
          });
        }
        const g = groups.get(key);
        g.totalPOs += 1;
        if (r.poStatus === "perfect") g.perfect += 1;
        else if (r.poStatus === "reviewed") g.reviewed += 1;
        else if (r.poStatus === "in_review") g.inReview += 1;
        else g.pending += 1;
        g.nvPoints += r.totalNotVerifiedPoints;
        g.nvClosedPoints += r.totalClosedNotVerified;
        g.nvPendingPoints += r.totalPendingPoints;
        if (hp) g.headerPendingPOs += 1;
        if (lp) g.linePendingPOs += 1;
      }
    }

    const total = rows.length;
    const pendingPOs = statusCounts.pending + statusCounts.in_review;
    const closedPOs = statusCounts.perfect + statusCounts.reviewed;

    const byPurchaseGroup = isUnrestricted
      ? [...groups.values()]
          .map((g) => ({ ...g, closed: g.perfect + g.reviewed }))
          .sort((a, b) => b.pending + b.inReview - (a.pending + a.inReview))
      : undefined;

    // ---- how many POs are outside this view (RC placeholder PO types) ----
    let excludedPlaceholderPOs = 0;
    if (RC_PLACEHOLDER_PO_TYPES?.length) {
      const ex = await prisma.auditResult.groupBy({
        by: ["po_number"],
        where: { ...where, po_type: { in: RC_PLACEHOLDER_PO_TYPES } },
      });
      excludedPlaceholderPOs = ex.length;
    }

    return res.status(200).json({
      generatedAt: new Date().toISOString(),
      scopeNote: {
        excludedPlaceholderPOs,
        excludedPoTypes: RC_PLACEHOLDER_PO_TYPES || [],
      },
      poSummary: {
        total,
        closed: closedPOs,
        pending: pendingPOs,
        header: { closed: total - headerPendingPOs, pending: headerPendingPOs },
        line: { closed: total - linePendingPOs, pending: linePendingPOs },
        bothPending,
      },
      statusCounts,
      headerPoints: {
        totalPOs: total,
        pointsPerPO: HEADER_LEVEL_RULE_NOS.length,
        rows: pointRows(headerTotals),
        total: pointTotal(headerTotals),
      },
      linePoints: {
        totalLines: model.lineRows.length,
        pointsPerLine: LINE_TABLE_RULE_NOS.length,
        rows: pointRows(lineTotals),
        total: pointTotal(lineTotals),
      },
      byPurchaseGroup,
      // lightweight rows for the dashboard's PO-wise list (same builder as
      // the PO Data page, so numbers are identical)
      poRows: rows.sort(
        (a, b) =>
          b.totalPendingPoints - a.totalPendingPoints ||
          b.exceptionLineCount - a.exceptionLineCount,
      ),
    });
  } catch (error) {
    console.error("Error in getPoStatusSummary:", error);
    return res
      .status(500)
      .json({ message: "Failed to compute PO status summary" });
  }
};

// ---------------------------------------------------------------------------
// POST /reports/po-status-detail   { poNumber }
//
// On-demand detail for ONE PO (opened when the user clicks a row / a Header or
// Line cell in the PO-Wise Review Status table). Not part of the dashboard
// load, so it costs nothing until clicked. Same scoping as every other
// dashboard endpoint (a buyer only sees their own purchase group).
// ---------------------------------------------------------------------------
export const getPoStatusDetail = async (req, res) => {
  try {
    await ensureSeverityLoaded();
    await ensurePointDefinitionsLoaded();
    const user = req.user || {};
    const poNumber = String(req.body?.poNumber || "").trim();
    if (!poNumber) {
      return res.status(400).json({ message: "poNumber is required" });
    }

    const where = buildWhere({ poNumber }, user);
    const requestedTs = req.body?.source_file_ts ? new Date(req.body.source_file_ts) : null;
    const latestRow = requestedTs ? null : await prisma.auditResult.findFirst({ where, orderBy: { source_file_ts: "desc" }, select: { source_file_ts: true } });
    const sourceFileTs = requestedTs || latestRow?.source_file_ts;
    if (sourceFileTs) where.source_file_ts = sourceFileTs;
    const lines = await prisma.auditResult.findMany({
      where,
      select: {
        id: true,
        source_file_ts: true,
        po_line_item: true,
        po_material_number: true,
        material_code: true,
        material_disc: true,
        net_value: true,
        results: true,
        checkedPoints: true,
      },
    });
    if (!lines.length) {
      return res.status(404).json({ message: "PO not found in your scope" });
    }

    const [header, lineRemarks, headerRemarks] = await Promise.all([
      prisma.poHeaderResult.findFirst({
        where: { po_number: poNumber, ...(sourceFileTs ? { source_file_ts: sourceFileTs } : {}) },
        select: { results: true, checkedPoints: true, source_file_ts: true },
      }),
      prisma.poRemark.findMany({
        where: { auditResultId: { in: lines.map((l) => l.id) } },
        orderBy: { submittedAt: "desc" },
        select: {
          auditResultId: true,
          pointNo: true,
          remark: true,
          isSystemResultWrong: true,
          submittedAt: true,
        },
      }),
      prisma.poHeaderRemark.findMany({
        where: { po_number: poNumber, ...(sourceFileTs ? { source_file_ts: sourceFileTs } : {}) },
        orderBy: { submittedAt: "desc" },
        select: {
          pointNo: true,
          remark: true,
          isSystemResultWrong: true,
          submittedAt: true,
        },
      }),
    ]);

    // newest first -> first one seen per point is the latest remark
    const latest = (rows, keyOf) => {
      const m = new Map();
      for (const r of rows) {
        const k = keyOf(r);
        if (!m.has(k)) m.set(k, new Map());
        const byPt = m.get(k);
        const pt = Number(r.pointNo);
        if (!byPt.has(pt)) byPt.set(pt, r);
      }
      return m;
    };
    const lineRem = latest(lineRemarks, (r) => r.auditResultId);
    const headerRem = latest(headerRemarks, () => "h");

    // one record (header or one line) -> counts + per-point rows
    const describe = (results, checkedPoints, remarkMap) => {
      const remarked = remarkMap ? [...remarkMap.keys()] : [];
      const counts = analyseRecord(results, checkedPoints, remarked);
      const mandatory = new Set(
        getMandatoryPoints(results).map((p) => Number(p.pointNo)),
      );
      const points = (results || [])
        .map((p) => {
          const no = Number(p.pointNo);
          const result = classifyPoint(p); // verified | notVerified | na | manual
          let state = result; // verified | na | manual | notVerified
          if (mandatory.has(no)) {
            state = isPointCovered(no, checkedPoints, remarked)
              ? "closed"
              : "pending";
          }
          const rem = remarkMap?.get(no);
          return {
            pointNo: no,
            title: getPointDefinition(no)?.title || "",
            severity: severityOf(no),
            result,
            state, // verified | na | manual | closed | pending
            remark: rem?.remark || "",
            systemWrong: rem ? !!rem.isSystemResultWrong : null,
            remarkedAt: rem?.submittedAt || null,
          };
        })
        .sort((a, b) => a.pointNo - b.pointNo);
      return { counts, points };
    };

    const pickCounts = (c) => ({
      verified: c.verified,
      notVerified: c.notVerified,
      closed: c.nvClosed,
      pending: c.nvPending,
      na: c.na,
      manual: c.manual,
    });

    let headerOut = null;
    let hCounts = emptyCounts();
    if (header) {
      const d = describe(
        header.results,
        header.checkedPoints,
        headerRem.get("h"),
      );
      hCounts = d.counts;
      headerOut = { ...pickCounts(d.counts), points: d.points };
    }

    const lCounts = emptyCounts();
    const lineOut = lines.map((row) => {
      const d = describe(row.results, row.checkedPoints, lineRem.get(row.id));
      for (const k of Object.keys(lCounts)) lCounts[k] += d.counts[k] || 0;
      const li =
        row.po_line_item ||
        (row.po_material_number?.includes("-")
          ? row.po_material_number.split("-").slice(1).join("-")
          : row.po_material_number) ||
        "—";
      return {
        lineItem: li,
        source_file_ts: row.source_file_ts?.toISOString?.() || null,
        materialCode: row.material_code || null,
        materialDescription: row.material_disc || null,
        netValue: row.net_value ?? null,
        status: poStatusOf(emptyCounts(), d.counts),
        ...pickCounts(d.counts),
        points: d.points,
      };
    });
    lineOut.sort((a, b) =>
      String(a.lineItem).localeCompare(String(b.lineItem), undefined, {
        numeric: true,
      }),
    );

    return res.status(200).json({
      poNumber,
      source_file_ts: sourceFileTs?.toISOString?.() || null,
      poStatus: poStatusOf(hCounts, lCounts),
      header: headerOut,
      lines: lineOut,
      lineTotals: pickCounts(lCounts),
    });
  } catch (error) {
    console.error("Error in getPoStatusDetail:", error);
    return res.status(500).json({ message: "Failed to load PO detail" });
  }
};
