import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import {
  Box, Card, CardActionArea, CardContent, Grid, IconButton, Paper, Skeleton,
  Tooltip as MuiTooltip, Typography, Chip, TextField, TableContainer, Table,
  TableHead, TableRow, TableCell, TableBody, TableSortLabel,
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
  BucketTooltip, HoldAgeingTooltip,
} from "./components/tooltips";

const SEVERITY_COLORS = { Critical: "#c0392b", High: "#e67e22", Medium: "#f1c40f", Low: "#95a5a6" };
const BAR_COLOR = "#1f6f6b";
const VERIFIED_COLOR = "#2f6b4f";
const NOT_VERIFIED_COLOR = "#a8442e";

const InfoTip = ({ text, placement = "top" }) => {
  if (!text) return null;
  return (
    <MuiTooltip title={text} placement={placement} arrow enterTouchDelay={0}>
      <InfoOutlinedIcon sx={{ fontSize: 15, ml: 0.5, color: "text.secondary", cursor: "help", verticalAlign: "text-bottom" }} />
    </MuiTooltip>
  );
};

const KpiCard = ({ label, value, sublabel, loading, onClick, info }) => {
  const content = (
    <CardContent>
      <Box sx={{ display: "flex", alignItems: "center" }}>
        <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: 0.5 }}>
          {label}
        </Typography>
        <InfoTip text={info} />
      </Box>
      {loading ? (
        <Skeleton width="60%" height={36} />
      ) : (
        <Typography variant="h5" sx={{ fontWeight: 700, mt: 0.5 }}>{value}</Typography>
      )}
      {sublabel && <Typography variant="caption" color="text.secondary">{sublabel}</Typography>}
    </CardContent>
  );
  return (
    <Card variant="outlined" sx={{ height: "100%" }}>
      {onClick ? <CardActionArea onClick={onClick} sx={{ height: "100%" }}>{content}</CardActionArea> : content}
    </Card>
  );
};

const ChartPanel = ({ title, hint, children, height = 300, info }) => (
  <Paper variant="outlined" sx={{ p: 2, height: "100%" }}>
    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
      <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 600, display: "flex", alignItems: "center" }}>
        {title}
        <InfoTip text={info} />
      </Typography>
      {hint && <Typography variant="caption" color="text.secondary">{hint}</Typography>}
    </Box>
    <Box sx={{ width: "100%", height }}>{children}</Box>
  </Paper>
);

const isCancel = (err) => err?.code === "ERR_CANCELED" || err?.name === "CanceledError";
const payloadOf = (d) => d?.payload ?? d ?? {};

const buildSummaryBody = (f) => ({
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

/* PO Number-Wise Exception Count table - unchanged (this is the reference
   for how every other table/chart's enrichment is expected to look now). */
const PoWiseExceptionsTable = ({ rows, loading, onOpenPo }) => {
  const [search, setSearch] = useState("");
  const [orderBy, setOrderBy] = useState("exceptionLineCount");
  const [order, setOrder] = useState("desc");

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const base = !term
      ? rows
      : rows.filter((r) =>
          [
            r.poNumber, r.vendorName, r.vendorCode, r.poType, r.poTypeName,
            r.plant, r.plantName, r.purchaseGroup, r.purchaseGroupName,
            r.paymentTerm, r.paymentTermDescription, ...(r.lineItems || []),
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

  const columns = [
    { key: "poNumber", label: "PO Number" },
    { key: "lineItemsDisplay", label: "Line Item(s)", sortKey: "distinctLineItems" },
    { key: "vendorName", label: "Vendor" },
    { key: "plantName", label: "Plant" },
    { key: "poTypeName", label: "PO Type" },
    { key: "purchaseGroupName", label: "Purchasing Group" },
    { key: "paymentTermDescription", label: "Payment Term" },
    { key: "exceptionLineCount", label: "Exceptions" },
    { key: "valueExposure", label: "Value Exposure" },
  ];

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1, flexWrap: "wrap", gap: 1 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600, display: "flex", alignItems: "center" }}>
          PO-Wise Exceptions ({rows.length} POs with at least one exception)
          <InfoTip text="Each row is one PO number. A single PO can span several line items - see the 'Line Item(s)' column for which specific lines contributed the exceptions/value below." />
        </Typography>
        <TextField
          size="small"
          placeholder="Search PO, vendor, plant, PO type, buyer, terms..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ minWidth: 280 }}
        />
      </Box>
      {loading ? (
        <Skeleton variant="rectangular" height={320} />
      ) : (
        <TableContainer sx={{ maxHeight: 480 }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                {columns.map((c) => (
                  <TableCell key={c.key}>
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
                <TableRow key={r.poNumber} hover sx={{ cursor: "pointer" }} onClick={() => onOpenPo(r)}>
                  <TableCell>{r.poNumber}</TableCell>
                  <TableCell>
                    <MuiTooltip title={(r.lineItems || []).join(", ") || "—"}>
                      <span>{joinLineItems(r)}</span>
                    </MuiTooltip>
                  </TableCell>
                  <TableCell>{r.vendorName || r.vendorCode || "—"}</TableCell>
                  <TableCell>{r.plantName || r.plant || "—"}</TableCell>
                  <TableCell>
                    {r.poTypeName || r.poType || "—"}
                    {r.poTypeIsAssumption && (
                      <MuiTooltip title="PO Type name inferred from common SAP conventions - no PO Type master file was supplied, so confirm this label with the client.">
                        <InfoOutlinedIcon sx={{ fontSize: 13, ml: 0.4, color: "warning.main", verticalAlign: "text-bottom" }} />
                      </MuiTooltip>
                    )}
                  </TableCell>
                  <TableCell>{r.purchaseGroupName || r.purchaseGroup || "—"}</TableCell>
                  <TableCell>{r.paymentTermDescription || r.paymentTerm || "—"}</TableCell>
                  <TableCell>{r.exceptionLineCount}</TableCell>
                  <TableCell>{r.valueExposure?.toLocaleString?.() ?? r.valueExposure}</TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={columns.length} align="center">No matching POs.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Paper>
  );
};

const ExecutiveDashboard = () => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);

  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [filterOptions, setFilterOptions] = useState({ plants: [], vendors: [], poTypes: [], purchaseGroups: [] });

  const [drilldown, setDrilldown] = useState(null);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

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
    <Box>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", mb: 2, flexWrap: "wrap", gap: 1 }}>
        <Box>
          <Typography variant="h5">Executive P2P Compliance Control Tower</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", maxWidth: 720 }}>
            Tracks how many of the 19 audit checkpoints each PO line passes. Hover the <InfoOutlinedIcon sx={{ fontSize: 12, verticalAlign: "text-bottom" }} /> icon
            on any card or chart below for what that specific metric means. Criticality of each checkpoint is managed on the
            Risk Categorization Master page.
          </Typography>
          {lastUpdated && (
            <Typography variant="caption" color="text.secondary">
              Last updated {moment(lastUpdated).format("DD-MMM-YYYY HH:mm:ss")}
            </Typography>
          )}
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Chip
            size="small"
            label={kpis.overallComplianceScore != null ? `${kpis.overallComplianceScore}% compliant` : "—"}
            color={kpis.overallComplianceScore >= 80 ? "success" : kpis.overallComplianceScore >= 50 ? "warning" : "error"}
          />
          <MuiTooltip title={kpiDefs.overallComplianceScore || "Export current summary as CSV"}>
            <Box component="span" sx={{ display: "inline-flex", cursor: !data ? "not-allowed" : "pointer" }}>
              <IconButton size="small" onClick={exportSummaryCsv} disabled={!data}>
                <FileDownloadRoundedIcon fontSize="small" />
              </IconButton>
            </Box>
          </MuiTooltip>
          <MuiTooltip title="Refresh">
            <Box component="span" sx={{ display: "inline-flex", cursor: loading ? "not-allowed" : "pointer" }}>
              <IconButton size="small" onClick={() => fetchSummary(filters)} disabled={loading}>
                <RefreshRoundedIcon fontSize="small" />
              </IconButton>
            </Box>
          </MuiTooltip>
        </Box>
      </Box>

      <FilterBar
        filters={filters}
        options={filterOptions}
        loading={loading}
        onApply={(next) => setFilters(next)}
        onReset={() => setFilters(DEFAULT_FILTERS)}
      />

      {error && (
        <Paper variant="outlined" sx={{ p: 2, mb: 2, borderColor: "error.main", color: "error.main" }}>
          {error}
        </Paper>
      )}

      {/* 1) NUMBER CARDS FIRST */}
      <Grid container spacing={2} sx={{ mb: 3, mt: 0.5 }}>
        <Grid item xs={6} sm={4} md={2.4}>
          <KpiCard label="Total PO Count" value={kpis.totalPOCount ?? "—"} sublabel="Click to view all PO lines" loading={loading} info={kpiDefs.totalPOCount}
            onClick={kpis.totalPOCount ? () => openDrilldown("all", true, "All PO Lines") : undefined} />
        </Grid>
        <Grid item xs={6} sm={4} md={2.4}>
          <KpiCard label="Total PO Lines" value={kpis.totalPOLineItems ?? "—"} sublabel="Click to view all PO lines" loading={loading} info={kpiDefs.totalPOLineItems}
            onClick={kpis.totalPOLineItems ? () => openDrilldown("all", true, "All PO Lines") : undefined} />
        </Grid>
        <Grid item xs={6} sm={4} md={2.4}>
          <KpiCard label="Total PR Count" value={kpis.totalPRCount ?? "—"} sublabel="Click to view all PO lines" loading={loading} info={kpiDefs.totalPRCount}
            onClick={kpis.totalPRCount ? () => openDrilldown("all", true, "All PO Lines") : undefined} />
        </Grid>
        <Grid item xs={6} sm={4} md={2.4}>
          <KpiCard label="Hold PO Count" value={kpis.holdPOCount ?? "—"} sublabel="Click to drill in" loading={loading} info={kpiDefs.holdPOCount}
            onClick={kpis.holdPOCount ? () => openDrilldown("hold", true, "Hold POs") : undefined} />
        </Grid>
        <Grid item xs={6} sm={4} md={2.4}>
          <KpiCard label="Exception Value Exposure" value={kpis.exceptionValueExposure != null ? kpis.exceptionValueExposure.toLocaleString() : "—"}
            sublabel="Click to drill in" loading={loading} info={kpiDefs.exceptionValueExposure}
            onClick={kpis.exceptionValueExposure ? () => openDrilldown("anyException", true, "Lines Contributing to Exception Value Exposure") : undefined} />
        </Grid>
        <Grid item xs={6} sm={4} md={2.4}>
          <KpiCard label="Verified Checks" value={kpis.verifiedCount ?? "—"} sublabel="Click to drill in" loading={loading} info={kpiDefs.verifiedCount}
            onClick={kpis.verifiedCount ? () => openDrilldown("verifiedAny", true, "Lines with at Least One Verified Checkpoint", { statusFilter: "verified" }) : undefined} />
        </Grid>
        <Grid item xs={6} sm={4} md={2.4}>
          <KpiCard label="Not Verified Checks" value={kpis.notVerifiedCount ?? "—"} sublabel="Click to drill in" loading={loading} info={kpiDefs.notVerifiedCount}
            onClick={kpis.notVerifiedCount ? () => openDrilldown("anyException", true, "Lines with at Least One Exception") : undefined} />
        </Grid>
        <Grid item xs={6} sm={4} md={2.4}>
          <KpiCard label="Not Applicable" value={kpis.notApplicableCount ?? "—"} sublabel="Click to drill in" loading={loading} info={kpiDefs.notApplicableCount}
            onClick={kpis.notApplicableCount ? () => openDrilldown("na", true, "Lines with at Least One N/A Checkpoint", { statusFilter: "na" }) : undefined} />
        </Grid>
        <Grid item xs={6} sm={4} md={2.4}>
          <KpiCard label="Manual Review Needed" value={kpis.manualReviewCount ?? "—"} sublabel="Click to drill in" loading={loading} info={kpiDefs.manualReviewCount}
            onClick={kpis.manualReviewCount ? () => openDrilldown("manual", true, "Lines Needing Manual Review", { statusFilter: "manual" }) : undefined} />
        </Grid>
        <Grid item xs={6} sm={4} md={2.4}>
          <KpiCard label="High-Risk Exceptions" value={kpis.highRiskExceptions ?? "—"} sublabel="Critical + High severity - click to drill in" loading={loading} info={kpiDefs.highRiskExceptions}
            onClick={kpis.highRiskExceptions ? () => openDrilldown("severity", "Critical,High", "High-Risk Exceptions (Critical + High)") : undefined} />
        </Grid>
      </Grid>

      {/* 2) CHARTS SECOND */}
      <Grid container spacing={2}>
        <Grid item xs={12} md={7}>
          <ChartPanel title="Control-Wise Compliance (% verified, points 1-19)" hint="Click a bar to drill in" info={chartDefs.controlWiseCompliance}>
            {loading ? (
              <Skeleton variant="rectangular" height="100%" />
            ) : (
              <ResponsiveContainer width="100%" height="82%">
                <BarChart data={charts.controlWiseCompliance || []}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="pointNo" tickFormatter={(v) => `#${v}`} interval={0} />
                  <YAxis domain={[0, 100]} unit="%" />
                  <Tooltip content={<ControlWiseTooltip />} />
                  <Bar
                    dataKey="compliancePct"
                    fill={BAR_COLOR}
                    radius={[3, 3, 0, 0]}
                    cursor="pointer"
                    minPointSize={5}
                    activeBar={{ stroke: "#000", strokeWidth: 2 }}
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
          <ChartPanel
            title="Exceptions by Severity"
            hint="Click a slice to drill in"
            info={
              (chartDefs.exceptionBySeverity || "") +
              " Criticality per checkpoint is set by an admin on the Risk Categorization Master page - this chart reflects whatever that page currently says."
            }
          >
            {loading ? (
              <Skeleton variant="rectangular" height="100%" />
            ) : (
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={charts.exceptionBySeverity || []}
                    dataKey="count"
                    nameKey="severity"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={2}
                    cursor="pointer"
                    onClick={(d) => {
                      const p = payloadOf(d);
                      openDrilldown("severity", p.severity, `${p.severity} Severity Exceptions`);
                    }}
                  >
                    {(charts.exceptionBySeverity || []).map((entry) => (
                      <Cell key={entry.severity} fill={SEVERITY_COLORS[entry.severity] || "#999"} />
                    ))}
                  </Pie>
                  <Tooltip content={<SeverityTooltip />} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </ChartPanel>
        </Grid>

        <Grid item xs={12} md={6}>
          <ChartPanel title="PO Type-Wise Compliance" hint="Click a bar to drill in" info={chartDefs.poTypeWiseCompliance}>
            {loading ? (
              <Skeleton variant="rectangular" height="100%" />
            ) : (
              <ResponsiveContainer>
                <BarChart data={charts.poTypeWiseCompliance || []}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="poType" tickFormatter={(v) => {
                    const row = (charts.poTypeWiseCompliance || []).find((c) => c.poType === v);
                    return row?.poTypeName || v;
                  }} />
                  <YAxis />
                  <Tooltip content={<PoTypeTooltip />} />
                  <Legend />
                  <Bar dataKey="verified" stackId="a" fill={VERIFIED_COLOR} name="Verified" cursor="pointer"
                    activeBar={{ stroke: "#0a3d24", strokeWidth: 2 }}
                    onClick={(d) => { const p = payloadOf(d); openDrilldown("poType", p.poType, `PO Type: ${p.poTypeName || p.poType} - Verified lines`, { statusFilter: "verified" }); }} />
                  <Bar dataKey="notVerified" stackId="a" fill={NOT_VERIFIED_COLOR} name="Not Verified" radius={[3, 3, 0, 0]} cursor="pointer"
                    activeBar={{ stroke: "#5c1f10", strokeWidth: 2 }}
                    onClick={(d) => { const p = payloadOf(d); openDrilldown("poType", p.poType, `PO Type: ${p.poTypeName || p.poType} - Not-Verified lines`, { statusFilter: "notVerified" }); }} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartPanel>
        </Grid>

        <Grid item xs={12} md={6}>
          <ChartPanel title="Monthly Exception Trend" hint="Click a point to drill in" info={chartDefs.monthlyExceptionTrend}>
            {loading ? (
              <Skeleton variant="rectangular" height="100%" />
            ) : (
              <ResponsiveContainer>
                <LineChart data={charts.monthlyExceptionTrend || []}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis allowDecimals={false} />
                  <Tooltip content={<MonthlyTooltip />} />
                  <Line
                    type="monotone"
                    dataKey="count"
                    stroke={NOT_VERIFIED_COLOR}
                    strokeWidth={2}
                    dot={(props) => (
                      <circle
                        key={props.payload.month}
                        cx={props.cx}
                        cy={props.cy}
                        r={4}
                        fill={NOT_VERIFIED_COLOR}
                        stroke="#fff"
                        strokeWidth={1}
                        style={{ cursor: "pointer" }}
                        onClick={() => openDrilldown("month", props.payload.month, `Exceptions in ${moment(props.payload.month, "YYYY-MM").format("MMMM YYYY")}`)}
                      />
                    )}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </ChartPanel>
        </Grid>

        <Grid item xs={12} md={6}>
          <ChartPanel title="Plant-Wise Exception Count (top 10)" hint="Click a bar to drill in" info={chartDefs.plantWiseExceptions}>
            {loading ? (
              <Skeleton variant="rectangular" height="100%" />
            ) : (
              <ResponsiveContainer>
                <BarChart data={charts.plantWiseExceptions || []} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" allowDecimals={false} />
                  <YAxis type="category" dataKey="plantName" width={140} tickFormatter={(v, idx) => v || (charts.plantWiseExceptions || [])[idx]?.key} />
                  <Tooltip content={<BucketTooltip />} />
                  <Bar dataKey="value" fill={NOT_VERIFIED_COLOR} radius={[0, 3, 3, 0]} cursor="pointer"
                    activeBar={{ stroke: "#000", strokeWidth: 2 }}
                    onClick={(d) => { const p = payloadOf(d); openDrilldown("plant", p.key, `Plant: ${p.plantName || p.key}`); }} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartPanel>
        </Grid>

        <Grid item xs={12} md={6}>
          <ChartPanel title="Vendor-Wise Top Exceptions (top 10)" hint="Click a bar to drill in" info={chartDefs.vendorWiseTopExceptions}>
            {loading ? (
              <Skeleton variant="rectangular" height="100%" />
            ) : (
              <ResponsiveContainer>
                <BarChart data={charts.vendorWiseTopExceptions || []} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" allowDecimals={false} />
                  <YAxis type="category" dataKey="vendorName" width={140} tickFormatter={(v, idx) => v || (charts.vendorWiseTopExceptions || [])[idx]?.key} />
                  <Tooltip content={<BucketTooltip />} />
                  <Bar dataKey="value" fill={NOT_VERIFIED_COLOR} radius={[0, 3, 3, 0]} cursor="pointer"
                    activeBar={{ stroke: "#000", strokeWidth: 2 }}
                    onClick={(d) => { const p = payloadOf(d); openDrilldown("vendor", p.key, `Vendor: ${p.vendorName || p.name || p.key}`); }} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartPanel>
        </Grid>

        <Grid item xs={12} md={6}>
          <ChartPanel
            title="Hold PO Ageing (PO date + 30 days)"
            hint="Click a bar to drill in"
            height={220}
            info={chartDefs.holdPoAgeing || "A PO on SAP Hold is 'Overdue' once more than 30 days have passed since its PO creation date without being released. 'Not yet due' means it's still inside that 30-day window."}
          >
            {loading ? (
              <Skeleton variant="rectangular" height="100%" />
            ) : (
              <ResponsiveContainer>
                <BarChart data={charts.holdPoAgeing || []}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="bucket" />
                  <YAxis allowDecimals={false} />
                  <Tooltip content={<HoldAgeingTooltip />} />
                  <Bar dataKey="count" fill="#b8842b" radius={[3, 3, 0, 0]} cursor="pointer"
                    activeBar={{ stroke: "#000", strokeWidth: 2 }}
                    onClick={(d) => { const p = payloadOf(d); openDrilldown("holdBucket", p.bucket, `Hold POs: ${p.bucket}`); }} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartPanel>
        </Grid>

        <Grid item xs={12} md={6}>
          <ChartPanel title="PO-Wise Not-Verified Cases (top 15)" hint="Click a bar to drill in" info={chartDefs.poNumberWiseExceptions}>
            {loading ? (
              <Skeleton variant="rectangular" height="100%" />
            ) : (
              <ResponsiveContainer>
                <BarChart data={charts.poNumberWiseExceptions || []} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" allowDecimals={false} />
                  <YAxis type="category" dataKey="key" width={90} />
                  <Tooltip content={<BucketTooltip />} />
                  <Bar dataKey="value" fill={NOT_VERIFIED_COLOR} radius={[0, 3, 3, 0]} cursor="pointer"
                    activeBar={{ stroke: "#000", strokeWidth: 2 }}
                    onClick={(d) => { const p = payloadOf(d); openDrilldown("poNumber", p.key, `PO: ${p.key} - Not-Verified lines (line items: ${(p.lineItems || []).join(", ") || "—"})`); }} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartPanel>
        </Grid>
      </Grid>

      {/* 3) PO-WISE EXCEPTIONS TABLE LAST */}
      <Box sx={{ mt: 3 }}>
        <PoWiseExceptionsTable
          rows={charts.poWiseExceptions || []}
          loading={loading}
          onOpenPo={(r) => openDrilldown("poNumber", r.poNumber, `PO Number: ${r.poNumber} — ${r.vendorName || r.vendorCode || ""}`.trim())}
        />
      </Box>

      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 3 }}>
        This is page 1 of 12 from the dashboard design (Executive P2P Compliance Control Tower). Checkpoint descriptions and
        criticality now live on the Risk Categorization Master page. The other 11 pages follow the same pattern - a Prisma
        aggregation endpoint plus a page like this one - and can be added the same way.
      </Typography>

      <DrilldownDialog drilldown={drilldown} appliedFilters={buildSummaryBody(filters)} onClose={() => setDrilldown(null)} />
    </Box>
  );
};

export default ExecutiveDashboard;