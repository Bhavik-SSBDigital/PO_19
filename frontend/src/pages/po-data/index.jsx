import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Box, Typography } from "@mui/material";
import { toast } from "react-toastify";

// Adjust these import paths if your folder structure is slightly different
import PoWiseExceptionsTable from "pages/executive-dashboard/components/PoWiseExceptionsTable";
import PoDetailsPreviewDialog from "pages/executive-dashboard/components/PoDetailsPreviewDialog";
import PoAdvancedFilterBar from "pages/executive-dashboard/components/PoAdvancedFilterBar";
import { post } from "utils/axiosApi";
import { buildSearchUrl, getFirstLineItem } from "utils/po-link-utils";

// Adjust this to however your app actually determines the logged-in user's
// role flags (redux selector, decoded token, etc.) — mirrors the pattern
// already used elsewhere in this app (e.g. `localStorage.getItem("role")`
// in search-audit-data). Swap this out for the real source of truth.
const useRoleFlags = () => {
  const role = localStorage.getItem("role") || "";
  return {
    isAdmin: role === "isAdmin",
    isProcurementManager: role === "isProcurementManager",
    isBuyer: role === "isBuyer",
  };
};

const PODataPage = () => {
  const navigate = useNavigate();
  const { isAdmin, isProcurementManager, isBuyer } = useRoleFlags();

  const [loading, setLoading] = useState(true);
  const [poData, setPoData] = useState([]);
  const [poPreview, setPoPreview] = useState(null);
  // Advanced filter payload from PoAdvancedFilterBar (PM/Admin only;
  // stays {} for a Buyer, whose scope is enforced server-side regardless).
  const [advancedFilters, setAdvancedFilters] = useState({});

  const fetchTableData = useCallback(async (filters = {}) => {
    setLoading(true);
    try {
      // Calls the dedicated PO Data endpoint. As of the backend update this
      // now returns EVERY PO in scope — compliant and non-compliant alike —
      // not just the ones with an exception. `filters` carries whatever the
      // advanced filter bar produced (purchaseGroup, purchaseGroupName,
      // vendorSearch, poNumberSearch, plant, poType, date range, severity,
      // pointNo) — all optional, all ignored server-side for a Buyer.
      const response = await post("/reports/po-data", filters);

      const rows = response?.results || [];
      setPoData(rows);
    } catch (err) {
      console.error("Failed to fetch PO data:", err);
      toast.error("Failed to load PO records");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTableData(advancedFilters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleApplyFilters = (filters) => {
    setAdvancedFilters(filters);
    fetchTableData(filters);
  };

  const handleRowAction = (row, mode) => {
    if (!row) return;
    const lineItem = getFirstLineItem(row);
    if (mode === "newtab") {
      window.open(buildSearchUrl(row.poNumber, lineItem), "_blank", "noopener,noreferrer");
    } else {
      setPoPreview({ poNumber: row.poNumber, lineItem });
    }
  };

  const openFullSearchPage = (preview, newTab) => {
    if (!preview) return;
    const url = buildSearchUrl(preview.poNumber, preview.lineItem);
    if (newTab) {
      window.open(url, "_blank", "noopener,noreferrer");
    } else {
      navigate(url);
    }
    setPoPreview(null);
  };

  return (
    <Box sx={{ maxWidth: 'xl', mx: 'auto', p: { xs: 2, sm: 3 } }}>
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" sx={{ fontWeight: 800, color: '#0f172a', mb: 1 }}>
          PO Data & Exceptions Master
        </Typography>
        <Typography variant="body1" sx={{ color: '#64748b' }}>
          Comprehensive view of every Purchase Order in scope — compliant and non-compliant — filterable by purchasing group and individual line-item compliance status.
        </Typography>
      </Box>

      {/* Advanced filters — renders nothing for a Buyer; their scope is
          fixed to their own purchasing group regardless of this UI. */}
      <PoAdvancedFilterBar
        isAdmin={isAdmin}
        isProcurementManager={isProcurementManager}
        onApply={handleApplyFilters}
      />

      <PoWiseExceptionsTable
        loading={loading}
        onRowAction={handleRowAction}
        rows={poData}
        title="All Purchase Orders"
        showTotals
        infoText="Every PO in scope is listed here, compliant or not. Click any row to open its PO Data & Results — in a new tab or right here in a preview."
        restrictedNotice={
          isBuyer && !(isAdmin || isProcurementManager)
            ? "Showing only POs in your purchasing group"
            : undefined
        }
      />

      <PoDetailsPreviewDialog
        preview={poPreview}
        onClose={() => setPoPreview(null)}
        onOpenFullPage={openFullSearchPage}
      />
    </Box>
  );
};

export default PODataPage;