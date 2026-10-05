import { prisma } from "../lib/prisma.js";
// Point content (title/summary/logic/dataPoints) lives in the DB
// (AuditPointConfig table), see utility/point-definitions.js and
// scripts/seed-point-definitions.js.
import {
  ensurePointDefinitionsLoaded,
  invalidatePointDefinitionsCache,
  listPointDefinitions,
} from "../utility/point-definitions.js";
import {
  SEVERITY_LEVELS,
  ensureSeverityLoaded,
  severityOf,
  invalidateSeverityCache,
} from "../utility/severity.js";

// Server-side checks. req.user is attached by requireAuth, which reads it
// from the token in the DB. Nothing here trusts client-sent headers.
// If requireAuth did not run, req.user is undefined and these deny.
const isAdminUser = (req) => !!req.user?.isAdmin;
const canEditSeverity = (req) =>
  !!(req.user?.isAdmin || req.user?.isProcurementManager);

// GET/POST /reports/audit-point-config
// Readable by any logged-in user. Returns each point's fixed description
// plus its current severity.
export const getAuditPointConfig = async (req, res) => {
  try {
    await Promise.all([ensureSeverityLoaded(), ensurePointDefinitionsLoaded()]);
    const points = listPointDefinitions().map((p) => ({
      pointNo: p.pointNo,
      title: p.title,
      summary: p.summary,
      logic: p.logic,
      dataPoints: p.dataPoints,
      scope: p.scope, // "header" | "line"
      severity: severityOf(p.pointNo),
    }));
    res.status(200).json({ points, severityLevels: SEVERITY_LEVELS });
  } catch (error) {
    console.error("Error in getAuditPointConfig:", error);
    res
      .status(500)
      .json({ message: "Failed to load audit point configuration" });
  }
};

// POST /risk-categorization/reload-point-config
// Admin-only. Drops this server process's in-memory caches and re-reads
// AuditPointConfig from the DB. Use after running
// `node scripts/seed-point-definitions.js`.
//
// NOTE: if the backend runs as multiple processes (PM2 cluster, several
// containers), each has its own cache. Call this on every instance or
// restart them all after a content change.
export const reloadPointConfig = async (req, res) => {
  try {
    if (!isAdminUser(req)) {
      return res.status(403).json({
        message: "Only an admin can reload audit point configuration",
      });
    }
    invalidateSeverityCache();
    invalidatePointDefinitionsCache();
    await Promise.all([ensureSeverityLoaded(), ensurePointDefinitionsLoaded()]);
    const points = listPointDefinitions();
    res.status(200).json({
      message: "Point configuration reloaded from DB",
      pointCount: points.length,
    });
  } catch (error) {
    console.error("Error in reloadPointConfig:", error);
    res.status(500).json({ message: "Failed to reload point configuration" });
  }
};

// POST /risk-categorization/update-severity  { pointNo, severity }
// Admin AND Procurement Manager. Only ever touches the `severity` column of
// AuditPointConfig. title/summary/logic/dataPoints/scope are fixed content
// maintained only via scripts/seed-point-definitions.js.
export const updateAuditPointSeverity = async (req, res) => {
  try {
    if (!canEditSeverity(req)) {
      return res.status(403).json({
        message:
          "Only an admin or procurement manager can change audit point criticality",
      });
    }

    const { pointNo, severity } = req.body || {};
    if (!pointNo || !SEVERITY_LEVELS.includes(severity)) {
      return res.status(400).json({
        message: `pointNo and a valid severity (${SEVERITY_LEVELS.join(", ")}) are required`,
      });
    }

    await ensurePointDefinitionsLoaded();
    const known = listPointDefinitions().some(
      (p) => Number(p.pointNo) === Number(pointNo),
    );
    if (!known) {
      return res
        .status(404)
        .json({ message: `Unknown audit point #${pointNo}` });
    }

    await prisma.auditPointConfig.update({
      where: { pointNo: Number(pointNo) },
      data: {
        severity,
        updatedBy: req.user?.username || req.user?.id || null,
      },
    });

    invalidateSeverityCache();
    invalidatePointDefinitionsCache();
    await Promise.all([ensureSeverityLoaded(), ensurePointDefinitionsLoaded()]);

    res.status(200).json({ pointNo: Number(pointNo), severity });
  } catch (error) {
    console.error("Error in updateAuditPointSeverity:", error);
    res.status(500).json({ message: "Failed to update audit point severity" });
  }
};
