import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import PoDetailsPreviewDialog from "./components/PoDetailsPreviewDialog";
import PoWiseExceptionsTable from "./components/PoWiseExceptionsTable";
import { buildSearchUrl, getFirstLineItem } from "utils/po-link-utils";
import {
  Box, Card, CardActionArea, CardContent, Grid, IconButton, Paper, Skeleton,
  Tooltip as MuiTooltip, Typography, Chip, alpha,
} from "@mui/material";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import FileDownloadRoundedIcon from "@mui/icons-material/FileDownloadRounded";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
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

// --- DASHBOARD PALETTE (v2) ---
const SEVERITY_COLORS = { Critical: "#dc2626", High: "#f97316", Medium: "#f59e0b", Low: "#64748b" };
const BAR_COLOR = "#4f46e5"; // Indigo — primary/neutral series (trend line, chrome)
const VERIFIED_COLOR = "#059669"; // Emerald — compliant
const NOT_VERIFIED_COLOR = "#dc2626"; // Red — exception
const GRID_COLOR = "#f1f5f9"; // Quiet grid line

// Gradient ids shared by every bar/line chart below, defined once per chart
// via <defs> so bars read as a considered surface rather than a flat fill.
const ChartGradients = () => (
  <defs>
    <linearGradient id="gradVerified" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stopColor="#10b981" stopOpacity={0.9} />
      <stop offset="100%" stopColor="#059669" stopOpacity={1} />
    </linearGradient>
    <linearGradient id="gradNotVerified" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stopColor="#ef4444" stopOpacity={0.9} />
      <stop offset="100%" stopColor="#dc2626" stopOpacity={1} />
    </linearGradient>
    <linearGradient id="gradPrimary" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor="#818cf8" stopOpacity={1} />
      <stop offset="100%" stopColor="#4f46e5" stopOpacity={0.9} />
    </linearGradient>
    <linearGradient id="gradLine" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stopColor="#4f46e5" />
      <stop offset="100%" stopColor="#7c3aed" />
    </linearGradient>
  </defs>
);

// Label-shortening helpers
const truncateLabel = (str, max = 24) => {
  if (!str) return str;
  const s = String(str);
  return s.length > max ? `${s.slice(0, max)}…` : s;
};

// Panel height scales with row count so a horizontal bar chart never has
// to squeeze 15 categories into a fixed 320px box — each row gets a fixed
// amount of breathing room instead.
const horizontalChartHeight = (rowCount, rowHeight = 34, base = 70, min = 220) =>
  Math.max(min, rowCount * rowHeight + base);

const formatMonthLabel = (m) => {
  const parsed = moment(m, "YYYY-MM");
  return parsed.isValid() ? parsed.format("MMM 'YY") : m;
};

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
        '&:hover': { color: '#4f46e5' } 
      }} />
    </MuiTooltip>
  );
};

const KpiCard = ({ label, value, sublabel, loading, onClick, info, valueColor = 'text.primary' }) => {
  const content = (
    <CardContent sx={{ p: 3, display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'space-between' }}>
      <Box>
        <Box sx={{ display: "flex", alignItems: "center", mb: 2, justifyContent: 'space-between' }}>
          <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700, letterSpacing: 1, lineHeight: 1.2 }}>
            {label}
          </Typography>
          <InfoTip text={info} />
        </Box>
        {loading ? (
          <Skeleton width="60%" height={48} sx={{ borderRadius: 2 }} />
        ) : (
          <Typography variant="h3" sx={{ fontWeight: 800, color: valueColor, letterSpacing: -1 }}>
            {value}
          </Typography>
        )}
      </Box>
      {sublabel && (
        <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: 'block', fontWeight: 500, pt: 1.5, borderTop: '1px dashed', borderColor: 'grey.200' }}>
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
        background: "#ffffff",
        border: '1px solid',
        borderColor: 'grey.100',
        boxShadow: '0 10px 30px -5px rgba(0,0,0,0.04)',
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        ...(onClick && {
          '&:hover': {
            transform: 'translateY(-4px)',
            boxShadow: '0 15px 35px -5px rgba(79, 70, 229, 0.12)',
            borderColor: alpha('#4f46e5', 0.3)
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
    boxShadow: '0 10px 30px -5px rgba(0,0,0,0.04)'
  }}>
    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", mb: 4 }}>
      <Box>
        <Typography variant="h6" sx={{ fontWeight: 800, color: '#0f172a', display: "flex", alignItems: "center" }}>
          {title}
          <InfoTip text={info} />
        </Typography>
        {hint && <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 500 }}>{hint}</Typography>}
      </Box>
    </Box>
    <Box sx={{ width: "100%", height }}>{children}</Box>
  </Paper>
);

const ComplianceTooltip = ({ active, payload, labelKey, labelFormatter }) => {
  if (!active || !payload || !payload.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  return (
    <Box
      sx={{
        bgcolor: "#fff",
        border: "1px solid",
        borderColor: "grey.100",
        borderRadius: 3,
        boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)",
        p: 2,
        minWidth: 180,
      }}
    >
      <Typography variant="body2" sx={{ fontWeight: 800, mb: 1, color: '#0f172a' }}>
        {labelFormatter ? labelFormatter(d) : d[labelKey]}
      </Typography>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
        <Typography variant="caption" sx={{ color: VERIFIED_COLOR, fontWeight: 700 }}>Verified:</Typography>
        <Typography variant="caption" sx={{ color: '#0f172a', fontWeight: 700 }}>{d.verified}</Typography>
      </Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
        <Typography variant="caption" sx={{ color: NOT_VERIFIED_COLOR, fontWeight: 700 }}>Not Verified:</Typography>
        <Typography variant="caption" sx={{ color: '#0f172a', fontWeight: 700 }}>{d.notVerified}</Typography>
      </Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1, pt: 1, borderTop: '1px solid', borderColor: 'grey.100' }}>
        <Typography variant="caption" sx={{ color: "#64748b", fontWeight: 700 }}>Compliance:</Typography>
        <Typography variant="caption" sx={{ color: '#0f172a', fontWeight: 800 }}>
          {d.compliancePct != null ? `${d.compliancePct}%` : "N/A"}
        </Typography>
      </Box>
    </Box>
  );
};

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
  // NEW — backend now returns `scope` when the current user's numbers are
  // restricted to their own purchasing group (Buyers). Admin/PM/other
  // dashboard-visible roles get `scope: null` and see the notice hidden.
  const restrictedNotice = data?.scope?.restrictedToPurchaseGroup
    ? `Showing figures for purchasing group ${data.scope.restrictedToPurchaseGroup} only`
    : undefined;

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
    
    // Export KPIs except any dynamically injected 'hold' definitions
    Object.entries(kpis).forEach(([k, v]) => {
      if (!k.toLowerCase().includes('hold')) {
        lines.push(`KPI,${csvEscape(k)},${csvEscape(v)},`);
      }
    });

    (charts.controlWiseCompliance || []).forEach((d) =>
      lines.push(`Control-Wise Compliance,Point ${d.pointNo} (${d.severity}),${d.compliancePct ?? "N/A"}%,verified=${d.verified} notVerified=${d.notVerified}`)
    );
    (charts.exceptionBySeverity || []).forEach((d) => lines.push(`Exceptions by Severity,${d.severity},${d.count},${d.pct}%`));
    (charts.plantWiseExceptions || []).forEach((d) => lines.push(`Plant-Wise Exceptions,${csvEscape(d.plantName || d.key)},${d.value},valueExposure=${d.valueExposure}`));
    (charts.vendorWiseTopExceptions || []).forEach((d) => lines.push(`Vendor-Wise Exceptions,${csvEscape(d.vendorName || d.name || d.key)},${d.value},valueExposure=${d.valueExposure}`));
    (charts.plantWiseCompliance || []).forEach((d) => lines.push(`Plant-Wise Compliance,${csvEscape(d.plantName || d.plant)},${d.compliancePct ?? "N/A"}%,verified=${d.verified} notVerified=${d.notVerified}`));
    (charts.vendorWiseCompliance || []).forEach((d) => lines.push(`Vendor-Wise Compliance,${csvEscape(d.vendorName || d.vendorCode)},${d.compliancePct ?? "N/A"}%,verified=${d.verified} notVerified=${d.notVerified}`));
    (charts.poNumberWiseCompliance || []).forEach((d) => lines.push(`PO-Wise Compliance,${csvEscape(d.poNumber)},${d.compliancePct ?? "N/A"}%,verified=${d.verified} notVerified=${d.notVerified}`));
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
            background: 'linear-gradient(90deg, #1e1b4b, #4338ca)', 
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
          {restrictedNotice && (
            <Typography variant="caption" sx={{ mt: 1.5, display: 'block', fontWeight: 700, color: '#4f46e5' }}>
              {restrictedNotice}
            </Typography>
          )}
          {lastUpdated && (
            <Typography variant="caption" sx={{ mt: 1.5, display: 'block', fontWeight: 600, color: '#94a3b8' }}>
              Last updated {moment(lastUpdated).format("DD-MMM-YYYY HH:mm:ss")}
            </Typography>
          )}
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 2, p: 1.5, bgcolor: '#ffffff', borderRadius: 3, border: '1px solid', borderColor: 'grey.100', boxShadow: '0 10px 30px -5px rgba(0,0,0,0.04)' }}>
          <Chip
            label={kpis.overallComplianceScore != null ? `${kpis.overallComplianceScore}% compliant` : "—"}
            sx={{ 
              fontWeight: 800, 
              borderRadius: 2, 
              px: 1,
              bgcolor: kpis.overallComplianceScore >= 80 ? alpha(VERIFIED_COLOR, 0.1) : kpis.overallComplianceScore >= 50 ? alpha('#d97706', 0.1) : alpha(NOT_VERIFIED_COLOR, 0.1),
              color: kpis.overallComplianceScore >= 80 ? VERIFIED_COLOR : kpis.overallComplianceScore >= 50 ? '#d97706' : NOT_VERIFIED_COLOR
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
              <IconButton onClick={() => fetchSummary(filters)} disabled={loading} sx={{ bgcolor: alpha('#4f46e5', 0.1), '&:hover': { bgcolor: alpha('#4f46e5', 0.2) } }}>
                <RefreshRoundedIcon fontSize="small" sx={{ color: '#4f46e5' }} />
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
        <Paper elevation={0} sx={{ p: 2.5, mb: 4, bgcolor: "#fef2f2", borderRadius: 3, border: '1px solid', borderColor: "#fecaca", color: "#dc2626" }}>
          <Typography variant="body1" sx={{ fontWeight: 600 }}>{error}</Typography>
        </Paper>
      )}

      {/* KPI Cards - Structured cleanly in a 3x3 layout (md=4 for 3 columns) */}
      <Grid container spacing={3} sx={{ mb: 5 }}>
        <Grid item xs={12} sm={6} md={4}>
          <KpiCard label="Total PO Count" value={kpis.totalPOCount ?? "—"} sublabel="Click to view all PO lines" loading={loading} info={kpiDefs.totalPOCount} onClick={kpis.totalPOCount ? () => openDrilldown("all", true, "All PO Lines") : undefined} />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <KpiCard label="Total PO Lines" value={kpis.totalPOLineItems ?? "—"} sublabel="Click to view all PO lines" loading={loading} info={kpiDefs.totalPOLineItems} onClick={kpis.totalPOLineItems ? () => openDrilldown("all", true, "All PO Lines") : undefined} />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <KpiCard label="Total PR Count" value={kpis.totalPRCount ?? "—"} sublabel="Click to view all PO lines" loading={loading} info={kpiDefs.totalPRCount} onClick={kpis.totalPRCount ? () => openDrilldown("all", true, "All PO Lines") : undefined} />
        </Grid>
        
        <Grid item xs={12} sm={6} md={4}>
          <KpiCard label="Exception Exposure" value={kpis.exceptionValueExposure != null ? `${kpis.exceptionValueExposure.toLocaleString()}` : "—"} sublabel="Click to drill in" loading={loading} info={kpiDefs.exceptionValueExposure} onClick={kpis.exceptionValueExposure ? () => openDrilldown("anyException", true, "Lines Contributing to Exception Value Exposure") : undefined} />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <KpiCard label="Verified Checks" value={kpis.verifiedCount ?? "—"} valueColor="#059669" sublabel="Click to drill in" loading={loading} info={kpiDefs.verifiedCount} onClick={kpis.verifiedCount ? () => openDrilldown("verifiedAny", true, "Lines with at Least One Verified Checkpoint", { statusFilter: "verified" }) : undefined} />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <KpiCard label="Not Verified Checks" value={kpis.notVerifiedCount ?? "—"} valueColor="#dc2626" sublabel="Click to drill in" loading={loading} info={kpiDefs.notVerifiedCount} onClick={kpis.notVerifiedCount ? () => openDrilldown("anyException", true, "Lines with at Least One Exception") : undefined} />
        </Grid>
        
        <Grid item xs={12} sm={6} md={4}>
          <KpiCard label="Not Applicable" value={kpis.notApplicableCount ?? "—"} sublabel="Click to drill in" loading={loading} info={kpiDefs.notApplicableCount} onClick={kpis.notApplicableCount ? () => openDrilldown("na", true, "Lines with at Least One N/A Checkpoint", { statusFilter: "na" }) : undefined} />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <KpiCard label="Manual Review" value={kpis.manualReviewCount ?? "—"} sublabel="Click to drill in" loading={loading} info={kpiDefs.manualReviewCount} onClick={kpis.manualReviewCount ? () => openDrilldown("manual", true, "Lines Needing Manual Review", { statusFilter: "manual" }) : undefined} />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <KpiCard label="High-Risk Alerts" value={kpis.highRiskExceptions ?? "—"} valueColor="#dc2626" sublabel="Critical + High severity" loading={loading} info={kpiDefs.highRiskExceptions} onClick={kpis.highRiskExceptions ? () => openDrilldown("severity", "Critical,High", "High-Risk Exceptions (Critical + High)") : undefined} />
        </Grid>
      </Grid>

      {/* Charts Section */}
      <Grid container spacing={3}>
        <Grid item xs={12} md={7}>
          <ChartPanel title="Control-Wise Compliance" hint="% verified (Points 1-19). Click a bar to drill in." info={chartDefs.controlWiseCompliance}>
            {loading ? <Skeleton variant="rounded" height="100%" sx={{ borderRadius: 2 }} /> : (
              <ResponsiveContainer width="100%" height="95%">
                <BarChart data={charts.controlWiseCompliance || []} margin={{ top: 20 }}>
                  <ChartGradients />
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={GRID_COLOR} />
                  <XAxis dataKey="pointNo" tickFormatter={(v) => `#${v}`} interval={0} axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12, fontWeight: 500 }} />
                  <YAxis domain={[0, 100]} unit="%" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12, fontWeight: 500 }} />
                  <Tooltip content={<ControlWiseTooltip />} cursor={{ fill: alpha('#4f46e5', 0.05) }} />
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
                      <Cell key={entry.severity} fill={SEVERITY_COLORS[entry.severity] || "#64748b"} />
                    ))}
                  </Pie>
                  <Tooltip content={<SeverityTooltip />} />
                  <Legend iconType="circle" wrapperStyle={{ paddingTop: 20, fontSize: '14px', fontWeight: 600, color: '#334155' }}/>
                </PieChart>
              </ResponsiveContainer>
            )}
          </ChartPanel>
        </Grid>

        <Grid item xs={12}>
          <ChartPanel
            title="PO Type-Wise Compliance"
            hint="Click a segment to drill in"
            info={chartDefs.poTypeWiseCompliance}
            height={horizontalChartHeight((charts.poTypeWiseCompliance || []).length, 40, 60, 180)}
          >
            {loading ? <Skeleton variant="rounded" height="100%" sx={{ borderRadius: 2 }} /> : (
              <ResponsiveContainer>
                <BarChart
                  data={charts.poTypeWiseCompliance || []}
                  layout="vertical"
                  margin={{ top: 10, bottom: 10, left: 10, right: 30 }}
                  barCategoryGap="30%"
                >
                  <ChartGradients />
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={GRID_COLOR} />
                  <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12, fontWeight: 500 }} />
                  <YAxis
                    type="category"
                    dataKey="poType"
                    tickFormatter={(v) => {
                      const row = (charts.poTypeWiseCompliance || []).find((c) => c.poType === v);
                      return truncateLabel(row?.poTypeName || v, 22);
                    }}
                    width={160}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#334155', fontSize: 13, fontWeight: 600 }}
                  />
                  <Tooltip content={<PoTypeTooltip />} cursor={{ fill: alpha('#4f46e5', 0.05) }} />
                  <Legend iconType="circle" wrapperStyle={{ paddingTop: 10, fontSize: '14px', fontWeight: 600 }} />
                  <Bar dataKey="verified" stackId="a" fill="url(#gradVerified)" name="Verified" cursor="pointer" radius={[6, 0, 0, 6]} barSize={22}
                    onClick={(d) => { const p = payloadOf(d); openDrilldown("poType", p.poType, `PO Type: ${p.poTypeName || p.poType} - Verified lines`, { statusFilter: "verified" }); }} />
                  <Bar dataKey="notVerified" stackId="a" fill="url(#gradNotVerified)" name="Not Verified" radius={[0, 6, 6, 0]} cursor="pointer" barSize={22}
                    onClick={(d) => { const p = payloadOf(d); openDrilldown("poType", p.poType, `PO Type: ${p.poTypeName || p.poType} - Not-Verified lines`, { statusFilter: "notVerified" }); }} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartPanel>
        </Grid>

        <Grid item xs={12}>
          <ChartPanel title="Monthly Exception Trend" hint="Click a point to drill in" info={chartDefs.monthlyExceptionTrend} height={300}>
            {loading ? <Skeleton variant="rounded" height="100%" sx={{ borderRadius: 2 }} /> : (
              <ResponsiveContainer>
                <LineChart data={charts.monthlyExceptionTrend || []} margin={{ top: 20, right: 20 }}>
                  <ChartGradients />
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={GRID_COLOR} />
                  <XAxis dataKey="month" tickFormatter={formatMonthLabel} axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12, fontWeight: 500 }} />
                  <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12, fontWeight: 500 }} />
                  <Tooltip content={<MonthlyTooltip />} />
                  <Line
                    type="monotone"
                    dataKey="count"
                    stroke="url(#gradLine)"
                    strokeWidth={4}
                    dot={(props) => (
                      <circle
                        key={props.payload.month}
                        cx={props.cx}
                        cy={props.cy}
                        r={6}
                        fill="#4f46e5"
                        stroke="#ffffff"
                        strokeWidth={3}
                        style={{ cursor: "pointer", filter: 'drop-shadow(0px 4px 6px rgba(0, 0, 0, 0.1))' }}
                        onClick={() => openDrilldown("month", props.payload.month, `Exceptions in ${moment(props.payload.month, "YYYY-MM").format("MMMM YYYY")}`)}
                      />
                    )}
                    activeDot={{ r: 9, strokeWidth: 0, fill: "#7c3aed" }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </ChartPanel>
        </Grid>

        <Grid item xs={12}>
          <ChartPanel
            title="Plant-Wise Compliance"
            hint="% verified per plant, worst first. Click a segment to drill in."
            info="Shows verified vs. not-verified checkpoint counts for every plant, so you can see which locations need the most attention."
            height={horizontalChartHeight((charts.plantWiseCompliance || []).length)}
          >
            {loading ? <Skeleton variant="rounded" height="100%" sx={{ borderRadius: 2 }} /> : (
              <ResponsiveContainer>
                <BarChart
                  data={charts.plantWiseCompliance || []}
                  layout="vertical"
                  margin={{ top: 10, bottom: 10, left: 10, right: 30 }}
                  barCategoryGap="25%"
                >
                  <ChartGradients />
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={GRID_COLOR} />
                  <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12, fontWeight: 500 }} />
                  <YAxis
                    type="category"
                    dataKey="plant"
                    tickFormatter={(v) => {
                      const row = (charts.plantWiseCompliance || []).find((c) => c.plant === v);
                      return truncateLabel(row?.plantName || v, 22);
                    }}
                    width={170}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#334155', fontSize: 13, fontWeight: 600 }}
                  />
                  <Tooltip content={<ComplianceTooltip labelFormatter={(d) => d.plantName || d.plant} />} cursor={{ fill: alpha('#4f46e5', 0.05) }} />
                  <Legend iconType="circle" wrapperStyle={{ paddingTop: 10, fontSize: '14px', fontWeight: 600 }} />
                  <Bar dataKey="verified" stackId="a" fill="url(#gradVerified)" name="Verified" cursor="pointer" radius={[6, 0, 0, 6]} barSize={20}
                    onClick={(d) => { const p = payloadOf(d); openDrilldown("plant", p.plant, `Plant: ${p.plantName || p.plant} - Verified lines`, { statusFilter: "verified" }); }} />
                  <Bar dataKey="notVerified" stackId="a" fill="url(#gradNotVerified)" name="Not Verified" radius={[0, 6, 6, 0]} cursor="pointer" barSize={20}
                    onClick={(d) => { const p = payloadOf(d); openDrilldown("plant", p.plant, `Plant: ${p.plantName || p.plant} - Not-Verified lines`, { statusFilter: "notVerified" }); }} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartPanel>
        </Grid>

        <Grid item xs={12}>
          <ChartPanel
            title="Vendor-Wise Compliance"
            hint="Top 15 vendors by not-verified count. Click a segment to drill in."
            info="Shows verified vs. not-verified checkpoint counts for the 15 vendors contributing the most compliance exceptions."
            height={horizontalChartHeight((charts.vendorWiseCompliance || []).length)}
          >
            {loading ? <Skeleton variant="rounded" height="100%" sx={{ borderRadius: 2 }} /> : (
              <ResponsiveContainer>
                <BarChart
                  data={charts.vendorWiseCompliance || []}
                  layout="vertical"
                  margin={{ top: 10, bottom: 10, left: 10, right: 30 }}
                  barCategoryGap="25%"
                >
                  <ChartGradients />
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={GRID_COLOR} />
                  <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12, fontWeight: 500 }} />
                  <YAxis
                    type="category"
                    dataKey="vendorCode"
                    tickFormatter={(v) => {
                      const row = (charts.vendorWiseCompliance || []).find((c) => c.vendorCode === v);
                      return truncateLabel(row?.vendorName || v, 26);
                    }}
                    width={200}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#334155', fontSize: 13, fontWeight: 600 }}
                  />
                  <Tooltip content={<ComplianceTooltip labelFormatter={(d) => d.vendorName || d.vendorCode} />} cursor={{ fill: alpha('#4f46e5', 0.05) }} />
                  <Legend iconType="circle" wrapperStyle={{ paddingTop: 10, fontSize: '14px', fontWeight: 600 }} />
                  <Bar dataKey="verified" stackId="a" fill="url(#gradVerified)" name="Verified" cursor="pointer" radius={[6, 0, 0, 6]} barSize={20}
                    onClick={(d) => { const p = payloadOf(d); openDrilldown("vendor", p.vendorCode, `Vendor: ${p.vendorName || p.vendorCode} - Verified lines`, { statusFilter: "verified" }); }} />
                  <Bar dataKey="notVerified" stackId="a" fill="url(#gradNotVerified)" name="Not Verified" radius={[0, 6, 6, 0]} cursor="pointer" barSize={20}
                    onClick={(d) => { const p = payloadOf(d); openDrilldown("vendor", p.vendorCode, `Vendor: ${p.vendorName || p.vendorCode} - Not-Verified lines`, { statusFilter: "notVerified" }); }} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartPanel>
        </Grid>

        {/* PO-Wise Compliance */}
        <Grid item xs={12}>
          <ChartPanel
            title="PO-Wise Compliance"
            hint="Top 15 POs by not-verified count. Click a segment to drill in."
            info="Shows verified vs. not-verified checkpoint counts for the 15 individual POs contributing the most compliance exceptions."
            height={horizontalChartHeight((charts.poNumberWiseCompliance || []).length)}
          >
            {loading ? <Skeleton variant="rounded" height="100%" sx={{ borderRadius: 2 }} /> : (
              <ResponsiveContainer>
                <BarChart
                  data={charts.poNumberWiseCompliance || []}
                  layout="vertical"
                  margin={{ top: 10, bottom: 10, left: 10, right: 30 }}
                  barCategoryGap="25%"
                >
                  <ChartGradients />
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={GRID_COLOR} />
                  <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12, fontWeight: 500 }} />
                  <YAxis
                    type="category"
                    dataKey="poNumber"
                    width={160} // Increased width for full PO number
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#334155', fontSize: 13, fontWeight: 600 }}
                  />
                  <Tooltip content={<ComplianceTooltip labelKey="poNumber" />} cursor={{ fill: alpha('#4f46e5', 0.05) }} />
                  <Legend iconType="circle" wrapperStyle={{ paddingTop: 10, fontSize: '14px', fontWeight: 600 }} />
                  <Bar dataKey="verified" stackId="a" fill="url(#gradVerified)" name="Verified" cursor="pointer" radius={[6, 0, 0, 6]} barSize={20}
                    onClick={(d) => { const p = payloadOf(d); openDrilldown("poNumber", p.poNumber, `PO ${p.poNumber} - Verified lines`, { statusFilter: "verified" }); }} />
                  <Bar dataKey="notVerified" stackId="a" fill="url(#gradNotVerified)" name="Not Verified" radius={[0, 6, 6, 0]} cursor="pointer" barSize={20}
                    onClick={(d) => { const p = payloadOf(d); openDrilldown("poNumber", p.poNumber, `PO ${p.poNumber} - Not-Verified lines`, { statusFilter: "notVerified" }); }} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartPanel>
        </Grid>
      </Grid>

      {/*
        PO-WISE EXCEPTIONS TABLE
        Still embedded here as before (per requirements: keep it on the
        dashboard). It's now the shared component also used, full-page,
        by the "PO-Data" sidebar entry at /po-data - `viewAllHref` adds a
        shortcut button into that full page from right here. `restrictedNotice`
        is now threaded through from the same backend `scope` used above, so
        a Buyer sees the same "purchasing group only" caveat here too.
      */}
      <Box sx={{ mt: 5 }}>
        <PoWiseExceptionsTable
          rows={charts.poWiseExceptions || []}
          loading={loading}
          onRowAction={handleRowAction}
          viewAllHref="/po-data"
          restrictedNotice={restrictedNotice}
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