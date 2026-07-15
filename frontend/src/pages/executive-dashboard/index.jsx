import { useCallback, useEffect, useRef, useState } from "react";
import {
  Box,
  Card,
  CardActionArea,
  CardContent,
  Grid,
  IconButton,
  Paper,
  Skeleton,
  Tooltip as MuiTooltip,
  Typography,
  Chip,
} from "@mui/material";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import FileDownloadRoundedIcon from "@mui/icons-material/FileDownloadRounded";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
} from "recharts";
import moment from "moment";
import { toast } from "react-toastify";

import { post } from "utils/axiosApi";
import FilterBar, { DEFAULT_FILTERS } from "./components/FilterBar";
import DrilldownDialog from "./components/DrilldownDialog";
import {
  ControlWiseTooltip,
  SeverityTooltip,
  PoTypeTooltip,
  MonthlyTooltip,
  BucketTooltip,
  HoldAgeingTooltip,
} from "./components/tooltips";

const SEVERITY_COLORS = { Critical: "#c0392b", High: "#e67e22", Medium: "#f1c40f", Low: "#95a5a6" };
const BAR_COLOR = "#1f6f6b";
const VERIFIED_COLOR = "#2f6b4f";
const NOT_VERIFIED_COLOR = "#a8442e";

const KpiCard = ({ label, value, sublabel, loading, onClick }) => {
  const content = (
    <CardContent>
      <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: 0.5 }}>
        {label}
      </Typography>
      {loading ? (
        <Skeleton width="60%" height={36} />
      ) : (
        <Typography variant="h5" sx={{ fontWeight: 700, mt: 0.5 }}>
          {value}
        </Typography>
      )}
      {sublabel && (
        <Typography variant="caption" color="text.secondary">
          {sublabel}
        </Typography>
      )}
    </CardContent>
  );
  return (
    <Card variant="outlined" sx={{ height: "100%" }}>
      {onClick ? <CardActionArea onClick={onClick} sx={{ height: "100%" }}>{content}</CardActionArea> : content}
    </Card>
  );
};

const ChartPanel = ({ title, hint, children, height = 300 }) => (
  <Paper variant="outlined" sx={{ p: 2, height: "100%" }}>
    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
      <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 600 }}>
        {title}
      </Typography>
      {hint && (
        <Typography variant="caption" color="text.secondary">
          {hint}
        </Typography>
      )}
    </Box>
    <Box sx={{ width: "100%", height }}>{children}</Box>
  </Paper>
);

const isCancel = (err) => err?.code === "ERR_CANCELED" || err?.name === "CanceledError";

// Recharts click handlers are sometimes called with the raw datum and
// sometimes with a wrapper object exposing the datum under `.payload`
// (Pie slices always do; Bar segments do on some recharts versions) - this
// normalizes both so every onClick below can just read the fields it needs.
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

const ExecutiveDashboard = () => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);

  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [filterOptions, setFilterOptions] = useState({ plants: [], vendors: [], poTypes: [], purchaseGroups: [] });

  const [drilldown, setDrilldown] = useState(null); // { dimension, value, title }

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

  const openDrilldown = (dimension, value, title, extra = {}) => setDrilldown({ dimension, value, title, ...extra });

  const exportSummaryCsv = () => {
    if (!data) return;
    const lines = ["Section,Key,Value,Extra"];
    Object.entries(kpis).forEach(([k, v]) => lines.push(`KPI,${csvEscape(k)},${csvEscape(v)},`));
    (charts.controlWiseCompliance || []).forEach((d) =>
      lines.push(`Control-Wise Compliance,Point ${d.pointNo} (${d.severity}),${d.compliancePct ?? "N/A"}%,verified=${d.verified} notVerified=${d.notVerified}`)
    );
    (charts.exceptionBySeverity || []).forEach((d) => lines.push(`Exceptions by Severity,${d.severity},${d.count},${d.pct}%`));
    (charts.plantWiseExceptions || []).forEach((d) => lines.push(`Plant-Wise Exceptions,${csvEscape(d.key)},${d.value},valueExposure=${d.valueExposure}`));
    (charts.vendorWiseTopExceptions || []).forEach((d) => lines.push(`Vendor-Wise Exceptions,${csvEscape(d.key)},${d.value},valueExposure=${d.valueExposure}`));
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
          <MuiTooltip title="Export current summary as CSV">
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
          <MuiTooltip title="Refresh">
            <span>
              <IconButton size="small" onClick={() => fetchSummary(filters)} disabled={loading}>
                <RefreshRoundedIcon fontSize="small" />
              </IconButton>
            </span>
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

      <Grid item xs={12} md={12}>
          <ChartPanel title="PO Number-Wise Exception Count (top 10)" hint="Click a bar to drill in">
            {loading ? (
              <Skeleton variant="rectangular" height="100%" />
            ) : (
              <ResponsiveContainer>
                <BarChart data={charts.poWiseExceptions || []}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="poNumber" />
                  <YAxis allowDecimals={false} />
                  <Tooltip content={<BucketTooltip />} />
                  <Bar
                    dataKey="count"
                    fill={NOT_VERIFIED_COLOR}
                    radius={[3, 3, 0, 0]}
                    cursor="pointer"
                    activeBar={{ stroke: "#000", strokeWidth: 2 }}
                    onClick={(d) => {
                      const p = payloadOf(d);
                      openDrilldown("poNumber", p.poNumber, `PO Number: ${p.poNumber} Exceptions`);
                    }}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartPanel>
        </Grid>

      {/* KPI cards - every one of these is now clickable and opens the rows
          that actually make up that number (same drilldown dialog the
          charts use), not just a static readout. */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={6} sm={4} md={2.4}>
          <KpiCard
            label="Total PO Count"
            value={kpis.totalPOCount ?? "—"}
            sublabel="Click to view all PO lines"
            loading={loading}
            onClick={kpis.totalPOCount ? () => openDrilldown("all", true, "All PO Lines") : undefined}
          />
        </Grid>
        <Grid item xs={6} sm={4} md={2.4}>
          <KpiCard
            label="Total PO Lines"
            value={kpis.totalPOLineItems ?? "—"}
            sublabel="Click to view all PO lines"
            loading={loading}
            onClick={kpis.totalPOLineItems ? () => openDrilldown("all", true, "All PO Lines") : undefined}
          />
        </Grid>
        <Grid item xs={6} sm={4} md={2.4}>
          <KpiCard
            label="Total PR Count"
            value={kpis.totalPRCount ?? "—"}
            sublabel="Click to view all PO lines"
            loading={loading}
            onClick={kpis.totalPRCount ? () => openDrilldown("all", true, "All PO Lines") : undefined}
          />
        </Grid>
        <Grid item xs={6} sm={4} md={2.4}>
          <KpiCard
            label="Hold PO Count"
            value={kpis.holdPOCount ?? "—"}
            sublabel="Click to drill in"
            loading={loading}
            onClick={kpis.holdPOCount ? () => openDrilldown("hold", true, "Hold POs") : undefined}
          />
        </Grid>
        <Grid item xs={6} sm={4} md={2.4}>
          <KpiCard
            label="Exception Value Exposure"
            value={kpis.exceptionValueExposure != null ? kpis.exceptionValueExposure.toLocaleString() : "—"}
            sublabel="Click to drill in"
            loading={loading}
            onClick={kpis.exceptionValueExposure ? () => openDrilldown("anyException", true, "Lines Contributing to Exception Value Exposure") : undefined}
          />
        </Grid>

        <Grid item xs={6} sm={4} md={2.4}>
          <KpiCard
            label="Verified Checks"
            value={kpis.verifiedCount ?? "—"}
            sublabel="Click to drill in"
            loading={loading}
            onClick={kpis.verifiedCount ? () => openDrilldown("verifiedAny", true, "Lines with at Least One Verified Checkpoint", { statusFilter: "verified" }) : undefined}
          />
        </Grid>
        <Grid item xs={6} sm={4} md={2.4}>
          <KpiCard
            label="Not Verified Checks"
            value={kpis.notVerifiedCount ?? "—"}
            sublabel="Click to drill in"
            loading={loading}
            onClick={kpis.notVerifiedCount ? () => openDrilldown("anyException", true, "Lines with at Least One Exception") : undefined}
          />
        </Grid>
        <Grid item xs={6} sm={4} md={2.4}>
          <KpiCard
            label="Not Applicable"
            value={kpis.notApplicableCount ?? "—"}
            sublabel="Click to drill in"
            loading={loading}
            onClick={kpis.notApplicableCount ? () => openDrilldown("na", true, "Lines with at Least One N/A Checkpoint", { statusFilter: "na" }) : undefined}
          />
        </Grid>
        <Grid item xs={6} sm={4} md={2.4}>
          <KpiCard
            label="Manual Review Needed"
            value={kpis.manualReviewCount ?? "—"}
            sublabel="Click to drill in"
            loading={loading}
            onClick={kpis.manualReviewCount ? () => openDrilldown("manual", true, "Lines Needing Manual Review", { statusFilter: "manual" }) : undefined}
          />
        </Grid>
        <Grid item xs={6} sm={4} md={2.4}>
          <KpiCard
            label="High-Risk Exceptions"
            value={kpis.highRiskExceptions ?? "—"}
            sublabel="Critical + High severity - click to drill in"
            loading={loading}
            onClick={
              kpis.highRiskExceptions
                ? () => openDrilldown("severity", "Critical,High", "High-Risk Exceptions (Critical + High)")
                : undefined
            }
          />
        </Grid>
      </Grid>

      {/* Charts */}
      <Grid container spacing={2}>
       <Grid item xs={12} md={7}>
          {/* Update the title to say points 1-19 */}
          <ChartPanel title="Control-Wise Compliance (% verified, points 1-19)" hint="Click a bar to drill in">
            {loading ? (
              <Skeleton variant="rectangular" height="100%" />
            ) : (
              <>
               <ResponsiveContainer width="100%" height="82%">
  <BarChart data={charts.controlWiseCompliance || []}>
    <CartesianGrid strokeDasharray="3 3" />

    {/* Never skip X-axis labels */}
    <XAxis
      dataKey="pointNo"
      tickFormatter={(v) => `#${v}`}
      interval={0}
    />

    <YAxis domain={[0, 100]} unit="%" />
    <Tooltip content={<ControlWiseTooltip />} />

    {/* Ensure 0% bars are still visible */}
    <Bar
      dataKey="compliancePct"
      fill={BAR_COLOR}
      radius={[3, 3, 0, 0]}
      cursor="pointer"
      minPointSize={5}
      activeBar={{ stroke: "#000", strokeWidth: 2 }}
      onClick={(d) => {
        const p = payloadOf(d);
        openDrilldown(
          "pointNo",
          p.pointNo,
          `Control Point #${p.pointNo}: ${p.label} - not-verified lines`
        );
      }}
    >
      {(charts.controlWiseCompliance || []).map((d) => (
        <Cell
          key={d.pointNo}
          fill={SEVERITY_COLORS[d.severity] || BAR_COLOR}
        />
      ))}
    </Bar>
  </BarChart>
</ResponsiveContainer>
              </>
            )}
          </ChartPanel>
        </Grid>

        <Grid item xs={12} md={5}>
          <ChartPanel title="Exceptions by Severity" hint="Click a slice to drill in">
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
          <ChartPanel title="PO Type-Wise Compliance" hint="Click a bar to drill in">
            {loading ? (
              <Skeleton variant="rectangular" height="100%" />
            ) : (
              <ResponsiveContainer>
                <BarChart data={charts.poTypeWiseCompliance || []}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="poType" />
                  <YAxis />
                  <Tooltip content={<PoTypeTooltip />} />
                  <Legend />
                  <Bar
                    dataKey="verified"
                    stackId="a"
                    fill={VERIFIED_COLOR}
                    name="Verified"
                    cursor="pointer"
                    activeBar={{ stroke: "#0a3d24", strokeWidth: 2 }}
                    onClick={(d) => {
                      const p = payloadOf(d);
                      openDrilldown("poType", p.poType, `PO Type: ${p.poType} - Verified lines`, { statusFilter: "verified" });
                    }}
                  />
                  <Bar
                    dataKey="notVerified"
                    stackId="a"
                    fill={NOT_VERIFIED_COLOR}
                    name="Not Verified"
                    radius={[3, 3, 0, 0]}
                    cursor="pointer"
                    activeBar={{ stroke: "#5c1f10", strokeWidth: 2 }}
                    onClick={(d) => {
                      const p = payloadOf(d);
                      openDrilldown("poType", p.poType, `PO Type: ${p.poType} - Not-Verified lines`, { statusFilter: "notVerified" });
                    }}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartPanel>
        </Grid>

        <Grid item xs={12} md={6}>
          <ChartPanel title="Monthly Exception Trend" hint="Click a point to drill in">
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
          <ChartPanel title="Plant-Wise Exception Count (top 10)" hint="Click a bar to drill in">
            {loading ? (
              <Skeleton variant="rectangular" height="100%" />
            ) : (
              <ResponsiveContainer>
                <BarChart data={charts.plantWiseExceptions || []} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" allowDecimals={false} />
                  <YAxis type="category" dataKey="key" width={70} />
                  <Tooltip content={<BucketTooltip />} />
                  <Bar
                    dataKey="value"
                    fill={NOT_VERIFIED_COLOR}
                    radius={[0, 3, 3, 0]}
                    cursor="pointer"
                    activeBar={{ stroke: "#000", strokeWidth: 2 }}
                    onClick={(d) => {
                      const p = payloadOf(d);
                      openDrilldown("plant", p.key, `Plant: ${p.key}`);
                    }}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartPanel>
        </Grid>

        <Grid item xs={12} md={6}>
          <ChartPanel title="Vendor-Wise Top Exceptions (top 10)" hint="Click a bar to drill in">
            {loading ? (
              <Skeleton variant="rectangular" height="100%" />
            ) : (
              <ResponsiveContainer>
                <BarChart data={charts.vendorWiseTopExceptions || []} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" allowDecimals={false} />
                  <YAxis type="category" dataKey="key" width={100} />
                  <Tooltip content={<BucketTooltip />} />
                  <Bar
                    dataKey="value"
                    fill={NOT_VERIFIED_COLOR}
                    radius={[0, 3, 3, 0]}
                    cursor="pointer"
                    activeBar={{ stroke: "#000", strokeWidth: 2 }}
                    onClick={(d) => {
                      const p = payloadOf(d);
                      openDrilldown("vendor", p.key, `Vendor: ${p.name || p.key}`);
                    }}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartPanel>
        </Grid>

        <Grid item xs={12} md={6}>
          <ChartPanel title="Hold PO Ageing (PO date + 30 days)" hint="Click a bar to drill in" height={220}>
            {loading ? (
              <Skeleton variant="rectangular" height="100%" />
            ) : (
              <ResponsiveContainer>
                <BarChart data={charts.holdPoAgeing || []}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="bucket" />
                  <YAxis allowDecimals={false} />
                  <Tooltip content={<HoldAgeingTooltip />} />
                  <Bar
                    dataKey="count"
                    fill="#b8842b"
                    radius={[3, 3, 0, 0]}
                    cursor="pointer"
                    activeBar={{ stroke: "#000", strokeWidth: 2 }}
                    onClick={(d) => {
                      const p = payloadOf(d);
                      openDrilldown("holdBucket", p.bucket, `Hold POs: ${p.bucket}`);
                    }}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartPanel>
        </Grid>

        <Grid item xs={12} md={6}>
          <ChartPanel title="PO-Wise Not-Verified Cases (top 15)" hint="Click a bar to drill in">
            {loading ? (
              <Skeleton variant="rectangular" height="100%" />
            ) : (
              <ResponsiveContainer>
                <BarChart data={charts.poNumberWiseExceptions || []} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" allowDecimals={false} />
                  <YAxis type="category" dataKey="key" width={90} />
                  <Tooltip content={<BucketTooltip />} />
                  <Bar
                    dataKey="value"
                    fill={NOT_VERIFIED_COLOR}
                    radius={[0, 3, 3, 0]}
                    cursor="pointer"
                    activeBar={{ stroke: "#000", strokeWidth: 2 }}
                    onClick={(d) => {
                      const p = payloadOf(d);
                      openDrilldown("poNumber", p.key, `PO: ${p.key} - Not-Verified lines`);
                    }}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartPanel>
        </Grid>
      </Grid>

      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 3 }}>
        This is page 1 of 12 from the dashboard design (Executive P2P Compliance Control Tower). The other 11 pages
        (PR Compliance, Quantity &amp; Delivery, Rate Contract, Tax &amp; Vendor-Material, Payment Terms &amp; MSME,
        Inco-Term &amp; Freight, Approval &amp; DWS Rate Approval, PO Type Compliance, Multiple PO Risk, Exception
        Workbench, Audit Report Export) follow the same pattern - a Prisma aggregation endpoint plus a page like this
        one - and can be added the same way.
      </Typography>

      <DrilldownDialog drilldown={drilldown} appliedFilters={buildSummaryBody(filters)} onClose={() => setDrilldown(null)} />
    </Box>
  );
};

export default ExecutiveDashboard;
