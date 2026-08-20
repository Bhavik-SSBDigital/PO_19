import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Box, Typography, Tabs, Tab, Chip, Pagination } from "@mui/material";
import { toast } from "react-toastify";

import PoWiseExceptionsTable from "pages/executive-dashboard/components/PoWiseExceptionsTable";
import PoLineItemBreakdownDialog from "pages/executive-dashboard/components/PoLineItemBreakdownDialog";
import PoDetailsPreviewDialog from "pages/executive-dashboard/components/PoDetailsPreviewDialog";
import PoAdvancedFilterBar from "pages/executive-dashboard/components/PoAdvancedFilterBar";
import { post } from "utils/axiosApi";
import { buildSearchUrl } from "utils/po-link-utils";

const useRoleFlags = () => {
  const role = localStorage.getItem("role") || "";
  return {
    isAdmin: role === "isAdmin",
    isProcurementManager: role === "isProcurementManager",
    isBuyer: role === "isBuyer",
  };
};

const TABS = [
  {
    value: "pending",
    label: "Pending to be Reviewed",
    match: (r) => r.reviewStatus === "pending",
    chipBg: "#fee2e2",
    chipColor: "#b91c1c",
  },
  {
    value: "in_progress",
    label: "Being Reviewed",
    match: (r) => r.reviewStatus === "in_progress",
    chipBg: "#fef3c7",
    chipColor: "#92400e",
  },
  {
    value: "reviewed",
    label: "Reviewed",
    match: (r) => r.reviewStatus === "reviewed",
    chipBg: "#dcfce7",
    chipColor: "#15803d",
  },
];

const PAGE_SIZE = 25;

const PODataPage = () => {
  const navigate = useNavigate();
  const { isAdmin, isProcurementManager, isBuyer } = useRoleFlags();

  const [loading, setLoading] = useState(true);
  const [poData, setPoData] = useState([]);
  const [poPreview, setPoPreview] = useState(null); 
  const [poBreakdown, setPoBreakdown] = useState(null); 
  const [advancedFilters, setAdvancedFilters] = useState({});
  const [activeTab, setActiveTab] = useState("pending");
  const [pageByTab, setPageByTab] = useState({ pending: 1, in_progress: 1, reviewed: 1 });

  const fetchTableData = useCallback(async (filters = {}) => {
    setLoading(true);
    try {
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
    setPageByTab({ pending: 1, in_progress: 1, reviewed: 1 });
  };

  const handleRowAction = (row, mode) => {
    if (!row) return;
    if (mode === "breakdown") {
      setPoBreakdown(row);
      return;
    }
    const lineItem = (row.lineItems && row.lineItems[0]) || null;
    if (mode === "newtab") {
      window.open(buildSearchUrl(row.poNumber, lineItem), "_blank", "noopener,noreferrer");
    } else {
      setPoPreview({ poNumber: row.poNumber, lineItem });
    }
  };

  const openLineItemPreview = (poNumber, lineItem) => {
    setPoBreakdown(null);
    setPoPreview({ poNumber, lineItem });
  };

  const openLineItemNewTab = (poNumber, lineItem) => {
    window.open(buildSearchUrl(poNumber, lineItem), "_blank", "noopener,noreferrer");
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

  const rowsByTab = useMemo(() => {
    const buckets = { pending: [], in_progress: [], reviewed: [] };
    for (const row of poData) {
      const tab = TABS.find((t) => t.match(row));
      buckets[tab ? tab.value : "pending"].push(row);
    }
    return buckets;
  }, [poData]);

  const restrictedNotice =
    isBuyer && !(isAdmin || isProcurementManager)
      ? "Showing only POs in your purchasing group"
      : undefined;

  const activeTabDef = TABS.find((t) => t.value === activeTab) || TABS[0];
  const activeRows = rowsByTab[activeTab] || [];
  const activePage = pageByTab[activeTab] || 1;
  const pageCount = Math.max(Math.ceil(activeRows.length / PAGE_SIZE), 1);
  const pagedRows = activeRows.slice((activePage - 1) * PAGE_SIZE, activePage * PAGE_SIZE);

  return (
    <Box sx={{ maxWidth: 'xl', mx: 'auto', p: { xs: 2, sm: 3 } }}>
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" sx={{ fontWeight: 800, color: '#0f172a', mb: 1 }}>
          PO Data & Exceptions Master
        </Typography>
        <Typography variant="body1" sx={{ color: '#64748b' }}>
          Comprehensive view of every Purchase Order in scope — filterable by purchasing group and individual line-item compliance status.
        </Typography>
      </Box>

      <PoAdvancedFilterBar
        isAdmin={isAdmin}
        isProcurementManager={isProcurementManager}
        onApply={handleApplyFilters}
      />

      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3, mt: 2 }}>
        <Tabs
          value={activeTab}
          onChange={(_, v) => setActiveTab(v)}
          sx={{
            '& .MuiTab-root': { textTransform: 'none', fontWeight: 700, fontSize: '0.95rem', minHeight: 48 },
          }}
        >
          {TABS.map((t) => (
            <Tab
              key={t.value}
              value={t.value}
              label={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  {t.label}
                  <Chip
                    size="small"
                    label={loading ? '—' : rowsByTab[t.value].length}
                    sx={{ height: 20, fontWeight: 700, bgcolor: t.chipBg, color: t.chipColor }}
                  />
                </Box>
              }
            />
          ))}
        </Tabs>
      </Box>

      <PoWiseExceptionsTable
        loading={loading}
        onRowAction={handleRowAction}
        rows={pagedRows}
        /* Clearly distinguishes page size from total to prevent user confusion */
        title={`${activeTabDef.label} — Page ${activePage} (Showing ${pagedRows.length} of ${activeRows.length} Total)`}
        showTotals
        showProgress
        infoText="Click any PO to see its per-line-item breakdown — which line items are closed and which are still pending. Review Progress shows closedLineCount/totalLineCount (e.g. 3/8)."
        restrictedNotice={restrictedNotice}
      />

      {pageCount > 1 && (
        <Box display="flex" justifyContent="center" sx={{ mt: 2 }}>
          <Pagination
            count={pageCount}
            page={activePage}
            onChange={(_, v) => setPageByTab((p) => ({ ...p, [activeTab]: v }))}
            color="primary"
          />
        </Box>
      )}

      <PoLineItemBreakdownDialog
        po={poBreakdown}
        onClose={() => setPoBreakdown(null)}
        onViewLineItem={openLineItemPreview}
        onOpenLineItemNewTab={openLineItemNewTab}
      />

      <PoDetailsPreviewDialog
        preview={poPreview}
        onClose={() => setPoPreview(null)}
        onOpenFullPage={openFullSearchPage}
        onHeaderChanged={() => fetchTableData(advancedFilters)}
      />
    </Box>
  );
};

export default PODataPage;