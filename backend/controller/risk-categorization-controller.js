import { prisma } from "../lib/prisma.js";
import {
  POINT_DEFINITIONS,
  POINT_DEFINITIONS_BY_NO,
} from "../utility/point-reference.js";
import {
  SEVERITY_LEVELS,
  ensureSeverityLoaded,
  severityOf,
  invalidateSeverityCache,
} from "../utility/severity.js";

// GET/POST /reports/audit-point-config
// Returns every audit point's fixed description (pointNo/title/summary/
// logic/dataPoints - never editable) plus its current, admin-set severity.
export const getAuditPointConfig = async (req, res) => {
  try {
    await ensureSeverityLoaded();
    const points = POINT_DEFINITIONS.map((p) => ({
      pointNo: p.pointNo,
      title: p.title,
      summary: p.summary,
      logic: p.logic,
      dataPoints: p.dataPoints,
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
    if (!POINT_DEFINITIONS_BY_NO[String(pointNo)]) {
      return res
        .status(404)
        .json({ message: `Unknown audit point #${pointNo}` });
    }

    await prisma.auditPointConfig.upsert({
      where: { pointNo: Number(pointNo) },
      update: {
        severity,
        updatedBy: req.user?.username || req.user?.id || null,
      },
      create: {
        pointNo: Number(pointNo),
        severity,
        updatedBy: req.user?.username || req.user?.id || null,
      },
    });

    invalidateSeverityCache();
    await ensureSeverityLoaded();

    res.status(200).json({ pointNo: Number(pointNo), severity });
  } catch (error) {
    console.error("Error in updateAuditPointSeverity:", error);
    res.status(500).json({ message: "Failed to update audit point severity" });
  }
};
