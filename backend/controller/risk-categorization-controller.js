import { prisma } from "../lib/prisma.js";
// CHANGED: point content (title/summary/logic/dataPoints) now lives in the
// DB (AuditPointConfig table), not a file - see utility/point-definitions.js
// and scripts/seed-point-definitions.js. This controller no longer touches
// utility/point-reference.js at all.
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

// GET/POST /reports/audit-point-config
// Returns every audit point's fixed description (pointNo/title/summary/
// logic/dataPoints - never editable) plus its current, admin-set severity.
// Both now come straight from the DB (AuditPointConfig), read through
// point-definitions.js's cache.
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

// POST /risk-categorization/update-severity  { pointNo, severity }
// Admin-only. Adjust the `req.user?.role` check below to match however
// your auth middleware attaches the logged-in user's role.
//
// IMPORTANT: this endpoint only ever touches the `severity` column of
// AuditPointConfig. title/summary/logic/dataPoints/scope on that same row
// are NOT admin-editable here - they're fixed content maintained only via
// scripts/seed-point-definitions.js (see that file's header comment). This
// mirrors the old behavior exactly: an admin adjusts criticality, nothing
// else.
export const updateAuditPointSeverity = async (req, res) => {
  try {
    const role = req.user?.role || req.headers["x-user-role"];
    if (role && !["admin", "isAdmin"].includes(role)) {
      return res
        .status(403)
        .json({ message: "Only an admin can change audit point criticality" });
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
