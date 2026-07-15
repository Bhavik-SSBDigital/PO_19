import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSelector } from "react-redux";
import moment from "moment";
import { toast } from "react-toastify";
import * as XLSX from "xlsx";
import {
  alpha,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Fade,
  FormControl,
  Grid,
  IconButton,
  InputAdornment,
  LinearProgress,
  MenuItem,
  Paper,
  Popper,
  Select,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
  useTheme,
} from "@mui/material";
import {
  BarChart,
  Bar,
  CartesianGrid,
  Cell,
  Legend,
  PieChart,
  Pie,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
  LabelList,
} from "recharts";

// Icons
import AssessmentOutlinedIcon from "@mui/icons-material/AssessmentOutlined";
import BusinessIcon from "@mui/icons-material/Business";
import CloseIcon from "@mui/icons-material/Close";
import DownloadIcon from "@mui/icons-material/Download";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import EventNoteRoundedIcon from "@mui/icons-material/EventNoteRounded";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import FilterListIcon from "@mui/icons-material/FilterList";
import NavigateBeforeIcon from "@mui/icons-material/NavigateBefore";
import NavigateNextIcon from "@mui/icons-material/NavigateNext";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import SearchIcon from "@mui/icons-material/Search";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import VerifiedOutlinedIcon from "@mui/icons-material/VerifiedOutlined";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import AutoGraphIcon from "@mui/icons-material/AutoGraph";
import GppBadIcon from "@mui/icons-material/GppBad";
import ShieldOutlinedIcon from "@mui/icons-material/ShieldOutlined";
import HourglassTopIcon from "@mui/icons-material/HourglassTop";
import MonetizationOnOutlinedIcon from "@mui/icons-material/MonetizationOnOutlined";
import CloudDownloadOutlinedIcon from "@mui/icons-material/CloudDownloadOutlined";
import StorageOutlinedIcon from "@mui/icons-material/StorageOutlined";
import DashboardCustomizeIcon from "@mui/icons-material/DashboardCustomize";
import HealthAndSafetyIcon from "@mui/icons-material/HealthAndSafety";
import FactCheckIcon from "@mui/icons-material/FactCheck";
import FileDownloadOutlinedIcon from "@mui/icons-material/FileDownloadOutlined";

import Loader from "components/Loader";
import { get, post } from "utils/axiosApi";
import { dateRangeToLocal } from "utils/dateRangeToLocal";

// Legacy charts
import InvoiceItemsCategoryChart from "./Charts/InvoiceItemsCategoryChart";
import RiskComboChart from "./Charts/RiskComboChart";
import TransactionsChart from "./Charts/TransactionsChart";
import PointIntensityChart from "./Charts/PointIntensityChart";
import TransactionOverTimeChart from "./Charts/TransactionOverTimeChart";
import HeatMap from "./Charts/HeatMap";

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 7 }, (_, i) => CURRENT_YEAR - i);
const ALL_MODULES = ["PJV", "BPV", "PO", "NONPO"];

const AGE_BUCKET_ORDER = ["0–7 days", "8–15 days", "16–30 days", "> 30 days"];
const AGE_BUCKET_COLORS = {
  "0–7 days": "success",
  "8–15 days": "info",
  "16–30 days": "warning",
  "> 30 days": "error",
};

const resolveAccuracySlot = (slot, startDate, endDate) => {
  if (slot !== "custom") {
    if (slot === "weekly") return "daily";
    return "monthly";
  }
  if (!startDate || !endDate) return "daily";
  const diffDays = moment(endDate).diff(moment(startDate), "days");
  return diffDays <= 31 ? "daily" : "monthly";
};

const useTokens = (theme) => ({
  cardBg: theme.palette.background.paper,
  gridLine: alpha(theme.palette.divider, 0.5),
  accent: theme.palette.primary.main,
  danger: theme.palette.error.main,
  warn: theme.palette.warning.main,
  success: theme.palette.success.main,
  info: theme.palette.info.main,
  textMuted: theme.palette.text.secondary,
  border: theme.palette.divider,
  hover: alpha(theme.palette.primary.main, 0.06),
});

const buildDocUrl = (documentNo, fiscalYear) => {
  let year = new Date().getFullYear();
  if (fiscalYear) {
    const match = String(fiscalYear).match(/(\d{4})/);
    if (match) year = parseInt(match[1], 10);
  }
  return `/search-data?year=${year}&documentNo=${encodeURIComponent(documentNo)}`;
};

// ─────────────────────────────────────────────────────────────
// STAT CARD
// ─────────────────────────────────────────────────────────────
const StatCard = ({ icon: Icon, label, value, accent, sub, onClick, loading }) => {
  const theme = useTheme();
  return (
    <Card
      elevation={0}
      onClick={onClick}
      sx={{
        height: "100%",
        borderRadius: 3,
        border: `1px solid ${alpha(theme.palette.divider, 0.6)}`,
        background: `linear-gradient(145deg, ${theme.palette.background.paper} 0%, ${alpha(theme.palette.background.default, 0.4)} 100%)`,
        borderBottom: `4px solid ${accent}`,
        cursor: onClick ? "pointer" : "default",
        transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
        position: "relative",
        zIndex: 1,
        "&:hover": onClick
          ? {
              borderColor: accent,
              boxShadow: `0 12px 24px -10px ${alpha(accent, 0.3)}`,
              transform: "translateY(-4px)",
            }
          : {},
        "&:active": onClick ? { transform: "translateY(0) scale(0.98)" } : {},
      }}
    >
      <CardContent sx={{ p: { xs: 2, sm: 3 }, pointerEvents: "none" }}>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
          <Box>
            <Typography
              variant="overline"
              sx={{
                fontSize: { xs: "0.65rem", sm: "0.7rem" },
                letterSpacing: 1.2,
                fontWeight: 800,
                color: theme.palette.text.secondary,
                display: "block",
                mb: 1,
                lineHeight: 1.2,
              }}
            >
              {label}
            </Typography>
            {loading ? (
              <Skeleton width={100} height={48} sx={{ borderRadius: 1 }} />
            ) : (
              <Typography
                variant="h3"
                sx={{
                  fontSize: { xs: "1.75rem", sm: "2.5rem", md: "3rem" },
                  fontWeight: 900,
                  letterSpacing: -1.5,
                  lineHeight: 1,
                  color: theme.palette.text.primary,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {typeof value === "number" ? value.toLocaleString() : value}
              </Typography>
            )}
            {sub && (
              <Typography
                variant="caption"
                sx={{
                  mt: 1,
                  display: "block",
                  color: alpha(theme.palette.text.secondary, 0.8),
                  fontWeight: 600,
                  lineHeight: 1.3,
                }}
              >
                {sub}
              </Typography>
            )}
          </Box>
          <Box
            sx={{
              p: { xs: 1, sm: 1.5 },
              borderRadius: { xs: "10px", sm: "14px" },
              bgcolor: alpha(accent, 0.1),
              color: accent,
              display: "flex",
              boxShadow: `inset 0 0 0 1px ${alpha(accent, 0.2)}`,
            }}
          >
            <Icon sx={{ fontSize: { xs: 22, sm: 28 } }} />
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
};

// ─────────────────────────────────────────────────────────────
// SECTION HEADER
// ─────────────────────────────────────────────────────────────
const SectionHeader = ({ icon: Icon, title, subtitle, accent }) => {
  const theme = useTheme();
  return (
    <Stack direction="row" alignItems="center" gap={2} mb={3}>
      <Box
        sx={{
          width: 6,
          height: { xs: 32, sm: 38 },
          borderRadius: 4,
          bgcolor: accent || theme.palette.primary.main,
          flexShrink: 0,
        }}
      />
      <Box>
        <Stack direction="row" alignItems="center" gap={1}>
          {Icon && (
            <Icon sx={{ fontSize: { xs: 20, sm: 24 }, color: accent || theme.palette.primary.main }} />
          )}
          <Typography variant="h6" fontWeight={800} letterSpacing={-0.3} sx={{ fontSize: { xs: "1rem", sm: "1.25rem" } }}>
            {title}
          </Typography>
        </Stack>
        {subtitle && (
          <Typography variant="caption" color="text.secondary" fontWeight={500} sx={{ display: "block", lineHeight: 1.3 }}>
            {subtitle}
          </Typography>
        )}
      </Box>
    </Stack>
  );
};

// ─────────────────────────────────────────────────────────────
// CHART CARD WRAPPER
// ─────────────────────────────────────────────────────────────
const ChartCard = ({ title, subtitle, children, height, action }) => {
  const theme = useTheme();
  return (
    <Card
      elevation={0}
      sx={{
        height: "100%",
        borderRadius: 4,
        border: `1px solid ${alpha(theme.palette.divider, 0.7)}`,
        boxShadow: `0 4px 20px 0 ${alpha(theme.palette.common.black, 0.03)}`,
        overflow: "visible",
        position: "relative",
        zIndex: 1,
        transition: "box-shadow 0.3s ease, z-index 0.3s ease",
        "&:hover": {
          zIndex: 10,
          boxShadow: `0 8px 30px 0 ${alpha(theme.palette.common.black, 0.06)}`,
        },
      }}
    >
      <Box
        sx={{
          px: { xs: 2, sm: 3 },
          py: { xs: 1.5, sm: 2.5 },
          borderBottom: `1px solid ${alpha(theme.palette.divider, 0.5)}`,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          bgcolor: theme.palette.background.paper,
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
        }}
      >
        <Box>
          <Typography variant="subtitle1" fontWeight={800} letterSpacing={-0.2} sx={{ fontSize: { xs: "0.9rem", sm: "1rem" } }}>
            {title}
          </Typography>
          {subtitle && (
            <Typography variant="caption" color="text.secondary" fontWeight={500} sx={{ display: "block", lineHeight: 1.2 }}>
              {subtitle}
            </Typography>
          )}
        </Box>
        {action}
      </Box>
      <CardContent
        sx={{
          p: { xs: 1.5, sm: 3 },
          height: height || "auto",
          bgcolor: alpha(theme.palette.background.default, 0.2),
          borderBottomLeftRadius: 16,
          borderBottomRightRadius: 16,
        }}
      >
        {children}
      </CardContent>
    </Card>
  );
};

// ─────────────────────────────────────────────────────────────
// CUSTOM RECHARTS TOOLTIP
// ─────────────────────────────────────────────────────────────
const ChartTooltip = ({ active, payload, label }) => {
  const theme = useTheme();
  if (!active || !payload?.length) return null;
  return (
    <Paper
      elevation={12}
      sx={{
        p: 2,
        borderRadius: 2.5,
        minWidth: 160,
        border: `1px solid ${alpha(theme.palette.divider, 0.8)}`,
        bgcolor: alpha(theme.palette.background.paper, 0.95),
        backdropFilter: "blur(8px)",
      }}
    >
      {label && (
        <Typography
          variant="caption"
          fontWeight={800}
          color="text.secondary"
          display="block"
          mb={1.5}
          sx={{ textTransform: "uppercase", letterSpacing: 0.5 }}
        >
          {label}
        </Typography>
      )}
      {payload[0]?.payload?.description && (
        <Typography
          variant="caption"
          color="text.secondary"
          display="block"
          mb={1.5}
          fontWeight={500}
          sx={{ maxWidth: 220, whiteSpace: "normal" }}
        >
          {payload[0].payload.description}
        </Typography>
      )}
      <Stack spacing={1}>
        {payload.map((p, i) => {
          const safeColor =
            p.color && p.color.includes("url")
              ? theme.palette.primary.main
              : p.color;
          return (
            <Stack key={i} direction="row" justifyContent="space-between" gap={3} alignItems="center">
              <Stack direction="row" alignItems="center" gap={1}>
                <Box
                  sx={{
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    background: p.color,
                    border: `1px solid ${theme.palette.divider}`,
                  }}
                />
                <Typography variant="caption" fontWeight={600} color="text.primary">
                  {p.name}
                </Typography>
              </Stack>
              <Typography
                variant="caption"
                fontWeight={800}
                sx={{ color: safeColor, fontVariantNumeric: "tabular-nums" }}
              >
                {typeof p.value === "number"
                  ? p.name?.includes("%") || p.dataKey?.includes("Pct") || p.dataKey === "accuracy"
                    ? `${p.value.toFixed(2)}%`
                    : p.value.toLocaleString()
                  : p.value}
                {p.payload?.percent !== undefined && !p.name?.includes("%") && ` (${p.payload.percent}%)`}
              </Typography>
            </Stack>
          );
        })}
      </Stack>
    </Paper>
  );
};

const RISK_COLORS = { "High Risk": "error", "Medium Risk": "warning", "Low Risk": "info" };

// ─────────────────────────────────────────────────────────────
// FULL EXPORT HELPER
// ─────────────────────────────────────────────────────────────
const useFullExport = () => {
  const [exporting, setExporting] = useState(false);

  const exportToExcel = useCallback(async ({
    title,
    dateRange,
    moduleType,
    reportSource,
    defectType,
    pointNo,
    vendorName,
    specificDate,
    riskCategory,
    breakdown,
    reportType,
    ageBucket,
    startDate,
    endDate,
  }) => {
    setExporting(true);
    try {
      const payload = {
        startDate: startDate || dateRange?.start,
        endDate: endDate || dateRange?.end,
        moduleType,
        reportSource,
        defectType,
        pointNo,
        vendorName,
        specificDate,
        riskCategory,
        breakdown,
        reportType,
        ageBucket,
      };
      Object.keys(payload).forEach((k) => payload[k] === undefined && delete payload[k]);

      const res = await post("/reports/full-export", payload);
      const rows = res?.data || [];
      if (!rows.length) {
        toast.info("No records found for export");
        return;
      }

      const clean = rows.map(({ Document_ID, ...rest }) => {
        const out = { ...rest };
        if (out.Date_Audited) out.Date_Audited = moment(out.Date_Audited).format("YYYY-MM-DD HH:mm");
        return out;
      });

      const ws = XLSX.utils.json_to_sheet(clean);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Report");
      XLSX.writeFile(wb, `${title.replace(/\s+/g, "_")}_FULL_${moment().format("YYYYMMDD")}.xlsx`);
      toast.success(`Downloaded ${rows.length.toLocaleString()} records`);
    } catch (err) {
      console.error("Full export error:", err);
      toast.error("Export failed. Please try again.");
    } finally {
      setExporting(false);
    }
  }, []);

  return { exportToExcel, exporting };
};

// ─────────────────────────────────────────────────────────────
// REPORT MODAL
// ─────────────────────────────────────────────────────────────
const ReportModal = ({
  open,
  onClose,
  title,
  data,
  loading,
  pagination,
  onPageChange,
  summary,
  onBucketFilter,
  activeBucket,
  exportMeta,
}) => {
  const theme = useTheme();
  const { exportToExcel, exporting } = useFullExport();
  const [search, setSearch] = useState("");
  const [riskFilter, setRiskFilter] = useState("all");
  const [moduleFilter, setModuleFilter] = useState("all");
  const [sysStatusFilter, setSysStatusFilter] = useState("all");
  const [audStatusFilter, setAudStatusFilter] = useState("all");

  useEffect(() => {
    if (open) {
      setSearch("");
      setRiskFilter("all");
      setModuleFilter("all");
      setSysStatusFilter("all");
      setAudStatusFilter("all");
    }
  }, [open, title]);

  const filtered = useMemo(() => {
    if (!data?.length) return [];
    return data.filter((row) => {
      const matchSearch =
        !search ||
        Object.values(row).some((v) =>
          String(v).toLowerCase().includes(search.toLowerCase())
        );
      const matchRisk = riskFilter === "all" || row.Risk_Category === riskFilter;
      const matchModule =
        moduleFilter === "all" ||
        row.Module === moduleFilter ||
        row.Module_Type === moduleFilter;
      const matchSys =
        sysStatusFilter === "all" ||
        row.System_Status === sysStatusFilter ||
        row.System_Result === sysStatusFilter;
      const matchAud =
        audStatusFilter === "all" ||
        row.Auditor_Result === audStatusFilter ||
        row.Auditor_Verified === audStatusFilter;
      return matchSearch && matchRisk && matchModule && matchSys && matchAud;
    });
  }, [data, search, riskFilter, moduleFilter, sysStatusFilter, audStatusFilter]);

  const riskOptions = useMemo(
    () => [...new Set((data || []).map((r) => r.Risk_Category).filter(Boolean))],
    [data]
  );
  const moduleOptions = useMemo(
    () => [...new Set((data || []).map((r) => r.Module || r.Module_Type).filter(Boolean))],
    [data]
  );
  const sysOptions = useMemo(
    () => [...new Set((data || []).map((r) => r.System_Status || r.System_Result).filter(Boolean))],
    [data]
  );
  const audOptions = useMemo(
    () => [...new Set((data || []).map((r) => r.Auditor_Result || r.Auditor_Verified).filter(Boolean))],
    [data]
  );

  const columns = useMemo(() => {
    if (!filtered?.length) return [];
    return Object.keys(filtered[0]).filter(
      (k) => k !== "Document_ID" && k !== "Fiscal_Year"
    );
  }, [filtered]);

  const downloadPageExcel = () => {
    if (!filtered.length) return;
    const clean = filtered.map(({ Document_ID, ...rest }) => {
      const out = { ...rest };
      if (out.Date_Audited) out.Date_Audited = moment(out.Date_Audited).format("YYYY-MM-DD HH:mm");
      return out;
    });
    const ws = XLSX.utils.json_to_sheet(clean);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Report");
    XLSX.writeFile(wb, `${title.replace(/\s+/g, "_")}_page${pagination?.page || 1}_${moment().format("YYYYMMDD")}.xlsx`);
    toast.success("Page exported");
  };

  const handleFullExport = () => {
    if (!exportMeta) return;
    exportToExcel({ title, ...exportMeta });
  };

  const renderCell = (col, row) => {
    const val = row[col];
    const str = val === null || val === undefined ? "—" : String(val);

    if (col === "Document_Number" && val && val !== "—") {
      const url = buildDocUrl(val, row.Fiscal_Year);
      return (
        <Button
          size="small"
          variant="text"
          endIcon={<OpenInNewIcon sx={{ fontSize: 12 }} />}
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            window.open(url, "_blank", "noopener,noreferrer");
          }}
          sx={{
            textTransform: "none",
            fontWeight: 800,
            p: 0,
            minWidth: 0,
            color: theme.palette.primary.main,
          }}
        >
          {str}
        </Button>
      );
    }

    if (col === "Risk_Category") {
      return (
        <Chip
          label={str}
          size="small"
          color={RISK_COLORS[str] || "default"}
          sx={{ fontWeight: 800, fontSize: "0.72rem", borderRadius: 1.5 }}
        />
      );
    }
    if (col === "Age_Bucket") {
      return (
        <Chip
          label={str}
          size="small"
          color={AGE_BUCKET_COLORS[str] || "default"}
          variant="outlined"
          sx={{ fontWeight: 800, fontSize: "0.72rem", borderRadius: 1.5 }}
        />
      );
    }
    if (col === "Correction_Category") {
      const colorMap = { "Audit Risk": "error", "Data Missing": "warning", "Not Verified": "info" };
      return (
        <Chip
          label={str}
          size="small"
          color={colorMap[str] || "default"}
          variant="outlined"
          sx={{ fontWeight: 800, fontSize: "0.72rem", borderRadius: 1.5 }}
        />
      );
    }
    if (col === "System_Status" || col === "System_Result") {
      const isPass = str === "Pass" || str === "true";
      const isFail = str === "Fail" || str === "false";
      const isWarning = str === "Missing Data" || str === "Not Applicable";
      let label = str;
      if (str === "true") label = "Pass";
      if (str === "false") label = "Fail";
      return (
        <Chip
          label={label}
          size="small"
          color={isPass ? "success" : isFail ? "error" : isWarning ? "warning" : "default"}
          variant="outlined"
          sx={{ fontWeight: 800, fontSize: "0.72rem", borderRadius: 1.5 }}
        />
      );
    }
    if (col === "Auditor_Result" || col === "Auditor_Verified") {
      const isPass = str === "Pass" || str === "true";
      const isFail = str === "Fail" || str === "false";
      let label = str;
      if (str === "true") label = "Pass";
      if (str === "false") label = "Fail";
      return (
        <Chip
          label={label}
          size="small"
          color={isPass ? "success" : isFail ? "error" : "default"}
          variant="outlined"
          sx={{ fontWeight: 800, fontSize: "0.72rem", borderRadius: 1.5 }}
        />
      );
    }
    if ((col.includes("Date") || col.includes("_On")) && val && str !== "—") {
      return (
        <Typography
          variant="caption"
          sx={{
            fontVariantNumeric: "tabular-nums",
            color: theme.palette.text.secondary,
            fontWeight: 600,
          }}
        >
          {moment(val).format("DD MMM YYYY")}
        </Typography>
      );
    }
    return (
      <Typography
        variant="body2"
        sx={{
          maxWidth: 240,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          fontWeight: 500,
        }}
      >
        {str}
      </Typography>
    );
  };

  const hasFilters =
    search ||
    riskFilter !== "all" ||
    moduleFilter !== "all" ||
    sysStatusFilter !== "all" ||
    audStatusFilter !== "all";
  const totalRecords = pagination?.total || data?.length || 0;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="xl"
      fullWidth
      TransitionComponent={Fade}
      PaperProps={{
        sx: {
          borderRadius: 4,
          border: `1px solid ${alpha(theme.palette.divider, 0.5)}`,
          boxShadow: `0 24px 48px -12px ${alpha(theme.palette.common.black, 0.2)}`,
          overflow: "hidden",
          minHeight: "78vh",
        },
      }}
    >
      {loading && <LinearProgress color="primary" sx={{ height: 4 }} />}

      <DialogTitle
        sx={{
          p: 0,
          borderBottom: `1px solid ${alpha(theme.palette.divider, 0.5)}`,
          bgcolor: alpha(theme.palette.background.paper, 0.8),
          backdropFilter: "blur(10px)",
        }}
      >
        <Stack
          direction={{ xs: "column", xl: "row" }}
          justifyContent="space-between"
          alignItems={{ xs: "flex-start", xl: "center" }}
          gap={2}
          sx={{ px: 4, py: 2.5 }}
        >
          <Box>
            <Typography variant="h6" fontWeight={800} letterSpacing={-0.3}>
              {title}
            </Typography>
            <Typography variant="caption" color="text.secondary" fontWeight={600}>
              {filtered.length} shown on page
              {pagination ? ` · ${totalRecords.toLocaleString()} total records` : ""}
            </Typography>
          </Box>

          <Stack direction="row" gap={1.5} alignItems="center" flexWrap="wrap">
            <TextField
              size="small"
              placeholder="Search this page…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" color="action" />
                  </InputAdornment>
                ),
                endAdornment: search ? (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={() => setSearch("")}>
                      <CloseIcon fontSize="small" />
                    </IconButton>
                  </InputAdornment>
                ) : null,
              }}
              sx={{
                minWidth: 200,
                bgcolor: theme.palette.background.default,
                borderRadius: 2,
                "& fieldset": { borderRadius: 2 },
              }}
            />
            {riskOptions.length > 0 && (
              <FormControl size="small" sx={{ minWidth: 120 }}>
                <Select
                  value={riskFilter}
                  onChange={(e) => setRiskFilter(e.target.value)}
                  displayEmpty
                  sx={{ borderRadius: 2, bgcolor: theme.palette.background.default }}
                  startAdornment={
                    <FilterListIcon fontSize="small" sx={{ mr: 0.5, color: "action.active" }} />
                  }
                >
                  <MenuItem value="all" sx={{ fontWeight: 600 }}>All Risk</MenuItem>
                  {riskOptions.map((r) => (
                    <MenuItem key={r} value={r} sx={{ fontWeight: 600 }}>{r}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
            {moduleOptions.length > 1 && (
              <FormControl size="small" sx={{ minWidth: 120 }}>
                <Select
                  value={moduleFilter}
                  onChange={(e) => setModuleFilter(e.target.value)}
                  displayEmpty
                  sx={{ borderRadius: 2, bgcolor: theme.palette.background.default }}
                >
                  <MenuItem value="all" sx={{ fontWeight: 600 }}>All Modules</MenuItem>
                  {moduleOptions.map((m) => (
                    <MenuItem key={m} value={m} sx={{ fontWeight: 600 }}>{m}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
            {sysOptions.length > 0 && (
              <FormControl size="small" sx={{ minWidth: 140 }}>
                <Select
                  value={sysStatusFilter}
                  onChange={(e) => setSysStatusFilter(e.target.value)}
                  displayEmpty
                  sx={{ borderRadius: 2, bgcolor: theme.palette.background.default }}
                  startAdornment={
                    <FactCheckIcon fontSize="small" sx={{ mr: 0.5, color: "action.active" }} />
                  }
                >
                  <MenuItem value="all" sx={{ fontWeight: 600 }}>Sys: All</MenuItem>
                  {sysOptions.map((m) => (
                    <MenuItem key={m} value={m} sx={{ fontWeight: 600 }}>
                      {m === true || m === "true" ? "Pass" : m === false || m === "false" ? "Fail" : m}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
            {audOptions.length > 0 && (
              <FormControl size="small" sx={{ minWidth: 140 }}>
                <Select
                  value={audStatusFilter}
                  onChange={(e) => setAudStatusFilter(e.target.value)}
                  displayEmpty
                  sx={{ borderRadius: 2, bgcolor: theme.palette.background.default }}
                  startAdornment={
                    <FactCheckIcon fontSize="small" sx={{ mr: 0.5, color: "action.active" }} />
                  }
                >
                  <MenuItem value="all" sx={{ fontWeight: 600 }}>Aud: All</MenuItem>
                  {audOptions.map((m) => (
                    <MenuItem key={m} value={m} sx={{ fontWeight: 600 }}>
                      {m === true || m === "true" ? "Pass" : m === false || m === "false" ? "Fail" : m}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
            <IconButton
              onClick={onClose}
              size="small"
              sx={{
                bgcolor: alpha(theme.palette.error.main, 0.1),
                color: theme.palette.error.main,
                "&:hover": { bgcolor: alpha(theme.palette.error.main, 0.2) },
                borderRadius: 2,
              }}
            >
              <CloseIcon fontSize="small" />
            </IconButton>
          </Stack>
        </Stack>

        {summary && summary.length > 0 && (
          <Stack direction="row" gap={1} px={4} pb={2} flexWrap="wrap">
            <Chip
              label={`All (${summary.reduce((a, b) => a + b.count, 0).toLocaleString()})`}
              size="small"
              onClick={() => onBucketFilter && onBucketFilter(null)}
              color={!activeBucket ? "primary" : "default"}
              variant={!activeBucket ? "filled" : "outlined"}
              sx={{ fontWeight: 800, fontSize: "0.75rem", cursor: "pointer" }}
            />
            {AGE_BUCKET_ORDER.map((bucket) => {
              const s = summary.find((x) => x._id === bucket);
              if (!s) return null;
              return (
                <Chip
                  key={bucket}
                  label={`${bucket}: ${s.count.toLocaleString()}`}
                  size="small"
                  onClick={() => onBucketFilter && onBucketFilter(bucket)}
                  color={activeBucket === bucket ? AGE_BUCKET_COLORS[bucket] : "default"}
                  variant={activeBucket === bucket ? "filled" : "outlined"}
                  sx={{ fontWeight: 800, fontSize: "0.75rem", cursor: "pointer" }}
                />
              );
            })}
          </Stack>
        )}
      </DialogTitle>

      <DialogContent sx={{ p: 0, bgcolor: theme.palette.background.default }}>
        {loading ? (
          <Stack height="50vh" justifyContent="center" alignItems="center" gap={2}>
            <CircularProgress size={32} thickness={5} />
            <Typography variant="body2" color="text.secondary" fontWeight={600}>
              Fetching report data…
            </Typography>
          </Stack>
        ) : filtered.length === 0 ? (
          <Stack height="50vh" justifyContent="center" alignItems="center" gap={1.5}>
            <ErrorOutlineIcon sx={{ fontSize: 64, color: alpha(theme.palette.text.disabled, 0.5) }} />
            <Typography variant="h6" color="text.secondary" fontWeight={700}>
              No matching records
            </Typography>
            <Typography variant="body2" color="text.disabled" fontWeight={500}>
              Try clearing your filters to see more results
            </Typography>
            {hasFilters && (
              <Button
                size="small"
                variant="outlined"
                sx={{ mt: 2, borderRadius: 2, fontWeight: 700 }}
                onClick={() => {
                  setSearch("");
                  setRiskFilter("all");
                  setModuleFilter("all");
                  setSysStatusFilter("all");
                  setAudStatusFilter("all");
                }}
              >
                Clear All Filters
              </Button>
            )}
          </Stack>
        ) : (
          <TableContainer sx={{ maxHeight: "52vh", overflowX: "auto" }}>
            <Table stickyHeader size="small">
              <TableHead>
                <TableRow>
                  {columns.map((col) => (
                    <TableCell
                      key={col}
                      sx={{
                        fontWeight: 800,
                        fontSize: "0.72rem",
                        letterSpacing: 0.8,
                        textTransform: "uppercase",
                        bgcolor: alpha(theme.palette.background.paper, 0.95),
                        backdropFilter: "blur(5px)",
                        color: theme.palette.text.secondary,
                        borderBottom: `2px solid ${alpha(theme.palette.divider, 0.8)}`,
                        whiteSpace: "nowrap",
                        py: 2,
                      }}
                    >
                      {col.replace(/_/g, " ")}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {filtered.map((row, i) => (
                  <TableRow
                    key={i}
                    hover
                    sx={{
                      "&:nth-of-type(even)": {
                        bgcolor: alpha(theme.palette.background.paper, 0.4),
                      },
                      "&:hover": { bgcolor: alpha(theme.palette.primary.main, 0.04) },
                    }}
                  >
                    {columns.map((col) => (
                      <TableCell
                        key={col}
                        sx={{
                          py: 1.5,
                          borderBottom: `1px solid ${alpha(theme.palette.divider, 0.4)}`,
                        }}
                      >
                        {renderCell(col, row)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </DialogContent>

      <DialogActions
        sx={{
          px: 4,
          py: 2.5,
          borderTop: `1px solid ${alpha(theme.palette.divider, 0.5)}`,
          bgcolor: theme.palette.background.paper,
        }}
      >
        <Typography variant="body2" color="text.secondary" sx={{ flexGrow: 1, fontWeight: 600 }}>
          Page{" "}
          <Box component="span" sx={{ color: "primary.main", fontWeight: 900 }}>
            {pagination?.page || 1}
          </Box>{" "}
          of{" "}
          <Box component="span" sx={{ fontWeight: 800 }}>
            {pagination?.pages || 1}
          </Box>{" · "}
          <Box component="span" sx={{ color: "primary.main", fontWeight: 900 }}>
            {totalRecords.toLocaleString()}
          </Box>{" "}
          total records
        </Typography>
        {pagination && pagination.pages > 1 && (
          <Stack direction="row" gap={1} alignItems="center">
            <IconButton
              size="small"
              disabled={pagination.page <= 1 || loading}
              onClick={() => onPageChange(pagination.page - 1)}
              sx={{ borderRadius: 2, border: `1px solid ${theme.palette.divider}` }}
            >
              <NavigateBeforeIcon fontSize="small" />
            </IconButton>
            <Typography variant="body2" fontWeight={800} sx={{ minWidth: 40, textAlign: "center" }}>
              {pagination.page} / {pagination.pages}
            </Typography>
            <IconButton
              size="small"
              disabled={pagination.page >= pagination.pages || loading}
              onClick={() => onPageChange(pagination.page + 1)}
              sx={{ borderRadius: 2, border: `1px solid ${theme.palette.divider}` }}
            >
              <NavigateNextIcon fontSize="small" />
            </IconButton>
          </Stack>
        )}
        <Button
          onClick={onClose}
          color="inherit"
          sx={{ fontWeight: 800, borderRadius: 2, px: 3 }}
        >
          Close
        </Button>
        <Button
          variant="outlined"
          startIcon={<DownloadIcon />}
          onClick={downloadPageExcel}
          disabled={!filtered.length}
          sx={{ borderRadius: 2, fontWeight: 800, px: 2.5 }}
        >
          Export Page
        </Button>
        {exportMeta && (
          <Button
            variant="contained"
            disableElevation
            startIcon={exporting ? <CircularProgress size={16} color="inherit" /> : <FileDownloadOutlinedIcon />}
            onClick={handleFullExport}
            disabled={exporting || !totalRecords}
            sx={{ borderRadius: 2, fontWeight: 800, px: 3, py: 1 }}
          >
            {exporting ? "Exporting…" : `Export All (${totalRecords.toLocaleString()})`}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

// ─────────────────────────────────────────────────────────────
// REPORT BUTTON
// ─────────────────────────────────────────────────────────────
const ReportBtn = ({ label, icon: Icon, onClick, disabled, color = "primary", variant = "outlined" }) => (
  <Button
    variant={variant}
    color={color}
    size="small"
    disabled={disabled}
    onClick={onClick}
    startIcon={Icon ? <Icon sx={{ fontSize: 18 }} /> : null}
    sx={{
      borderRadius: 2,
      fontWeight: 800,
      fontSize: "0.8rem",
      justifyContent: "flex-start",
      textAlign: "left",
      px: 2,
      py: 1.25,
      borderWidth: variant === "outlined" ? 1.5 : undefined,
      transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
      "&:hover": {
        borderWidth: variant === "outlined" ? 1.5 : undefined,
        transform: "translateX(4px)",
        boxShadow:
          variant === "contained"
            ? `0 4px 12px ${alpha(
                color === "primary" ? "#1976d2" : color === "success" ? "#2e7d32" : color === "warning" ? "#ed6c02" : "#d32f2f",
                0.3
              )}`
            : "none",
      },
    }}
  >
    {label}
  </Button>
);

// ─────────────────────────────────────────────────────────────
// ACCURACY TREND CHART
// ─────────────────────────────────────────────────────────────
const AccuracyTrendChart = ({ data, loading, onBarClick }) => {
  const theme = useTheme();
  const tk = useTokens(theme);

  const enrichedData = data?.map((item) => ({
    ...item,
    accuracy: item.accuracy ?? 0,
    discrepancyPct: item.discrepancyPct ?? 0,
  }));

  const AccuracyTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    const dataObj = payload[0].payload;
    return (
      <Paper
        elevation={12}
        sx={{
          p: 2,
          borderRadius: 2.5,
          minWidth: 260,
          border: `1px solid ${alpha(theme.palette.divider, 0.8)}`,
          bgcolor: alpha(theme.palette.background.paper, 0.97),
        }}
      >
        <Typography
          variant="caption"
          fontWeight={800}
          color="text.secondary"
          display="block"
          mb={1.5}
          sx={{ textTransform: "uppercase", letterSpacing: 0.5 }}
        >
          {label}
        </Typography>
        {[...payload].reverse().map((p, i) => (
          <Box key={i} mb={1}>
            <Stack direction="row" justifyContent="space-between" gap={3} alignItems="center">
              <Stack direction="row" alignItems="center" gap={1}>
                <Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: p.fill || p.color }} />
                <Typography variant="caption" fontWeight={600}>
                  {p.name}
                  {p.dataKey === "accuracy" && (
                    <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1, fontWeight: 700 }}>
                      ({dataObj.accuratePoints} pts)
                    </Typography>
                  )}
                  {p.dataKey === "discrepancyPct" && (
                    <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1, fontWeight: 700 }}>
                      ({dataObj.alterations} pts)
                    </Typography>
                  )}
                </Typography>
              </Stack>
              <Typography variant="caption" fontWeight={900} sx={{ color: p.fill || p.color }}>
                {p.value?.toFixed(2)}%
              </Typography>
            </Stack>
            {p.dataKey === "discrepancyPct" && dataObj.alterations > 0 && (
              <Stack pl={3.5} mt={0.75} spacing={0.5}>
                {dataObj.auditRiskCount > 0 && (
                  <Stack direction="row" justifyContent="space-between">
                    <Stack direction="row" alignItems="center" gap={1}>
                      <Box sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: tk.danger }} />
                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.68rem", fontWeight: 600 }}>Audit Risk</Typography>
                    </Stack>
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.68rem", fontWeight: 800 }}>{dataObj.auditRiskCount}</Typography>
                  </Stack>
                )}
                {dataObj.dataMissingCount > 0 && (
                  <Stack direction="row" justifyContent="space-between">
                    <Stack direction="row" alignItems="center" gap={1}>
                      <Box sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: tk.warn }} />
                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.68rem", fontWeight: 600 }}>Data Missing</Typography>
                    </Stack>
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.68rem", fontWeight: 800 }}>{dataObj.dataMissingCount}</Typography>
                  </Stack>
                )}
                {dataObj.notVerifiedCount > 0 && (
                  <Stack direction="row" justifyContent="space-between">
                    <Stack direction="row" alignItems="center" gap={1}>
                      <Box sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: tk.info }} />
                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.68rem", fontWeight: 600 }}>Not Verified</Typography>
                    </Stack>
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.68rem", fontWeight: 800 }}>{dataObj.notVerifiedCount}</Typography>
                  </Stack>
                )}
              </Stack>
            )}
          </Box>
        ))}
        {dataObj.totalPoints !== undefined && (
          <Typography
            variant="caption"
            color="text.disabled"
            display="block"
            mt={1.5}
            pt={1.5}
            borderTop={`1px dashed ${alpha(theme.palette.divider, 0.5)}`}
            fontWeight={600}
          >
            {dataObj.totalPoints.toLocaleString()} closed points total evaluated
          </Typography>
        )}
      </Paper>
    );
  };

  if (loading) {
    return (
      <Stack height={320} alignItems="center" justifyContent="center">
        <CircularProgress size={30} />
      </Stack>
    );
  }
  if (!enrichedData?.length) {
    return (
      <Stack height={320} alignItems="center" justifyContent="center">
        <Typography color="text.disabled" variant="body2" fontWeight={600}>
          No accuracy trend data available
        </Typography>
      </Stack>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={enrichedData} margin={{ top: 20, right: 20, left: -10, bottom: 80 }} barCategoryGap="30%">
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={tk.gridLine} />
        <XAxis dataKey="label" tick={{ fontSize: 9.5, fill: tk.textMuted, fontWeight: 700 }} tickLine={false} axisLine={false} angle={-35} textAnchor="end" dy={5} interval={0} />
        <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11, fill: tk.textMuted, fontWeight: 600 }} tickLine={false} axisLine={false} width={52} />
        <RTooltip content={<AccuracyTooltip />} cursor={{ fill: alpha(tk.accent, 0.04), radius: 4 }} allowEscapeViewBox={{ x: true, y: true }} wrapperStyle={{ zIndex: 1000 }} />
        <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ fontSize: 12, fontWeight: 800, paddingBottom: 8 }} />
        <Bar dataKey="accuracy" stackId="a" name="System Accuracy" fill={tk.accent} radius={[0, 0, 4, 4]} style={{ cursor: onBarClick ? "pointer" : "default" }} onClick={(entry) => onBarClick && onBarClick(entry, "accuracy")}>
          <LabelList dataKey="accuracy" position="insideBottom" fill="#ffffff" fontWeight={800} fontSize={11} formatter={(val) => (val > 5 ? `${val.toFixed(1)}%` : "")} />
        </Bar>
        <Bar dataKey="discrepancyPct" stackId="a" name="System Discrepancy" fill={tk.danger} radius={[4, 4, 0, 0]} style={{ cursor: onBarClick ? "pointer" : "default" }} onClick={(entry) => onBarClick && onBarClick(entry, "discrepancy")}>
          <LabelList dataKey="discrepancyPct" position="insideTop" fill="#ffffff" fontWeight={800} fontSize={11} formatter={(val) => (val > 5 ? `${val.toFixed(1)}%` : "")} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
};

// ─────────────────────────────────────────────────────────────
// VENDOR DEVIATION ANALYSIS PANEL
// ─────────────────────────────────────────────────────────────
const VendorDeviationPanel = ({ dateRange, dataViewType, onDrillDown }) => {
  const theme = useTheme();
  const tk = useTokens(theme);
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!dateRange.start || !dateRange.end) return;
    setLoading(true);
    post("/reports/vendor-deviation", {
      startDate: dateRange.start,
      endDate: dateRange.end,
      moduleType: dataViewType,
    })
      .then((res) => {
        if (res?.success) setVendors(res.data || []);
      })
      .catch(() => toast.error("Failed to load vendor deviation data"))
      .finally(() => setLoading(false));
  }, [dateRange.start, dateRange.end, dataViewType]);

  const filteredVendors = useMemo(() => {
    if (!search) return vendors;
    return vendors.filter((v) =>
      v.vendor?.toLowerCase().includes(search.toLowerCase())
    );
  }, [vendors, search]);

  if (loading) {
    return (
      <Stack height={200} alignItems="center" justifyContent="center" gap={2}>
        <CircularProgress size={32} thickness={5} />
        <Typography variant="body2" color="text.secondary" fontWeight={600}>Loading vendor analysis…</Typography>
      </Stack>
    );
  }
  if (!vendors.length) {
    return (
      <Stack height={160} alignItems="center" justifyContent="center" gap={1.5}>
        <BusinessIcon sx={{ fontSize: 48, color: alpha(theme.palette.text.disabled, 0.4) }} />
        <Typography color="text.disabled" variant="body2" fontWeight={700}>
          No vendor deviations found for this period
        </Typography>
      </Stack>
    );
  }

  return (
    <Box>
      <Stack direction={{ xs: "column", sm: "row" }} mb={2} alignItems={{ xs: "stretch", sm: "center" }} gap={2}>
        <TextField
          size="small"
          placeholder="Search vendor…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" color="action" />
              </InputAdornment>
            ),
            endAdornment: search ? (
              <InputAdornment position="end">
                <IconButton size="small" onClick={() => setSearch("")}>
                  <CloseIcon fontSize="small" />
                </IconButton>
              </InputAdornment>
            ) : null,
          }}
          sx={{ width: { xs: "100%", sm: 260 }, bgcolor: theme.palette.background.default, "& fieldset": { borderRadius: 2 } }}
        />
        <Typography variant="caption" color="text.secondary" fontWeight={600} textAlign={{ xs: "center", sm: "left" }}>
          {filteredVendors.length} vendor{filteredVendors.length !== 1 ? "s" : ""} · click row to expand
        </Typography>
      </Stack>

      <Box
        sx={{
          maxHeight: 480,
          overflowY: "auto",
          pr: 0.5,
          "&::-webkit-scrollbar": { width: 6 },
          "&::-webkit-scrollbar-track": { bgcolor: alpha(theme.palette.divider, 0.2), borderRadius: 4 },
          "&::-webkit-scrollbar-thumb": {
            bgcolor: alpha(theme.palette.primary.main, 0.3),
            borderRadius: 4,
            "&:hover": { bgcolor: alpha(theme.palette.primary.main, 0.5) },
          },
        }}
      >
        <Stack spacing={1.5}>
          {filteredVendors.map((v, i) => {
            const isOpen = expanded === i;
            const totalCorrection = v.correctionNature.auditRisk + v.correctionNature.dataMissing + v.correctionNature.notVerified;
            const correctionData = [
              { name: "Audit Risk", value: v.correctionNature.auditRisk, color: tk.danger },
              { name: "Data Missing", value: v.correctionNature.dataMissing, color: tk.warn },
              { name: "Not Verified", value: v.correctionNature.notVerified, color: tk.info },
            ].filter((d) => d.value > 0);

            if (totalCorrection > 0) {
              let sum = 0;
              correctionData.forEach((d, idx) => {
                if (idx === correctionData.length - 1) {
                  d.percent = Math.max(0, 100 - sum).toFixed(1);
                } else {
                  const p = parseFloat(((d.value / totalCorrection) * 100).toFixed(1));
                  d.percent = p.toFixed(1);
                  sum += p;
                }
              });
            }

            const totalRisk = v.riskBreakdown.highRisk + v.riskBreakdown.mediumRisk + v.riskBreakdown.lowRisk;
            const riskData = [
              { name: "High", value: v.riskBreakdown.highRisk, color: tk.danger },
              { name: "Medium", value: v.riskBreakdown.mediumRisk, color: tk.warn },
              { name: "Low", value: v.riskBreakdown.lowRisk, color: tk.info },
            ].filter((d) => d.value > 0);

            if (totalRisk > 0) {
              let sum = 0;
              riskData.forEach((d, idx) => {
                if (idx === riskData.length - 1) {
                  d.percent = Math.max(0, 100 - sum).toFixed(1);
                } else {
                  const p = parseFloat(((d.value / totalRisk) * 100).toFixed(1));
                  d.percent = p.toFixed(1);
                  sum += p;
                }
              });
            }

            const topPointsData = (v.topPoints || []).map((p) => ({
              name: `Pt ${p.ptNo}`,
              ptNo: p.ptNo,
              Overrides: p.count,
            }));

            return (
              <Card
                key={i}
                elevation={0}
                sx={{
                  borderRadius: 3,
                  border: `1px solid ${alpha(isOpen ? theme.palette.primary.main : theme.palette.divider, isOpen ? 0.5 : 0.6)}`,
                  overflow: isOpen ? "visible" : "hidden",
                  transition: "all 0.25s ease, z-index 0.25s ease",
                  boxShadow: isOpen ? `0 8px 24px -8px ${alpha(theme.palette.primary.main, 0.15)}` : "none",
                  zIndex: isOpen ? 10 : 1,
                  position: "relative",
                }}
              >
                <Box
                  onClick={() => setExpanded(isOpen ? null : i)}
                  sx={{
                    px: { xs: 2, sm: 3 }, py: { xs: 1.5, sm: 2 }, cursor: "pointer",
                    display: "flex", flexDirection: { xs: "column", sm: "row" },
                    alignItems: { xs: "flex-start", sm: "center" }, gap: { xs: 1.5, sm: 2 },
                    bgcolor: isOpen ? alpha(theme.palette.primary.main, 0.03) : theme.palette.background.paper,
                    "&:hover": { bgcolor: alpha(theme.palette.primary.main, 0.04) },
                    transition: "background 0.2s",
                  }}
                >
                  <Box sx={{ display: "flex", alignItems: "flex-start", width: "100%", gap: { xs: 1.5, sm: 2 } }}>
                    <Box sx={{ width: { xs: 28, sm: 32 }, height: { xs: 28, sm: 32 }, borderRadius: "50%", bgcolor: i < 3 ? alpha(tk.danger, 0.1) : alpha(tk.accent, 0.08), color: i < 3 ? tk.danger : tk.accent, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: { xs: "0.7rem", sm: "0.8rem" }, flexShrink: 0, border: `2px solid ${i < 3 ? alpha(tk.danger, 0.3) : alpha(tk.accent, 0.2)}`, mt: 0.25 }}>
                      {i + 1}
                    </Box>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="subtitle2" fontWeight={800} noWrap sx={{ fontSize: { xs: "0.85rem", sm: "0.875rem" } }}>
                        {v.vendor || "Unknown Vendor"}
                      </Typography>
                      <Stack direction="row" gap={0.75} mt={0.5} flexWrap="wrap">
                        <Chip label={`${v.totalDeviations} deviations`} size="small" color="error" sx={{ fontWeight: 800, fontSize: "0.65rem", height: 20 }} />
                        {correctionData.map((c) => (
                          <Chip key={c.name} label={`${c.name}: ${c.value} (${c.percent}%)`} size="small" variant="outlined" sx={{ fontWeight: 700, fontSize: { xs: "0.6rem", sm: "0.68rem" }, height: 20, borderColor: c.color, color: c.color }} />
                        ))}
                      </Stack>
                    </Box>
                    <Box sx={{ display: { xs: "flex", sm: "none" }, alignSelf: "center", ml: 1 }}>
                      {isOpen ? <ExpandLessIcon color="primary" /> : <ExpandMoreIcon sx={{ color: "text.secondary" }} />}
                    </Box>
                  </Box>
                  <Box sx={{ display: "flex", alignItems: "center", width: { xs: "100%", sm: "auto" }, justifyContent: { xs: "flex-end", sm: "flex-end" }, gap: 1, mt: { xs: 0.5, sm: 0 } }}>
                    <Button size="small" variant="outlined" onClick={(e) => { e.stopPropagation(); onDrillDown && onDrillDown(v.vendor); }} sx={{ borderRadius: 2, fontWeight: 800, fontSize: "0.72rem", py: 0.5, px: 1.5, whiteSpace: "nowrap" }}>
                      View Records
                    </Button>
                    <Box sx={{ display: { xs: "none", sm: "flex" }, alignItems: "center" }}>
                      {isOpen ? <ExpandLessIcon color="primary" /> : <ExpandMoreIcon sx={{ color: "text.secondary" }} />}
                    </Box>
                  </Box>
                </Box>

                <Collapse in={isOpen} timeout={300}>
                  <Divider />
                  <Box sx={{ p: { xs: 2, sm: 3 }, bgcolor: alpha(theme.palette.background.default, 0.5) }}>
                    <Grid container spacing={3}>
                      <Grid item xs={12} lg={4}>
                        <Typography variant="caption" fontWeight={800} color="text.secondary" display="block" mb={1.5} letterSpacing={0.5} sx={{ textTransform: "uppercase" }}>Correction Nature</Typography>
                        {correctionData.length > 0 ? (
                          <ResponsiveContainer width="100%" height={160}>
                            <PieChart>
                              <Pie data={correctionData} innerRadius="45%" outerRadius="75%" paddingAngle={5} dataKey="value" stroke="none" style={{ cursor: "pointer" }} onClick={(entry) => { const defMap = { "Audit Risk": "AUDIT_RISK", "Data Missing": "DATA_MISSING", "Not Verified": "NOT_VERIFIED" }; onDrillDown && onDrillDown(v.vendor, defMap[entry.name]); }}>
                                {correctionData.map((d, idx) => <Cell key={idx} fill={d.color} />)}
                              </Pie>
                              <RTooltip content={<ChartTooltip />} wrapperStyle={{ zIndex: 1000 }} allowEscapeViewBox={{ x: true, y: true }} />
                              <Legend verticalAlign="bottom" height={30} iconType="circle" wrapperStyle={{ fontSize: 11, fontWeight: 700 }} formatter={(value, entry) => (<span style={{ color: theme.palette.text.primary }}>{value} {entry.payload?.percent ? `(${entry.payload.percent}%)` : ""}</span>)} />
                            </PieChart>
                          </ResponsiveContainer>
                        ) : <Typography variant="body2" color="text.disabled">No data</Typography>}
                      </Grid>
                      <Grid item xs={12} lg={4}>
                        <Typography variant="caption" fontWeight={800} color="text.secondary" display="block" mb={1.5} letterSpacing={0.5} sx={{ textTransform: "uppercase" }}>Risk Severity</Typography>
                        {riskData.length > 0 ? (
                          <ResponsiveContainer width="100%" height={160}>
                            <PieChart>
                              <Pie data={riskData} innerRadius="45%" outerRadius="75%" paddingAngle={5} dataKey="value" stroke="none" style={{ cursor: "pointer" }} onClick={(entry) => { const riskMap = { High: "High Risk", Medium: "Medium Risk", Low: "Low Risk" }; onDrillDown && onDrillDown(v.vendor, null, riskMap[entry.name]); }}>
                                {riskData.map((d, idx) => <Cell key={idx} fill={d.color} />)}
                              </Pie>
                              <RTooltip content={<ChartTooltip />} wrapperStyle={{ zIndex: 1000 }} allowEscapeViewBox={{ x: true, y: true }} />
                              <Legend verticalAlign="bottom" height={30} iconType="circle" wrapperStyle={{ fontSize: 11, fontWeight: 700 }} formatter={(value, entry) => (<span style={{ color: theme.palette.text.primary }}>{value} {entry.payload?.percent ? `(${entry.payload.percent}%)` : ""}</span>)} />
                            </PieChart>
                          </ResponsiveContainer>
                        ) : <Typography variant="body2" color="text.disabled">No data</Typography>}
                      </Grid>
                      <Grid item xs={12} lg={4}>
                        <Typography variant="caption" fontWeight={800} color="text.secondary" display="block" mb={1.5} letterSpacing={0.5} sx={{ textTransform: "uppercase" }}>Top Override Points</Typography>
                        {topPointsData.length > 0 ? (
                          <ResponsiveContainer width="100%" height={160}>
                            <BarChart data={topPointsData} layout="vertical" margin={{ top: 0, right: 50, left: 30, bottom: 0 }}>
                              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={tk.gridLine} />
                              <XAxis type="number" tick={{ fontSize: 10, fill: tk.textMuted, fontWeight: 600 }} tickLine={false} axisLine={false} />
                              <YAxis dataKey="name" type="category" tick={{ fontSize: 11, fill: theme.palette.text.primary, fontWeight: 800 }} axisLine={false} tickLine={false} width={50} />
                              <RTooltip content={<ChartTooltip />} cursor={{ fill: alpha(tk.accent, 0.05) }} wrapperStyle={{ zIndex: 1000 }} allowEscapeViewBox={{ x: true, y: true }} />
                              <Bar dataKey="Overrides" fill={tk.danger} radius={[0, 4, 4, 0]} barSize={16} style={{ cursor: "pointer" }} onClick={(data) => { if (data && data.ptNo) { onDrillDown && onDrillDown(v.vendor, null, null, data.ptNo); } }}>
                                <LabelList dataKey="Overrides" position="right" fontSize={11} fontWeight={800} fill={theme.palette.text.primary} />
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        ) : <Typography variant="body2" color="text.disabled">No data</Typography>}
                      </Grid>
                    </Grid>
                  </Box>
                </Collapse>
              </Card>
            );
          })}
        </Stack>
      </Box>
    </Box>
  );
};

// ─────────────────────────────────────────────────────────────
// SSBD ZIP EXPORT PANEL
// ─────────────────────────────────────────────────────────────
const SSBDExportPanel = () => {
  const theme = useTheme();
  const tk = useTokens(theme);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [selectedModule, setSelectedModule] = useState("ALL");
  const [loading, setLoading] = useState(false);

  const handleExport = async () => {
    if (fromDate && toDate && new Date(fromDate) > new Date(toDate)) {
      toast.error("'From' date cannot be after 'To' date.");
      return;
    }
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const ts = moment().format("YYYYMMDD_HHmmss");
      const payload = {};
      if (fromDate) payload.from = fromDate;
      if (toDate) payload.to = toDate;
      if (selectedModule !== "ALL") payload.module = selectedModule;
      const response = await fetch(
        `${import.meta.env.VITE_APP_BACKEND_URL}audit/export-json`,
        { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(payload) }
      );
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        if (response.status === 404) { toast.warn("No records found for the selected criteria."); return; }
        throw new Error(errData.message || `Export failed (${response.status})`);
      }
      const blob = await response.blob();
      const filename = `export_${selectedModule}_${ts}.zip`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      toast.success(`Downloaded archive: ${filename}`);
    } catch (err) {
      console.error("SSBD export error:", err);
      toast.error(err.message || "Export failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => { setFromDate(""); setToDate(""); setSelectedModule("ALL"); };

  return (
    <Card elevation={0} sx={{ borderRadius: 4, border: `1px solid ${alpha(tk.accent, 0.2)}`, borderLeft: `6px solid ${tk.accent}`, background: `linear-gradient(135deg, ${alpha(tk.accent, 0.02)} 0%, ${theme.palette.background.paper} 100%)`, overflow: "hidden", position: "relative" }}>
      <Box sx={{ position: "absolute", top: -40, right: -40, width: 200, height: 200, borderRadius: "50%", background: `radial-gradient(circle, ${alpha(tk.accent, 0.08)} 0%, transparent 70%)`, pointerEvents: "none" }} />
      <CardContent sx={{ p: 4, position: "relative" }}>
        <Stack direction="row" alignItems="center" gap={2} mb={1}>
          <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: alpha(tk.accent, 0.1), color: tk.accent, display: "flex", boxShadow: `inset 0 0 0 1px ${alpha(tk.accent, 0.2)}` }}>
            <StorageOutlinedIcon sx={{ fontSize: 24 }} />
          </Box>
          <Box>
            <Typography variant="h6" fontWeight={900} letterSpacing={-0.2}>Raw Data Export</Typography>
            <Chip label="SSBD Access Required" size="small" sx={{ mt: 0.5, height: 20, fontSize: "0.65rem", fontWeight: 800, bgcolor: alpha(tk.accent, 0.15), color: tk.accent, letterSpacing: 0.5, borderRadius: 1 }} />
          </Box>
        </Stack>
        <Typography variant="body2" color="text.secondary" fontWeight={500} display="block" mb={4} sx={{ maxWidth: "80%" }}>
          Download full AuditResult records packaged as a compressed ZIP file. Optionally filter by date range and/or module.
        </Typography>
        <Grid container spacing={3} alignItems="flex-end">
          <Grid item xs={12} sm={6} md={3}>
            <Typography variant="caption" fontWeight={800} color="text.secondary" display="block" mb={1} letterSpacing={0.5}>FROM DATE</Typography>
            <TextField size="small" type="date" fullWidth value={fromDate} onChange={(e) => setFromDate(e.target.value)} InputLabelProps={{ shrink: true }} inputProps={{ max: toDate || undefined }} sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2.5 }, bgcolor: theme.palette.background.default }} />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Typography variant="caption" fontWeight={800} color="text.secondary" display="block" mb={1} letterSpacing={0.5}>TO DATE</Typography>
            <TextField size="small" type="date" fullWidth value={toDate} onChange={(e) => setToDate(e.target.value)} InputLabelProps={{ shrink: true }} inputProps={{ min: fromDate || undefined }} sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2.5 }, bgcolor: theme.palette.background.default }} />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Typography variant="caption" fontWeight={800} color="text.secondary" display="block" mb={1} letterSpacing={0.5}>MODULE</Typography>
            <FormControl fullWidth size="small">
              <Select value={selectedModule} onChange={(e) => setSelectedModule(e.target.value)} sx={{ borderRadius: 2.5, bgcolor: theme.palette.background.default, fontWeight: 600 }}>
                <MenuItem value="ALL" sx={{ fontWeight: 600 }}><Stack direction="row" alignItems="center" gap={1.5}><Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: tk.accent }} />All Modules</Stack></MenuItem>
                {ALL_MODULES.map((m) => (<MenuItem key={m} value={m} sx={{ fontWeight: 600 }}><Stack direction="row" alignItems="center" gap={1.5}><Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: tk.info }} />{m}</Stack></MenuItem>))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Stack direction="row" gap={1.5}>
              <Button variant="contained" disableElevation fullWidth onClick={handleExport} disabled={loading} startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <CloudDownloadOutlinedIcon sx={{ fontSize: 20 }} />} sx={{ borderRadius: 2.5, fontWeight: 800, py: 1.1, bgcolor: tk.accent, "&:hover": { bgcolor: alpha(tk.accent, 0.85) }, boxShadow: `0 8px 24px -8px ${alpha(tk.accent, 0.5)}` }}>
                {loading ? "Zipping..." : "Export to ZIP"}
              </Button>
              {(fromDate || toDate || selectedModule !== "ALL") && (
                <Tooltip title="Clear filters" arrow>
                  <IconButton size="small" onClick={handleClear} disabled={loading} sx={{ borderRadius: 2.5, border: `1.5px solid ${theme.palette.divider}`, color: theme.palette.text.secondary, "&:hover": { color: tk.danger, borderColor: tk.danger, bgcolor: alpha(tk.danger, 0.05) } }}>
                    <CloseIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
            </Stack>
          </Grid>
        </Grid>
      </CardContent>
    </Card>
  );
};

// ─────────────────────────────────────────────────────────────
// MAIN DASHBOARD
// ─────────────────────────────────────────────────────────────
const Dashboard = () => {
  const theme = useTheme();
  const tk = useTokens(theme);
  const { dataViewType } = useSelector((state) => state.menu);

  const role = localStorage.getItem("role");
  const isFromSSBD = role === "fromSSBD";

  const [activeTab, setActiveTab] = useState("health");
  const [legacyData, setLegacyData] = useState({});
  const [execData, setExecData] = useState(null);
  const [defaultDocs, setDefaultDocs] = useState([]);
  const [ageingSummaryData, setAgeingSummaryData] = useState([]);
  const [accuracyTrendData, setAccuracyTrendData] = useState([]);
  const [accuracyTrendLoading, setAccuracyTrendLoading] = useState(false);
  const [slot, setSlot] = useState("monthly");
  const [selectedYear, setSelectedYear] = useState(CURRENT_YEAR);
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [anchorDate, setAnchorDate] = useState(null);
  const [anchorYear, setAnchorYear] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [execLoading, setExecLoading] = useState(false);

  const [modal, setModal] = useState({
    open: false,
    title: "",
    data: [],
    loading: false,
    pagination: null,
    summary: null,
    _endpoint: "",
    _extra: {},
    _activeBucket: null,
    _exportMeta: null,
  });

  const dateRangeRef = useRef({ start: null, end: null });

  // ─────────────────────────────────────────────────────────
  // PAYLOAD BUILDER
  // ─────────────────────────────────────────────────────────
  const getFetchPayloads = useCallback((type) => {
    let legacyBody = { type: dataViewType };
    let execStart, execEnd, trendSlot;

    if (type === "custom") {
      const s = new Date(customStart);
      const e = new Date(customEnd);
      if (isNaN(s) || isNaN(e) || s > e) return null;
      const fmt = dateRangeToLocal({ startDate: customStart, endDate: e });
      execStart = fmt.startDate;
      execEnd = fmt.endDate;
      legacyBody = { duration: "custom", startDate: fmt.startDate, endDate: fmt.endDate, type: dataViewType };
      trendSlot = resolveAccuracySlot("custom", execStart, execEnd);
    } else if (type === "monthly") {
      execStart = `${selectedYear}-01-01`;
      execEnd = `${selectedYear}-12-31`;
      legacyBody = { duration: "monthly", year: selectedYear, type: dataViewType };
      trendSlot = "monthly";
    } else {
      // weekly
      const now = new Date();
      const week = new Date();
      week.setDate(now.getDate() - 7);
      execStart = week.toISOString();
      execEnd = now.toISOString();
      legacyBody = { duration: "weekly", type: dataViewType };
      trendSlot = "daily";
    }

    dateRangeRef.current = { start: execStart, end: execEnd };

    return {
      legacyBody,
      execPayload: { startDate: execStart, endDate: execEnd, moduleType: dataViewType, slotType: trendSlot },
      ageingPayload: { moduleType: dataViewType, page: 1, limit: 1 },
    };
  }, [dataViewType, customStart, customEnd, selectedYear]);

  // ─────────────────────────────────────────────────────────
  // AUDIT RESULT TAB FETCHER
  // ─────────────────────────────────────────────────────────
  const fetchAuditResultTab = useCallback(async (legacyBody) => {
    setIsLoading(true);
    try {
      const [legacyRes, defaultDocRes] = await Promise.all([
        get("/dashboardAnalytics", legacyBody),
        get("/getVendorWiseDefaultDocumentCount", legacyBody),
      ]);
      const raw = legacyRes?.result || {};
      if (raw.range) {
        const s = new Date(raw.range.startDate);
        const e = new Date(raw.range.endDate);
        s.setHours(s.getHours() - 5, s.getMinutes() - 30);
        e.setHours(e.getHours() - 5, e.getMinutes() - 30);
        raw.range = { startDate: s, endDate: e };
      }
      setLegacyData(raw);
      setDefaultDocs(defaultDocRes?.defaultDocumentDetailsOverTime || []);
    } catch {
      toast.error("Failed to load Audit Result data");
    } finally {
      setIsLoading(false);
    }
  }, []);

  // ─────────────────────────────────────────────────────────
  // SYSTEM HEALTH TAB FETCHER
  // ─────────────────────────────────────────────────────────
  const fetchSystemHealthTab = useCallback(async (execPayload, ageingPayload) => {
    setIsLoading(true);
    setExecLoading(true);
    setAccuracyTrendLoading(true);
    try {
      const [execRes, ageingRes, accuracyRes] = await Promise.all([
        post("/reports/executive-summary", execPayload),
        post("/reports/ageing/unassigned", ageingPayload),
        post("/reports/accuracy-trend", execPayload),
      ]);
      if (execRes?.success) setExecData(execRes.data);
      if (ageingRes?.summary) setAgeingSummaryData(ageingRes.summary);
      if (accuracyRes?.success) setAccuracyTrendData(accuracyRes.data || []);
    } catch {
      setExecData(null);
      setAccuracyTrendData([]);
      toast.error("Failed to load System Health data");
    } finally {
      setExecLoading(false);
      setAccuracyTrendLoading(false);
      setIsLoading(false);
    }
  }, []);

  // ─────────────────────────────────────────────────────────
  // ✅ FIX: fetchAll — the missing function that ties everything together
  // Calling this updates `slot` state, which triggers the master useEffect below.
  // For "custom" it validates dates first and closes the date popper.
  // ─────────────────────────────────────────────────────────
  const fetchAll = useCallback((newSlot) => {
    if (newSlot === "custom") {
      // Validate custom dates before accepting
      if (!customStart || !customEnd) {
        toast.warn("Please select both a start and end date.");
        return;
      }
      const s = new Date(customStart);
      const e = new Date(customEnd);
      if (isNaN(s) || isNaN(e) || s > e) {
        toast.error("Start date must be before end date.");
        return;
      }
    }
    // Setting slot triggers the master useEffect to re-fetch
    setSlot(newSlot);
  }, [customStart, customEnd]);

  // ─────────────────────────────────────────────────────────
  // MASTER EFFECT — re-runs when tab, module, slot, or year changes
  // ─────────────────────────────────────────────────────────
  useEffect(() => {
    const payloads = getFetchPayloads(slot);
    if (!payloads) return;

    if (activeTab === "audit") {
      fetchAuditResultTab(payloads.legacyBody);
    } else if (activeTab === "health") {
      fetchSystemHealthTab(payloads.execPayload, payloads.ageingPayload);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, dataViewType, slot, selectedYear]);

  // ─────────────────────────────────────────────────────────
  // MODAL / DRILL DOWNS
  // ─────────────────────────────────────────────────────────
  const openReport = useCallback(
    async (endpoint, title, extra = {}, page = 1, exportMeta = null) => {
      setModal((m) => ({
        ...m,
        open: true,
        title,
        loading: true,
        data: [],
        pagination: null,
        summary: null,
        _endpoint: endpoint,
        _extra: extra,
        _exportMeta: exportMeta || null,
      }));
      try {
        const payload = {
          startDate: dateRangeRef.current.start,
          endDate: dateRangeRef.current.end,
          moduleType: dataViewType,
          page,
          limit: 200,
          ...extra,
        };
        const res = await post(`/reports${endpoint}`, payload);
        const rows = res?.data || [];
        if (!rows.length && !res?.summary?.length) {
          toast.info("No records found for this report");
          setModal((m) => ({ ...m, loading: false, data: [] }));
        } else {
          setModal((m) => ({ ...m, open: true, title, data: rows, loading: false, pagination: res?.pagination || null, summary: res?.summary || null }));
        }
      } catch {
        toast.error("Failed to load report");
        setModal((m) => ({ ...m, loading: false }));
      }
    },
    [dataViewType]
  );

  const buildExportMeta = useCallback(
    (reportSource, opts = {}) => ({
      dateRange: dateRangeRef.current,
      moduleType: dataViewType,
      reportSource,
      ...opts,
    }),
    [dataViewType]
  );

  const handleModalPageChange = useCallback(
    (newPage) => {
      openReport(modal._endpoint, modal.title, { ...modal._extra, ageBucket: modal._activeBucket }, newPage, modal._exportMeta);
    },
    [modal._endpoint, modal.title, modal._extra, modal._activeBucket, modal._exportMeta, openReport]
  );

  const handleBucketFilter = useCallback(
    (bucket) => {
      setModal((m) => ({ ...m, _activeBucket: bucket }));
      openReport(modal._endpoint, modal.title, { ...modal._extra, ageBucket: bucket }, 1, bucket ? { ...modal._exportMeta, ageBucket: bucket } : modal._exportMeta);
    },
    [modal._endpoint, modal.title, modal._extra, modal._exportMeta, openReport]
  );

  const openVendorDrillDown = useCallback(
    (vendorName, defectType = null, riskCategory = null, pointNo = null) => {
      if (defectType) {
        openReport("/performance/system", `${defectType.replace(/_/g, " ")} – ${vendorName}`, { defectType, vendorName, moduleType: dataViewType }, 1, buildExportMeta("system", { defectType, vendorName }));
        return;
      }
      if (riskCategory) {
        openReport("/performance/risk-category", `${riskCategory} – ${vendorName}`, { riskCategory, vendorName, moduleType: dataViewType }, 1, buildExportMeta("risk", { riskCategory, vendorName }));
        return;
      }
      if (pointNo) {
        openReport("/performance/system", `Point ${pointNo} Overrides – ${vendorName}`, { defectType: "ALL_DISCREPANCIES", breakdown: "point", pointNo: Number(pointNo), vendorName, moduleType: dataViewType }, 1, buildExportMeta("system", { defectType: "ALL_DISCREPANCIES", breakdown: "point", pointNo: Number(pointNo), vendorName }));
        return;
      }
      openReport("/vendor-deviation", `Deviation Records – ${vendorName}`, { vendorName, moduleType: dataViewType }, 1, buildExportMeta("vendor-deviation", { vendorName }));
    },
    [openReport, buildExportMeta, dataViewType]
  );

  const handleAccuracyBarClick = useCallback(
    (entry, type) => {
      if (!entry) return;
      const { minDate, maxDate, label } = entry;
      if (!minDate || !maxDate) return;
      const startD = moment(minDate).startOf("day").toISOString();
      const endD = moment(maxDate).endOf("day").toISOString();
      const defectType = type === "discrepancy" ? "ALL_DISCREPANCIES" : "ALL_SCANNED";
      const titlePrefix = type === "discrepancy" ? "System Discrepancies" : "All Closed Audit Points";
      openReport("/performance/system", `${titlePrefix} – ${label}`, { defectType, breakdown: "overall", startDate: startD, endDate: endD, moduleType: dataViewType }, 1, buildExportMeta("system", { defectType, startDate: startD, endDate: endD }));
    },
    [openReport, buildExportMeta, dataViewType]
  );

  // ─────────────────────────────────────────────────────────
  // DERIVED DATA
  // ─────────────────────────────────────────────────────────
  const { totalTransactions, totalResults } = useMemo(() => {
    const txns = legacyData?.no_of_transaction_over_time?.reduce((a, c) => a + (c.count || 0), 0) || 0;
    const res = legacyData?.risk_point_data?.reduce((a, c) => {
      const { NDOPointCount = 0, highRiskPointFailureCount = 0, lowRiskPointFailureCount = 0, mediumRiskPOintFailureCount = 0 } = c.count || {};
      return a + NDOPointCount + highRiskPointFailureCount + lowRiskPointFailureCount + mediumRiskPOintFailureCount;
    }, 0) || 0;
    return { totalTransactions: txns, totalResults: res };
  }, [legacyData]);

  const totalDefaults = useMemo(
    () => defaultDocs?.reduce((a, t) => a + (t.defaultDocumentDetails?.reduce((b, d) => b + d.count, 0) || 0), 0) || 0,
    [defaultDocs]
  );

  const stats = execData?.stats || {
    totalPointsChecked: 0, totalManuallyReviewed: 0, totalAltered: 0,
    totalAuditRisk: 0, totalDataMissing: 0, totalNotVerified: 0,
    sysTrueManualFalse: 0, sysFalseManualTrue: 0,
  };

  const systemAccuracy = useMemo(() => {
    if (!stats.totalPointsChecked) return 100;
    return (((stats.totalPointsChecked - stats.totalAltered) / stats.totalPointsChecked) * 100).toFixed(1);
  }, [stats]);

  const correctionNatureData = useMemo(() => {
    const total = stats.totalAuditRisk + stats.totalDataMissing + stats.totalNotVerified;
    const arr = [];
    if (stats.totalAuditRisk > 0) arr.push({ name: "Audit Risk", value: stats.totalAuditRisk, color: tk.danger });
    if (stats.totalDataMissing > 0) arr.push({ name: "Data Missing", value: stats.totalDataMissing, color: tk.warn });
    if (stats.totalNotVerified > 0) arr.push({ name: "Not Verified", value: stats.totalNotVerified, color: tk.info });
    if (total > 0) {
      let sum = 0;
      arr.forEach((d, i) => {
        if (i === arr.length - 1) { d.percent = Math.max(0, 100 - sum).toFixed(1); }
        else { const p = parseFloat(((d.value / total) * 100).toFixed(1)); d.percent = p.toFixed(1); sum += p; }
      });
    }
    return arr;
  }, [stats, tk]);

  const topPointsData = useMemo(
    () => (execData?.topAlteredPoints || []).map((p) => ({ name: `Pt ${p.pointNo}`, ptNo: p.pointNo, description: p.description, Overrides: p.count })),
    [execData]
  );

  const riskBreakdownData = useMemo(() => {
    const total = (execData?.riskSeverity || []).reduce((a, b) => a + b.count, 0);
    const arr = (execData?.riskSeverity || []).map((r) => ({
      name: r._id || "Unknown", value: r.count,
      color: r._id === "High Risk" ? tk.danger : r._id === "Medium Risk" ? tk.warn : tk.info,
    })).filter((d) => d.value > 0);
    if (total > 0) {
      let sum = 0;
      arr.forEach((d, i) => {
        if (i === arr.length - 1) { d.percent = Math.max(0, 100 - sum).toFixed(1); }
        else { const p = parseFloat(((d.value / total) * 100).toFixed(1)); d.percent = p.toFixed(1); sum += p; }
      });
    }
    return arr;
  }, [execData, tk]);

  const totalAgeingAll = ageingSummaryData.reduce((a, b) => a + b.count, 0);
  const getAgeingCount = (bucket) => ageingSummaryData.find((x) => x._id === bucket)?.count || 0;

  const isBPV = dataViewType === "BPV";
  const isBPVorPO = ["BPV", "PO"].includes(dataViewType);

  // ─────────────────────────────────────────────────────────
  // SYSTEM HEALTH TAB CONTENT
  // ─────────────────────────────────────────────────────────
  const systemHealthContent = useMemo(
    () => (
      <Fade in={activeTab === "health"} timeout={400}>
        <Box sx={{ display: activeTab === "health" ? "block" : "none" }}>
          {isFromSSBD && (<Box mb={5}><SSBDExportPanel /></Box>)}

          <SectionHeader icon={HealthAndSafetyIcon} title="System Intelligence" subtitle="Closed audit points by auditors vs. system corrections" accent={tk.accent} />

          <Grid container spacing={3} mb={5}>
            <Grid item xs={12} sm={4}>
              <StatCard icon={AssessmentOutlinedIcon} label="Total Closed Audit Points by Auditors" value={stats.totalPointsChecked} accent={tk.info} loading={execLoading}
                onClick={() => openReport("/performance/system", `Closed Audit Points (${dataViewType})`, { defectType: "ALL_SCANNED", breakdown: "overall" }, 1, buildExportMeta("system", { defectType: "ALL_SCANNED" }))} />
            </Grid>
            <Grid item xs={12} sm={4}>
              <StatCard icon={GppBadIcon} label="Auditor Overrides" value={stats.totalAltered} accent={tk.danger} sub="System result overridden" loading={execLoading}
                onClick={() => openReport("/performance/system", `All System Overrides (${dataViewType})`, { defectType: "ALL_DISCREPANCIES", breakdown: "overall" }, 1, buildExportMeta("system", { defectType: "ALL_DISCREPANCIES" }))} />
            </Grid>
            <Grid item xs={12} sm={4}>
              <StatCard icon={ShieldOutlinedIcon} label="System Accuracy" value={`${systemAccuracy}%`}
                accent={parseFloat(systemAccuracy) >= 90 ? tk.success : parseFloat(systemAccuracy) >= 75 ? tk.warn : tk.danger}
                sub={`${stats.totalAuditRisk} audit risk · ${stats.totalDataMissing} data missing · ${stats.totalNotVerified} not verified`} loading={execLoading} />
            </Grid>
          </Grid>

          <Grid container spacing={3} mb={4}>
            <Grid item xs={12}>
              <ChartCard
                title={`System Accuracy & Override Breakdown Trend — ${dataViewType}`}
                subtitle="Composition of 100% evaluated points · click any segment to drill into that period's records"
                action={<Chip label={slot === "weekly" ? "Last 7 days" : slot === "monthly" ? `Year ${selectedYear}` : "Custom range"} size="small" color="primary" variant="outlined" sx={{ fontWeight: 800, fontSize: "0.72rem" }} />}
              >
                <AccuracyTrendChart data={accuracyTrendData} loading={accuracyTrendLoading} onBarClick={handleAccuracyBarClick} />
              </ChartCard>
            </Grid>
          </Grid>

          <Grid container spacing={3} mb={6}>
            <Grid item xs={12} lg={4}>
              <ChartCard title="Correction Nature" subtitle="Click a segment to view records" height={320}
                action={correctionNatureData.length > 0 ? (
                  <Stack direction="column" gap={0.5} alignItems="flex-end">
                    {correctionNatureData.map((d) => (
                      <Stack key={d.name} direction="row" alignItems="center" gap={0.75}>
                        <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: d.color }} />
                        <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ fontSize: "0.68rem" }}>
                          {d.name}: <Box component="span" sx={{ color: d.color, fontWeight: 900 }}>{d.value} ({d.percent}%)</Box>
                        </Typography>
                      </Stack>
                    ))}
                  </Stack>
                ) : null}
              >
                {correctionNatureData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={correctionNatureData} innerRadius="52%" outerRadius="78%" paddingAngle={6} dataKey="value" stroke="none" style={{ cursor: "pointer" }}
                        onClick={(e) => {
                          const defMap = { "Audit Risk": "AUDIT_RISK", "Data Missing": "DATA_MISSING", "Not Verified": "NOT_VERIFIED" };
                          openReport("/performance/system", `${e.name} – Detail Log (${dataViewType})`, { defectType: defMap[e.name] || "ALL_DISCREPANCIES", breakdown: "overall" }, 1, buildExportMeta("system", { defectType: defMap[e.name] || "ALL_DISCREPANCIES" }));
                        }}>
                        {correctionNatureData.map((d, i) => (<Cell key={i} fill={d.color} style={{ filter: `drop-shadow(0 4px 8px ${alpha(d.color, 0.4)})` }} />))}
                      </Pie>
                      <RTooltip content={<ChartTooltip />} wrapperStyle={{ zIndex: 1000 }} allowEscapeViewBox={{ x: true, y: true }} />
                      <Legend verticalAlign="bottom" height={40} iconType="circle" wrapperStyle={{ fontSize: 12, fontWeight: 800 }} formatter={(value, entry) => (<span style={{ color: theme.palette.text.primary }}>{value} {entry.payload?.percent ? `(${entry.payload.percent}%)` : ""}</span>)} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <Stack height="100%" alignItems="center" justifyContent="center">
                    {execLoading ? <CircularProgress size={30} /> : <Stack alignItems="center" gap={1.5}><VerifiedOutlinedIcon sx={{ fontSize: 48, color: alpha(tk.success, 0.5) }} /><Typography variant="body2" color="text.secondary" fontWeight={700}>No corrections recorded</Typography></Stack>}
                  </Stack>
                )}
              </ChartCard>
            </Grid>

            <Grid item xs={12} lg={4}>
              <ChartCard title="Top Override Points" subtitle="Click any bar to drill into that point's records" height={320}>
                {topPointsData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={topPointsData} layout="vertical" margin={{ top: 5, right: 50, left: 40, bottom: 5 }}>
                      <defs>
                        <linearGradient id="barG" x1="0" y1="0" x2="1" y2="0">
                          <stop offset="0%" stopColor={tk.danger} />
                          <stop offset="100%" stopColor={alpha(tk.danger, 0.6)} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={tk.gridLine} />
                      <XAxis type="number" tick={{ fontSize: 11, fill: tk.textMuted, fontWeight: 600 }} tickLine={false} axisLine={false} />
                      <YAxis dataKey="name" type="category" tick={{ fontSize: 12, fill: theme.palette.text.primary, fontWeight: 800 }} axisLine={false} tickLine={false} width={55} />
                      <RTooltip content={<ChartTooltip />} cursor={{ fill: alpha(tk.accent, 0.05), radius: 4 }} allowEscapeViewBox={{ x: true, y: true }} wrapperStyle={{ zIndex: 1000 }} />
                      <Bar dataKey="Overrides" fill="url(#barG)" radius={[0, 6, 6, 0]} barSize={24} style={{ cursor: "pointer" }}
                        onClick={(data) => { if (data?.ptNo) { openReport("/performance/system", `Overrides for Point ${data.ptNo} (${dataViewType})`, { defectType: "ALL_DISCREPANCIES", breakdown: "point", pointNo: Number(data.ptNo) }, 1, buildExportMeta("system", { defectType: "ALL_DISCREPANCIES", breakdown: "point", pointNo: Number(data.ptNo) })); } }}>
                        <LabelList dataKey="Overrides" position="right" fontSize={12} fontWeight={800} fill={theme.palette.text.primary} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <Stack height="100%" alignItems="center" justifyContent="center">
                    {execLoading ? <CircularProgress size={30} /> : <Typography color="text.disabled" variant="body2" fontWeight={600}>No data</Typography>}
                  </Stack>
                )}
              </ChartCard>
            </Grid>

            <Grid item xs={12} lg={4}>
              <ChartCard title="Risk Severity of Overrides" subtitle="Click a segment to filter records by risk level" height={320}>
                {riskBreakdownData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={riskBreakdownData} innerRadius="50%" outerRadius="78%" paddingAngle={5} dataKey="value" stroke="none" style={{ cursor: "pointer" }}
                        onClick={(e) => openReport("/performance/risk-category", `${e.name} Overrides (${dataViewType})`, { riskCategory: e.name }, 1, buildExportMeta("risk", { riskCategory: e.name }))}>
                        {riskBreakdownData.map((d, i) => (<Cell key={i} fill={d.color} style={{ filter: `drop-shadow(0 4px 8px ${alpha(d.color, 0.4)})` }} />))}
                      </Pie>
                      <RTooltip content={<ChartTooltip />} wrapperStyle={{ zIndex: 1000 }} allowEscapeViewBox={{ x: true, y: true }} />
                      <Legend verticalAlign="bottom" height={40} iconType="circle" wrapperStyle={{ fontSize: 12, fontWeight: 800 }} formatter={(value, entry) => (<span style={{ color: theme.palette.text.primary }}>{value} {entry.payload?.percent ? `(${entry.payload.percent}%)` : ""}</span>)} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <Stack height="100%" alignItems="center" justifyContent="center">
                    {execLoading ? <CircularProgress size={30} /> : <Typography color="text.disabled" variant="body2" fontWeight={600}>No data</Typography>}
                  </Stack>
                )}
              </ChartCard>
            </Grid>
          </Grid>

          <SectionHeader icon={BusinessIcon} title="Vendor Deviation Analysis" subtitle="Per-vendor breakdown of top override points, risk severity, and correction nature — all charts clickable" accent={tk.warn} />
          <Box mb={6}>
            <ChartCard title="Vendor-wise Override Intelligence" subtitle="Expand any vendor · click pie segments or bars to drill into filtered records">
              <VendorDeviationPanel dateRange={dateRangeRef.current} dataViewType={dataViewType} onDrillDown={openVendorDrillDown} />
            </ChartCard>
          </Box>

          <SectionHeader icon={TrendingUpIcon} title="Reports & Data Extracts" subtitle="Click any report to open an interactive, searchable, filterable data table — with full Excel export" accent={theme.palette.secondary.main || tk.accent} />

          <Grid container spacing={3}>
            <Grid item xs={12} md={4}>
              <Card elevation={0} sx={{ height: "100%", borderRadius: 4, border: `1px solid ${alpha(theme.palette.divider, 0.6)}`, borderTop: `4px solid ${tk.accent}`, boxShadow: `0 4px 20px 0 ${alpha(theme.palette.common.black, 0.02)}` }}>
                <CardContent sx={{ p: 3.5 }}>
                  <Stack direction="row" alignItems="center" gap={1.5} mb={1}>
                    <AssessmentOutlinedIcon fontSize="small" sx={{ color: tk.accent }} />
                    <Typography variant="subtitle1" fontWeight={800} color="primary.main">Quality Control Logs</Typography>
                  </Stack>
                  <Typography variant="body2" color="text.secondary" fontWeight={500} display="block" mb={3}>Documents where system logic diverged from human review</Typography>
                  <Stack spacing={1.5}>
                    <ReportBtn label={`Master Discrepancy Log (${dataViewType})`} icon={GppBadIcon} variant="contained" onClick={() => openReport("/performance/system", `Master Discrepancy Log (${dataViewType})`, { defectType: "ALL_DISCREPANCIES", breakdown: "overall" }, 1, buildExportMeta("system", { defectType: "ALL_DISCREPANCIES" }))} />
                    <ReportBtn label={`Audit Risk Log (${dataViewType})`} onClick={() => openReport("/performance/system", `Audit Risk Log (${dataViewType})`, { defectType: "AUDIT_RISK", breakdown: "overall" }, 1, buildExportMeta("system", { defectType: "AUDIT_RISK" }))} />
                    <ReportBtn label={`Data Missing Log (${dataViewType})`} onClick={() => openReport("/performance/system", `Data Missing Log (${dataViewType})`, { defectType: "DATA_MISSING", breakdown: "overall" }, 1, buildExportMeta("system", { defectType: "DATA_MISSING" }))} />
                    <ReportBtn label={`Not Verified Log (${dataViewType})`} onClick={() => openReport("/performance/system", `Not Verified Log (${dataViewType})`, { defectType: "NOT_VERIFIED", breakdown: "overall" }, 1, buildExportMeta("system", { defectType: "NOT_VERIFIED" }))} />
                    <ReportBtn label={`Point-Wise Defect Totals (${dataViewType})`} onClick={() => openReport("/performance/system", `Point-Wise Defect Totals (${dataViewType})`, { defectType: "ALL_DISCREPANCIES", breakdown: "point" }, 1, buildExportMeta("system", { defectType: "ALL_DISCREPANCIES", breakdown: "point" }))} />
                    <ReportBtn label={`Vendor Override Analysis (${dataViewType})`} onClick={() => openReport("/performance/vendor", `Vendor Override Analysis (${dataViewType})`, {}, 1, buildExportMeta("vendor"))} />
                    <ReportBtn label={`Risk Category Classification (${dataViewType})`} onClick={() => openReport("/performance/risk-category", `Risk Category Report (${dataViewType})`, {}, 1, buildExportMeta("risk"))} />
                  </Stack>
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} md={4}>
              <Card elevation={0} sx={{ height: "100%", borderRadius: 4, border: `1px solid ${alpha(theme.palette.divider, 0.6)}`, borderTop: `4px solid ${tk.success}` }}>
                <CardContent sx={{ p: 3.5 }}>
                  <Stack direction="row" alignItems="center" gap={1.5} mb={1}>
                    <HourglassTopIcon fontSize="small" sx={{ color: tk.success }} />
                    <Typography variant="subtitle1" fontWeight={800} sx={{ color: tk.success }}>Operational Tracking</Typography>
                  </Stack>
                  <Typography variant="body2" color="text.secondary" fontWeight={500} display="block" mb={3}>Workflow health and document ageing across modules</Typography>
                  <Stack spacing={1.5}>
                    <ReportBtn label={`Unassigned Document Ageing (${dataViewType}) • ${totalAgeingAll}`} icon={HourglassTopIcon} color="success" variant="contained" onClick={() => openReport("/ageing/unassigned", `Unassigned Ageing (${dataViewType})`, { moduleType: dataViewType }, 1, buildExportMeta("ageing"))} />
                    <ReportBtn label={`0–7 Days Bucket • ${getAgeingCount("0–7 days")}`} color="success" onClick={() => openReport("/ageing/unassigned", `Ageing: 0–7 Days (${dataViewType})`, { moduleType: dataViewType, ageBucket: "0–7 days" }, 1, buildExportMeta("ageing", { ageBucket: "0–7 days" }))} />
                    <ReportBtn label={`8–15 Days Bucket • ${getAgeingCount("8–15 days")}`} color="success" onClick={() => openReport("/ageing/unassigned", `Ageing: 8–15 Days (${dataViewType})`, { moduleType: dataViewType, ageBucket: "8–15 days" }, 1, buildExportMeta("ageing", { ageBucket: "8–15 days" }))} />
                    <ReportBtn label={`16–30 Days Bucket • ${getAgeingCount("16–30 days")}`} color="success" onClick={() => openReport("/ageing/unassigned", `Ageing: 16–30 Days (${dataViewType})`, { moduleType: dataViewType, ageBucket: "16–30 days" }, 1, buildExportMeta("ageing", { ageBucket: "16–30 days" }))} />
                    <ReportBtn label={`> 30 Days (Critical) • ${getAgeingCount("> 30 days")}`} color="error" onClick={() => openReport("/ageing/unassigned", `Ageing: Over 30 Days (${dataViewType})`, { moduleType: dataViewType, ageBucket: "> 30 days" }, 1, buildExportMeta("ageing", { ageBucket: "> 30 days" }))} />
                  </Stack>
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} md={4}>
              <Card elevation={0} sx={{ height: "100%", borderRadius: 4, border: `1px solid ${isBPVorPO ? alpha(tk.warn, 0.5) : alpha(theme.palette.divider, 0.6)}`, borderTop: `4px solid ${tk.warn}`, bgcolor: isBPVorPO ? alpha(tk.warn, 0.02) : "transparent" }}>
                <CardContent sx={{ p: 3.5 }}>
                  <Stack direction="row" alignItems="center" gap={1.5} mb={1}>
                    <MonetizationOnOutlinedIcon fontSize="small" sx={{ color: tk.warn }} />
                    <Typography variant="subtitle1" fontWeight={800} sx={{ color: tk.warn }}>
                      Financial Edge Cases{" "}
                      {!isBPVorPO && <Chip label="BPV/PO only" size="small" variant="outlined" sx={{ ml: 1, fontSize: "0.65rem", height: 18, fontWeight: 700 }} />}
                    </Typography>
                  </Stack>
                  <Typography variant="body2" color="text.secondary" fontWeight={500} display="block" mb={3}>Highly sensitive BPV-specific compliance risk flags</Typography>
                  <Stack spacing={1.5}>
                    <Tooltip title={!isBPV ? "Switch module to BPV to enable this report" : ""} placement="top" arrow>
                      <span>
                        <ReportBtn label="Debit Note Non-Adjustment" icon={WarningAmberIcon} color="warning" variant="contained" disabled={!isBPV} onClick={() => openReport("/operational/risks", "Debit Note Non-Adjustment (BPV)", { reportType: "DEBIT_NOTE_ADJUSTMENT" }, 1, buildExportMeta("operational", { reportType: "DEBIT_NOTE_ADJUSTMENT" }))} />
                      </span>
                    </Tooltip>
                    <Tooltip title={!isBPV ? "Switch module to BPV to enable" : ""} placement="top" arrow>
                      <span>
                        <ReportBtn label="ITC Hit During Advance Payment" color="warning" disabled={!isBPV} onClick={() => openReport("/operational/risks", "ITC Hit During Advance (BPV)", { reportType: "ITC_AVAILED_ADVANCE" }, 1, buildExportMeta("operational", { reportType: "ITC_AVAILED_ADVANCE" }))} />
                      </span>
                    </Tooltip>
                    <Tooltip title={!isBPVorPO ? "Switch module to BPV or PO to enable" : ""} placement="top" arrow>
                      <span>
                        <ReportBtn label="Advance Against PO – Open Items" color="warning" disabled={!isBPVorPO} onClick={() => openReport("/operational/risks", "Advance Against PO – Open Items", { reportType: "ADVANCE_OPEN_ITEMS" }, 1, buildExportMeta("operational", { reportType: "ADVANCE_OPEN_ITEMS" }))} />
                      </span>
                    </Tooltip>
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </Box>
      </Fade>
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeTab, isFromSSBD, execLoading, stats, systemAccuracy, correctionNatureData, topPointsData, riskBreakdownData, dataViewType, isBPV, isBPVorPO, openReport, openVendorDrillDown, tk, theme, totalAgeingAll, ageingSummaryData, accuracyTrendData, accuracyTrendLoading, handleAccuracyBarClick, buildExportMeta, slot, selectedYear]
  );

  // ─────────────────────────────────────────────────────────
  // AUDIT RESULT TAB CONTENT
  // ─────────────────────────────────────────────────────────
  const auditResultContent = useMemo(
    () => (
      <Fade in={activeTab === "audit"} timeout={400}>
        <Box sx={{ display: activeTab === "audit" ? "block" : "none" }}>
          <SectionHeader icon={DashboardCustomizeIcon} title="Audit System Analytics" subtitle="Legacy audit scan metrics — risk breakdowns, transaction volumes and vendor defaults" accent={theme.palette.text.secondary} />
          <Grid container spacing={3}>
            <Grid item xs={12}><TransactionsChart count={totalTransactions} numberOfResults={totalResults} totalDefaults={totalDefaults} /></Grid>
            <Grid item xs={12} lg={6}><ChartCard title="Risk Level Analysis" subtitle="Severity distribution across scanned points"><RiskComboChart counts={legacyData?.risk_point_data || []} filterType={slot} startDate={legacyData?.range?.startDate} endDate={legacyData?.range?.endDate} /></ChartCard></Grid>
            <Grid item xs={12} lg={6}><ChartCard title="Scan Volume Over Time" subtitle="Transactions processed in the selected period"><TransactionOverTimeChart noOfTransactionsOverTime={legacyData?.no_of_transaction_over_time || []} slot={slot} startDate={legacyData?.range?.startDate} endDate={legacyData?.range?.endDate} /></ChartCard></Grid>
            <Grid item xs={12}><ChartCard title="Point Failure Intensity" subtitle="Frequency of failures per audit rule"><PointIntensityChart data={legacyData?.point_wise_failure_count || []} startDate={legacyData?.range?.startDate} endDate={legacyData?.range?.endDate} /></ChartCard></Grid>
            <Grid item xs={12}><ChartCard title="Category Breakdown" subtitle="Distribution of findings by item category"><InvoiceItemsCategoryChart categoryCounts={legacyData?.invoiceItemsCategoryCounts || {}} type={dataViewType} /></ChartCard></Grid>
            {dataViewType === "PJV" && <Grid item xs={12}><ChartCard title="Vendor Default Heatmap" subtitle="Concentration of defaults by vendor and rule"><HeatMap filterType={slot} defaultData={defaultDocs} startDate={legacyData?.range?.startDate} endDate={legacyData?.range?.endDate} /></ChartCard></Grid>}
          </Grid>
        </Box>
      </Fade>
    ),
    [activeTab, totalTransactions, totalResults, totalDefaults, legacyData, slot, defaultDocs, dataViewType, theme]
  );

  if (isLoading) return <Loader />;

  const dateLabel = legacyData?.range
    ? `${moment(legacyData.range.startDate).format("DD MMM YYYY")} – ${moment(legacyData.range.endDate).format("DD MMM YYYY")}`
    : "—";

  return (
    <Box sx={{ p: { xs: 2, md: 4 }, bgcolor: alpha(theme.palette.background.default, 0.4), minHeight: "100vh" }}>
      <Stack direction={{ xs: "column", xl: "row" }} justifyContent="space-between" alignItems={{ xs: "stretch", xl: "center" }} mb={5} gap={3}>
        <Box>
          <Stack direction="row" alignItems="center" gap={1.5} mb={0.5}>
            <Box sx={{ p: 1, bgcolor: tk.accent, borderRadius: 2, display: "flex", color: "white", boxShadow: `0 4px 12px ${alpha(tk.accent, 0.4)}` }}>
              <AutoGraphIcon sx={{ fontSize: 24 }} />
            </Box>
            <Typography variant="h4" fontWeight={900} letterSpacing={-0.5} color="text.primary">{dataViewType} Analytics</Typography>
          </Stack>
          <Stack direction="row" alignItems="center" gap={1} mt={1}>
            <EventNoteRoundedIcon sx={{ fontSize: 16, color: "text.secondary" }} />
            <Typography variant="body2" color="text.secondary" fontWeight={700}>{dateLabel}</Typography>
          </Stack>
        </Box>

        <Stack direction={{ xs: "column", lg: "row" }} alignItems="center" gap={3}>
          {/* Tab switcher */}
          <Box sx={{ display: "flex", p: 0.75, bgcolor: alpha(theme.palette.divider, 0.3), borderRadius: 3, border: `1px solid ${alpha(theme.palette.divider, 0.5)}`, backdropFilter: "blur(10px)", width: { xs: "100%", md: "auto" } }}>
            {[{ label: "Audit Result", key: "audit" }, { label: "System Health", key: "health" }].map(({ label, key }) => (
              <Button key={key} disableRipple onClick={() => setActiveTab(key)} sx={{ flex: { xs: 1, md: "none" }, py: 1, px: 3, borderRadius: 2.5, fontWeight: 800, textTransform: "none", color: activeTab === key ? tk.accent : "text.secondary", bgcolor: activeTab === key ? theme.palette.background.paper : "transparent", boxShadow: activeTab === key ? `0 4px 12px ${alpha(theme.palette.common.black, 0.08)}` : "none", transition: "all 0.3s ease", "&:hover": { bgcolor: activeTab === key ? theme.palette.background.paper : alpha(theme.palette.common.black, 0.02) } }}>{label}</Button>
            ))}
          </Box>

          {/* ✅ FIX: Slot picker buttons now correctly call fetchAll(key) */}
          <Paper elevation={0} sx={{ display: "flex", width: { xs: "100%", md: "auto" }, flexWrap: { xs: "wrap", sm: "nowrap" }, alignItems: "center", border: `1px solid ${alpha(theme.palette.divider, 0.7)}`, borderRadius: 3, overflow: "hidden" }}>
            {[
              { label: "Yearly", key: "monthly", action: (e) => setAnchorYear(e.currentTarget) },
              { label: "Weekly", key: "weekly",  action: () => fetchAll("weekly") },           // ✅ was missing fetchAll
              { label: "Custom", key: "custom",  action: (e) => setAnchorDate(e.currentTarget) },
            ].map(({ label, key, action }, i) => (
              <React.Fragment key={key}>
                {i > 0 && <Divider orientation="vertical" flexItem sx={{ display: { xs: "none", sm: "block" } }} />}
                <Button size="small" onClick={action} disableElevation
                  sx={{ flex: 1, px: 2.5, py: 1.5, borderRadius: 0, fontWeight: 800, fontSize: "0.8rem", color: slot === key ? tk.accent : "text.secondary", bgcolor: slot === key ? alpha(tk.accent, 0.1) : "transparent", "&:hover": { bgcolor: slot === key ? alpha(tk.accent, 0.15) : alpha(tk.accent, 0.05) }, transition: "all 0.2s" }}
                  endIcon={key === "custom" ? <EventNoteRoundedIcon sx={{ fontSize: 16 }} /> : null}>
                  {label}
                </Button>
              </React.Fragment>
            ))}
          </Paper>
        </Stack>
      </Stack>

      {auditResultContent}
      {systemHealthContent}

      <ReportModal
        open={modal.open}
        onClose={() => setModal((m) => ({ ...m, open: false }))}
        title={modal.title}
        data={modal.data}
        loading={modal.loading}
        pagination={modal.pagination}
        summary={modal.summary}
        activeBucket={modal._activeBucket}
        onPageChange={handleModalPageChange}
        onBucketFilter={handleBucketFilter}
        exportMeta={modal._exportMeta}
      />

      {/* Year picker popper */}
      <Popper sx={{ zIndex: 1300 }} open={Boolean(anchorYear)} anchorEl={anchorYear} placement="bottom-end" transition>
        {({ TransitionProps }) => (
          <Fade {...TransitionProps} timeout={250}>
            <Paper elevation={16} sx={{ p: 3, borderRadius: 3, minWidth: 240, border: `1px solid ${theme.palette.divider}`, mt: 1 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
                <Typography variant="subtitle2" fontWeight={800}>Select Year</Typography>
                <IconButton size="small" onClick={() => setAnchorYear(null)} sx={{ bgcolor: alpha(theme.palette.divider, 0.5) }}><CloseIcon fontSize="small" /></IconButton>
              </Stack>
              <Stack gap={2.5}>
                <FormControl fullWidth size="small">
                  <Select value={selectedYear} onChange={(e) => setSelectedYear(e.target.value)} sx={{ borderRadius: 2, fontWeight: 700 }}>
                    {YEARS.map((y) => <MenuItem key={y} value={y} sx={{ fontWeight: 700 }}>{y}</MenuItem>)}
                  </Select>
                </FormControl>
                {/* ✅ FIX: calls fetchAll("monthly") and closes popper */}
                <Button variant="contained" disableElevation sx={{ borderRadius: 2, fontWeight: 800, py: 1 }}
                  onClick={() => { fetchAll("monthly"); setAnchorYear(null); }}>
                  Apply Year
                </Button>
              </Stack>
            </Paper>
          </Fade>
        )}
      </Popper>

      {/* Custom date range popper */}
      <Popper sx={{ zIndex: 1300 }} open={Boolean(anchorDate)} anchorEl={anchorDate} placement="bottom-end" transition>
        {({ TransitionProps }) => (
          <Fade {...TransitionProps} timeout={250}>
            <Paper elevation={16} sx={{ p: 3, borderRadius: 3, minWidth: 260, border: `1px solid ${theme.palette.divider}`, mt: 1 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
                <Typography variant="subtitle2" fontWeight={800}>Custom Date Range</Typography>
                <IconButton size="small" onClick={() => setAnchorDate(null)} sx={{ bgcolor: alpha(theme.palette.divider, 0.5) }}><CloseIcon fontSize="small" /></IconButton>
              </Stack>
              <Stack gap={2.5}>
                <TextField size="small" label="Start Date" type="date" InputLabelProps={{ shrink: true }} value={customStart} onChange={(e) => setCustomStart(e.target.value)} fullWidth />
                <TextField size="small" label="End Date" type="date" InputLabelProps={{ shrink: true }} value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} fullWidth />
                {/* ✅ FIX: calls fetchAll("custom") with validation, then closes popper */}
                <Button variant="contained" disableElevation sx={{ borderRadius: 2, fontWeight: 800, py: 1 }}
                  onClick={() => { fetchAll("custom"); setAnchorDate(null); }}>
                  Apply Range
                </Button>
              </Stack>
            </Paper>
          </Fade>
        )}
      </Popper>
    </Box>
  );
};

export default Dashboard;