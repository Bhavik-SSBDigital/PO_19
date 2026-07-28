import { useCallback, useEffect, useRef, useState } from "react";
import { Box, Typography } from "@mui/material";
import { toast } from "react-toastify";

import RcOverlapTable from "pages/rc-overlap/components/RcOverlapTable";
import RcOverlapDetailDialog from "pages/rc-overlap/components/RcOverlapDetailDialog";
import { post } from "utils/axiosApi";

const PAGE_SIZE = 25;
const SEARCH_DEBOUNCE_MS = 350;

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
 */
const RcOverlapPage = () => {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [notVerifiedCount, setNotVerifiedCount] = useState(0);
  const [scope, setScope] = useState(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
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
    fetchData(1, "", "");
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
        restrictedNotice={
          scope?.restrictedToPurchaseGroup
            ? "Showing only RC Overlap records relevant to your purchasing group"
            : undefined
        }
      />

      <RcOverlapDetailDialog rcId={selectedRcId} onClose={() => setSelectedRcId(null)} />
    </Box>
  );
};

export default RcOverlapPage;