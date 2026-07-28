import { prisma } from "../lib/prisma.js";
import {
  getPurchaseGroupCode,
  getVendorInfo,
  getVendorName,
  getPurchaseGroupName,
} from "../utility/master-data.js";

/**
 * Standalone RC Overlap controller.
 *
 * Backs the new "/rc-overlap" page/section, which is now the ONLY place
 * Rule 19 (RC Overlap) results are shown. Data comes from the dedicated
 * `rc_overlap_results` table (populated via `node addrc.js`), NOT from
 * AuditResult.results — RC Overlap is a fact about an RC (vendor + material
 * + RC number), not about any individual PO line.
 *
 * ACCESS CONTROL (matches the PO Data page's pattern):
 *   - Admin / Procurement Manager: full access, every RC, full detail.
 *   - Buyer: scoped to RCs relevant to their own purchasing group only.
 *     RC master data has no purchasing-group column of its own, so
 *     "relevant to this buyer" is derived at import time (engine.py cross-
 *     references POAUDIT against POAUDITRC) and stored as
 *     RcOverlapResult.purchaseGroups — the set of purchasing groups whose
 *     PO lines actually reference that RC. A Buyer only sees rows where
 *     their own group appears in that array.
 *   - Anyone else: 403, same as PO Data.
 *
 * This is a UX/data-scoping boundary enforced server-side (unlike
 * RequireRbac on the frontend, which is only a navigation convenience) —
 * every endpoint below checks req.user itself.
 *
 * MASTER DATA ENRICHMENT (new):
 * RcOverlapResult only stores raw codes (vendorCode, purchaseGroups[]) — no
 * names. Every response below now runs each row through enrichRcOverlapRow
 * so the frontend gets the same resolved-name fields the PO Data / PO
 * Remarks Report pages already show (vendorName, vendorGstin,
 * purchaseGroupNames). Note: there is currently no Material Master lookup
 * wired up in utility/master-data.js, so rcMaterialCode is passed through
 * as-is (no materialDesc) — add a getMaterialName()-style helper there if
 * that master file becomes available.
 */

function buildFilterWhere(body = {}) {
  const and = [];

  if (body.vendorCode) {
    and.push({
      vendorCode: { contains: body.vendorCode, mode: "insensitive" },
    });
  }
  if (body.rcMaterialCode) {
    and.push({
      rcMaterialCode: { contains: body.rcMaterialCode, mode: "insensitive" },
    });
  }
  if (body.rcNumber) {
    and.push({ rcNumber: { contains: body.rcNumber, mode: "insensitive" } });
  }
  if (body.status) {
    and.push({ status: body.status });
  }
  if (body.search) {
    and.push({
      OR: [
        { vendorCode: { contains: body.search, mode: "insensitive" } },
        { rcMaterialCode: { contains: body.search, mode: "insensitive" } },
        { rcNumber: { contains: body.search, mode: "insensitive" } },
      ],
    });
  }

  return and;
}

/**
 * Adds the role-based scoping clause on top of whatever filters the
 * request already supplied. Returns { where, scope, ownGroup } — `scope`
 * is echoed back in the response so the frontend can show a "restricted
 * to your group" notice, same as PO Data does.
 *
 * Throws a {status, message} plain object for the caller to translate into
 * an HTTP response when the role isn't allowed at all.
 */
function buildScopedWhere(req, body) {
  const and = buildFilterWhere(body);
  const user = req.user || {};

  if (user.isAdmin || user.isProcurementManager) {
    // Admin/PM can optionally still filter DOWN to a specific group via the
    // advanced filter bar, but are not restricted to one.
    if (body.purchaseGroup) {
      and.push({ purchaseGroups: { has: body.purchaseGroup } });
    }
    return {
      where: and.length ? { AND: and } : {},
      scope: null,
      ownGroup: null,
    };
  }

  if (user.isBuyer) {
    const ownGroup = getPurchaseGroupCode(user.username);
    if (!ownGroup) {
      // No purchasing group on file for this buyer - show nothing rather
      // than accidentally leaking everything.
      and.push({ purchaseGroups: { has: "__no_group_assigned__" } });
    } else {
      and.push({ purchaseGroups: { has: ownGroup } });
    }
    return {
      where: { AND: and },
      scope: { restrictedToPurchaseGroup: ownGroup || user.username },
      ownGroup,
    };
  }

  const err = new Error("Not authorized to view RC Overlap data");
  err.status = 403;
  throw err;
}

/**
 * Whether a single already-fetched RcOverlapResult record is visible to
 * this user - used by the detail endpoint, where we fetch by id/rcNumber
 * first and then need to check access on that specific row.
 */
function canAccessRecord(user, record) {
  if (user.isAdmin || user.isProcurementManager) return true;
  if (user.isBuyer) {
    const ownGroup = getPurchaseGroupCode(user.username);
    return !!ownGroup && (record.purchaseGroups || []).includes(ownGroup);
  }
  return false;
}

/**
 * Resolves master-data names onto a raw RcOverlapResult row, mirroring the
 * fallback chain po-controller.js already uses (vendor snapshot-on-row →
 * vendor master → getVendorName). purchaseGroups is an array here (unlike
 * AuditResult.purchase_group), so we resolve each code and keep BOTH the
 * raw codes and resolved names, same "code + codeName" pairing pattern
 * used everywhere else (plant/plantName, poType/poTypeName, etc.).
 */
function enrichRcOverlapRow(record) {
  if (!record) return record;
  const vendor = getVendorInfo(record.vendorCode);
  const purchaseGroupNames = (record.purchaseGroups || []).map((code) => ({
    code,
    name: getPurchaseGroupName(code) || code,
  }));

  return {
    ...record,
    vendorName: vendor?.name || getVendorName(record.vendorCode),
    vendorGstin: vendor?.gstin || "",
    vendorState: vendor?.state || "", // parity with enrichPoRow in po-controller.js
    purchaseGroupNames,
  };
}

/**
 * POST /reports/rc-overlap
 * Paginated, filterable, role-scoped list of RC Overlap results.
 */
export const getRcOverlapResults = async (req, res) => {
  try {
    const user = req.user || {};
    const { page = 1, pageSize = 25 } = req.body || {};

    let where, scope;
    try {
      ({ where, scope } = buildScopedWhere(req, req.body || {}));
    } catch (err) {
      return res
        .status(err.status || 403)
        .json({ message: err.message || "Not authorized" });
    }

    const take = Math.min(Number(pageSize) || 25, 200);
    const skip = (Math.max(Number(page) || 1, 1) - 1) * take;

    const [results, total, notVerifiedCount] = await Promise.all([
      prisma.rcOverlapResult.findMany({
        where,
        orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
        take,
        skip,
      }),
      prisma.rcOverlapResult.count({ where }),
      prisma.rcOverlapResult.count({
        where: { ...where, status: "Not Verified" },
      }),
    ]);

    return res.status(200).json({
      results: results.map(enrichRcOverlapRow),
      total,
      notVerifiedCount,
      page: Number(page),
      pageSize: take,
      scope,
    });
  } catch (error) {
    console.error("Error in getRcOverlapResults:", error);
    return res
      .status(500)
      .json({ message: "Failed to fetch RC Overlap results" });
  }
};

/**
 * POST /reports/rc-overlap-detail
 * Single RC's detail, including the sibling RCs it overlaps with (if any).
 * A Buyer gets 403 if the RC they asked for isn't in their own group's
 * purchaseGroups set - this is the row-level equivalent of the list
 * endpoint's scoping.
 */
export const getRcOverlapDetail = async (req, res) => {
  try {
    const user = req.user || {};
    if (!(user.isAdmin || user.isProcurementManager || user.isBuyer)) {
      return res.status(403).json({ message: "Not authorized" });
    }

    const { id, rcNumber, vendorCode, rcMaterialCode } = req.body || {};

    if (!id && !rcNumber) {
      return res.status(400).json({ message: "id or rcNumber is required" });
    }

    const where = id
      ? { id }
      : {
          rcNumber,
          ...(vendorCode ? { vendorCode } : {}),
          ...(rcMaterialCode ? { rcMaterialCode } : {}),
        };

    const record = id
      ? await prisma.rcOverlapResult.findUnique({ where })
      : await prisma.rcOverlapResult.findFirst({ where });

    if (!record) {
      return res.status(404).json({ message: "RC Overlap record not found" });
    }

    if (!canAccessRecord(user, record)) {
      return res
        .status(403)
        .json({ message: "Not authorized to view this RC" });
    }

    let overlappingRecords = [];
    if (record.overlappingRcs?.length) {
      const allOverlaps = await prisma.rcOverlapResult.findMany({
        where: {
          vendorCode: record.vendorCode,
          rcMaterialCode: record.rcMaterialCode,
          rcNumber: { in: record.overlappingRcs },
        },
      });
      // A Buyer should only see the sibling overlaps that are ALSO in their
      // own group's scope - otherwise the detail dialog would leak RC
      // numbers/validity dates from other purchasing groups' contracts via
      // the "overlapping RCs" list, even though the list/search endpoints
      // correctly hide them.
      overlappingRecords = allOverlaps
        .filter((r) => canAccessRecord(user, r))
        .map(enrichRcOverlapRow);
    }

    return res.status(200).json({
      ...enrichRcOverlapRow(record),
      overlappingRecords,
    });
  } catch (error) {
    console.error("Error in getRcOverlapDetail:", error);
    return res
      .status(500)
      .json({ message: "Failed to fetch RC Overlap detail" });
  }
};

/**
 * POST /reports/rc-overlap-summary
 * Small counts block for a header/summary strip on the RC Overlap page
 * (e.g. "12 Not Verified / 340 total"), same scoping as the list endpoint.
 */
export const getRcOverlapSummary = async (req, res) => {
  try {
    let where;
    try {
      ({ where } = buildScopedWhere(req, req.body || {}));
    } catch (err) {
      return res
        .status(err.status || 403)
        .json({ message: err.message || "Not authorized" });
    }

    const [total, notVerified, verified] = await Promise.all([
      prisma.rcOverlapResult.count({ where }),
      prisma.rcOverlapResult.count({
        where: { ...where, status: "Not Verified" },
      }),
      prisma.rcOverlapResult.count({
        where: { ...where, status: "Verified" },
      }),
    ]);

    return res.status(200).json({ total, notVerified, verified });
  } catch (error) {
    console.error("Error in getRcOverlapSummary:", error);
    return res
      .status(500)
      .json({ message: "Failed to fetch RC Overlap summary" });
  }
};
