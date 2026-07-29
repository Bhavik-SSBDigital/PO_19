import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Box, Typography, Tabs, Tab, Chip } from "@mui/material";
import { toast } from "react-toastify";

// Adjust these import paths if your folder structure is slightly different
import PoWiseExceptionsTable from "pages/executive-dashboard/components/PoWiseExceptionsTable";
import PoLineItemBreakdownDialog from "pages/executive-dashboard/components/PoLineItemBreakdownDialog";
import PoDetailsPreviewDialog from "pages/executive-dashboard/components/PoDetailsPreviewDialog";
import PoAdvancedFilterBar from "pages/executive-dashboard/components/PoAdvancedFilterBar";
import { post } from "utils/axiosApi";
import { buildSearchUrl } from "utils/po-link-utils";

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

// Ordered tab definitions — order matches the natural review lifecycle:
// nothing started -> partially done -> fully done. `match` decides which
// tab a PO's `reviewStatus` (from the backend) belongs in.
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

const PODataPage = () => {
  const navigate = useNavigate();
  const { isAdmin, isProcurementManager, isBuyer } = useRoleFlags();

  const [loading, setLoading] = useState(true);
  const [poData, setPoData] = useState([]);
  const [poPreview, setPoPreview] = useState(null); // { poNumber, lineItem } — full audit-check detail
  const [poBreakdown, setPoBreakdown] = useState(null); // the PO row — per-line-item closed/open list
  // Advanced filter payload from PoAdvancedFilterBar (PM/Admin only;
  // stays {} for a Buyer, whose scope is enforced server-side regardless).
  const [advancedFilters, setAdvancedFilters] = useState({});
  // Which tab is showing. "pending" is the default landing tab — the
  // not-yet-started queue is usually what needs attention first.
  const [activeTab, setActiveTab] = useState("pending");

  const fetchTableData = useCallback(async (filters = {}) => {
    setLoading(true);
    try {
      // Calls the dedicated PO Data endpoint. It now returns EVERY PO in
      // scope — compliant and non-compliant alike — each carrying
      // closedLineCount/totalLineCount/reviewStatus/lineItemDetails so we
      // can split them into the three tabs below, and show a full
      // line-item breakdown on click, without a second round-trip.
      // `filters` carries whatever the advanced filter bar produced
      // (purchaseGroup, purchaseGroupName, vendorSearch, poNumberSearch,
      // plant, poType, date range, severity, pointNo) — all optional, all
      // ignored server-side for a Buyer.
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

  // Row-level menu action from PoWiseExceptionsTable:
  //  - "breakdown": open the per-line-item closed/open dialog for this PO
  //  - "newtab" / "modal": kept for whole-PO shortcuts (first line item)
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

  // Used by the breakdown dialog when the user picks one specific line item.
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

  // Split into the three tabs by reviewStatus. Falls back gracefully if an
  // older API response without reviewStatus ever slips through (treats it
  // as pending rather than silently dropping the row from every tab).
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
        rows={activeRows}
        title={activeTabDef.label}
        showTotals
        showProgress
        infoText="Click any PO to see its per-line-item breakdown — which line items are closed and which are still pending. Review Progress shows closedLineCount/totalLineCount (e.g. 3/8)."
        restrictedNotice={restrictedNotice}
      />

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
      />
    </Box>
  );
};

export default PODataPage;