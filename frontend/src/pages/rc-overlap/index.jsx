import { useCallback, useEffect, useRef, useState } from "react";
import { Box, Typography } from "@mui/material";
import { toast } from "react-toastify";

import RcOverlapTable from "pages/rc-overlap/components/RcOverlapTable";
import RcOverlapDetailDialog from "pages/rc-overlap/components/RcOverlapDetailDialog";
import RcOverlapDownloadExcel from "pages/rc-overlap/components/download-excel";
import { post } from "utils/axiosApi";

const PAGE_SIZE = 25;
const SEARCH_DEBOUNCE_MS = 350;

// Mirrors the useRoleFlags hook in pages/audit/search-audit-data.jsx so the
// RC Overlap page can gate remark write access (buyer-only) and lock/unlock
// access (admin/PM/buyer) the same way the PO Data page does for line- and
// header-level remarks.
const useRoleFlags = () => {
  const role = localStorage.getItem("role") || "";
  return {
    isAdmin: role === "isAdmin",
    isBuyer: role === "isBuyer",
    isProcurementManager: role === "isProcurementManager",
    isAuditor: role === "isAuditor",
  };
};

/**
 * Standalone RC Overlap page (/rc-overlap).
 *
 * This is the client-requested dedicated section for Rule 19 (RC Overlap) —
 * it is now the ONLY place this check is shown; it no longer appears as
 * point #19 inside PO Data & Results / the dashboard's PO-Wise Exceptions
 * table. Data is served from the dedicated rc_overlap_results table via
 * /reports/rc-overlap (see controller/rc-overlap-controller.js), which
 * ALSO enforces access control server-side: Admin/PM see every RC with
 * full detail; a Buyer only sees RCs relevant to their own purchasing
 * group. The `scope` the backend returns drives the restrictedNotice shown
 * below, mirroring the PO Data page's pattern.
 *
 * NEW: RC-level remarks. A buyer can leave a remark against an RC (and
 * mark it "Checked", locking further remarks) the same way they already
 * can for header- and line-level audit points — see
 * controller/rc-remarks-controller.js. That UI lives inside
 * RcOverlapDetailDialog; this page just needs to know who's looking so it
 * can pass roleFlags/currentUserId down.
 */
const RcOverlapPage = () => {
  const roleFlags = useRoleFlags();
  const currentUserId = localStorage.getItem("userId");

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [notVerifiedCount, setNotVerifiedCount] = useState(0);
  const [scope, setScope] = useState(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  // Default filter = "Not Verified" (Part 4 of the closure overhaul): the
  // buyer's own workflow always lands on the actionable subset first, with
  // the option to switch to All/Verified via the dropdown exactly like
  // before.
  const [status, setStatus] = useState("Not Verified");
  const [selectedRcId, setSelectedRcId] = useState(null);

  const debounceRef = useRef(null);

  const fetchData = useCallback(async (targetPage, targetSearch, targetStatus) => {
    setLoading(true);
    try {
      const response = await post("/reports/rc-overlap", {
        page: targetPage,
        pageSize: PAGE_SIZE,
        search: targetSearch || undefined,
        status: targetStatus || undefined,
      });
      setRows(response?.results || []);
      setTotal(response?.total || 0);
      setNotVerifiedCount(response?.notVerifiedCount || 0);
      setScope(response?.scope || null);
    } catch (err) {
      console.error("Failed to fetch RC Overlap data:", err);
      toast.error("Failed to load RC Overlap records");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(1, "", "Not Verified");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearchChange = (value) => {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      fetchData(1, value, status);
    }, SEARCH_DEBOUNCE_MS);
  };

  const handleStatusChange = (value) => {
    setStatus(value);
    setPage(1);
    fetchData(1, search, value);
  };

  const handlePageChange = (value) => {
    setPage(value);
    fetchData(value, search, status);
  };

  // Re-runs the current page's fetch after a remark is added/edited/
  // deleted or the RC is locked/unlocked from the detail dialog, so the
  // "Buyer Check" column in the table stays in sync without a full page
  // reload.
  const refreshCurrentPage = () => fetchData(page, search, status);

  const pageCount = Math.max(Math.ceil(total / PAGE_SIZE), 1);

  return (
    <Box sx={{ maxWidth: "xl", mx: "auto", p: { xs: 2, sm: 3 } }}>
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" sx={{ fontWeight: 800, color: "#0f172a", mb: 1 }}>
          RC Overlap
        </Typography>
        <Typography variant="body1" sx={{ color: "#64748b" }}>
          Every Rate Contract checked for overlapping validity periods against other RCs for the same vendor and material — click any row for details.
        </Typography>
      </Box>

      <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 1.5 }}>
        <RcOverlapDownloadExcel search={search} status={status} />
      </Box>

      <RcOverlapTable
        loading={loading}
        rows={rows}
        total={total}
        notVerifiedCount={notVerifiedCount}
        page={page}
        pageCount={pageCount}
        onPageChange={handlePageChange}
        search={search}
        onSearchChange={handleSearchChange}
        status={status}
        onStatusChange={handleStatusChange}
        onRowClick={(row) => setSelectedRcId(row.id)}
        roleFlags={roleFlags}
        currentUserId={currentUserId}
        onChanged={refreshCurrentPage}
        restrictedNotice={
          scope?.restrictedToPurchaseGroup
            ? "Showing only RC Overlap records relevant to your purchasing group"
            : undefined
        }
      />

      <RcOverlapDetailDialog
        rcId={selectedRcId}
        onClose={() => setSelectedRcId(null)}
        roleFlags={roleFlags}
        currentUserId={currentUserId}
        onChanged={refreshCurrentPage}
      />
    </Box>
  );
};

export default RcOverlapPage;