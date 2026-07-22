import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import PoDetailsPreviewDialog from "./components/PoDetailsPreviewDialog";
import { buildSearchUrl, getFirstLineItem } from "utils/po-link-utils";
import {
  Box, Card, CardActionArea, CardContent, Grid, IconButton, Paper, Skeleton,
  Tooltip as MuiTooltip, Typography, Chip, TextField, TableContainer, Table,
  TableHead, TableRow, TableCell, TableBody, TableSortLabel, InputAdornment, alpha,
  Menu, MenuItem,
} from "@mui/material";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import FileDownloadRoundedIcon from "@mui/icons-material/FileDownloadRounded";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import OpenInNewRoundedIcon from "@mui/icons-material/OpenInNewRounded";
import VisibilityRoundedIcon from "@mui/icons-material/VisibilityRounded";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line,
} from "recharts";
import moment from "moment";
import { toast } from "react-toastify";

import { post } from "utils/axiosApi";
import FilterBar, { DEFAULT_FILTERS } from "./components/FilterBar";
import DrilldownDialog from "./components/DrilldownDialog";
import {
  ControlWiseTooltip, SeverityTooltip, PoTypeTooltip, MonthlyTooltip,
  BucketTooltip,
} from "./components/tooltips";

// --- NEW MODERN THEME COLORS ---
const SEVERITY_COLORS = { Critical: "#ef4444", High: "#f97316", Medium: "#eab308", Low: "#94a3b8" };
const BAR_COLOR = "#6366f1"; // Sleek Indigo
const VERIFIED_COLOR = "#10b981"; // Emerald Green
const NOT_VERIFIED_COLOR = "#f43f5e"; // Rose Red

const InfoTip = ({ text, placement = "top" }) => {
  if (!text) return null;
  return (
    <MuiTooltip title={text} placement={placement} arrow enterTouchDelay={0}>
      <InfoOutlinedIcon sx={{ 
        fontSize: 18, 
        ml: 0.75, 
        color: "text.disabled", 
        cursor: "help", 
        verticalAlign: "text-bottom", 
        transition: 'color 0.2s',
        '&:hover': { color: '#6366f1' } 
      }} />
    </MuiTooltip>
  );
};

const KpiCard = ({ label, value, sublabel, loading, onClick, info }) => {
  const content = (
    <CardContent sx={{ p: 3 }}>
      <Box sx={{ display: "flex", alignItems: "center", mb: 1.5 }}>
        <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700, letterSpacing: 1, lineHeight: 1.2 }}>
          {label}
        </Typography>
        <InfoTip text={info} />
      </Box>
      {loading ? (
        <Skeleton width="60%" height={48} sx={{ borderRadius: 2 }} />
      ) : (
        <Typography variant="h3" sx={{ fontWeight: 800, color: 'text.primary', letterSpacing: -1 }}>
          {value}
        </Typography>
      )}
      {sublabel && (
        <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block', fontWeight: 500 }}>
          {sublabel}
        </Typography>
      )}
    </CardContent>
  );
  return (
    <Card 
      elevation={0} 
      sx={{ 
        height: "100%", 
        borderRadius: 4, 
        background: "linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)",
        border: '1px solid',
        borderColor: 'grey.100',
        boxShadow: '0 4px 20px -2px rgba(0,0,0,0.03)',
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        ...(onClick && {
          '&:hover': {
            transform: 'translateY(-6px)',
            boxShadow: '0 14px 28px rgba(0,0,0,0.08)',
            borderColor: alpha('#6366f1', 0.3)
          }
        })
      }}
    >
      {onClick ? <CardActionArea onClick={onClick} sx={{ height: "100%" }}>{content}</CardActionArea> : content}
    </Card>
  );
};

const ChartPanel = ({ title, hint, children, height = 320, info }) => (
  <Paper elevation={0} sx={{ 
    p: 3, 
    height: "100%", 
    borderRadius: 4, 
    background: '#ffffff',
    border: '1px solid', 
    borderColor: 'grey.100',
    boxShadow: '0 4px 20px -2px rgba(0,0,0,0.03)'
  }}>
    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", mb: 4 }}>
      <Box>
        <Typography variant="h6" sx={{ fontWeight: 800, color: '#1e293b', display: "flex", alignItems: "center" }}>
          {title}
          <InfoTip text={info} />
        </Typography>
        {hint && <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 500 }}>{hint}</Typography>}
      </Box>
    </Box>
    <Box sx={{ width: "100%", height }}>{children}</Box>
  </Paper>
);

const isCancel = (err) => err?.code === "ERR_CANCELED" || err?.name === "CanceledError";
const payloadOf = (d) => d?.payload ?? d ?? {};

const buildSummaryBody = (f) => ({
  ...(f.poNumber && { poNumber: f.poNumber }),
  ...(f.poDateFrom && { poDateFrom: f.poDateFrom }),
  ...(f.poDateTo && { poDateTo: f.poDateTo }),
  ...(f.prDateFrom && { prDateFrom: f.prDateFrom }),
  ...(f.prDateTo && { prDateTo: f.prDateTo }),
  ...(f.purchaseGroup?.length && { purchaseGroup: f.purchaseGroup }),
  ...(f.poType?.length && { poType: f.poType }),
  ...(f.plant && { plant: f.plant }),
  ...(f.vendorCode && { vendorCode: f.vendorCode }),
  ...(f.materialCode && { materialCode: f.materialCode }),
});

const csvEscape = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;

const joinLineItems = (r) => {
  if (Array.isArray(r.lineItems) && r.lineItems.length) {
    return r.lineItems.length > 4
      ? `${r.lineItems.slice(0, 4).join(", ")} +${r.lineItems.length - 4} more`
      : r.lineItems.join(", ");
  }
  return r.distinctLineItems ? `${r.distinctLineItems} line item(s)` : "—";
};

const PoWiseExceptionsTable = ({ rows, loading, onRowAction }) => {
  const [search, setSearch] = useState("");
  const [orderBy, setOrderBy] = useState("exceptionLineCount");
  const [order, setOrder] = useState("desc");
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [menuRow, setMenuRow] = useState(null);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const base = !term
      ? rows
      : rows.filter((r) =>
          [
            r.poNumber, r.vendorName, r.vendorCode, r.poType, r.poTypeName,
            r.plant, r.plantName, r.purchaseGroup, r.purchaseGroupName,
            r.paymentTerm, r.paymentTermDescription, r.purchase_req,
            r.vendorGstin, r.taxCode, ...(r.lineItems || []),
          ]
            .filter(Boolean)
            .some((f) => String(f).toLowerCase().includes(term)),
        );
    const sorted = [...base].sort((a, b) => {
      const av = a[orderBy] ?? "";
      const bv = b[orderBy] ?? "";
      if (typeof av === "number" && typeof bv === "number") return order === "asc" ? av - bv : bv - av;
      return order === "asc" ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });
    return sorted;
  }, [rows, search, orderBy, order]);

  const toggleSort = (field) => {
    if (orderBy === field) {
      setOrder(order === "asc" ? "desc" : "asc");
    } else {
      setOrderBy(field);
      setOrder("desc");
    }
  };

  const openRowMenu = (event, row) => {
    setMenuAnchor(event.currentTarget);
    setMenuRow(row);
  };

  const closeRowMenu = () => {
    setMenuAnchor(null);
    setMenuRow(null);
  };

  const columns = [
    { key: "poNumber", label: "PO Number", minWidth: 120 },
    { key: "lineItemsDisplay", label: "Line Item(s)", sortKey: "distinctLineItems", minWidth: 100 },
    { key: "purchase_req", label: "PR Number", minWidth: 120 },
    { key: "vendorName", label: "Vendor", minWidth: 180 },
    { key: "vendorGstin", label: "GSTIN", minWidth: 130 },
    { key: "plantName", label: "Plant", minWidth: 130 },
    { key: "poTypeName", label: "PO Type", minWidth: 130 },
    { key: "taxCode", label: "Tax Code", minWidth: 100 },
    { key: "purchaseGroupName", label: "Purchasing Group", minWidth: 150 },
    { key: "paymentTermDescription", label: "Payment Term", minWidth: 150 },
    { key: "exceptionLineCount", label: "Exceptions", minWidth: 100 },
    { key: "valueExposure", label: "Value Exposure", minWidth: 130 },
  ];

  return (
    <Paper elevation={0} sx={{ 
      p: 0, 
      borderRadius: 4, 
      background: '#ffffff',
      border: '1px solid', 
      borderColor: 'grey.100', 
      boxShadow: '0 4px 20px -2px rgba(0,0,0,0.03)',
      overflow: 'hidden' 
    }}>
      <Box sx={{ p: 3, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 800, color: '#1e293b', display: "flex", alignItems: "center" }}>
          PO-Wise Exceptions 
          <Chip size="small" label={`${rows.length} POs`} sx={{ ml: 2, fontWeight: 700, bgcolor: alpha('#6366f1', 0.1), color: '#6366f1' }} />
          <InfoTip text="Click ANY row to open its PO Data & Results — in a new tab or right here in a preview." />
        </Typography>
        <TextField
          size="small"
          placeholder="Search PO, vendor, PR, plant..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          InputProps={{
            startAdornment: <InputAdornment position="start"><SearchRoundedIcon fontSize="small" sx={{ color: 'text.secondary' }} /></InputAdornment>,
            sx: { borderRadius: 3, bgcolor: '#f8fafc', '& fieldset': { borderColor: 'transparent' }, '&:hover fieldset': { borderColor: 'grey.300' } }
          }}
          sx={{ minWidth: 320 }}
        />
      </Box>
      {loading ? (
        <Box sx={{ p: 3 }}><Skeleton variant="rectangular" height={320} sx={{ borderRadius: 2 }} /></Box>
      ) : (
        <TableContainer sx={{ maxHeight: 500, overflowX: 'auto' }}>
          <Table size="medium" stickyHeader sx={{ minWidth: 1200 }}>
            <TableHead>
              <TableRow>
                {columns.map((c) => (
                  <TableCell 
                    key={c.key} 
                    sx={{ 
                      bgcolor: '#f8fafc', 
                      fontWeight: 700, 
                      color: '#475569',
                      borderBottom: '2px solid',
                      borderColor: 'grey.100',
                      minWidth: c.minWidth,
                      whiteSpace: 'nowrap'
                    }}
                  >
                    <TableSortLabel
                      active={orderBy === (c.sortKey || c.key)}
                      direction={orderBy === (c.sortKey || c.key) ? order : "asc"}
                      onClick={() => toggleSort(c.sortKey || c.key)}
                    >
                      {c.label}
                    </TableSortLabel>
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {filtered.map((r) => (
                <TableRow 
                  key={r.poNumber} 
                  hover 
                  sx={{ 
                    cursor: "pointer", 
                    '&:last-child td': { border: 0 },
                    transition: 'background-color 0.2s',
                    '&:hover': { bgcolor: alpha('#6366f1', 0.04) }
                  }} 
                  onClick={(e) => openRowMenu(e, r)}
                >
                  <TableCell sx={{ fontWeight: 600, color: '#1e293b', whiteSpace: 'nowrap' }}>{r.poNumber}</TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>
                    <MuiTooltip title={(r.lineItems || []).join(", ") || "—"}>
                      <Chip size="small" label={joinLineItems(r)} sx={{ height: 24, fontSize: '0.75rem', fontWeight: 600, bgcolor: 'grey.100' }}/>
                    </MuiTooltip>
                  </TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap', color: '#475569' }}>{r.purchase_req || "—"}</TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', color: '#475569' }}>
                    <MuiTooltip title={r.vendorName || r.vendorCode || "—"}>
                      <span>{r.vendorName || r.vendorCode || "—"}</span>
                    </MuiTooltip>
                  </TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap', color: '#475569' }}>{r.vendorGstin || "—"}</TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap', color: '#475569' }}>{r.plantName || r.plant || "—"}</TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap', color: '#475569' }}>{r.poTypeName || r.poType || "—"}</TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap', color: '#475569' }}>{r.taxCode || "—"}</TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', color: '#475569' }}>
                    <MuiTooltip title={r.purchaseGroupName || r.purchaseGroup || "—"}>
                      <span>{r.purchaseGroupName || r.purchaseGroup || "—"}</span>
                    </MuiTooltip>
                  </TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', color: '#475569' }}>
                    <MuiTooltip title={r.paymentTermDescription || r.paymentTerm || "—"}>
                      <span>{r.paymentTermDescription || r.paymentTerm || "—"}</span>
                    </MuiTooltip>
                  </TableCell>
                  <TableCell sx={{ fontWeight: 700, color: r.exceptionLineCount > 0 ? '#ef4444' : 'inherit' }}>
                    {r.exceptionLineCount}
                  </TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap', fontWeight: 500, color: '#1e293b' }}>
                    {r.valueExposure?.toLocaleString?.() ?? r.valueExposure}
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={columns.length} align="center" sx={{ py: 6, color: 'text.secondary' }}>No matching POs found.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={closeRowMenu}>
        <MenuItem
          onClick={() => {
            onRowAction(menuRow, "newtab");
            closeRowMenu();
          }}
        >
          <OpenInNewRoundedIcon fontSize="small" sx={{ mr: 1.25, color: "text.secondary" }} />
          Open in New Tab
        </MenuItem>
        <MenuItem
          onClick={() => {
            onRowAction(menuRow, "modal");
            closeRowMenu();
          }}
        >
          <VisibilityRoundedIcon fontSize="small" sx={{ mr: 1.25, color: "text.secondary" }} />
          View Details Here
        </MenuItem>
      </Menu>
    </Paper>
  );
};

const ExecutiveDashboard = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);

  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [filterOptions, setFilterOptions] = useState({ plants: [], vendors: [], poTypes: [], purchaseGroups: [] });

  const [drilldown, setDrilldown] = useState(null);
  const [poPreview, setPoPreview] = useState(null);
  const abortRef = useRef(null);

  const fetchSummary = useCallback(async (activeFilters) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError("");
    try {
      const response = await post("/reports/executive-summary", buildSummaryBody(activeFilters), { signal: controller.signal });
      setData(response);
      setLastUpdated(new Date());
    } catch (err) {
      if (isCancel(err)) return;
      console.error("Error fetching executive summary:", err);
      setError("Could not reach the backend. Is it running, and has data been loaded via node addpo.js?");
      toast.error("Failed to load dashboard data");
    } finally {
      if (abortRef.current === controller) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSummary(filters);
    return () => abortRef.current?.abort();
  }, [filters, fetchSummary]);

  useEffect(() => {
    const loadOptions = async () => {
      try {
        const res = await post("/reports/filter-options", {});
        setFilterOptions(res || {});
      } catch (err) {
        console.error("Error fetching filter options:", err);
      }
    };
    loadOptions();
  }, []);

  const kpis = data?.kpis || {};
  const charts = data?.charts || {};
  const kpiDefs = data?.kpiDefinitions || {};
  const chartDefs = data?.chartDefinitions || {};

  const openDrilldown = (dimension, value, title, extra = {}) => setDrilldown({ dimension, value, title, ...extra });

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

  const exportSummaryCsv = () => {
    if (!data) return;
    const lines = ["Section,Key,Value,Extra"];
    Object.entries(kpis).forEach(([k, v]) => lines.push(`KPI,${csvEscape(k)},${csvEscape(v)},`));
    (charts.controlWiseCompliance || []).forEach((d) =>
      lines.push(`Control-Wise Compliance,Point ${d.pointNo} (${d.severity}),${d.compliancePct ?? "N/A"}%,verified=${d.verified} notVerified=${d.notVerified}`)
    );
    (charts.exceptionBySeverity || []).forEach((d) => lines.push(`Exceptions by Severity,${d.severity},${d.count},${d.pct}%`));
    (charts.plantWiseExceptions || []).forEach((d) => lines.push(`Plant-Wise Exceptions,${csvEscape(d.plantName || d.key)},${d.value},valueExposure=${d.valueExposure}`));
    (charts.vendorWiseTopExceptions || []).forEach((d) => lines.push(`Vendor-Wise Exceptions,${csvEscape(d.vendorName || d.name || d.key)},${d.value},valueExposure=${d.valueExposure}`));
    (charts.monthlyExceptionTrend || []).forEach((d) => lines.push(`Monthly Exception Trend,${d.month},${d.count},valueExposure=${d.valueExposure}`));
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `executive-summary-${moment().format("YYYYMMDD-HHmm")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Box sx={{ maxWidth: 'xl', mx: 'auto', p: { xs: 2, sm: 3 } }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", mb: 5, flexWrap: "wrap", gap: 3 }}>
        <Box>
          <Typography variant="h3" sx={{ 
            fontWeight: 900, 
            letterSpacing: -1, 
            background: 'linear-gradient(45deg, #2563eb, #7c3aed)', 
            WebkitBackgroundClip: 'text', 
            WebkitTextFillColor: 'transparent',
            mb: 1.5 
          }}>
            Executive P2P Compliance Control Tower
          </Typography>
          <Typography variant="body1" sx={{ display: "block", maxWidth: 800, lineHeight: 1.6, color: '#64748b' }}>
            Tracks how many of the 19 checkpoints each PO line passes. Hover the <InfoOutlinedIcon sx={{ fontSize: 16, verticalAlign: "text-bottom" }} /> icon
            on any card or chart below for what that specific metric means. Criticality of each checkpoint is managed on the Risk Categorization Master page.
          </Typography>
          {lastUpdated && (
            <Typography variant="caption" sx={{ mt: 1.5, display: 'block', fontWeight: 600, color: '#94a3b8' }}>
              Last updated {moment(lastUpdated).format("DD-MMM-YYYY HH:mm:ss")}
            </Typography>
          )}
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 2, p: 1.5, bgcolor: '#ffffff', borderRadius: 3, border: '1px solid', borderColor: 'grey.100', boxShadow: '0 4px 20px -2px rgba(0,0,0,0.03)' }}>
          <Chip
            label={kpis.overallComplianceScore != null ? `${kpis.overallComplianceScore}% compliant` : "—"}
            sx={{ 
              fontWeight: 800, 
              borderRadius: 2, 
              px: 1,
              bgcolor: kpis.overallComplianceScore >= 80 ? alpha('#10b981', 0.1) : kpis.overallComplianceScore >= 50 ? alpha('#eab308', 0.1) : alpha('#ef4444', 0.1),
              color: kpis.overallComplianceScore >= 80 ? '#10b981' : kpis.overallComplianceScore >= 50 ? '#eab308' : '#ef4444'
            }}
          />
          <Box sx={{ width: '1px', height: 24, bgcolor: 'divider' }} />
          <MuiTooltip title={kpiDefs.overallComplianceScore || "Export current summary as CSV"}>
            <Box component="span" sx={{ display: "inline-flex", cursor: !data ? "not-allowed" : "pointer" }}>
              <IconButton onClick={exportSummaryCsv} disabled={!data} sx={{ bgcolor: '#f8fafc', '&:hover': { bgcolor: '#f1f5f9' } }}>
                <FileDownloadRoundedIcon fontSize="small" sx={{ color: '#475569' }} />
              </IconButton>
            </Box>
          </MuiTooltip>
          <MuiTooltip title="Refresh">
            <Box component="span" sx={{ display: "inline-flex", cursor: loading ? "not-allowed" : "pointer" }}>
              <IconButton onClick={() => fetchSummary(filters)} disabled={loading} sx={{ bgcolor: alpha('#6366f1', 0.1), '&:hover': { bgcolor: alpha('#6366f1', 0.2) } }}>
                <RefreshRoundedIcon fontSize="small" sx={{ color: '#6366f1' }} />
              </IconButton>
            </Box>
          </MuiTooltip>
        </Box>
      </Box>

      <Box sx={{ mb: 4 }}>
        <FilterBar
          filters={filters}
          options={filterOptions}
          loading={loading}
          onApply={(next) => setFilters(next)}
          onReset={() => setFilters(DEFAULT_FILTERS)}
        />
      </Box>

      {error && (
        <Paper elevation={0} sx={{ p: 2.5, mb: 4, bgcolor: "#fef2f2", borderRadius: 3, border: '1px solid', borderColor: "#fecaca", color: "#b91c1c" }}>
          <Typography variant="body1" sx={{ fontWeight: 600 }}>{error}</Typography>
        </Paper>
      )}

      {/* KPI Cards */}
      <Grid container spacing={3} sx={{ mb: 5 }}>
        <Grid item xs={6} sm={4} md={2.4}>
          <KpiCard label="Total PO Count" value={kpis.totalPOCount ?? "—"} sublabel="Click to view all PO lines" loading={loading} info={kpiDefs.totalPOCount} onClick={kpis.totalPOCount ? () => openDrilldown("all", true, "All PO Lines") : undefined} />
        </Grid>
        <Grid item xs={6} sm={4} md={2.4}>
          <KpiCard label="Total PO Lines" value={kpis.totalPOLineItems ?? "—"} sublabel="Click to view all PO lines" loading={loading} info={kpiDefs.totalPOLineItems} onClick={kpis.totalPOLineItems ? () => openDrilldown("all", true, "All PO Lines") : undefined} />
        </Grid>
        <Grid item xs={6} sm={4} md={2.4}>
          <KpiCard label="Total PR Count" value={kpis.totalPRCount ?? "—"} sublabel="Click to view all PO lines" loading={loading} info={kpiDefs.totalPRCount} onClick={kpis.totalPRCount ? () => openDrilldown("all", true, "All PO Lines") : undefined} />
        </Grid>
        <Grid item xs={6} sm={4} md={2.4}>
          <KpiCard label="Hold PO Count" value={kpis.holdPOCount ?? "—"} sublabel="Click to drill in" loading={loading} info={kpiDefs.holdPOCount} onClick={kpis.holdPOCount ? () => openDrilldown("hold", true, "Hold POs") : undefined} />
        </Grid>
        <Grid item xs={6} sm={4} md={2.4}>
          <KpiCard label="Exception Exposure" value={kpis.exceptionValueExposure != null ? `$${kpis.exceptionValueExposure.toLocaleString()}` : "—"} sublabel="Click to drill in" loading={loading} info={kpiDefs.exceptionValueExposure} onClick={kpis.exceptionValueExposure ? () => openDrilldown("anyException", true, "Lines Contributing to Exception Value Exposure") : undefined} />
        </Grid>
        <Grid item xs={6} sm={4} md={2.4}>
          <KpiCard label="Verified Checks" value={kpis.verifiedCount ?? "—"} sublabel="Click to drill in" loading={loading} info={kpiDefs.verifiedCount} onClick={kpis.verifiedCount ? () => openDrilldown("verifiedAny", true, "Lines with at Least One Verified Checkpoint", { statusFilter: "verified" }) : undefined} />
        </Grid>
        <Grid item xs={6} sm={4} md={2.4}>
          <KpiCard label="Not Verified Checks" value={kpis.notVerifiedCount ?? "—"} sublabel="Click to drill in" loading={loading} info={kpiDefs.notVerifiedCount} onClick={kpis.notVerifiedCount ? () => openDrilldown("anyException", true, "Lines with at Least One Exception") : undefined} />
        </Grid>
        <Grid item xs={6} sm={4} md={2.4}>
          <KpiCard label="Not Applicable" value={kpis.notApplicableCount ?? "—"} sublabel="Click to drill in" loading={loading} info={kpiDefs.notApplicableCount} onClick={kpis.notApplicableCount ? () => openDrilldown("na", true, "Lines with at Least One N/A Checkpoint", { statusFilter: "na" }) : undefined} />
        </Grid>
        <Grid item xs={6} sm={4} md={2.4}>
          <KpiCard label="Manual Review" value={kpis.manualReviewCount ?? "—"} sublabel="Click to drill in" loading={loading} info={kpiDefs.manualReviewCount} onClick={kpis.manualReviewCount ? () => openDrilldown("manual", true, "Lines Needing Manual Review", { statusFilter: "manual" }) : undefined} />
        </Grid>
        <Grid item xs={6} sm={4} md={2.4}>
          <KpiCard label="High-Risk Alerts" value={kpis.highRiskExceptions ?? "—"} sublabel="Critical + High severity" loading={loading} info={kpiDefs.highRiskExceptions} onClick={kpis.highRiskExceptions ? () => openDrilldown("severity", "Critical,High", "High-Risk Exceptions (Critical + High)") : undefined} />
        </Grid>
      </Grid>

      {/* Charts Section */}
      <Grid container spacing={3}>
        <Grid item xs={12} md={7}>
          <ChartPanel title="Control-Wise Compliance" hint="% verified (Points 1-19). Click a bar to drill in." info={chartDefs.controlWiseCompliance}>
            {loading ? <Skeleton variant="rounded" height="100%" sx={{ borderRadius: 2 }} /> : (
              <ResponsiveContainer width="100%" height="95%">
                <BarChart data={charts.controlWiseCompliance || []} margin={{ top: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="pointNo" tickFormatter={(v) => `#${v}`} interval={0} axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12, fontWeight: 500 }} />
                  <YAxis domain={[0, 100]} unit="%" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12, fontWeight: 500 }} />
                  <Tooltip content={<ControlWiseTooltip />} cursor={{ fill: alpha('#6366f1', 0.05) }} />
                  <Bar
                    dataKey="compliancePct"
                    radius={[6, 6, 0, 0]}
                    cursor="pointer"
                    minPointSize={5}
                    onClick={(d) => {
                      const p = payloadOf(d);
                      openDrilldown("pointNo", p.pointNo, `Control Point #${p.pointNo}: ${p.title || p.label} - not-verified lines`);
                    }}
                  >
                    {(charts.controlWiseCompliance || []).map((d) => (
                      <Cell key={d.pointNo} fill={SEVERITY_COLORS[d.severity] || BAR_COLOR} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartPanel>
        </Grid>

        <Grid item xs={12} md={5}>
          <ChartPanel title="Exceptions by Severity" hint="Click a slice to drill in" info={(chartDefs.exceptionBySeverity || "") + " Criticality per checkpoint is set by an admin."}>
            {loading ? <Skeleton variant="rounded" height="100%" sx={{ borderRadius: 2 }} /> : (
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={charts.exceptionBySeverity || []}
                    dataKey="count"
                    nameKey="severity"
                    innerRadius={80}
                    outerRadius={110}
                    paddingAngle={5}
                    cursor="pointer"
                    stroke="none"
                    onClick={(d) => {
                      const p = payloadOf(d);
                      openDrilldown("severity", p.severity, `${p.severity} Severity Exceptions`);
                    }}
                  >
                    {(charts.exceptionBySeverity || []).map((entry) => (
                      <Cell key={entry.severity} fill={SEVERITY_COLORS[entry.severity] || "#94a3b8"} />
                    ))}
                  </Pie>
                  <Tooltip content={<SeverityTooltip />} />
                  <Legend iconType="circle" wrapperStyle={{ paddingTop: 20, fontSize: '14px', fontWeight: 600, color: '#334155' }}/>
                </PieChart>
              </ResponsiveContainer>
            )}
          </ChartPanel>
        </Grid>

        <Grid item xs={12} md={6}>
          <ChartPanel title="PO Type-Wise Compliance" hint="Click a bar to drill in" info={chartDefs.poTypeWiseCompliance}>
            {loading ? <Skeleton variant="rounded" height="100%" sx={{ borderRadius: 2 }} /> : (
              <ResponsiveContainer>
                <BarChart data={charts.poTypeWiseCompliance || []} margin={{ top: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="poType" tickFormatter={(v) => {
                    const row = (charts.poTypeWiseCompliance || []).find((c) => c.poType === v);
                    return row?.poTypeName || v;
                  }} axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12, fontWeight: 500 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12, fontWeight: 500 }} />
                  <Tooltip content={<PoTypeTooltip />} cursor={{ fill: alpha('#6366f1', 0.05) }} />
                  <Legend iconType="circle" wrapperStyle={{ paddingTop: 10, fontSize: '14px', fontWeight: 600 }} />
                  <Bar dataKey="verified" stackId="a" fill={VERIFIED_COLOR} name="Verified" cursor="pointer"
                    onClick={(d) => { const p = payloadOf(d); openDrilldown("poType", p.poType, `PO Type: ${p.poTypeName || p.poType} - Verified lines`, { statusFilter: "verified" }); }} />
                  <Bar dataKey="notVerified" stackId="a" fill={NOT_VERIFIED_COLOR} name="Not Verified" radius={[6, 6, 0, 0]} cursor="pointer"
                    onClick={(d) => { const p = payloadOf(d); openDrilldown("poType", p.poType, `PO Type: ${p.poTypeName || p.poType} - Not-Verified lines`, { statusFilter: "notVerified" }); }} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartPanel>
        </Grid>

        <Grid item xs={12} md={6}>
          <ChartPanel title="Monthly Exception Trend" hint="Click a point to drill in" info={chartDefs.monthlyExceptionTrend}>
            {loading ? <Skeleton variant="rounded" height="100%" sx={{ borderRadius: 2 }} /> : (
              <ResponsiveContainer>
                <LineChart data={charts.monthlyExceptionTrend || []} margin={{ top: 20, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12, fontWeight: 500 }} />
                  <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12, fontWeight: 500 }} />
                  <Tooltip content={<MonthlyTooltip />} />
                  <Line
                    type="monotone"
                    dataKey="count"
                    stroke={BAR_COLOR}
                    strokeWidth={4}
                    dot={(props) => (
                      <circle
                        key={props.payload.month}
                        cx={props.cx}
                        cy={props.cy}
                        r={6}
                        fill={BAR_COLOR}
                        stroke="#ffffff"
                        strokeWidth={3}
                        style={{ cursor: "pointer", filter: 'drop-shadow(0px 4px 6px rgba(0, 0, 0, 0.1))' }}
                        onClick={() => openDrilldown("month", props.payload.month, `Exceptions in ${moment(props.payload.month, "YYYY-MM").format("MMMM YYYY")}`)}
                      />
                    )}
                    activeDot={{ r: 9, strokeWidth: 0 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </ChartPanel>
        </Grid>
      </Grid>

      {/* PO-WISE EXCEPTIONS TABLE */}
      <Box sx={{ mt: 5 }}>
        <PoWiseExceptionsTable
          rows={charts.poWiseExceptions || []}
          loading={loading}
          onRowAction={handleRowAction}
        />
      </Box>

      <Typography variant="body2" sx={{ display: "block", mt: 5, textAlign: 'center', color: '#94a3b8', fontWeight: 500 }}>
        This is page 1 of 12 from the dashboard design (Executive P2P Compliance Control Tower). Checkpoint descriptions and criticality now live on the Risk Categorization Master page.
      </Typography>

      <DrilldownDialog drilldown={drilldown} appliedFilters={buildSummaryBody(filters)} onClose={() => setDrilldown(null)} />
      <PoDetailsPreviewDialog preview={poPreview} onClose={() => setPoPreview(null)} onOpenFullPage={openFullSearchPage} />
    </Box>
  );
};

export default ExecutiveDashboard;