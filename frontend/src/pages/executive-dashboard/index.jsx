import { useCallback, useEffect, useRef, useState } from "react";
import PoDetailsPreviewDialog from "./components/PoDetailsPreviewDialog";
import RemarksImpactListDialog from "./components/RemarksImpactListDialog";
import PoListDialog from "./components/PoListDialog";
import PoWiseExceptionsTable from "./components/PoWiseExceptionsTable";
import PoStatusSummaryTables from "./components/PoStatusSummaryTables";
import { buildSearchUrl, getFirstLineItem } from "utils/po-link-utils";
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
  alpha,
} from "@mui/material";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import FileDownloadRoundedIcon from "@mui/icons-material/FileDownloadRounded";
import CheckCircleOutlineRoundedIcon from "@mui/icons-material/CheckCircleOutlineRounded";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import LayersRoundedIcon from "@mui/icons-material/LayersRounded";
import DescriptionRoundedIcon from "@mui/icons-material/DescriptionRounded";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
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
  LabelList,
} from "recharts";
import moment from "moment";
import { toast } from "react-toastify";

import { post } from "utils/axiosApi";
import FilterBar, { DEFAULT_FILTERS } from "./components/FilterBar";
import DrilldownDialog from "./components/DrilldownDialog";
import HeaderDrilldownDialog from "./components/HeaderDrilldownDialog";
import HeaderKpiDrilldownDialog from "./components/HeaderKpiDrilldownDialog";
import RcKpiDrilldownDialog from "./components/RcKpiDrilldownDialog";
import {
  ControlWiseTooltip,
  SeverityTooltip,
  PoTypeTooltip,
} from "./components/tooltips";

// --- DASHBOARD PALETTE ---
const SEVERITY_COLORS = {
  Critical: "#dc2626",
  High: "#f97316",
  Medium: "#f59e0b",
  Low: "#64748b",
};
const BAR_COLOR = "#4f46e5";
const VERIFIED_COLOR = "#059669";
const NOT_VERIFIED_COLOR = "#dc2626";
const PENDING_COLOR = "#d97706";
const GRID_COLOR = "#f1f5f9";
const HEADER_ACCENT = "#4f46e5";
const HEADER_ACCENT_BG = "#eef2ff";
const OVERVIEW_ACCENT = "#0f172a";
const RC_ACCENT = "#0d9488";
const RC_ACCENT_BG = "#f0fdfa";
const RC_ACCENT_BORDER = "#99f6e4";
const RC_ACCENT_DARK = "#115e59";
const RC_PANEL_TONE = {
  bg: "#fafffe",
  border: RC_ACCENT_BORDER,
  title: RC_ACCENT_DARK,
  hint: RC_ACCENT,
};
const TREND_LINE_COLOR = "#4f46e5";
const TREND_HEADER_COLOR = "#f97316";

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
    <linearGradient id="gradHeaderBar" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor="#a5b4fc" stopOpacity={1} />
      <stop offset="100%" stopColor="#6366f1" stopOpacity={0.95} />
    </linearGradient>
  </defs>
);

const truncateLabel = (str, max = 24) => {
  if (!str) return str;
  const s = String(str);
  return s.length > max ? `${s.slice(0, max)}…` : s;
};

const horizontalChartHeight = (
  rowCount,
  rowHeight = 34,
  base = 70,
  min = 220,
) => Math.max(min, rowCount * rowHeight + base);

const formatMonthLabel = (m) => {
  const parsed = moment(m, "YYYY-MM");
  return parsed.isValid() ? parsed.format("MMM 'YY") : m;
};

const fmt = (v) => (typeof v === "number" ? v.toLocaleString() : "—");

const mergeMonthlyTrends = (lineData = [], headerData = []) => {
  const map = new Map();
  (lineData || []).forEach((d) => {
    map.set(d.month, {
      month: d.month,
      lineCount: d.count,
      lineValueExposure: d.valueExposure,
      headerCount: 0,
    });
  });
  (headerData || []).forEach((d) => {
    const existing = map.get(d.month);
    if (existing) {
      existing.headerCount = d.count;
    } else {
      map.set(d.month, {
        month: d.month,
        lineCount: 0,
        lineValueExposure: 0,
        headerCount: d.count,
      });
    }
  });
  return [...map.values()].sort((a, b) => (a.month < b.month ? -1 : 1));
};

const InfoTip = ({ text }) => {
  if (!text) return null;
  return (
    <InfoOutlinedIcon
      sx={{
        fontSize: 18,
        ml: 0.75,
        color: "text.disabled",
        verticalAlign: "text-bottom",
        transition: "color 0.2s",
      }}
    />
  );
};

// Small caption that tells the reader WHAT IS BEING COUNTED in a block.
// This is the single biggest source of confusion: POs vs lines vs checks.
const UnitBadge = ({ children, color = "#475569", bg = "#f1f5f9" }) => (
  <Chip
    size="small"
    label={children}
    sx={{
      ml: 1.5,
      fontWeight: 700,
      fontSize: 11,
      height: 22,
      color,
      bgcolor: bg,
    }}
  />
);

const KpiCard = ({
  label,
  value,
  sublabel,
  loading,
  onClick,
  info,
  valueColor = "text.primary",
  accent,
  accentBg = HEADER_ACCENT_BG,
  accentBorder = "#c7d2fe",
  emphasize,
}) => {
  const content = (
    <CardContent
      sx={{
        p: 3,
        display: "flex",
        flexDirection: "column",
        height: "100%",
        justifyContent: "space-between",
      }}
    >
      <Box>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            mb: 2,
            justifyContent: "space-between",
          }}
        >
          <Typography
            variant="overline"
            color="text.secondary"
            sx={{ fontWeight: 700, letterSpacing: 1, lineHeight: 1.2 }}
          >
            {label}
          </Typography>
          {info && <InfoTip text={info} />}
        </Box>
        {loading ? (
          <Skeleton width="60%" height={48} sx={{ borderRadius: 2 }} />
        ) : (
          <Typography
            variant={emphasize ? "h2" : "h3"}
            sx={{ fontWeight: 800, color: valueColor, letterSpacing: -1 }}
          >
            {value}
          </Typography>
        )}
      </Box>
      {sublabel && (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{
            mt: 2,
            display: "block",
            fontWeight: 500,
            pt: 1.5,
            borderTop: "1px dashed",
            borderColor: "grey.200",
          }}
        >
          {sublabel}
        </Typography>
      )}
    </CardContent>
  );

  const cardElement = (
    <Card
      elevation={0}
      sx={{
        height: "100%",
        borderRadius: 4,
        background: accent ? accentBg : "#ffffff",
        border: "1px solid",
        borderColor: accent ? accentBorder : "grey.100",
        boxShadow: "0 10px 30px -5px rgba(0,0,0,0.04)",
        transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
        ...(onClick && {
          "&:hover": {
            transform: "translateY(-4px)",
            boxShadow: "0 15px 35px -5px rgba(79, 70, 229, 0.12)",
            borderColor: alpha("#4f46e5", 0.3),
          },
        }),
      }}
    >
      {onClick ? (
        <CardActionArea onClick={onClick} sx={{ height: "100%" }}>
          {content}
        </CardActionArea>
      ) : (
        content
      )}
    </Card>
  );

  return info ? (
    <MuiTooltip title={info} placement="top" arrow>
      <Box sx={{ height: "100%" }}>{cardElement}</Box>
    </MuiTooltip>
  ) : (
    cardElement
  );
};

// One "Remarks Impact" number. Each is its own click target.
const RemarksImpactNumber = ({ value, label, color, onClick, prefix }) => (
  <Box
    onClick={onClick}
    sx={{
      cursor: onClick ? "pointer" : "default",
      borderRadius: 2,
      px: 1,
      py: 0.5,
      transition: "background-color 0.15s",
      "&:hover": onClick ? { bgcolor: alpha(color, 0.08) } : undefined,
    }}
  >
    <Typography
      variant="h4"
      sx={{
        fontWeight: 800,
        color,
        textDecoration: onClick ? "underline" : "none",
        textDecorationColor: alpha(color, 0.3),
        textUnderlineOffset: 4,
      }}
    >
      {prefix && (
        <span style={{ color: "#94a3b8", marginRight: 6, fontWeight: 600 }}>
          {prefix}
        </span>
      )}
      {value}
    </Typography>
    <Typography
      variant="caption"
      color="text.secondary"
      sx={{ display: "flex", alignItems: "center", gap: 0.3 }}
    >
      {label}
      {onClick && <span style={{ fontSize: "0.85em" }}>↗</span>}
    </Typography>
  </Box>
);

// Remarks Impact card. Order is now  TOTAL = CLOSED + PENDING  (left to right)
// so the equation reads naturally.
const RemarksImpactCardBody = ({
  title,
  unitLabel,
  closed,
  pending,
  totalNotVerified,
  loading,
  nothingPending,
  onBucketClick,
}) => (
  <CardContent sx={{ p: 3 }}>
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <Typography
        variant="overline"
        color="text.secondary"
        sx={{ fontWeight: 700, letterSpacing: 1 }}
      >
        {title} — Not Verified {unitLabel}
      </Typography>
      <MuiTooltip
        arrow
        placement="top"
        title={
          <Box sx={{ p: 0.5, maxWidth: 300 }}>
            <Typography variant="body2" sx={{ fontWeight: 700, mb: 0.5 }}>
              How to read this card
            </Typography>
            <Typography variant="caption" component="div" sx={{ mb: 0.5 }}>
              Unit = <b>{unitLabel}</b>, not POs.
            </Typography>
            <Typography variant="caption" component="div" sx={{ mb: 0.5 }}>
              <b>Total Not Verified</b> = checks the system flagged.
            </Typography>
            <Typography variant="caption" component="div" sx={{ mb: 0.5 }}>
              <b>Closed</b> = flagged checks that now have a remark or check.
            </Typography>
            <Typography variant="caption" component="div">
              <b>Pending</b> = flagged checks nobody has acted on. Total =
              Closed + Pending.
            </Typography>
          </Box>
        }
      >
        <InfoOutlinedIcon
          sx={{ fontSize: 18, color: "text.disabled", cursor: "help" }}
        />
      </MuiTooltip>
    </Box>
    {loading ? (
      <Skeleton width="80%" height={40} sx={{ borderRadius: 2, my: 1 }} />
    ) : nothingPending ? (
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, my: 1.5 }}>
        <CheckCircleOutlineRoundedIcon
          fontSize="small"
          sx={{ color: "#15803d" }}
        />
        <Typography variant="body1" sx={{ fontWeight: 700, color: "#15803d" }}>
          No Not Verified {title.toLowerCase()} items — nothing pending here.
        </Typography>
      </Box>
    ) : (
      <Box sx={{ display: "flex", alignItems: "baseline", gap: 1, my: 1 }}>
        <RemarksImpactNumber
          value={totalNotVerified}
          label="Total Not Verified"
          color="#475569"
          onClick={
            totalNotVerified > 0 ? () => onBucketClick("total") : undefined
          }
        />
        <RemarksImpactNumber
          prefix="="
          value={closed}
          label="Closed"
          color={VERIFIED_COLOR}
          onClick={closed > 0 ? () => onBucketClick("closed") : undefined}
        />
        <RemarksImpactNumber
          prefix="+"
          value={pending}
          label="Pending"
          color={PENDING_COLOR}
          onClick={pending > 0 ? () => onBucketClick("pending") : undefined}
        />
      </Box>
    )}
    {!loading && !nothingPending && (
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{
          mt: 1,
          display: "block",
          pt: 1.5,
          borderTop: "1px dashed",
          borderColor: "grey.200",
        }}
      >
        {totalNotVerified} flagged = {closed} closed + {pending} pending. Click
        a number to see its list.
      </Typography>
    )}
  </CardContent>
);

const ChartPanel = ({
  title,
  hint,
  children,
  height = 320,
  info,
  accent,
  tone,
  icon,
}) => {
  const t = {
    bg: "#fbfbff",
    border: "#c7d2fe",
    title: "#3730a3",
    hint: "#6366f1",
    ...(tone || {}),
  };
  return (
    <Paper
      elevation={0}
      sx={{
        p: 3,
        height: "100%",
        borderRadius: 4,
        background: accent ? t.bg : "#ffffff",
        border: "1px solid",
        borderColor: accent ? t.border : "grey.100",
        boxShadow: "0 10px 30px -5px rgba(0,0,0,0.04)",
      }}
    >
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          mb: 4,
        }}
      >
        <Box>
          <Typography
            variant="h6"
            sx={{
              fontWeight: 800,
              color: accent ? t.title : "#0f172a",
              display: "flex",
              alignItems: "center",
            }}
          >
            {icon}
            {title}
            {info && (
              <MuiTooltip title={info} placement="top" arrow>
                <InfoOutlinedIcon
                  sx={{
                    fontSize: 18,
                    ml: 0.75,
                    color: "text.disabled",
                    cursor: "help",
                    verticalAlign: "text-bottom",
                    transition: "color 0.2s",
                    "&:hover": { color: "#4f46e5" },
                  }}
                />
              </MuiTooltip>
            )}
          </Typography>
          {hint && (
            <Typography
              variant="caption"
              sx={{ color: accent ? t.hint : "#64748b", fontWeight: 500 }}
            >
              {hint}
            </Typography>
          )}
        </Box>
      </Box>
      <Box sx={{ width: "100%", height }}>{children}</Box>
    </Paper>
  );
};

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
      <Typography
        variant="body2"
        sx={{ fontWeight: 800, mb: 1, color: "#0f172a" }}
      >
        {labelFormatter ? labelFormatter(d) : d[labelKey]}
      </Typography>
      <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
        <Typography
          variant="caption"
          sx={{ color: VERIFIED_COLOR, fontWeight: 700 }}
        >
          Verified:
        </Typography>
        <Typography variant="caption" sx={{ color: "#0f172a", fontWeight: 700 }}>
          {d.verified}
        </Typography>
      </Box>
      <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
        <Typography
          variant="caption"
          sx={{ color: NOT_VERIFIED_COLOR, fontWeight: 700 }}
        >
          Not Verified:
        </Typography>
        <Typography variant="caption" sx={{ color: "#0f172a", fontWeight: 700 }}>
          {d.notVerified}
        </Typography>
      </Box>
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          mt: 1,
          pt: 1,
          borderTop: "1px solid",
          borderColor: "grey.100",
        }}
      >
        <Typography variant="caption" sx={{ color: "#64748b", fontWeight: 700 }}>
          Compliance:
        </Typography>
        <Typography variant="caption" sx={{ color: "#0f172a", fontWeight: 800 }}>
          {d.compliancePct != null ? `${d.compliancePct}%` : "N/A"}
        </Typography>
      </Box>
    </Box>
  );
};

const HeaderControlWiseTooltip = ({ active, payload }) => {
  if (!active || !payload || !payload.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  return (
    <Box
      sx={{
        bgcolor: "#fff",
        border: "1px solid #c7d2fe",
        borderRadius: 3,
        boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)",
        p: 2,
        minWidth: 220,
      }}
    >
      <Typography
        variant="body2"
        sx={{ fontWeight: 800, mb: 0.5, color: "#3730a3" }}
      >
        #{d.pointNo} — {d.title}
      </Typography>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: "block", mb: 1 }}
      >
        {d.summary}
      </Typography>
      <Box sx={{ display: "flex", justifyContent: "space-between" }}>
        <Typography
          variant="caption"
          sx={{ color: VERIFIED_COLOR, fontWeight: 700 }}
        >
          Verified POs:
        </Typography>
        <Typography variant="caption" sx={{ fontWeight: 700 }}>
          {d.verified}
        </Typography>
      </Box>
      <Box sx={{ display: "flex", justifyContent: "space-between" }}>
        <Typography
          variant="caption"
          sx={{ color: NOT_VERIFIED_COLOR, fontWeight: 700 }}
        >
          Not-Verified POs:
        </Typography>
        <Typography variant="caption" sx={{ fontWeight: 700 }}>
          {d.notVerified}
        </Typography>
      </Box>
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          mt: 1,
          pt: 1,
          borderTop: "1px solid #e0e7ff",
        }}
      >
        <Typography variant="caption" sx={{ color: "#6366f1", fontWeight: 700 }}>
          PO Compliance:
        </Typography>
        <Typography variant="caption" sx={{ fontWeight: 800 }}>
          {d.compliancePct != null ? `${d.compliancePct}%` : "N/A"}
        </Typography>
      </Box>
    </Box>
  );
};

const MonthlyTrendTooltip = ({ active, payload }) => {
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
        minWidth: 210,
      }}
    >
      <Typography
        variant="body2"
        sx={{ fontWeight: 800, mb: 1, color: "#0f172a" }}
      >
        {formatMonthLabel(d.month)}
      </Typography>
      <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
        <Typography
          variant="caption"
          sx={{ color: TREND_LINE_COLOR, fontWeight: 700 }}
        >
          Lines with an exception:
        </Typography>
        <Typography variant="caption" sx={{ color: "#0f172a", fontWeight: 700 }}>
          {d.lineCount}
        </Typography>
      </Box>
      <Box sx={{ display: "flex", justifyContent: "space-between" }}>
        <Typography
          variant="caption"
          sx={{ color: TREND_HEADER_COLOR, fontWeight: 700 }}
        >
          POs with a header exception:
        </Typography>
        <Typography variant="caption" sx={{ color: "#0f172a", fontWeight: 700 }}>
          {d.headerCount}
        </Typography>
      </Box>
    </Box>
  );
};

const isCancel = (err) =>
  err?.code === "ERR_CANCELED" || err?.name === "CanceledError";
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

// Section heading used for Header / Line / RC blocks.
const LevelHeading = ({ icon, color, children, unit, unitColor, unitBg }) => (
  <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5 }}>
    {icon}
    <Typography
      variant="overline"
      sx={{ fontWeight: 800, color, letterSpacing: 1.5 }}
    >
      {children}
    </Typography>
    {unit && (
      <UnitBadge color={unitColor} bg={unitBg}>
        {unit}
      </UnitBadge>
    )}
  </Box>
);

const ExecutiveDashboard = () => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);

  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [filterOptions, setFilterOptions] = useState({
    plants: [],
    vendors: [],
    poTypes: [],
    purchaseGroups: [],
  });

  const [drilldown, setDrilldown] = useState(null);
  const [headerDrilldown, setHeaderDrilldown] = useState(null);
  const [headerKpiDrilldown, setHeaderKpiDrilldown] = useState(null);
  const [rcDrilldown, setRcDrilldown] = useState(null);
  const [poPreview, setPoPreview] = useState(null);
  const abortRef = useRef(null);

  // PO Status Summary + PO list: ONE endpoint, so the tables and the list
  // below them can never disagree. Closed = no pending point (no "locked").
  const [poStatus, setPoStatus] = useState(null);
  const [poStatusLoading, setPoStatusLoading] = useState(true);
  // Drill-down PO list opened from any PO number on the dashboard:
  // { spec, title } - see components/poListFilters.js
  const [poListDialog, setPoListDialog] = useState(null);

  // Remarks Impact (same refresh moments). Refetched whenever a remark is
  // added/edited/deleted; never rewrites the underlying results.
  const [remarksImpact, setRemarksImpact] = useState(null);
  const [remarksImpactDialog, setRemarksImpactDialog] = useState(null);
  const [remarksImpactLoading, setRemarksImpactLoading] = useState(true);

  const fetchPoStatus = useCallback(async (activeFilters) => {
    setPoStatusLoading(true);
    try {
      setPoStatus(
        await post("/reports/po-status-summary", buildSummaryBody(activeFilters)),
      );
    } catch (err) {
      console.error("Error fetching PO status summary:", err);
    } finally {
      setPoStatusLoading(false);
    }
  }, []);

  // Called on first load, filter change, Refresh and every onChanged /
  // onDataChanged / onHeaderChanged callback, so ALL tables refresh together.
  const fetchRemarksImpact = useCallback(
    async (activeFilters) => {
    fetchPoStatus(activeFilters);
    setRemarksImpactLoading(true);
    try {
      const response = await post(
        "/reports/remarks-impact-summary",
        buildSummaryBody(activeFilters),
      );
      setRemarksImpact(response);
    } catch (err) {
      console.error("Error fetching remarks impact summary:", err);
    } finally {
      setRemarksImpactLoading(false);
    }
    },
    [fetchPoStatus],
  );

  const fetchSummary = useCallback(async (activeFilters) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError("");
    try {
      const response = await post(
        "/reports/executive-summary",
        buildSummaryBody(activeFilters),
        { signal: controller.signal },
      );
      setData(response);
      setLastUpdated(new Date());
    } catch (err) {
      if (isCancel(err)) return;
      console.error("Error fetching executive summary:", err);
      setError(
        "Could not reach the backend. Is it running, and has data been loaded via node addpo.js?",
      );
      toast.error("Failed to load dashboard data");
    } finally {
      if (abortRef.current === controller) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSummary(filters);
    fetchRemarksImpact(filters);
    return () => abortRef.current?.abort();
  }, [filters, fetchSummary, fetchRemarksImpact]);

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
  const headerKpis = kpis.header || {};
  const rcKpis = kpis.rc || {};
  const charts = data?.charts || {};
  const kpiDefs = data?.kpiDefinitions || {};
  const chartDefs = data?.chartDefinitions || {};
  const restrictedNotice = data?.scope?.restrictedToPurchaseGroup
    ? `Showing figures for purchasing group ${data.scope.restrictedToPurchaseGroup} only`
    : undefined;
  const missingHeaderDataCount = kpis.missingHeaderDataCount || 0;

  // Header / whole-PO closed numbers come from the SAME source as the PO Status
  // Summary tables, so the two can never show different figures.
  const ps = poStatus?.poSummary;
  const hdrClosedPOs = ps?.header?.closed ?? headerKpis.closedPOCount;
  const hdrPendingPOs = ps?.header?.pending ?? headerKpis.openPOCount;
  const wholeClosedPOs = ps?.closed;
  const headerOnlyClosedPOs =
    ps ? Math.max(ps.header.closed - ps.closed, 0) : null;
  const rcGroupChartData = charts.rcPurchaseGroupCompliance || [];
  const rcVendorChartData = charts.rcVendorCompliance || [];

  const monthlyTrendData = mergeMonthlyTrends(
    charts.monthlyExceptionTrend,
    charts.headerMonthlyExceptionTrend,
  );

  const openDrilldown = (dimension, value, title, extra = {}) =>
    setDrilldown({ dimension, value, title, ...extra });
  const openHeaderDrilldown = (pointNo, title, extra = {}) =>
    setHeaderDrilldown({ pointNo, title, ...extra });
  const openHeaderKpiDrilldown = (dimension, title, value) =>
    setHeaderKpiDrilldown({ dimension, title, value });
  const openRcDrilldown = (dimension, title, extra = {}) =>
    setRcDrilldown({ dimension, title, ...extra });

  const handleRowAction = (row, mode, extra) => {
    if (!row) return;
    const lineItem = extra?.lineItem || getFirstLineItem(row);
    if (mode === "newtab") {
      window.open(
        buildSearchUrl(row.poNumber, lineItem, row.source_file_ts),
        "_blank",
        "noopener,noreferrer",
      );
    } else if (mode === "breakdown") {
      setPoPreview({ poNumber: row.poNumber, source_file_ts: row.source_file_ts });
    } else {
      setPoPreview({ poNumber: row.poNumber, lineItem, source_file_ts: row.source_file_ts });
    }
  };

  // Open a PO list (the exact POs behind a number) - every PO there opens its
  // header / line detail, where the buyer can close points.
  const openPoList = (spec, title) => setPoListDialog({ spec, title });
  // "Close points" button inside the detail dialog -> the buyer's existing
  // remark / close dialog for that PO header or line.
  const handleWork = (w) =>
    handleRowAction(
      { poNumber: w.poNumber, source_file_ts: w.source_file_ts },
      w.lineItem ? "modal" : "breakdown",
      w,
    );

  const openFullSearchPage = (preview, newTab) => {
    if (!preview) return;
    const url = buildSearchUrl(preview.poNumber, preview.lineItem, preview.source_file_ts);
    if (newTab) {
      window.open(url, "_blank", "noopener,noreferrer");
    } else {
      window.location.assign(url);
    }
    setPoPreview(null);
  };

  const exportSummaryCsv = () => {
    if (!data) return;
    const lines = ["Section,Key,Value,Extra"];

    // PO status first - the same numbers the on-screen tables show.
    if (poStatus?.poSummary) {
      const ps = poStatus.poSummary;
      lines.push(`PO Status,total,${ps.total},`);
      lines.push(`PO Status,closed,${ps.closed},`);
      lines.push(`PO Status,pending,${ps.pending},`);
      Object.entries(poStatus.statusCounts || {}).forEach(([k, v]) =>
        lines.push(`PO Status,${csvEscape(k)},${v},`),
      );
      (poStatus.byPurchaseGroup || []).forEach((g) =>
        lines.push(
          `PO Status by Purchase Group,${csvEscape(g.purchaseGroup)},${g.closed},total=${g.totalPOs} pending=${g.inReview + g.pending}`,
        ),
      );
    }

    Object.entries(kpis).forEach(([k, v]) => {
      if (k === "header" || k === "rc") return;
      if (!k.toLowerCase().includes("hold")) {
        lines.push(`Overview / Line-Level KPI,${csvEscape(k)},${csvEscape(v)},`);
      }
    });
    Object.entries(headerKpis).forEach(([k, v]) => {
      lines.push(`Header-Level KPI,${csvEscape(k)},${csvEscape(v)},`);
    });
    Object.entries(rcKpis).forEach(([k, v]) => {
      lines.push(`RC-Level KPI,${csvEscape(k)},${csvEscape(v)},`);
    });

    const compRow = (section, label, d) =>
      lines.push(
        `${section},${csvEscape(label)},${d.compliancePct ?? "N/A"}%,verified=${d.verified} notVerified=${d.notVerified}`,
      );
    (charts.controlWiseCompliance || []).forEach((d) =>
      compRow(
        "Control-Wise Compliance (Line-Level)",
        `Point ${d.pointNo} (${d.severity})`,
        d,
      ),
    );
    (charts.headerControlWiseCompliance || []).forEach((d) =>
      compRow(
        "Control-Wise Compliance (Header-Level)",
        `Point ${d.pointNo} (${d.severity})`,
        d,
      ),
    );
    (charts.rcPurchaseGroupCompliance || []).forEach((d) =>
      compRow(
        "RC Compliance by Purchase Group",
        d.purchaseGroupName || d.purchaseGroup,
        d,
      ),
    );
    (charts.rcVendorCompliance || []).forEach((d) =>
      compRow("RC Compliance by Vendor", d.vendorName || d.vendorCode, d),
    );
    (charts.exceptionBySeverity || []).forEach((d) =>
      lines.push(`Exceptions by Severity,${d.severity},${d.count},${d.pct}%`),
    );
    (charts.purchaseGroupWiseCompliance || []).forEach((d) =>
      compRow(
        "Purchase Group-Wise Compliance",
        d.purchaseGroupName || d.purchaseGroup,
        d,
      ),
    );
    (charts.plantWiseExceptions || []).forEach((d) =>
      lines.push(
        `Plant-Wise Exceptions,${csvEscape(d.plantName || d.key)},${d.value},valueExposure=${d.valueExposure}`,
      ),
    );
    (charts.plantWiseCompliance || []).forEach((d) =>
      compRow("Plant-Wise Compliance", d.plantName || d.plant, d),
    );
    (charts.vendorWiseTopExceptions || []).forEach((d) =>
      lines.push(
        `Vendor-Wise Exceptions,${csvEscape(d.vendorName || d.name || d.key)},${d.value},valueExposure=${d.valueExposure}`,
      ),
    );
    (charts.vendorWiseCompliance || []).forEach((d) =>
      compRow("Vendor-Wise Compliance", d.vendorName || d.vendorCode, d),
    );
    (charts.poNumberWiseCompliance || []).forEach((d) =>
      compRow("PO-Wise Compliance", d.poNumber, d),
    );
    (charts.monthlyExceptionTrend || []).forEach((d) =>
      lines.push(
        `Monthly Exception Trend (Line-Item),${d.month},${d.count},valueExposure=${d.valueExposure}`,
      ),
    );
    (charts.headerMonthlyExceptionTrend || []).forEach((d) =>
      lines.push(
        `Monthly Exception Trend (Header-Level),${d.month},${d.count},`,
      ),
    );

    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `executive-summary-${moment().format("YYYYMMDD-HHmm")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ONE renderer for every stacked Verified / Not Verified bar chart (line
  // purchase group / plant / vendor / PO type, and the two RC charts), so
  // they stay visually identical. `tone` switches the RC teal palette on.
  const renderStackedChart = ({
    chartData,
    categoryKey,
    labelOf,
    axisWidth,
    tooltip,
    onSegment,
    rc = false,
    barSize = 20,
    gap = "25%",
  }) => (
    <ResponsiveContainer>
      <BarChart
        data={chartData}
        layout="vertical"
        margin={{ top: 10, bottom: 10, left: 10, right: 30 }}
        barCategoryGap={gap}
      >
        <ChartGradients />
        <CartesianGrid
          strokeDasharray="3 3"
          horizontal={false}
          stroke={rc ? RC_ACCENT_BORDER : GRID_COLOR}
        />
        <XAxis
          type="number"
          allowDecimals={false}
          axisLine={false}
          tickLine={false}
          tick={{
            fill: rc ? RC_ACCENT : "#64748b",
            fontSize: 12,
            fontWeight: 500,
          }}
        />
        <YAxis
          type="category"
          dataKey={categoryKey}
          tickFormatter={(v) => {
            const row = chartData.find((c) => c[categoryKey] === v);
            return truncateLabel(labelOf(row) || v, 26);
          }}
          width={axisWidth}
          axisLine={false}
          tickLine={false}
          tick={{
            fill: rc ? RC_ACCENT_DARK : "#334155",
            fontSize: 13,
            fontWeight: 600,
          }}
        />
        <Tooltip
          content={tooltip}
          cursor={{ fill: alpha(rc ? RC_ACCENT : "#4f46e5", rc ? 0.06 : 0.05) }}
        />
        <Legend
          iconType="circle"
          wrapperStyle={{ paddingTop: 10, fontSize: "14px", fontWeight: 600 }}
        />
        <Bar
          dataKey="verified"
          stackId="a"
          fill="url(#gradVerified)"
          name="Verified"
          cursor="pointer"
          radius={[6, 0, 0, 6]}
          barSize={barSize}
          onClick={(d) => onSegment(payloadOf(d), "verified")}
        />
        <Bar
          dataKey="notVerified"
          stackId="a"
          fill="url(#gradNotVerified)"
          name="Not Verified"
          radius={[0, 6, 6, 0]}
          cursor="pointer"
          barSize={barSize}
          onClick={(d) => onSegment(payloadOf(d), "notVerified")}
        />
      </BarChart>
    </ResponsiveContainer>
  );

  const statusWord = (s) => (s === "verified" ? "Verified" : "Not-Verified");

  const lineStacked = ({
    title,
    hint,
    info,
    data: chartData,
    categoryKey,
    labelOf,
    axisWidth,
    dimension,
    titlePrefix,
    tooltip,
    barSize,
    gap,
    heightArgs,
  }) => (
    <Grid item xs={12}>
      <ChartPanel
        title={title}
        hint={hint}
        info={info}
        height={horizontalChartHeight(
          (chartData || []).length,
          ...(heightArgs || []),
        )}
      >
        {loading ? (
          <Skeleton variant="rounded" height="100%" sx={{ borderRadius: 2 }} />
        ) : (
          renderStackedChart({
            chartData: chartData || [],
            categoryKey,
            labelOf,
            axisWidth,
            barSize,
            gap,
            tooltip:
              tooltip || <ComplianceTooltip labelFormatter={(d) => labelOf(d)} />,
            onSegment: (p, status) =>
              openDrilldown(
                dimension,
                p[categoryKey],
                `${titlePrefix}: ${labelOf(p)} - ${statusWord(status)} lines`,
                { statusFilter: status },
              ),
          })
        )}
      </ChartPanel>
    </Grid>
  );

  const rcCard = (props) => (
    <Grid item xs={12} sm={6} md={3}>
      <KpiCard accent accentBg={RC_ACCENT_BG} accentBorder={RC_ACCENT_BORDER} loading={loading} {...props} />
    </Grid>
  );

  const hdrCard = (props) => (
    <Grid item xs={12} sm={6} md={3}>
      <KpiCard accent loading={loading} {...props} />
    </Grid>
  );

  return (
    <Box sx={{ maxWidth: "xl", mx: "auto", p: { xs: 2, sm: 3 } }}>
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          mb: 4,
          flexWrap: "wrap",
          gap: 3,
        }}
      >
        <Box>
          <Typography
            variant="h3"
            sx={{
              fontWeight: 900,
              letterSpacing: -1,
              background: "linear-gradient(90deg, #1e1b4b, #4338ca)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              mb: 1.5,
            }}
          >
            Executive P2P Compliance Control Tower
          </Typography>
          <Typography
            variant="body1"
            sx={{
              display: "block",
              maxWidth: 800,
              lineHeight: 1.6,
              color: "#64748b",
            }}
          >
            Every PO is checked against 19 audit points: 9{" "}
            <strong>Header</strong> points (one result per PO) and 10{" "}
            <strong>Line-Item</strong> points (one result per PO line). Every
            Rate Contract gets one <strong>RC Overlap</strong> check. Section 1
            below shows all of them in <strong>one unit (checks)</strong> so
            the numbers add up; section 2 shows the same data as POs, lines and
            RCs. Criticality of each checkpoint is managed on the Risk
            Categorization Master page.
          </Typography>
          {restrictedNotice && (
            <Typography
              variant="caption"
              sx={{
                mt: 1.5,
                display: "block",
                fontWeight: 700,
                color: "#4f46e5",
              }}
            >
              {restrictedNotice}
            </Typography>
          )}
          {lastUpdated && (
            <Typography
              variant="caption"
              sx={{
                mt: 1.5,
                display: "block",
                fontWeight: 600,
                color: "#94a3b8",
              }}
            >
              Last updated {moment(lastUpdated).format("DD-MMM-YYYY HH:mm:ss")}
            </Typography>
          )}
        </Box>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 2,
            p: 1.5,
            bgcolor: "#ffffff",
            borderRadius: 3,
            border: "1px solid",
            borderColor: "grey.100",
            boxShadow: "0 10px 30px -5px rgba(0,0,0,0.04)",
            flexWrap: "wrap",
          }}
        >
          <Chip
            icon={<LayersRoundedIcon fontSize="small" />}
            label={
              headerKpis.overallComplianceScore != null
                ? `${headerKpis.overallComplianceScore}% header compliant`
                : "—"
            }
            sx={{
              fontWeight: 800,
              borderRadius: 2,
              px: 1,
              bgcolor: HEADER_ACCENT_BG,
              color: HEADER_ACCENT,
            }}
          />
          <Chip
            label={
              kpis.overallComplianceScore != null
                ? `${kpis.overallComplianceScore}% line-item compliant`
                : "—"
            }
            sx={{
              fontWeight: 800,
              borderRadius: 2,
              px: 1,
              bgcolor:
                kpis.overallComplianceScore >= 80
                  ? alpha(VERIFIED_COLOR, 0.1)
                  : kpis.overallComplianceScore >= 50
                    ? alpha("#d97706", 0.1)
                    : alpha(NOT_VERIFIED_COLOR, 0.1),
              color:
                kpis.overallComplianceScore >= 80
                  ? VERIFIED_COLOR
                  : kpis.overallComplianceScore >= 50
                    ? "#d97706"
                    : NOT_VERIFIED_COLOR,
            }}
          />
          <Chip
            icon={<DescriptionRoundedIcon fontSize="small" />}
            label={
              rcKpis.overallComplianceScore != null
                ? `${rcKpis.overallComplianceScore}% RC compliant`
                : "—"
            }
            sx={{
              fontWeight: 800,
              borderRadius: 2,
              px: 1,
              bgcolor: RC_ACCENT_BG,
              color: RC_ACCENT,
              "& .MuiChip-icon": { color: RC_ACCENT },
            }}
          />
          <Box sx={{ width: "1px", height: 24, bgcolor: "divider" }} />
          <MuiTooltip title="Export current summary as CSV">
            <Box
              component="span"
              sx={{
                display: "inline-flex",
                cursor: !data ? "not-allowed" : "pointer",
              }}
            >
              <IconButton
                onClick={exportSummaryCsv}
                disabled={!data}
                sx={{ bgcolor: "#f8fafc", "&:hover": { bgcolor: "#f1f5f9" } }}
              >
                <FileDownloadRoundedIcon
                  fontSize="small"
                  sx={{ color: "#475569" }}
                />
              </IconButton>
            </Box>
          </MuiTooltip>
          <MuiTooltip title="Refresh">
            <Box
              component="span"
              sx={{
                display: "inline-flex",
                cursor: loading ? "not-allowed" : "pointer",
              }}
            >
              <IconButton
                onClick={() => {
                  fetchSummary(filters);
                  fetchRemarksImpact(filters);
                }}
                disabled={loading}
                sx={{
                  bgcolor: alpha("#4f46e5", 0.1),
                  "&:hover": { bgcolor: alpha("#4f46e5", 0.2) },
                }}
              >
                <RefreshRoundedIcon fontSize="small" sx={{ color: "#4f46e5" }} />
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
        <Paper
          elevation={0}
          sx={{
            p: 2.5,
            mb: 4,
            bgcolor: "#fef2f2",
            borderRadius: 3,
            border: "1px solid",
            borderColor: "#fecaca",
            color: "#dc2626",
          }}
        >
          <Typography variant="body1" sx={{ fontWeight: 600 }}>
            {error}
          </Typography>
        </Paper>
      )}

      {/* ===== PO STATUS SUMMARY (start here) ===== */}
      <PoStatusSummaryTables
        data={poStatus}
        loading={poStatusLoading}
        onList={openPoList}
        onPoints={(trigger) => setRemarksImpactDialog(trigger)}
        rcByGroup={remarksImpact?.byPurchaseGroup}
      />

      {/* ===== PORTFOLIO OVERVIEW ===== */}
      <LevelHeading color="#64748b" unit="unit: POs / lines / PRs">
        Portfolio Overview
      </LevelHeading>
      <Grid container spacing={3} sx={{ mb: 2 }}>
        <Grid item xs={12} sm={6} md={3}>
          <KpiCard
            emphasize
            label="Total POs"
            value={kpis.totalPOCount ?? "—"}
            valueColor={OVERVIEW_ACCENT}
            sublabel="Distinct PO numbers. Header and line-item sections are both measured on this same set."
            loading={loading}
            info={
              kpiDefs.totalPOCount ||
              "Distinct PO numbers in scope under the current filters."
            }
            onClick={
              kpis.totalPOCount
                ? () => openDrilldown("all", true, "All PO Lines")
                : undefined
            }
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <KpiCard
            label="Total PO Line Items"
            value={kpis.totalPOLineItems ?? "—"}
            sublabel="All lines of the POs above."
            loading={loading}
            info={kpiDefs.totalPOLineItems || "Total count of individual PO line items"}
            onClick={
              kpis.totalPOLineItems
                ? () => openDrilldown("all", true, "All PO Lines")
                : undefined
            }
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <KpiCard
            label="Total PR Count"
            value={kpis.totalPRCount ?? "—"}
            sublabel="Distinct Purchase Requisitions."
            loading={loading}
            info={kpiDefs.totalPRCount || "Distinct Purchase Requisitions driving these POs"}
            onClick={
              kpis.totalPRCount
                ? () => openDrilldown("all", true, "All PO Lines")
                : undefined
            }
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <KpiCard
            label="Exception Exposure"
            value={
              kpis.exceptionValueExposure != null
                ? `${kpis.exceptionValueExposure.toLocaleString()}`
                : "—"
            }
            sublabel={`Net value of the ${fmt(kpis.exceptionLineCount)} lines with ≥ 1 Not Verified check.`}
            loading={loading}
            info={kpiDefs.exceptionValueExposure || "Total financial value of lines flagged with at least one exception"}
            onClick={
              kpis.exceptionValueExposure
                ? () =>
                    openDrilldown(
                      "anyException",
                      true,
                      "Lines Contributing to Exception Value Exposure",
                    )
                : undefined
            }
          />
        </Grid>
      </Grid>

      {/* ===== REMARKS IMPACT ===== */}
      <Typography
        variant="overline"
        sx={{
          fontWeight: 800,
          color: "text.secondary",
          letterSpacing: 1.5,
          display: "block",
          mb: 1.5,
          mt: 3,
        }}
      >
        Remarks Impact — Total Not Verified = Closed + Pending (unit: checks)
      </Typography>
      <Grid container spacing={3} sx={{ mb: 5 }}>
        {[
          { key: "header", title: "Header", unitLabel: "header checks" },
          { key: "line", title: "Line Item", unitLabel: "line-item checks" },
          { key: "rc", title: "RC Overlap", unitLabel: "RCs" },
        ].map(({ key, title, unitLabel }) => {
          const section = remarksImpact?.[key] || {};
          const totalNotVerified = section.systemGenerated ?? 0;
          const pending = section.pending ?? 0;
          const closed = section.closed ?? 0;
          const nothingPending = !remarksImpactLoading && totalNotVerified === 0;
          return (
            <Grid item xs={12} md={4} key={key}>
              <Card
                elevation={0}
                sx={{
                  height: "100%",
                  borderRadius: 4,
                  border: "1px solid",
                  borderColor: nothingPending ? "#bbf7d0" : "grey.100",
                  boxShadow: "0 10px 30px -5px rgba(0,0,0,0.04)",
                }}
              >
                <RemarksImpactCardBody
                  title={title}
                  unitLabel={unitLabel}
                  closed={closed}
                  pending={pending}
                  totalNotVerified={totalNotVerified}
                  loading={remarksImpactLoading}
                  nothingPending={nothingPending}
                  onBucketClick={(bucket) =>
                    setRemarksImpactDialog({
                      section: key,
                      title,
                      bucket,
                      closedLabel: key === "rc" ? "RCs Closed" : "Points Closed",
                    })
                  }
                />
              </Card>
            </Grid>
          );
        })}
      </Grid>

      {missingHeaderDataCount > 0 && (
        <Paper
          elevation={0}
          sx={{
            p: 2,
            mb: 5,
            display: "flex",
            alignItems: "center",
            gap: 1.5,
            bgcolor: "#fffbeb",
            borderRadius: 3,
            border: "1px solid",
            borderColor: "#fde68a",
          }}
        >
          <WarningAmberRoundedIcon sx={{ color: "#b45309" }} fontSize="small" />
          <Typography variant="body2" sx={{ color: "#92400e", fontWeight: 600 }}>
            Header-level audit data hasn't been loaded yet for{" "}
            {missingHeaderDataCount} of the {kpis.totalPOCount} POs in scope
            (e.g. <code>node addheader.js</code> hasn't been run for that
            batch). The Header-Level panels below only reflect the{" "}
            {kpis.totalPOCount - missingHeaderDataCount} POs that do have
            header data loaded.
          </Typography>
        </Paper>
      )}

      {/* ===== HEADER LEVEL ===== */}
      <LevelHeading
        icon={<LayersRoundedIcon sx={{ color: HEADER_ACCENT, fontSize: 20 }} />}
        color={HEADER_ACCENT}
        unit="unit: POs and header checks"
        unitColor={HEADER_ACCENT}
        unitBg={HEADER_ACCENT_BG}
      >
        Header Level (9 points, one result per whole PO — points 1-9)
      </LevelHeading>
      <Grid container spacing={3} sx={{ mb: 3 }}>
        {hdrCard({
          label: "Header Compliance",
          value:
            headerKpis.overallComplianceScore != null
              ? `${headerKpis.overallComplianceScore}%`
              : "—",
          sublabel: `Verified ÷ Applicable = ${fmt(headerKpis.verifiedCount)} ÷ ${fmt(headerKpis.applicableChecks)} checks. Click to view all POs.`,
          info:
            kpiDefs.headerComplianceScore ||
            "Verified ÷ (Verified + Not Verified) header checks",
          onClick: headerKpis.totalPOsWithHeaderData
            ? () =>
                openHeaderKpiDrilldown("all", "All POs — Header-Level Detail")
            : undefined,
        })}
        {hdrCard({
          label: "POs Closed at Header Level",
          value: hdrClosedPOs ?? "—",
          valueColor: "#059669",
          sublabel: ps
            ? `Header only: ${fmt(hdrPendingPOs)} of ${fmt(ps.total)} POs still have a pending header point. Whole PO closed (header + line items) = ${fmt(wholeClosedPOs)}, because ${fmt(headerOnlyClosedPOs)} POs are closed here but still pending on line items. Click to view.`
            : `POs with no pending header point (unit: POs). ${fmt(hdrPendingPOs)} still pending. Click to view.`,
          info:
            kpiDefs.closedPOCount ||
            "POs whose header has no pending point: every point is Verified, Not Applicable, or Not Verified with a check or remark.",
          onClick: hdrClosedPOs
            ? () =>
                ps
                  ? openPoList({ metric: "headerClosed" }, "POs closed at header level")
                  : openHeaderKpiDrilldown("closed", "POs Closed at Header Level")
            : undefined,
        })}
        {hdrCard({
          label: "Verified (Header checks)",
          value: headerKpis.verifiedCount ?? "—",
          valueColor: "#059669",
          sublabel:
            "Header checks that passed (unit: checks). Click to view POs with a verified header point.",
          info:
            kpiDefs.headerVerifiedCount ||
            "Count of header checks that came back Verified.",
          onClick: headerKpis.verifiedCount
            ? () =>
                openHeaderKpiDrilldown(
                  "verifiedAny",
                  "POs with at Least One Verified Header Point",
                )
            : undefined,
        })}
        {hdrCard({
          label: "Not Verified (Header checks)",
          value: headerKpis.notVerifiedCount ?? "—",
          valueColor: "#dc2626",
          sublabel: `Header checks that failed (unit: checks), spread over ${fmt(headerKpis.exceptionPOCount)} POs. Click to view them.`,
          info:
            kpiDefs.headerNotVerifiedCount ||
            "Count of header checks that came back Not Verified.",
          onClick: headerKpis.notVerifiedCount
            ? () =>
                openHeaderKpiDrilldown(
                  "notVerifiedAny",
                  "POs with at Least One Not-Verified Header Point",
                )
            : undefined,
        })}
      </Grid>
      <Grid container spacing={3} sx={{ mb: 5 }}>
        {hdrCard({
          label: "Total Header Checks",
          value: headerKpis.totalChecks ?? "—",
          sublabel: `${fmt(headerKpis.totalPOsWithHeaderData)} POs × 9 header points.`,
          info: "Every header check run: Verified + Not Verified + Not Applicable + Manual.",
        })}
        {hdrCard({
          label: "Not Applicable (Header)",
          value: headerKpis.notApplicableCount ?? "—",
          sublabel: "Header checks that did not apply to that PO. Excluded from compliance.",
          info: "Header checks that were Not Applicable to the PO (e.g. no RC, no freight term).",
        })}
        {hdrCard({
          label: "Manual Review (Header)",
          value: headerKpis.manualReviewCount ?? "—",
          sublabel: "Header checks needing a human. Excluded from compliance.",
          info: "Header checks the system could not decide and that need manual review.",
        })}
        {hdrCard({
          label: "Header Points Closed",
          value: remarksImpact?.header?.closed ?? "—",
          valueColor: "#059669",
          sublabel: `Of ${fmt(remarksImpact?.header?.systemGenerated)} Not Verified header points, ${fmt(remarksImpact?.header?.pending)} are still pending (unit: points). Click to see the closed points.`,
          info: "Not Verified header points that now have a check or remark. Closed + Pending = Total Not Verified.",
          onClick: remarksImpact?.header?.closed
            ? () =>
                setRemarksImpactDialog({
                  section: "header",
                  title: "Header",
                  bucket: "closed",
                  closedLabel: "Points Closed",
                })
            : undefined,
        })}
      </Grid>

      {/* ===== LINE-ITEM LEVEL ===== */}
      <LevelHeading
        color="#64748b"
        unit="unit: PO lines and line-item checks"
      >
        Line-Item Level (10 points, one result per PO line item — points 10-19)
      </LevelHeading>
      <Grid container spacing={3} sx={{ mb: 5 }}>
        <Grid item xs={12} sm={6} md={4}>
          <KpiCard
            label="Line-Item Compliance"
            value={
              kpis.overallComplianceScore != null
                ? `${kpis.overallComplianceScore}%`
                : "—"
            }
            valueColor={VERIFIED_COLOR}
            sublabel={`Verified ÷ Applicable = ${fmt(kpis.verifiedCount)} ÷ ${fmt(kpis.applicableLineChecks)} checks`}
            info={kpiDefs.overallComplianceScore || "Verified ÷ (Verified + Not Verified) line-item checks"}
            loading={loading}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <KpiCard
            label="Verified Checks"
            value={kpis.verifiedCount ?? "—"}
            valueColor="#059669"
            sublabel="Line-item checks that passed. Click to drill in."
            loading={loading}
            info={kpiDefs.verifiedCount || "Count of Verified line-item checks"}
            onClick={
              kpis.verifiedCount
                ? () =>
                    openDrilldown(
                      "verifiedAny",
                      true,
                      "Lines with at Least One Verified Checkpoint",
                      { statusFilter: "verified" },
                    )
                : undefined
            }
          />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <KpiCard
            label="Not Verified Checks"
            value={kpis.notVerifiedCount ?? "—"}
            valueColor="#dc2626"
            sublabel={`Failed checks, spread over ${fmt(kpis.exceptionLineCount)} lines. Click to drill in.`}
            loading={loading}
            info={kpiDefs.notVerifiedCount || "Count of Not Verified line-item checks"}
            onClick={
              kpis.notVerifiedCount
                ? () =>
                    openDrilldown(
                      "anyException",
                      true,
                      "Lines with at Least One Exception",
                    )
                : undefined
            }
          />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <KpiCard
            label="Not Applicable"
            value={kpis.notApplicableCount ?? "—"}
            sublabel="Did not apply to that line. Excluded from compliance. Click to drill in."
            loading={loading}
            info={kpiDefs.notApplicableCount || "Count of Not Applicable line-item checks"}
            onClick={
              kpis.notApplicableCount
                ? () =>
                    openDrilldown(
                      "na",
                      true,
                      "Lines with at Least One N/A Checkpoint",
                      { statusFilter: "na" },
                    )
                : undefined
            }
          />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <KpiCard
            label="Manual Review"
            value={kpis.manualReviewCount ?? "—"}
            sublabel="Need a human. Excluded from compliance. Click to drill in."
            loading={loading}
            info={kpiDefs.manualReviewCount || "Count of line-item checks requiring human review"}
            onClick={
              kpis.manualReviewCount
                ? () =>
                    openDrilldown(
                      "manual",
                      true,
                      "Lines Needing Manual Review",
                      { statusFilter: "manual" },
                    )
                : undefined
            }
          />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <KpiCard
            label="Total Line Checks"
            value={kpis.totalLineChecks ?? "—"}
            sublabel={`${fmt(kpis.totalPOLineItems)} lines × 10 line points.`}
            loading={loading}
            info="Every line-item check run: Verified + Not Verified + Not Applicable + Manual."
          />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <KpiCard
            label="Applicable Line Checks"
            value={kpis.applicableLineChecks ?? "—"}
            sublabel={`Verified ${fmt(kpis.verifiedCount)} + Not Verified ${fmt(kpis.notVerifiedCount)}. Compliance denominator.`}
            loading={loading}
            info="Verified + Not Verified line-item checks."
          />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <KpiCard
            label="POs Closed at Line Level"
            value={ps?.line?.closed ?? "—"}
            valueColor="#059669"
            sublabel={
              ps
                ? `POs whose line items have no pending point (unit: POs). ${fmt(ps.line.pending)} of ${fmt(ps.total)} POs still have a pending line item. Click to view.`
                : "POs whose line items have no pending point (unit: POs)."
            }
            loading={loading || poStatusLoading}
            info="A PO is closed at line level when none of its line items has a pending point: every point is Verified, Not Applicable, Manual, or Not Verified with a check or remark."
            onClick={
              ps?.line?.closed
                ? () => openPoList({ metric: "lineClosed" }, "POs closed at line level")
                : undefined
            }
          />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <KpiCard
            label="Line Points Closed"
            value={remarksImpact?.line?.closed ?? "—"}
            valueColor="#059669"
            sublabel={`Of ${fmt(remarksImpact?.line?.systemGenerated)} Not Verified line points, ${fmt(remarksImpact?.line?.pending)} are still pending (unit: points). Click to see the closed points.`}
            loading={loading || remarksImpactLoading}
            info="Not Verified line-item points that now have a check or remark. Closed + Pending = Total Not Verified."
            onClick={
              remarksImpact?.line?.closed
                ? () =>
                    setRemarksImpactDialog({
                      section: "line",
                      title: "Line Item",
                      bucket: "closed",
                      closedLabel: "Points Closed",
                    })
                : undefined
            }
          />
        </Grid>
      </Grid>

      <Grid container spacing={3}>
        <Grid item xs={12}>
          <ChartPanel
            title="PO Header-Level Compliance"
            hint="% verified per header point (9 points: 1-9). Each bar's denominator is POs where that point applied. Click a bar to drill in."
            info="Header-level points describe the whole PO, not one line item, so this chart counts each PO once per point."
            accent
            icon={<LayersRoundedIcon sx={{ mr: 1, color: HEADER_ACCENT }} />}
            height={horizontalChartHeight(
              (charts.headerControlWiseCompliance || []).length,
              40,
              60,
              220,
            )}
          >
            {loading ? (
              <Skeleton variant="rounded" height="100%" sx={{ borderRadius: 2 }} />
            ) : (
              <ResponsiveContainer width="100%" height="95%">
                <BarChart
                  data={charts.headerControlWiseCompliance || []}
                  layout="vertical"
                  margin={{ top: 10, bottom: 10, left: 10, right: 40 }}
                  barCategoryGap="30%"
                >
                  <ChartGradients />
                  <CartesianGrid
                    strokeDasharray="3 3"
                    horizontal={false}
                    stroke="#e0e7ff"
                  />
                  <XAxis
                    type="number"
                    domain={[0, 100]}
                    unit="%"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#6366f1", fontSize: 12, fontWeight: 500 }}
                  />
                  <YAxis
                    type="category"
                    dataKey="pointNo"
                    tickFormatter={(v) => `#${v}`}
                    width={50}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#3730a3", fontSize: 13, fontWeight: 700 }}
                  />
                  <Tooltip
                    content={<HeaderControlWiseTooltip />}
                    cursor={{ fill: alpha("#6366f1", 0.06) }}
                  />
                  <Bar
                    dataKey="compliancePct"
                    radius={[0, 8, 8, 0]}
                    cursor="pointer"
                    barSize={22}
                    onClick={(d) => {
                      const p = payloadOf(d);
                      openHeaderDrilldown(
                        p.pointNo,
                        `PO Header Point #${p.pointNo}: ${p.title} — Not-Verified POs`,
                      );
                    }}
                  >
                    {(charts.headerControlWiseCompliance || []).map((d) => (
                      <Cell
                        key={d.pointNo}
                        fill={SEVERITY_COLORS[d.severity] || "url(#gradHeaderBar)"}
                      />
                    ))}
                    <LabelList
                      dataKey="compliancePct"
                      position="right"
                      formatter={(v) => (v != null ? `${v}%` : "")}
                      style={{ fontSize: 12, fontWeight: 700, fill: "#3730a3" }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartPanel>
        </Grid>

        <Grid item xs={12} md={7}>
          <ChartPanel
            title="Control-Wise Compliance (Line-Item)"
            hint="% verified per line-item point (10-19). Click a bar to drill in."
            info={chartDefs.controlWiseCompliance}
          >
            {loading ? (
              <Skeleton variant="rounded" height="100%" sx={{ borderRadius: 2 }} />
            ) : (
              <ResponsiveContainer width="100%" height="95%">
                <BarChart
                  data={charts.controlWiseCompliance || []}
                  margin={{ top: 20 }}
                >
                  <ChartGradients />
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke={GRID_COLOR}
                  />
                  <XAxis
                    dataKey="pointNo"
                    tickFormatter={(v) => `#${v}`}
                    interval={0}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#64748b", fontSize: 12, fontWeight: 500 }}
                  />
                  <YAxis
                    domain={[0, 100]}
                    unit="%"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#64748b", fontSize: 12, fontWeight: 500 }}
                  />
                  <Tooltip
                    content={<ControlWiseTooltip />}
                    cursor={{ fill: alpha("#4f46e5", 0.05) }}
                  />
                  <Bar
                    dataKey="compliancePct"
                    radius={[6, 6, 0, 0]}
                    cursor="pointer"
                    minPointSize={5}
                    onClick={(d) => {
                      const p = payloadOf(d);
                      openDrilldown(
                        "pointNo",
                        p.pointNo,
                        `Control Point #${p.pointNo}: ${p.title || p.label} - not-verified lines`,
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
            )}
          </ChartPanel>
        </Grid>

        <Grid item xs={12} md={5}>
          <ChartPanel
            title="Exceptions by Severity"
            hint="Share of Not Verified line checks. Click a slice to drill in"
            info={
              (chartDefs.exceptionBySeverity || "") +
              " Criticality per checkpoint is set by an admin."
            }
          >
            {loading ? (
              <Skeleton variant="rounded" height="100%" sx={{ borderRadius: 2 }} />
            ) : (
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
                      openDrilldown(
                        "severity",
                        p.severity,
                        `${p.severity} Severity Exceptions`,
                      );
                    }}
                  >
                    {(charts.exceptionBySeverity || []).map((entry) => (
                      <Cell
                        key={entry.severity}
                        fill={SEVERITY_COLORS[entry.severity] || "#64748b"}
                      />
                    ))}
                  </Pie>
                  <Tooltip content={<SeverityTooltip />} />
                  <Legend
                    iconType="circle"
                    wrapperStyle={{
                      paddingTop: 20,
                      fontSize: "14px",
                      fontWeight: 600,
                      color: "#334155",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </ChartPanel>
        </Grid>

        {lineStacked({
          title: "Purchase Group-Wise Compliance",
          hint: "% verified per purchasing group, worst first. Click a segment to drill in. (Line-item checks)",
          info: "Verified vs. not-verified LINE-ITEM checks for every purchasing group.",
          data: charts.purchaseGroupWiseCompliance,
          categoryKey: "purchaseGroup",
          labelOf: (d) => d?.purchaseGroupName || d?.purchaseGroup,
          axisWidth: 170,
          dimension: "purchaseGroup",
          titlePrefix: "Purchase Group",
        })}
        {lineStacked({
          title: "Plant-Wise Compliance",
          hint: "% verified per plant, worst first. Click a segment to drill in. (Line-item checks)",
          info: "Verified vs. not-verified LINE-ITEM checks for every plant.",
          data: charts.plantWiseCompliance,
          categoryKey: "plant",
          labelOf: (d) => d?.plantName || d?.plant,
          axisWidth: 170,
          dimension: "plant",
          titlePrefix: "Plant",
        })}
        {lineStacked({
          title: "Vendor-Wise Compliance",
          hint: "Top 15 vendors by not-verified count. Click a segment to drill in. (Line-item checks)",
          info: "Verified vs. not-verified LINE-ITEM checks for the 15 vendors with the most exceptions.",
          data: charts.vendorWiseCompliance,
          categoryKey: "vendorCode",
          labelOf: (d) => d?.vendorName || d?.vendorCode,
          axisWidth: 200,
          dimension: "vendor",
          titlePrefix: "Vendor",
        })}
        {lineStacked({
          title: "PO Type-Wise Compliance",
          hint: "Click a segment to drill in. (Line-item checks)",
          info: chartDefs.poTypeWiseCompliance,
          data: charts.poTypeWiseCompliance,
          categoryKey: "poType",
          labelOf: (d) => d?.poTypeName || d?.poType,
          axisWidth: 160,
          dimension: "poType",
          titlePrefix: "PO Type",
          tooltip: <PoTypeTooltip />,
          barSize: 22,
          gap: "30%",
          heightArgs: [40, 60, 180],
        })}

        <Grid item xs={12}>
          <ChartPanel
            title="Monthly Exception Trend"
            hint="Click a bar on either series to drill in."
            info={
              (chartDefs.monthlyExceptionTrend || "") +
              " Line-item bars count PO LINES with ≥ 1 Not Verified check. Header bars count POs with ≥ 1 Not Verified header check. Different units, so do not add the two bars."
            }
            height={320}
          >
            {loading ? (
              <Skeleton variant="rounded" height="100%" sx={{ borderRadius: 2 }} />
            ) : (
              <ResponsiveContainer>
                <BarChart
                  data={monthlyTrendData}
                  margin={{ top: 20, right: 20 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke={GRID_COLOR}
                  />
                  <XAxis
                    dataKey="month"
                    tickFormatter={formatMonthLabel}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#64748b", fontSize: 12, fontWeight: 500 }}
                  />
                  <YAxis
                    allowDecimals={false}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#64748b", fontSize: 12, fontWeight: 500 }}
                  />
                  <Tooltip
                    content={<MonthlyTrendTooltip />}
                    cursor={{ fill: alpha("#4f46e5", 0.05) }}
                  />
                  <Legend
                    iconType="circle"
                    wrapperStyle={{
                      paddingTop: 10,
                      fontSize: "14px",
                      fontWeight: 600,
                    }}
                  />
                  <Bar
                    dataKey="lineCount"
                    name="Lines with an exception"
                    fill={TREND_LINE_COLOR}
                    radius={[4, 4, 0, 0]}
                    barSize={20}
                    cursor="pointer"
                    onClick={(d) => {
                      const p = payloadOf(d);
                      if (!p.month) return;
                      openDrilldown(
                        "month",
                        p.month,
                        `Exceptions in ${moment(p.month, "YYYY-MM").format("MMMM YYYY")}`,
                      );
                    }}
                  />
                  <Bar
                    dataKey="headerCount"
                    name="POs with a header exception"
                    fill={TREND_HEADER_COLOR}
                    radius={[4, 4, 0, 0]}
                    barSize={20}
                    cursor="pointer"
                    onClick={(d) => {
                      const p = payloadOf(d);
                      if (!p.month) return;
                      openHeaderKpiDrilldown(
                        "month",
                        `Header Exceptions in ${moment(p.month, "YYYY-MM").format("MMMM YYYY")}`,
                        p.month,
                      );
                    }}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartPanel>
        </Grid>
      </Grid>

      {/* ===== RC LEVEL ===== */}
      <Box sx={{ mt: 5 }}>
        <LevelHeading
          icon={<DescriptionRoundedIcon sx={{ color: RC_ACCENT, fontSize: 20 }} />}
          color={RC_ACCENT}
          unit="unit: Rate Contracts (1 check per RC)"
          unitColor={RC_ACCENT}
          unitBg={RC_ACCENT_BG}
        >
          RC Overlap Level
        </LevelHeading>
      </Box>
      <Typography
        variant="caption"
        sx={{ display: "block", mb: 2, color: "#64748b", fontWeight: 500 }}
      >
        Only the Purchase Group, Vendor and Material Code filters apply to RC
        figures (on the KPI cards, the charts and the RC Remarks Impact card
        alike) — PO number, dates, plant and PO type don't exist on a Rate
        Contract.
      </Typography>
      <Grid container spacing={3} sx={{ mb: 3 }}>
        {rcCard({
          label: "RC Compliance",
          value:
            rcKpis.overallComplianceScore != null
              ? `${rcKpis.overallComplianceScore}%`
              : "—",
          sublabel: `Verified ÷ Total = ${fmt(rcKpis.verifiedCount)} ÷ ${fmt(rcKpis.totalRCCount)} RCs. Click to view all RCs.`,
          info:
            kpiDefs.rcComplianceScore ||
            "Verified ÷ (Verified + Not Verified) Rate Contracts",
          onClick: rcKpis.totalRCCount
            ? () => openRcDrilldown("all", "All RCs — RC Overlap Detail")
            : undefined,
        })}
        {rcCard({
          label: "RCs Closed",
          value: rcKpis.closedRCCount ?? "—",
          valueColor: "#059669",
          sublabel: `Not Verified RCs that have been closed. ${fmt(rcKpis.pendingRCCount)} still pending, out of ${fmt(rcKpis.notVerifiedCount)} Not Verified.`,
          info:
            kpiDefs.closedRCCount ||
            "Not Verified RCs where the RC-level check has been closed.",
          onClick: rcKpis.closedRCCount
            ? () => openRcDrilldown("closed", "RCs — Closed")
            : undefined,
        })}
        {rcCard({
          label: "Verified (RC)",
          value: rcKpis.verifiedCount ?? "—",
          valueColor: "#059669",
          sublabel: "RCs with no overlap found. Click to view Verified RCs.",
          info: kpiDefs.rcVerifiedCount || "Count of Verified Rate Contracts.",
          onClick: rcKpis.verifiedCount
            ? () => openRcDrilldown("verified", "RCs — Verified")
            : undefined,
        })}
        {rcCard({
          label: "Not Verified (RC)",
          value: rcKpis.notVerifiedCount ?? "—",
          valueColor: "#dc2626",
          sublabel: "RCs flagged by the RC Overlap check. Click to view Not Verified RCs.",
          info:
            kpiDefs.rcNotVerifiedCount ||
            "Count of Not Verified Rate Contracts (system-flagged overlaps).",
          onClick: rcKpis.notVerifiedCount
            ? () => openRcDrilldown("notVerified", "RCs — Not Verified")
            : undefined,
        })}
      </Grid>
      <Grid container spacing={3} sx={{ mb: 5 }}>
        {rcCard({
          label: "Total RCs in Scope",
          value: rcKpis.totalRCCount ?? "—",
          sublabel: `Verified ${fmt(rcKpis.verifiedCount)} + Not Verified ${fmt(rcKpis.notVerifiedCount)}.`,
          info: "Every Rate Contract that has a Verified or Not Verified result.",
          onClick: rcKpis.totalRCCount
            ? () => openRcDrilldown("all", "All RCs — RC Overlap Detail")
            : undefined,
        })}
        {rcCard({
          label: "RCs Pending",
          value: rcKpis.pendingRCCount ?? "—",
          valueColor: "#d97706",
          sublabel: "Not Verified RCs still open. Click to view them.",
          info: "Not Verified RCs that are not closed yet.",
          onClick: rcKpis.pendingRCCount
            ? () => openRcDrilldown("pending", "RCs — Pending")
            : undefined,
        })}
      </Grid>

      <Grid container spacing={3}>
        {rcGroupChartData.length > 0 && (
          <Grid item xs={12}>
            <ChartPanel
              title="RC Compliance by Purchase Group"
              hint="Verified vs. Not Verified RCs per purchasing group, worst first. An RC listing several groups counts once toward each, so group totals can exceed the RC total. Click a segment to drill in."
              info="Verified vs. not-verified RC counts for every purchasing group. Visible to Admin, Procurement Manager and SSB Digital only."
              accent
              tone={RC_PANEL_TONE}
              icon={<DescriptionRoundedIcon sx={{ mr: 1, color: RC_ACCENT }} />}
              height={horizontalChartHeight(rcGroupChartData.length)}
            >
              {loading ? (
                <Skeleton variant="rounded" height="100%" sx={{ borderRadius: 2 }} />
              ) : (
                renderStackedChart({
                  chartData: rcGroupChartData,
                  categoryKey: "purchaseGroup",
                  labelOf: (d) => d?.purchaseGroupName || d?.purchaseGroup,
                  axisWidth: 170,
                  rc: true,
                  tooltip: (
                    <ComplianceTooltip
                      labelFormatter={(d) => d?.purchaseGroupName || d?.purchaseGroup}
                    />
                  ),
                  onSegment: (p, status) =>
                    openRcDrilldown(
                      "purchaseGroup",
                      `RC Purchase Group: ${p.purchaseGroupName || p.purchaseGroup} - ${statusWord(status)} RCs`,
                      { value: p.purchaseGroup, statusFilter: status },
                    ),
                })
              )}
            </ChartPanel>
          </Grid>
        )}

        {rcVendorChartData.length > 0 && (
          <Grid item xs={12}>
            <ChartPanel
              title="RC Compliance by Vendor"
              hint="Top 15 vendors by not-verified RC count. Click a segment to drill in."
              info="Verified vs. not-verified RC counts for the 15 vendors with the most Not Verified Rate Contracts. Note: the same vendor can appear twice if its code is stored with and without leading zeros."
              accent
              tone={RC_PANEL_TONE}
              icon={<DescriptionRoundedIcon sx={{ mr: 1, color: RC_ACCENT }} />}
              height={horizontalChartHeight(rcVendorChartData.length)}
            >
              {loading ? (
                <Skeleton variant="rounded" height="100%" sx={{ borderRadius: 2 }} />
              ) : (
                renderStackedChart({
                  chartData: rcVendorChartData,
                  categoryKey: "vendorCode",
                  labelOf: (d) => d?.vendorName || d?.vendorCode,
                  axisWidth: 200,
                  rc: true,
                  tooltip: (
                    <ComplianceTooltip
                      labelFormatter={(d) => d?.vendorName || d?.vendorCode}
                    />
                  ),
                  onSegment: (p, status) =>
                    openRcDrilldown(
                      "vendor",
                      `RC Vendor: ${p.vendorName || p.vendorCode} - ${statusWord(status)} RCs`,
                      { value: p.vendorCode, statusFilter: status },
                    ),
                })
              )}
            </ChartPanel>
          </Grid>
        )}
      </Grid>

      <Box sx={{ mt: 5 }}>
        <PoWiseExceptionsTable
          rows={poStatus?.poRows || []}
          loading={poStatusLoading && !poStatus}
          onRowAction={handleRowAction}
          viewAllHref="/po-data"
          restrictedNotice={restrictedNotice}
        />
      </Box>

      <Typography
        variant="body2"
        sx={{
          display: "block",
          mt: 5,
          textAlign: "center",
          color: "#94a3b8",
          fontWeight: 500,
        }}
      >
        Executive P2P Compliance Control Tower — start with the PO Status
        Summary at the top. Closed means the same thing everywhere: a point is
        closed when it is Verified, Not Applicable, or Not Verified with a
        check or remark; a PO is closed when it has no pending point.
        Checkpoint descriptions and criticality live on the Risk
        Categorization Master page.
      </Typography>

      <DrilldownDialog
        drilldown={drilldown}
        appliedFilters={buildSummaryBody(filters)}
        onClose={() => setDrilldown(null)}
        onDataChanged={() => {
          fetchSummary(filters);
          fetchRemarksImpact(filters);
        }}
      />
      <HeaderDrilldownDialog
        drilldown={headerDrilldown}
        appliedFilters={buildSummaryBody(filters)}
        onClose={() => setHeaderDrilldown(null)}
      />
      <HeaderKpiDrilldownDialog
        drilldown={headerKpiDrilldown}
        appliedFilters={buildSummaryBody(filters)}
        onClose={() => setHeaderKpiDrilldown(null)}
        onViewHeader={(poNumber, source_file_ts) => setPoPreview({ poNumber, source_file_ts })}
      />
      <RcKpiDrilldownDialog
        drilldown={rcDrilldown}
        appliedFilters={buildSummaryBody(filters)}
        onClose={() => setRcDrilldown(null)}
      />
      <PoDetailsPreviewDialog
        preview={poPreview}
        onClose={() => setPoPreview(null)}
        onOpenFullPage={openFullSearchPage}
        onHeaderChanged={() => {
          fetchSummary(filters);
          fetchRemarksImpact(filters);
        }}
      />
      <PoListDialog
        dialog={poListDialog}
        rows={poStatus?.poRows || []}
        version={poStatus}
        onClose={() => setPoListDialog(null)}
        onWork={handleWork}
      />
      <RemarksImpactListDialog
        trigger={remarksImpactDialog}
        onClose={() => setRemarksImpactDialog(null)}
      />
    </Box>
  );
};

export default ExecutiveDashboard;
