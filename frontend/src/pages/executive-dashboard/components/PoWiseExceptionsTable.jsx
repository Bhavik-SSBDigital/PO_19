import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Box,
  Paper,
  Skeleton,
  Typography,
  Chip,
  TextField,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  TableSortLabel,
  InputAdornment,
  alpha,
  Menu,
  MenuItem,
  Button,
  Tooltip as MuiTooltip,
  Collapse,
  LinearProgress,
} from "@mui/material";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import OpenInNewRoundedIcon from "@mui/icons-material/OpenInNewRounded";
import VisibilityRoundedIcon from "@mui/icons-material/VisibilityRounded";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import FactCheckRoundedIcon from "@mui/icons-material/FactCheckRounded";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import { useNavigate } from "react-router-dom";
import moment from "moment";
import { post } from "utils/axiosApi";
import { formatFileTimestamp } from "utils/formatFileTimestamp";
import { STATUS_META } from "./PoStatusSummaryTables";
import PoStatusDetailDialog from "./PoStatusDetailDialog";
import {
  SIDE_OPTIONS,
  bifurcate,
  matchPo,
  parsePoNumbers,
} from "./poListFilters";

const ROW_HEIGHT = 64;
const HEADER_HEIGHT = 52;
const FROZEN_COL_WIDTH = 140;
const BODY_MAX_HEIGHT = 560;

// ---- readable text colours (all pass contrast on white) --------------------
const TEXT_STRONG = "#0f172a";
const TEXT_BODY = "#1e293b";
const TEXT_SECONDARY = "#334155";
const TEXT_MUTED = "#475569"; // was #94a3b8 / #64748b - too faint
const TEXT_ZERO = "#64748b"; // a "0" is allowed to be quieter, still readable

// Header-level columns get the same indigo tint as the dashboard's Header panels
const HEADER_TINT = { bg: "#eef2ff", color: "#312e81" };
const LINE_TINT = { bg: "#f1f5f9", color: "#1e293b" };

const RIGHT_ALIGN_KEYS = new Set([
  "totalLineCount",
  "exceptionLineCount",
  "headerNotVerified",
  "headerClosedPoints",
  "headerPendingPoints",
  "lineNotVerified",
  "lineClosedPoints",
  "linePendingPoints",
  "headerCompliancePct",
  "lineCompliancePct",
  "compliancePct",
  "valueExposure",
]);

const STATUS_FILTERS = ["all", "pending", "in_review", "reviewed", "perfect"];

const SOURCE_META = {
  header: { label: "Header", color: "#3730a3" },
  line: { label: "Line", color: "#334155" },
  both: { label: "Header + Line", color: "#92400e" },
};

const InfoTip = ({ text, placement = "top" }) => {
  if (!text) return null;
  return (
    <MuiTooltip title={text} placement={placement} arrow enterTouchDelay={0}>
      <InfoOutlinedIcon
        sx={{
          fontSize: 20,
          ml: 0.75,
          color: TEXT_MUTED,
          cursor: "help",
          verticalAlign: "text-bottom",
          transition: "color 0.2s",
          "&:hover": { color: "#4f46e5" },
        }}
      />
    </MuiTooltip>
  );
};

const joinLineItems = (r) => {
  if (Array.isArray(r.lineItems) && r.lineItems.length) {
    return r.lineItems.length > 3
      ? `${r.lineItems.slice(0, 3).join(", ")} +${r.lineItems.length - 3}`
      : r.lineItems.join(", ");
  }
  return r.distinctLineItems ? `${r.distinctLineItems} item(s)` : "—";
};

const TruncatedCell = ({
  value,
  maxWidth = 160,
  mono = false,
  weight = 500,
  color = TEXT_SECONDARY,
}) => (
  <MuiTooltip title={value || "—"} enterDelay={400}>
    <Typography
      variant="body2"
      noWrap
      sx={{
        maxWidth,
        color,
        fontWeight: weight,
        fontSize: "0.9rem",
        fontFamily: mono
          ? "ui-monospace, SFMono-Regular, Menlo, monospace"
          : "inherit",
      }}
    >
      {value || "—"}
    </Typography>
  </MuiTooltip>
);

// tone: "bad" (red when > 0) | "good" (green when > 0) | undefined
const CountCell = ({ value, tone }) => {
  const v = value ?? 0;
  const color =
    v === 0
      ? TEXT_ZERO
      : tone === "bad"
        ? "#b91c1c"
        : tone === "good"
          ? "#047857"
          : TEXT_STRONG;
  return (
    <Typography
      variant="body2"
      sx={{
        fontWeight: 700,
        fontSize: "0.95rem",
        color,
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {v}
    </Typography>
  );
};

// A count that opens the PO's header / line detail when clicked.
const ClickCount = ({ children, onOpen, title }) => (
  <MuiTooltip title={title}>
    <Box
      component="span"
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      sx={{
        cursor: "pointer",
        borderRadius: 1,
        px: 0.75,
        mx: -0.75,
        "&:hover": { bgcolor: alpha("#4f46e5", 0.1) },
        "& p": { textDecoration: "underline", textDecorationStyle: "dotted" },
      }}
    >
      {children}
    </Box>
  </MuiTooltip>
);

const PctChip = ({ value }) => (
  <Chip
    size="small"
    label={value != null ? `${value}%` : "N/A"}
    sx={{
      height: 28,
      fontWeight: 700,
      fontSize: "0.82rem",
      bgcolor:
        value == null
          ? "grey.200"
          : value >= 80
            ? alpha("#059669", 0.14)
            : value >= 50
              ? alpha("#d97706", 0.16)
              : alpha("#dc2626", 0.14),
      color:
        value == null
          ? TEXT_SECONDARY
          : value >= 80
            ? "#047857"
            : value >= 50
              ? "#92400e"
              : "#b91c1c",
    }}
  />
);

const ProgressCell = ({ closedCount = 0, total = 0 }) => {
  const pct = total > 0 ? Math.round((closedCount / total) * 100) : 0;
  const barColor = pct === 100 ? "#059669" : pct > 0 ? "#4f46e5" : "#94a3b8";
  return (
    <Box
      sx={{ display: "flex", alignItems: "center", gap: 1.25, minWidth: 150 }}
    >
      <Box sx={{ flex: 1 }}>
        <LinearProgress
          variant="determinate"
          value={pct}
          sx={{
            height: 8,
            borderRadius: 4,
            bgcolor: alpha("#64748b", 0.2),
            "& .MuiLinearProgress-bar": { borderRadius: 4, bgcolor: barColor },
          }}
        />
      </Box>
      <Typography
        variant="caption"
        sx={{
          fontWeight: 700,
          fontSize: "0.85rem",
          color: TEXT_SECONDARY,
          whiteSpace: "nowrap",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {closedCount}/{total}
      </Typography>
    </Box>
  );
};

/**
 * Props
 *   rows         : the rows this table lists by default (e.g. the current
 *                  page / tab of the PO Data page, or every PO on the
 *                  dashboard).
 *   allRows      : OPTIONAL. EVERY PO (unpaginated, e.g. the dashboard's
 *                  poStatus.poRows or the full /reports/po-data `results`).
 *                  The status cards (counts + Header / Line / Both split)
 *                  are ALWAYS computed from this, so they always match the
 *                  dashboard. If you do not pass it, the table loads it
 *                  itself from /reports/po-status-summary (the same endpoint
 *                  the dashboard uses), so the numbers are identical.
 *   onSelectStatus(status, side) : OPTIONAL. Called when a card is clicked.
 */
const PoWiseExceptionsTable = ({
  rows = [],
  allRows,
  onSelectStatus,
  loading = false,
  onRowAction = () => {},
  title = "PO Exception-Wise List",
  infoText = "Click ANY row for its menu, or click a Header / Line count (or the Pending Because Of chip) to see that PO's exact header points and line items. Status is the same 4-way split as the PO Status Summary on the dashboard. Header columns are tinted indigo, line-item columns grey.",
  viewAllHref,
  restrictedNotice,
  showTotals = false,
  showProgress = false,
}) => {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [orderBy, setOrderBy] = useState("totalPendingPoints");
  const [order, setOrder] = useState("desc");
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [menuRow, setMenuRow] = useState(null);
  const [detail, setDetail] = useState(null); // { poNumber, tab }
  // advanced filters
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [poNumbersText, setPoNumbersText] = useState("");
  const [sideFilter, setSideFilter] = useState("any");
  const [groupFilter, setGroupFilter] = useState("");
  const poNumbers = useMemo(() => parsePoNumbers(poNumbersText), [poNumbersText]);

  // ---- FULL data set (for the cards) -------------------------------------
  // If the parent did not give us every PO, load them ourselves from the
  // SAME endpoint the dashboard uses, so the cards can never disagree.
  const [fetchedRows, setFetchedRows] = useState(null);
  const loadAllRows = useCallback(async () => {
    try {
      const res = await post("/reports/po-status-summary", {});
      setFetchedRows(res?.poRows || []);
    } catch (err) {
      console.error("Could not load all POs for the status cards:", err);
    }
  }, []);
  useEffect(() => {
    if (allRows === undefined) loadAllRows();
  }, [allRows, loadAllRows]);

  const summaryRows = useMemo(() => {
    if (allRows && allRows.length) return allRows;
    if (fetchedRows && fetchedRows.length) return fetchedRows;
    return rows;
  }, [allRows, fetchedRows, rows]);

  // "page" = list only the rows given in `rows`; "all" = list across EVERY PO
  // (set when a card is clicked or an advanced filter is used, so the list
  // always contains exactly the POs behind the number that was clicked).
  const [scope, setScope] = useState("page");

  const advancedActive =
    poNumbers.length > 0 || sideFilter !== "any" || groupFilter !== "";

  const useAll =
    (scope === "all" || advancedActive) &&
    summaryRows !== rows &&
    summaryRows.length > 0;
  const baseRows = useAll ? summaryRows : rows;

  const groupOptions = useMemo(
    () =>
      [...new Set(baseRows.map((r) => r.purchaseGroup || "Unassigned"))].sort(),
    [baseRows],
  );

  // Cards: ALWAYS over every PO.
  const split = useMemo(() => {
    const out = {};
    for (const k of ["pending", "in_review", "reviewed"])
      out[k] = bifurcate(summaryRows, k);
    return out;
  }, [summaryRows]);

  // counts for the status cards (always over ALL POs, ignoring search / page)
  const statusCounts = useMemo(() => {
    const c = {
      all: summaryRows.length,
      pending: 0,
      in_review: 0,
      reviewed: 0,
      perfect: 0,
    };
    summaryRows.forEach((r) => {
      if (c[r.poStatus] !== undefined) c[r.poStatus] += 1;
    });
    return c;
  }, [summaryRows]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const byStatus = baseRows.filter((r) =>
      matchPo(r, {
        status: statusFilter,
        side: sideFilter,
        group: groupFilter || undefined,
        poNumbers,
      }),
    );
    const base = !term
      ? byStatus
      : byStatus.filter((r) =>
          [
            r.poNumber,
            r.vendorName,
            r.vendorCode,
            r.poType,
            r.poTypeName,
            r.plant,
            r.plantName,
            r.purchaseGroup,
            r.purchaseGroupName,
            r.paymentTerm,
            r.paymentTermDescription,
            r.purchase_req,
            r.vendorGstin,
            r.taxCode,
            ...(r.lineItems || []),
          ]
            .filter(Boolean)
            .some((f) => String(f).toLowerCase().includes(term)),
        );
    const sorted = [...base].sort((a, b) => {
      const av = a[orderBy] ?? "";
      const bv = b[orderBy] ?? "";
      if (typeof av === "number" && typeof bv === "number")
        return order === "asc" ? av - bv : bv - av;
      return order === "asc"
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });
    return sorted;
  }, [
    baseRows,
    search,
    statusFilter,
    sideFilter,
    groupFilter,
    poNumbers,
    orderBy,
    order,
  ]);

  // Only draw a page of rows at a time (drawing ~2,000 rows made the
  // dashboard slow). Search / filter / sort still run over ALL rows.
  const PAGE = 50;
  const [limit, setLimit] = useState(PAGE);
  useEffect(() => {
    setLimit(PAGE);
  }, [
    search,
    statusFilter,
    sideFilter,
    groupFilter,
    poNumbersText,
    orderBy,
    order,
    baseRows,
  ]);
  const visible = useMemo(() => filtered.slice(0, limit), [filtered, limit]);

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

  const scrollColumns = useMemo(() => {
    const cols = [
      { key: "poDate", label: "PO Date", minWidth: 130 },
      { key: "poStatus", label: "PO Status", minWidth: 140 },
      { key: "pendingSource", label: "Pending Because Of", minWidth: 170 },

      // ---- HEADER level ----
      { key: "headerNotVerified", label: "Header · Not Verified", minWidth: 170, group: "header" },
      { key: "headerClosedPoints", label: "Header · Closed", minWidth: 150, group: "header" },
      { key: "headerPendingPoints", label: "Header · Pending", minWidth: 160, group: "header" },

      // ---- LINE level ----
      { key: "lineNotVerified", label: "Line · Not Verified", minWidth: 170, group: "line" },
      { key: "lineClosedPoints", label: "Line · Closed", minWidth: 150, group: "line" },
      { key: "linePendingPoints", label: "Line · Pending", minWidth: 160, group: "line" },

      {
        key: "lineItemsDisplay",
        label: "Line Item(s)",
        sortKey: "distinctLineItems",
        minWidth: 150,
      },
      { key: "purchase_req", label: "PR Number", minWidth: 130 },
      { key: "vendorName", label: "Vendor", minWidth: 200 },
      { key: "vendorGstin", label: "GSTIN", minWidth: 160 },
      { key: "plantName", label: "Plant", minWidth: 160 },
      { key: "poTypeName", label: "PO Type", minWidth: 160 },
      { key: "taxCode", label: "Tax Code", minWidth: 110 },
      { key: "purchaseGroupName", label: "Purchasing Group", minWidth: 180 },
      { key: "paymentTermDescription", label: "Payment Term", minWidth: 180 },
    ];
    if (showTotals) {
      cols.push({ key: "totalLineCount", label: "Total Lines", minWidth: 120 });
      cols.push({
        key: "exceptionLineCount",
        label: "Lines with Exceptions",
        minWidth: 180,
        group: "line",
      });
    }
    if (showProgress) {
      cols.push({
        key: "progress",
        label: "Line Closed Progress",
        sortKey: "closedPct",
        minWidth: 200,
        group: "line",
      });
    }
    cols.push({
      key: "headerCompliancePct",
      label: "Header · Compliance %",
      minWidth: 180,
      group: "header",
    });
    cols.push({
      key: "lineCompliancePct",
      label: "Line · Compliance %",
      minWidth: 170,
      group: "line",
    });
    cols.push({ key: "valueExposure", label: "Value Exposure (Line)", minWidth: 190, group: "line" });
    return cols;
  }, [showTotals, showProgress]);

  const tableMinWidth = useMemo(
    () => FROZEN_COL_WIDTH + 160 + scrollColumns.reduce((sum, c) => sum + c.minWidth, 0),
    [scrollColumns],
  );

  const renderCell = (col, r) => {
    switch (col.key) {
      case "poDate":
        return (
          <Typography variant="body2" sx={{ fontWeight: 500, fontSize: "0.9rem", color: TEXT_SECONDARY }}>
            {r.poDate ? moment(r.poDate).format("DD-MMM-YYYY") : "—"}
          </Typography>
        );
      case "poStatus": {
        const m = STATUS_META[r.poStatus];
        if (!m) return "—";
        return (
          <MuiTooltip title={m.help}>
            <Chip
              size="small"
              label={m.label}
              sx={{
                height: 28,
                fontWeight: 700,
                fontSize: "0.82rem",
                bgcolor: alpha(m.color, 0.14),
                color: m.color,
              }}
            />
          </MuiTooltip>
        );
      }
      case "pendingSource": {
        const m = SOURCE_META[r.pendingSource];
        if (!m)
          return (
            <Typography variant="body2" sx={{ color: TEXT_MUTED, fontSize: "0.9rem" }}>
              —
            </Typography>
          );
        return (
          <ClickCount
            title="Click to see where the pending points are"
            onOpen={() =>
              setDetail({
                poNumber: r.poNumber,
                tab: r.pendingSource === "line" ? "lines" : "header",
              })
            }
          >
            <Chip
              size="small"
              label={m.label}
              sx={{
                height: 28,
                fontWeight: 700,
                fontSize: "0.82rem",
                bgcolor: alpha(m.color, 0.14),
                color: m.color,
              }}
            />
          </ClickCount>
        );
      }
      case "headerNotVerified":
      case "lineNotVerified":
      case "headerClosedPoints":
      case "lineClosedPoints":
      case "headerPendingPoints":
      case "linePendingPoints": {
        const tone = col.key.endsWith("ClosedPoints")
          ? "good"
          : col.key.endsWith("PendingPoints")
            ? "bad"
            : undefined;
        const isHeader = col.key.startsWith("header");
        return (
          <ClickCount
            title={`Click to see this PO's ${isHeader ? "header points" : "line items"}`}
            onOpen={() =>
              setDetail({
                poNumber: r.poNumber,
                tab: isHeader ? "header" : "lines",
              })
            }
          >
            <CountCell value={r[col.key]} tone={tone} />
          </ClickCount>
        );
      }
      case "lineItemsDisplay":
        return (
          <MuiTooltip title={(r.lineItems || []).join(", ") || "—"}>
            <Chip
              size="small"
              label={joinLineItems(r)}
              sx={{
                height: 28,
                fontSize: "0.82rem",
                fontWeight: 600,
                color: TEXT_BODY,
                bgcolor: "grey.200",
              }}
            />
          </MuiTooltip>
        );
      case "purchase_req":
        return (
          <TruncatedCell value={r.purchase_req} maxWidth={115} weight={500} />
        );
      case "vendorName":
        return (
          <TruncatedCell
            value={r.vendorName || r.vendorCode}
            maxWidth={180}
            weight={600}
            color={TEXT_STRONG}
          />
        );
      case "vendorGstin":
        return <TruncatedCell value={r.vendorGstin} maxWidth={140} mono />;
      case "plantName":
        return <TruncatedCell value={r.plantName || r.plant} maxWidth={140} />;
      case "poTypeName":
        return (
          <TruncatedCell value={r.poTypeName || r.poType} maxWidth={140} />
        );
      case "taxCode":
        return <TruncatedCell value={r.taxCode} maxWidth={90} mono />;
      case "purchaseGroupName":
        return (
          <TruncatedCell
            value={r.purchaseGroupName || r.purchaseGroup}
            maxWidth={160}
          />
        );
      case "paymentTermDescription":
        return (
          <TruncatedCell
            value={r.paymentTermDescription || r.paymentTerm}
            maxWidth={160}
          />
        );
      case "totalLineCount":
        return (
          <Typography
            variant="body2"
            sx={{
              fontWeight: 600,
              fontSize: "0.95rem",
              color: TEXT_STRONG,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {r.totalLineCount ?? "—"}
          </Typography>
        );
      case "progress":
        return (
          <ProgressCell
            closedCount={r.closedLineCount ?? 0}
            total={r.totalLineCount ?? 0}
          />
        );
      case "exceptionLineCount":
        return (
          <Chip
            size="small"
            label={r.exceptionLineCount}
            sx={{
              height: 28,
              minWidth: 36,
              fontWeight: 700,
              fontSize: "0.82rem",
              bgcolor:
                r.exceptionLineCount > 0
                  ? alpha("#dc2626", 0.14)
                  : alpha("#059669", 0.14),
              color: r.exceptionLineCount > 0 ? "#b91c1c" : "#047857",
            }}
          />
        );
      case "headerCompliancePct":
        return <PctChip value={r.headerCompliancePct} />;
      case "lineCompliancePct":
        return <PctChip value={r.lineCompliancePct} />;
      case "valueExposure":
        return typeof r.valueExposure === "number"
          ? r.valueExposure.toLocaleString(undefined, {
              maximumFractionDigits: 0,
            })
          : (r.valueExposure ?? "—");
      default:
        return r[col.key] ?? "—";
    }
  };

  const headerCellSx = {
    height: HEADER_HEIGHT,
    bgcolor: "#f1f5f9",
    fontWeight: 800,
    fontSize: "0.88rem",
    color: TEXT_BODY,
    borderBottom: "2px solid",
    borderColor: "grey.300",
    whiteSpace: "nowrap",
    py: 0,
  };

  // Every body cell is pinned to the SAME height, and the first column is
  // sticky inside the SAME table - so rows can never go out of sync.
  const rowSx = {
    cursor: "pointer",
    "& > td": {
      height: ROW_HEIGHT,
      py: 0,
      boxSizing: "border-box",
      bgcolor: "#ffffff",
      fontSize: "0.9rem",
      color: TEXT_BODY,
      transition: "background-color 0.2s",
    },
    "&:hover > td": { bgcolor: "#eef2ff" },
    "&:last-child > td": { borderBottom: 0 },
  };

  const frozenSx = {
    position: "sticky",
    left: 0,
    zIndex: 2,
    width: FROZEN_COL_WIDTH,
    minWidth: FROZEN_COL_WIDTH,
    maxWidth: FROZEN_COL_WIDTH,
    borderRight: "1px solid",
    borderRightColor: "grey.300",
    boxShadow: "3px 0 6px -4px rgba(0,0,0,0.18)",
  };

  // Title chip text. Cards show totals over ALL POs; this chip says exactly
  // what the LIST below is showing.
  const titleChipLabel = useAll
    ? `${filtered.length.toLocaleString()} of ${summaryRows.length.toLocaleString()} POs (all pages)`
    : statusFilter === "all" && !search.trim()
      ? `${rows?.length ?? 0} POs on this page`
      : `${filtered.length} of ${rows?.length ?? 0} POs on this page`;

  return (
    <Paper
      elevation={0}
      sx={{
        p: 0,
        borderRadius: 4,
        background: "#ffffff",
        border: "1px solid",
        borderColor: "grey.200",
        boxShadow: "0 10px 30px -5px rgba(0,0,0,0.04)",
        overflow: "hidden",
      }}
    >
      <Box
        sx={{
          p: 3,
          pb: 1.5,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 2,
        }}
      >
        <Box>
          <Typography
            variant="h6"
            sx={{
              fontWeight: 800,
              color: TEXT_STRONG,
              display: "flex",
              alignItems: "center",
            }}
          >
            {title}
            <Chip
              size="small"
              label={titleChipLabel}
              sx={{
                ml: 2,
                height: 28,
                fontWeight: 700,
                fontSize: "0.82rem",
                bgcolor: alpha("#4f46e5", 0.12),
                color: "#3730a3",
              }}
            />
            <InfoTip text={infoText} />
          </Typography>
          {restrictedNotice && (
            <Typography
              variant="caption"
              sx={{
                color: TEXT_SECONDARY,
                fontWeight: 600,
                fontSize: "0.85rem",
                mt: 0.5,
                display: "block",
              }}
            >
              {restrictedNotice}
            </Typography>
          )}
        </Box>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1.5,
            flexWrap: "wrap",
          }}
        >
          <TextField
            size="small"
            placeholder="Search PO, vendor, PR, plant..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchRoundedIcon
                    fontSize="small"
                    sx={{ color: TEXT_MUTED }}
                  />
                </InputAdornment>
              ),
              sx: {
                borderRadius: 3,
                bgcolor: "#f1f5f9",
                fontSize: "0.95rem",
                color: TEXT_STRONG,
                "& input::placeholder": { color: TEXT_MUTED, opacity: 1 },
                "& fieldset": { borderColor: "grey.300" },
                "&:hover fieldset": { borderColor: "grey.500" },
              },
            }}
            sx={{ minWidth: 280 }}
          />
          {viewAllHref && (
            <Button
              size="small"
              endIcon={<ArrowForwardRoundedIcon fontSize="small" />}
              onClick={() => navigate(viewAllHref)}
              sx={{
                borderRadius: 2,
                fontWeight: 700,
                fontSize: "0.9rem",
                textTransform: "none",
                bgcolor: alpha("#4f46e5", 0.1),
                color: "#3730a3",
                "&:hover": { bgcolor: alpha("#4f46e5", 0.18) },
              }}
            >
              Open PO Data page
            </Button>
          )}
        </Box>
      </Box>

      {/* ---- STATUS CARDS (always counted over ALL POs, with Header / Line split) ---- */}
      <Box sx={{ px: 3, pb: 1.5, display: "flex", gap: 1.25, flexWrap: "wrap" }}>
        {STATUS_FILTERS.map((k) => {
          const meta =
            k === "all"
              ? { label: "All POs", tabLabel: "All POs", color: TEXT_STRONG, help: "Every PO" }
              : STATUS_META[k];
          const active = statusFilter === k;
          const sp = split[k];
          const pick = (side) => {
            setStatusFilter(k);
            setSideFilter(side);
            setScope("all");
            onSelectStatus?.(k, side);
          };
          return (
            <Box
              key={k}
              sx={{
                border: "1px solid",
                borderColor: active ? meta.color : "grey.300",
                bgcolor: active ? alpha(meta.color, 0.1) : "#fff",
                borderRadius: 2.5,
                px: 1.75,
                py: 1,
                minWidth: 160,
              }}
            >
              <MuiTooltip title={meta.help}>
                <Box
                  onClick={() => pick("any")}
                  sx={{ cursor: "pointer", display: "flex", alignItems: "baseline", gap: 1 }}
                >
                  <Typography sx={{ fontWeight: 800, color: meta.color, fontSize: "0.95rem" }}>
                    {meta.tabLabel}
                  </Typography>
                  <Typography sx={{ fontWeight: 800, fontSize: "1.15rem", color: TEXT_STRONG }}>
                    {(statusCounts[k] ?? 0).toLocaleString()}
                  </Typography>
                </Box>
              </MuiTooltip>
              {sp ? (
                <Box sx={{ display: "flex", gap: 1.25, mt: 0.5, flexWrap: "wrap" }}>
                  {[
                    ["header", "Header", "#3730a3", sp.header],
                    ["line", "Line", "#334155", sp.line],
                    ["both", "Both", "#92400e", sp.both],
                  ].map(([side, label, color, count]) => (
                    <Typography
                      key={side}
                      variant="caption"
                      onClick={() => count && pick(side)}
                      sx={{
                        fontWeight: 700,
                        fontSize: "0.85rem",
                        color: count ? color : TEXT_ZERO,
                        cursor: count ? "pointer" : "default",
                        "&:hover": count ? { textDecoration: "underline" } : undefined,
                      }}
                    >
                      {label} {count.toLocaleString()}
                    </Typography>
                  ))}
                </Box>
              ) : (
                <Typography variant="caption" sx={{ color: TEXT_MUTED, fontWeight: 600, fontSize: "0.85rem" }}>
                  {k === "perfect" ? "no issue anywhere" : "\u00a0"}
                </Typography>
              )}
            </Box>
          );
        })}
        <Button
          size="small"
          onClick={() => setShowAdvanced((v) => !v)}
          sx={{
            alignSelf: "center",
            textTransform: "none",
            fontWeight: 700,
            fontSize: "0.9rem",
            borderRadius: 2,
            color: advancedActive ? "#fff" : "#3730a3",
            bgcolor: advancedActive ? "#4f46e5" : alpha("#4f46e5", 0.1),
            "&:hover": { bgcolor: advancedActive ? "#4338ca" : alpha("#4f46e5", 0.18) },
          }}
        >
          Advanced filters{advancedActive ? " (on)" : ""}
        </Button>
      </Box>

      {/* Tells the reader the list is no longer limited to the current page */}
      {useAll && (
        <Box
          sx={{
            mx: 3,
            mb: 1.5,
            px: 2,
            py: 1,
            borderRadius: 2,
            bgcolor: alpha("#4f46e5", 0.08),
            display: "flex",
            alignItems: "center",
            gap: 1.5,
            flexWrap: "wrap",
          }}
        >
          <Typography variant="caption" sx={{ fontWeight: 700, fontSize: "0.88rem", color: "#312e81" }}>
            Showing matching POs across ALL pages, not just the current page.
          </Typography>
          {!advancedActive && (
            <Button
              size="small"
              onClick={() => {
                setScope("page");
                setStatusFilter("all");
                setSideFilter("any");
              }}
              sx={{ textTransform: "none", fontWeight: 700, fontSize: "0.88rem" }}
            >
              Back to this page
            </Button>
          )}
        </Box>
      )}

      <Collapse in={showAdvanced}>
        <Box
          sx={{
            mx: 3,
            mb: 2,
            p: 2,
            borderRadius: 3,
            bgcolor: "#f1f5f9",
            border: "1px solid",
            borderColor: "grey.300",
            display: "flex",
            gap: 2,
            flexWrap: "wrap",
            alignItems: "flex-start",
          }}
        >
          <TextField
            size="small"
            multiline
            minRows={2}
            maxRows={5}
            label="PO numbers (exact)"
            placeholder="Paste one or many PO numbers - separated by space, comma or new line"
            value={poNumbersText}
            onChange={(e) => setPoNumbersText(e.target.value)}
            helperText={poNumbers.length ? `${poNumbers.length} PO number(s)` : " "}
            FormHelperTextProps={{ sx: { color: TEXT_SECONDARY, fontSize: "0.82rem" } }}
            sx={{ minWidth: 340, flex: 1, "& input::placeholder, & textarea::placeholder": { color: TEXT_MUTED, opacity: 1 } }}
          />
          <TextField
            select
            size="small"
            label="Problem in"
            value={sideFilter}
            onChange={(e) => setSideFilter(e.target.value)}
            sx={{ minWidth: 250 }}
          >
            {SIDE_OPTIONS.map((o) => (
              <MenuItem key={o.value} value={o.value}>
                {o.label}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            size="small"
            label="Purchase group"
            value={groupFilter}
            onChange={(e) => setGroupFilter(e.target.value)}
            sx={{ minWidth: 190 }}
          >
            <MenuItem value="">All groups</MenuItem>
            {groupOptions.map((g) => (
              <MenuItem key={g} value={g}>
                {g}
              </MenuItem>
            ))}
          </TextField>
          <Button
            size="small"
            disabled={!advancedActive}
            onClick={() => {
              setPoNumbersText("");
              setSideFilter("any");
              setGroupFilter("");
            }}
            sx={{ textTransform: "none", fontWeight: 700, fontSize: "0.9rem", alignSelf: "center" }}
          >
            Clear
          </Button>
        </Box>
      </Collapse>

      {loading ? (
        <Box sx={{ p: 3 }}>
          <Skeleton
            variant="rectangular"
            height={320}
            sx={{ borderRadius: 2 }}
          />
        </Box>
      ) : (
        /* ONE scroll container, ONE table. The first column is sticky, so it
           stays put while the rest scroll sideways - and because every row is
           the same row, the vertical ends can never be out of sync. */
        <Box
          sx={{
            maxHeight: BODY_MAX_HEIGHT,
            overflow: "auto",
            position: "relative",
            borderTop: "1px solid",
            borderColor: "grey.200",
          }}
        >
          <Table
            stickyHeader
            size="medium"
            sx={{ minWidth: tableMinWidth, tableLayout: "auto" }}
          >
            <TableHead>
              <TableRow>
                <TableCell
                  sx={{
                    ...headerCellSx,
                    ...frozenSx,
                    top: 0,
                    zIndex: 4, // above both sticky header cells and sticky column
                  }}
                >
                  <TableSortLabel
                    active={orderBy === "poNumber"}
                    direction={orderBy === "poNumber" ? order : "asc"}
                    onClick={() => toggleSort("poNumber")}
                  >
                    PO Number
                  </TableSortLabel>
                </TableCell>
                <TableCell sx={{ ...headerCellSx, minWidth: 160 }}>
                  <TableSortLabel active={orderBy === "source_file_ts"} direction={orderBy === "source_file_ts" ? order : "asc"} onClick={() => toggleSort("source_file_ts")}>File Timestamp</TableSortLabel>
                </TableCell>
                {scrollColumns.map((c) => {
                  const tint =
                    c.group === "header"
                      ? HEADER_TINT
                      : c.group === "line"
                        ? LINE_TINT
                        : null;
                  return (
                    <TableCell
                      key={c.key}
                      align={RIGHT_ALIGN_KEYS.has(c.key) ? "right" : "left"}
                      sx={{
                        ...headerCellSx,
                        minWidth: c.minWidth,
                        ...(tint && { bgcolor: tint.bg, color: tint.color }),
                        ...(RIGHT_ALIGN_KEYS.has(c.key) && { pr: 3 }),
                      }}
                    >
                      <TableSortLabel
                        active={orderBy === (c.sortKey || c.key)}
                        direction={
                          orderBy === (c.sortKey || c.key) ? order : "asc"
                        }
                        onClick={() => toggleSort(c.sortKey || c.key)}
                      >
                        {c.label}
                      </TableSortLabel>
                    </TableCell>
                  );
                })}
              </TableRow>
            </TableHead>
            <TableBody>
              {visible.map((r) => (
                <TableRow
                  key={`${r.poNumber}:${r.source_file_ts || ""}`}
                  hover
                  sx={rowSx}
                  onClick={(e) => openRowMenu(e, r)}
                >
                  <TableCell
                    sx={{
                      ...frozenSx,
                      fontWeight: 700,
                      fontSize: "0.95rem",
                      color: TEXT_STRONG,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {r.poNumber}
                  </TableCell>
                  <TableCell sx={{ whiteSpace: "nowrap", fontSize: 12 }}>{formatFileTimestamp(r.source_file_ts)}</TableCell>
                  {scrollColumns.map((c) => (
                    <TableCell
                      key={c.key}
                      align={RIGHT_ALIGN_KEYS.has(c.key) ? "right" : "left"}
                      sx={{
                        whiteSpace: "nowrap",
                        ...(RIGHT_ALIGN_KEYS.has(c.key) && {
                          pr: 3,
                          fontVariantNumeric: "tabular-nums",
                        }),
                        ...(c.key === "valueExposure" && {
                          fontWeight: 600,
                          color: TEXT_STRONG,
                        }),
                      }}
                    >
                      {renderCell(c, r)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow sx={{ height: ROW_HEIGHT }}>
                  <TableCell
                    colSpan={scrollColumns.length + 1}
                    align="center"
                    sx={{ color: TEXT_SECONDARY, fontSize: "0.95rem" }}
                  >
                    No matching POs found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Box>
      )}

      {!loading && filtered.length > visible.length && (
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 1.5,
            py: 1.5,
            borderTop: "1px solid",
            borderColor: "grey.200",
          }}
        >
          <Typography variant="caption" sx={{ color: TEXT_SECONDARY, fontWeight: 600, fontSize: "0.88rem" }}>
            Showing {visible.length} of {filtered.length} POs
          </Typography>
          <Button size="small" sx={{ fontSize: "0.88rem" }} onClick={() => setLimit((l) => l + 100)}>
            Show 100 more
          </Button>
          <Button size="small" sx={{ fontSize: "0.88rem" }} onClick={() => setLimit(filtered.length)}>
            Show all
          </Button>
        </Box>
      )}

      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={closeRowMenu}
        elevation={3}
        sx={{ "& .MuiPaper-root": { borderRadius: 2, mt: 0.5 } }}
      >
        <MenuItem
          onClick={() => {
            setDetail({ poNumber: menuRow?.poNumber, tab: "header" });
            closeRowMenu();
          }}
        >
          <FactCheckRoundedIcon
            fontSize="small"
            sx={{ mr: 1.25, color: "#4338ca" }}
          />
          <Typography variant="body2" sx={{ fontWeight: 700, fontSize: "0.95rem", color: TEXT_STRONG }}>
            View Header Points
          </Typography>
        </MenuItem>
        <MenuItem
          onClick={() => {
            setDetail({ poNumber: menuRow?.poNumber, tab: "lines" });
            closeRowMenu();
          }}
        >
          <FactCheckRoundedIcon
            fontSize="small"
            sx={{ mr: 1.25, color: TEXT_SECONDARY }}
          />
          <Typography variant="body2" sx={{ fontWeight: 700, fontSize: "0.95rem", color: TEXT_STRONG }}>
            View Line Items &amp; Points
          </Typography>
        </MenuItem>
        <MenuItem
          onClick={() => {
            onRowAction(menuRow, "breakdown");
            closeRowMenu();
          }}
        >
          <FactCheckRoundedIcon
            fontSize="small"
            sx={{ mr: 1.25, color: TEXT_SECONDARY }}
          />
          <Typography variant="body2" sx={{ fontWeight: 500, fontSize: "0.95rem", color: TEXT_BODY }}>
            View Line Item Breakdown
          </Typography>
        </MenuItem>
        <MenuItem
          onClick={() => {
            onRowAction(menuRow, "newtab");
            closeRowMenu();
          }}
        >
          <OpenInNewRoundedIcon
            fontSize="small"
            sx={{ mr: 1.25, color: TEXT_SECONDARY }}
          />
          <Typography variant="body2" sx={{ fontWeight: 500, fontSize: "0.95rem", color: TEXT_BODY }}>
            Open First Line Item in New Tab
          </Typography>
        </MenuItem>
        <MenuItem
          onClick={() => {
            onRowAction(menuRow, "modal");
            closeRowMenu();
          }}
        >
          <VisibilityRoundedIcon
            fontSize="small"
            sx={{ mr: 1.25, color: TEXT_SECONDARY }}
          />
          <Typography variant="body2" sx={{ fontWeight: 500, fontSize: "0.95rem", color: TEXT_BODY }}>
            View First Line Item Details
          </Typography>
        </MenuItem>
      </Menu>
      <PoStatusDetailDialog
        detail={detail}
        onClose={() => setDetail(null)}
        version={rows}
        onChanged={() => {
          // a remark / check was saved: refresh the card numbers too
          if (allRows === undefined) loadAllRows();
        }}
        onWork={(w) =>
          onRowAction(
            { poNumber: w.poNumber, lineItems: [] },
            w.lineItem ? "modal" : "breakdown",
            w,
          )
        }
      />
    </Paper>
  );
};

export default PoWiseExceptionsTable;
