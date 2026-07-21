import { prisma } from "../lib/prisma.js";
import {
  severityOf,
  classifyPoint,
  exceptionPointsOf,
} from "../utility/severity.js";

function buildWhere(body = {}) {
  const and = [{ type: "PO" }];

  if (body.poNumber)
    and.push({ po_number: { contains: body.poNumber, mode: "insensitive" } });
  if (body.vendorCode) and.push({ vendor_code: body.vendorCode });
  if (body.fiscalYear) and.push({ fiscalYear: body.fiscalYear });
  if (body.poType) and.push({ po_type: body.poType });
  if (body.purchaseGroup) and.push({ purchase_group: body.purchaseGroup });
  if (body.plant) and.push({ plant: body.plant });

  if (body.holdOnly === true || body.holdOnly === "true") {
    and.push({ po_status: "H" });
    if (body.holdBucket === "overdue")
      and.push({ hold_due_date: { lt: new Date() } });
    if (body.holdBucket === "not_due")
      and.push({ hold_due_date: { gte: new Date() } });
  }

  if (body.month) {
    const [y, m] = body.month.split("-").map(Number);
    if (y && m) {
      const from = new Date(Date.UTC(y, m - 1, 1));
      const to = new Date(Date.UTC(y, m, 1));
      and.push({ po_created_date: { gte: from, lt: to } });
    }
  }

  if (body.status === "unassigned") {
    and.push({
      OR: [
        { verificationWorkflow: null },
        { verificationWorkflow: { currentStatus: "unassigned" } },
      ],
    });
  } else if (body.status) {
    and.push({ verificationWorkflow: { currentStatus: body.status } });
  }

  return { AND: and };
}

// `severity` / `notVerifiedPointNo` filter on the per-point `results` Json
// array, which Prisma can't express as a plain `where` clause (there's no
// "some array element matches this condition" operator for Json columns
// here). Both are applied in-memory after the DB-level `where` above has
// already narrowed things down by every indexed column, so this only ever
// scans the rows that already matched plant/vendor/PO type/etc.
function matchesPointFilter(row, { severity, notVerifiedPointNo }) {
  if (!severity && !notVerifiedPointNo) return true;
  const wantedSeverities = severity
    ? String(severity)
        .split(",")
        .map((s) => s.trim())
    : null;
  return (row.results || []).some((p) => {
    if (classifyPoint(p) !== "notVerified") return false;
    if (notVerifiedPointNo && String(p.pointNo) !== String(notVerifiedPointNo))
      return false;
    if (wantedSeverities && !wantedSeverities.includes(severityOf(p.pointNo)))
      return false;
    return true;
  });
}

const INCLUDE = {
  verificationWorkflow: {
    include: {
      assignee: {
        select: { id: true, username: true, firstName: true, lastName: true },
      },
    },
  },
};

// See po-controller.js's lineItemOf()/uniqueKeyOf() for why this fallback
// exists: rows imported before po_line_item was a column derive it from
// po_material_number ("{po}-{line}") instead.
const lineItemOf = (row) => {
  if (row.po_line_item) return row.po_line_item;
  if (row.po_material_number && row.po_material_number.includes("-")) {
    return row.po_material_number.split("-").slice(1).join("-");
  }
  return null;
};

const withExceptionPoints = (row) => ({
  ...row,
  // Unique, human-readable identifier so the SAME po_number appearing
  // multiple times (multiple line items) is never ambiguous in a table.
  lineItemKey:
    row.po_material_number || `${row.po_number}-${lineItemOf(row) ?? row.id}`,
  lineItem: lineItemOf(row),
  exceptionPoints: exceptionPointsOf(row),
});

export const get_po_audit_results = async (req, res) => {
  try {
    const {
      page = 1,
      pageSize = 25,
      severity,
      notVerifiedPointNo,
    } = req.body || {};
    const where = buildWhere(req.body || {});
    const take = Math.min(Number(pageSize) || 25, 200);
    const skip = (Math.max(Number(page) || 1, 1) - 1) * take;

    if (severity || notVerifiedPointNo) {
      // Row-level Json filter requested (e.g. drilled down from the
      // dashboard's "Exceptions by Severity" or "Control-Wise Compliance"
      // charts) - fetch the DB-filtered set, filter in memory, paginate
      // after. `results` is always returned (no `select`), so no extra
      // query is needed.
      const all = await prisma.auditResult.findMany({
        where,
        include: INCLUDE,
        orderBy: { po_created_date: "desc" },
      });
      const filtered = all.filter((row) =>
        matchesPointFilter(row, { severity, notVerifiedPointNo }),
      );
      const rows = filtered.slice(skip, skip + take).map(withExceptionPoints);
      return res.status(200).json({
        results: rows,
        total: filtered.length,
        page: Number(page),
        pageSize: take,
      });
    }

    const [rows, total] = await Promise.all([
      prisma.auditResult.findMany({
        where,
        include: INCLUDE,
        orderBy: { po_created_date: "desc" },
        take,
        skip,
      }),
      prisma.auditResult.count({ where }),
    ]);

    return res.status(200).json({
      results: rows.map(withExceptionPoints),
      total,
      page: Number(page),
      pageSize: take,
    });
  } catch (error) {
    console.error("Error in get_po_audit_results:", error);
    return res
      .status(500)
      .json({ message: "Failed to fetch PO audit results" });
  }
};

const RESULT_INCLUDE = {
  verificationWorkflow: {
    include: {
      assignee: {
        select: { id: true, username: true, firstName: true, lastName: true },
      },
      closer: {
        select: { id: true, username: true, firstName: true, lastName: true },
      },
      workflowSteps: { orderBy: { timestamp: "asc" } },
    },
  },
};

export const get_po_audit_result = async (req, res) => {
  try {
    const { poMaterialNumber, id, po_number, fiscalYear } = req.body || {};

    if (!id && !poMaterialNumber && !po_number) {
      return res
        .status(400)
        .json({ message: "id, poMaterialNumber, or po_number is required" });
    }

    // Unique lookups - id or po_material_number both resolve to exactly one
    // row (or none), so these can go straight through findFirst as before.
    if (id || poMaterialNumber) {
      const where = { type: "PO" };
      if (id) where.id = id;
      if (poMaterialNumber) where.po_material_number = poMaterialNumber;
      if (fiscalYear) where.fiscalYear = fiscalYear;

      const result = await prisma.auditResult.findFirst({
        where,
        include: RESULT_INCLUDE,
      });
      if (!result)
        return res.status(404).json({ message: "PO audit result not found" });
      return res.status(200).json(withExceptionPoints(result));
    }

    // po_number (+ fiscalYear) lookup - NOT guaranteed unique: a PO number
    // can have several line items. This is exactly the case the user
    // flagged ("same PO number, multiple entries, no way to differ them") -
    // so the multi-match payload below now carries po_line_item /
    // po_material_number / material_disc so the picker is actually usable.
    const where = { type: "PO", po_number };
    if (fiscalYear) where.fiscalYear = fiscalYear;

    const matches = await prisma.auditResult.findMany({
      where,
      include: RESULT_INCLUDE,
      orderBy: { po_material_number: "asc" },
    });

    if (matches.length === 0) {
      return res.status(404).json({ message: "PO audit result not found" });
    }

    if (matches.length === 1) {
      return res.status(200).json(withExceptionPoints(matches[0]));
    }

    // Multiple line items under the same PO number (+ fiscal year) - refuse
    // to guess. Return enough to build a picker that actually disambiguates.
    return res.status(200).json({
      multipleMatches: true,
      total: matches.length,
      results: matches.map((r) => ({
        id: r.id,
        po_number: r.po_number,
        po_line_item: lineItemOf(r),
        po_material_number: r.po_material_number,
        material_code: r.material_code,
        material_disc: r.material_disc,
        plant: r.plant,
        net_value: r.net_value,
        fiscalYear: r.fiscalYear,
      })),
    });
  } catch (error) {
    console.error("Error in get_po_audit_result:", error);
    return res.status(500).json({ message: "Failed to fetch PO audit result" });
  }
};
