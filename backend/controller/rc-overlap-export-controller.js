import XLSX from "xlsx";
import { prisma } from "../lib/prisma.js";
import {
  getPurchaseGroupCode,
  getVendorInfo,
  getVendorName,
  getPurchaseGroupName,
} from "../utility/master-data.js";

/**
 * RC Overlap Excel export - dedicated to the standalone /rc-overlap page
 * (rc-overlap-controller.js), mirroring the "2 export types" pattern
 * po-remarks-report-controller.js already offers (downloadPoRemarksReport
 * / downloadIssueTrackerReport):
 *
 *   exportType: "exceptions" -> only RCs currently "Not Verified" AND not
 *      yet covered by a remark (i.e. still pending buyer action - the
 *      actionable subset, same semantics as every other "Exceptions only"
 *      export in this app).
 *   exportType: "all" (default) -> every RC record in scope, regardless
 *      of status or coverage.
 *
 * Access control mirrors rc-overlap-controller.js exactly: Admin/PM see
 * every RC; a Buyer is scoped to RCs whose `purchaseGroups` array includes
 * their own purchasing group.
 *
 * This reads RcOverlapResult + its remarks read-only - it never writes
 * anything, so it cannot affect closure/tally state.
 */

function buildScopedWhere(user, { search, status, exportType }) {
  const and = [];

  if (user.isBuyer && !(user.isAdmin || user.isProcurementManager)) {
    const ownGroup = getPurchaseGroupCode(user.username);
    and.push({ purchaseGroups: { has: ownGroup || "__none__" } });
  }

  if (search) {
    and.push({
      OR: [
        { rcNumber: { contains: search, mode: "insensitive" } },
        { vendorCode: { contains: search, mode: "insensitive" } },
        { rcMaterialCode: { contains: search, mode: "insensitive" } },
      ],
    });
  }

  if (exportType === "exceptions") {
    // Exceptions = currently pending: Not Verified AND not yet closed.
    and.push({ status: "Not Verified", remarksLocked: false });
  } else if (status) {
    and.push({ status });
  }

  return and.length > 0 ? { AND: and } : {};
}

const COLUMNS = [
  ["RC Number", "rcNumber"],
  ["Vendor Code", "vendorCode"],
  ["Vendor Name", "vendorName"],
  ["Material Code", "rcMaterialCode"],
  ["Valid From", "validFrom"],
  ["Valid To", "validTo"],
  ["Status (System)", "status"],
  ["Purchase Group(s)", "purchaseGroups"],
  ["Buyer Check", "buyerCheck"],
  ["Latest Remark", "latestRemark"],
  ["Buyer's Result", "buyerResult"],
  ["Is PO Corrected?", "isPoCorrected"],
];

function rowsToSheetData(rows) {
  return [
    COLUMNS.map(([header]) => header),
    ...rows.map((row) =>
      COLUMNS.map(([, key]) => {
        const v = row[key];
        if (v instanceof Date) return v.toISOString();
        if (v === null || v === undefined) return "";
        return v;
      }),
    ),
  ];
}

export const downloadRcOverlapReport = async (req, res) => {
  try {
    const user = req.user || {};
    if (!(user.isAdmin || user.isProcurementManager || user.isBuyer)) {
      return res.status(403).json({ message: "Not authorized" });
    }

    const { search, status, exportType = "all" } = req.body || {};
    const where = buildScopedWhere(user, { search, status, exportType });

    const rcs = await prisma.rcOverlapResult.findMany({
      where,
      orderBy: { rcNumber: "asc" },
      take: 20000,
    });

    const rcIds = rcs.map((r) => r.id);
    const remarksByRcId = new Map();
    if (rcIds.length > 0) {
      const remarks = await prisma.poRcRemark.findMany({
        where: { rcOverlapResultId: { in: rcIds } },
        orderBy: { submittedAt: "desc" },
      });
      for (const r of remarks) {
        if (!remarksByRcId.has(r.rcOverlapResultId)) {
          remarksByRcId.set(r.rcOverlapResultId, r); // first hit = latest, due to orderBy
        }
      }
    }

    const rows = rcs.map((rc) => {
      const latest = remarksByRcId.get(rc.id);
      const vendor = getVendorInfo(rc.vendorCode);
      return {
        rcNumber: rc.rcNumber,
        vendorCode: rc.vendorCode,
        vendorName: vendor?.name || getVendorName(rc.vendorCode) || "",
        rcMaterialCode: rc.rcMaterialCode,
        validFrom: rc.validFrom,
        validTo: rc.validTo,
        status: rc.status,
        purchaseGroups: (rc.purchaseGroups || [])
          .map((code) => getPurchaseGroupName(code) || code)
          .join(", "),
        buyerCheck: rc.remarksLocked ? "Closed" : "Open",
        latestRemark: latest?.remark || "",
        buyerResult: latest?.buyerResult || "",
        isPoCorrected: latest
          ? latest.isSystemResultWrong
            ? "PO Corrected"
            : "System Altercation"
          : "",
      };
    });

    const worksheet = XLSX.utils.aoa_to_sheet(rowsToSheetData(rows));
    worksheet["!cols"] = COLUMNS.map(([header]) => ({
      wch: Math.max(12, header.length + 2),
    }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      worksheet,
      exportType === "exceptions" ? "RC Exceptions" : "RC Overlap (All)",
    );
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

    const filename = `rc-overlap-${exportType === "exceptions" ? "exceptions" : "all"}-${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.status(200).send(buffer);
  } catch (error) {
    console.error("Error in downloadRcOverlapReport:", error);
    return res
      .status(500)
      .json({ message: "Failed to generate RC Overlap export" });
  }
};
