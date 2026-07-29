import { useCallback, useMemo, useRef, useState } from "react";
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
  LinearProgress,
} from "@mui/material";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import OpenInNewRoundedIcon from "@mui/icons-material/OpenInNewRounded";
import VisibilityRoundedIcon from "@mui/icons-material/VisibilityRounded";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import FactCheckRoundedIcon from "@mui/icons-material/FactCheckRounded";
import { useNavigate } from "react-router-dom";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";

const ROW_HEIGHT = 64; // fixed row height, shared by BOTH tables so rows line up exactly
const HEADER_HEIGHT = 48; // fixed header height, shared by both tables
const FROZEN_COL_WIDTH = 130;
const BODY_MAX_HEIGHT = 500;

// Columns that should be right-aligned + get numeric styling, regardless
// of whether they're present (only shown when showTotals is on, except
// exceptionLineCount/valueExposure which are always shown).
const RIGHT_ALIGN_KEYS = new Set([
  "totalLineCount",
  "exceptionLineCount",
  "compliancePct",
  "valueExposure",
]);

const InfoTip = ({ text, placement = "top" }) => {
  if (!text) return null;
  return (
    <MuiTooltip title={text} placement={placement} arrow enterTouchDelay={0}>
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

// Single-line value with ellipsis + tooltip for anything that might overflow
// its column (long vendor names, purchasing-group descriptions, etc).
// `mono` renders in a monospace face, useful for codes like GSTIN/Tax Code
// where consistent character width makes scanning easier.
const TruncatedCell = ({
  value,
  maxWidth = 160,
  mono = false,
  weight = 500,
  color = "#475569",
}) => (
  <MuiTooltip title={value || "—"} enterDelay={400}>
    <Typography
      variant="body2"
      noWrap
      sx={{
        maxWidth,
        color,
        fontWeight: weight,
        fontFamily: mono
          ? "ui-monospace, SFMono-Regular, Menlo, monospace"
          : "inherit",
        fontSize: mono ? "0.8125rem" : "inherit",
      }}
    >
      {value || "—"}
    </Typography>
  </MuiTooltip>
);

// "20/40 closed" progress bar + label, used by the Review Progress column
// (showProgress). Distinct from the Compliance % chip — this is workflow
// closure progress (per-line VerificationWorkflow.currentStatus), not audit
// point verification.
const ProgressCell = ({ closedCount = 0, total = 0 }) => {
  const pct = total > 0 ? Math.round((closedCount / total) * 100) : 0;
  const barColor = pct === 100 ? "#059669" : pct > 0 ? "#4f46e5" : "#cbd5e1";
  return (
    <Box
      sx={{ display: "flex", alignItems: "center", gap: 1.25, minWidth: 150 }}
    >
      <Box sx={{ flex: 1 }}>
        <LinearProgress
          variant="determinate"
          value={pct}
          sx={{
            height: 6,
            borderRadius: 3,
            bgcolor: alpha("#94a3b8", 0.15),
            "& .MuiLinearProgress-bar": { borderRadius: 3, bgcolor: barColor },
          }}
        />
      </Box>
      <Typography
        variant="caption"
        sx={{
          fontWeight: 700,
          color: "#475569",
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
 * Shared PO-Wise table, used in two places:
 *  - Executive Dashboard (embedded, exceptions-only data from
 *    getExecutiveSummary): rendered exactly as before — no new prop is
 *    passed there, so this component's default output is unchanged.
 *  - Standalone PO Data page (/po-data): passes `showTotals` so every PO
 *    (compliant or not) gets a "Total Lines" and "Compliance %" column
 *    alongside the existing "Exceptions" count, and `showProgress` for the
 *    Open/Closed tabs so each PO shows its closed-vs-total line-item
 *    progress ("20/40 closed").
 *
 * FROZEN COLUMN IMPLEMENTATION NOTE:
 * Earlier versions used CSS `position: sticky` on a <td>, which triggers a
 * known Chromium repaint bug (stale-frame "ghosting" + jitter) when combined
 * with a horizontally-scrolling table. This version avoids that entirely by
 * rendering the PO Number column as its own small, non-scrolling-horizontally
 * table sitting next to a normal scrollable table for the rest of the
 * columns. The two tables share an identical ROW_HEIGHT/HEADER_HEIGHT so
 * rows always line up, and their vertical scroll position is kept in sync
 * in JS.
 */
const PoWiseExceptionsTable = ({
  rows = [],
  loading = false,
  onRowAction = () => {},
  title = "PO-Wise Exceptions",
  infoText = "Click ANY row to open its PO Data & Results — in a new tab or right here in a preview.",
  viewAllHref,
  restrictedNotice,
  // NEW — opt-in only. Leave false (default) for the dashboard's embedded
  // table so its columns/behavior stay exactly as they were.
  showTotals = false,
  // NEW — opt-in. Adds the "Review Progress" column (closedLineCount /
  // totalLineCount, from the backend's per-PO workflow-closure rollup).
  // Used by the Open/Closed tabs on the standalone PO Data page.
  showProgress = false,
}) => {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [orderBy, setOrderBy] = useState("exceptionLineCount");
  const [order, setOrder] = useState("desc");
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [menuRow, setMenuRow] = useState(null);

  const frozenScrollRef = useRef(null);
  const mainScrollRef = useRef(null);
  const isSyncingRef = useRef(false);

  // Keep the two tables' vertical scroll positions in sync, regardless of
  // which one the user's cursor/wheel is actually over.
  const handleFrozenScroll = useCallback(() => {
    if (isSyncingRef.current) {
      isSyncingRef.current = false;
      return;
    }
    if (!frozenScrollRef.current || !mainScrollRef.current) return;
    isSyncingRef.current = true;
    mainScrollRef.current.scrollTop = frozenScrollRef.current.scrollTop;
  }, []);

  const handleMainScroll = useCallback(() => {
    if (isSyncingRef.current) {
      isSyncingRef.current = false;
      return;
    }
    if (!frozenScrollRef.current || !mainScrollRef.current) return;
    isSyncingRef.current = true;
    frozenScrollRef.current.scrollTop = mainScrollRef.current.scrollTop;
  }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const base = !term
      ? rows
      : rows.filter((r) =>
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

  // Columns rendered in the SCROLLABLE (right-hand) table only.
  // PO Number lives in its own frozen table below, not in this list.
  // "Total Lines" and "Compliance %" only appear when showTotals is true;
  // "Review Progress" only appears when showProgress is true — the
  // dashboard's call site never passes either, so its column set is
  // exactly what it was before.
  const scrollColumns = useMemo(() => {
    const cols = [
      {
        key: "lineItemsDisplay",
        label: "Line Item(s)",
        sortKey: "distinctLineItems",
        minWidth: 130,
      },
      { key: "purchase_req", label: "PR Number", minWidth: 120 },
      { key: "vendorName", label: "Vendor", minWidth: 190 },
      { key: "vendorGstin", label: "GSTIN", minWidth: 150 },
      { key: "plantName", label: "Plant", minWidth: 150 },
      { key: "poTypeName", label: "PO Type", minWidth: 150 },
      { key: "taxCode", label: "Tax Code", minWidth: 100 },
      { key: "purchaseGroupName", label: "Purchasing Group", minWidth: 170 },
      { key: "paymentTermDescription", label: "Payment Term", minWidth: 170 },
    ];
    if (showTotals) {
      cols.push({ key: "totalLineCount", label: "Total Lines", minWidth: 110 });
    }
    if (showProgress) {
      cols.push({
        key: "progress",
        label: "Review Progress",
        sortKey: "closedPct",
        minWidth: 180,
      });
    }
    cols.push({
      key: "exceptionLineCount",
      label: "Exceptions",
      minWidth: 110,
    });
    if (showTotals) {
      cols.push({ key: "compliancePct", label: "Compliance %", minWidth: 130 });
    }
    cols.push({ key: "valueExposure", label: "Value Exposure", minWidth: 150 });
    return cols;
  }, [showTotals, showProgress]);

  // Sum of column widths drives the scrollable table's min-width, so it
  // stays correct whichever combination of showTotals/showProgress is on.
  const tableMinWidth = useMemo(
    () => scrollColumns.reduce((sum, c) => sum + c.minWidth, 0),
    [scrollColumns],
  );

  // Data-driven cell renderer so the body always matches scrollColumns,
  // whether or not the extra showTotals/showProgress columns are present.
  const renderCell = (col, r) => {
    switch (col.key) {
      case "lineItemsDisplay":
        return (
          <MuiTooltip title={(r.lineItems || []).join(", ") || "—"}>
            <Chip
              size="small"
              label={joinLineItems(r)}
              sx={{
                height: 24,
                fontSize: "0.75rem",
                fontWeight: 600,
                bgcolor: "grey.100",
              }}
            />
          </MuiTooltip>
        );
      case "purchase_req":
        return (
          <TruncatedCell value={r.purchase_req} maxWidth={110} weight={500} />
        );
      case "vendorName":
        return (
          <TruncatedCell
            value={r.vendorName || r.vendorCode}
            maxWidth={175}
            weight={600}
            color="#0f172a"
          />
        );
      case "vendorGstin":
        return <TruncatedCell value={r.vendorGstin} maxWidth={135} mono />;
      case "plantName":
        return <TruncatedCell value={r.plantName || r.plant} maxWidth={135} />;
      case "poTypeName":
        return (
          <TruncatedCell value={r.poTypeName || r.poType} maxWidth={135} />
        );
      case "taxCode":
        return <TruncatedCell value={r.taxCode} maxWidth={85} mono />;
      case "purchaseGroupName":
        return (
          <TruncatedCell
            value={r.purchaseGroupName || r.purchaseGroup}
            maxWidth={155}
          />
        );
      case "paymentTermDescription":
        return (
          <TruncatedCell
            value={r.paymentTermDescription || r.paymentTerm}
            maxWidth={155}
          />
        );
      case "totalLineCount":
        return (
          <Typography
            variant="body2"
            sx={{
              fontWeight: 600,
              color: "#0f172a",
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
              height: 24,
              minWidth: 32,
              fontWeight: 700,
              fontSize: "0.75rem",
              bgcolor:
                r.exceptionLineCount > 0
                  ? alpha("#dc2626", 0.1)
                  : alpha("#059669", 0.1),
              color: r.exceptionLineCount > 0 ? "#dc2626" : "#059669",
            }}
          />
        );
      case "compliancePct":
        return (
          <Chip
            size="small"
            label={r.compliancePct != null ? `${r.compliancePct}%` : "N/A"}
            sx={{
              height: 24,
              fontWeight: 700,
              fontSize: "0.75rem",
              bgcolor:
                r.compliancePct == null
                  ? "grey.100"
                  : r.compliancePct >= 80
                    ? alpha("#059669", 0.1)
                    : r.compliancePct >= 50
                      ? alpha("#d97706", 0.1)
                      : alpha("#dc2626", 0.1),
              color:
                r.compliancePct == null
                  ? "text.secondary"
                  : r.compliancePct >= 80
                    ? "#059669"
                    : r.compliancePct >= 50
                      ? "#d97706"
                      : "#dc2626",
            }}
          />
        );
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
    bgcolor: "#f8fafc",
    fontWeight: 700,
    color: "#475569",
    borderBottom: "2px solid",
    borderColor: "grey.100",
    whiteSpace: "nowrap",
    py: 0,
  };

  const rowSx = {
    height: ROW_HEIGHT,
    cursor: "pointer",
    "&:last-child td": { border: 0 },
    transition: "background-color 0.2s",
    "&:hover": { bgcolor: alpha("#4f46e5", 0.04) },
  };

  return (
    <Paper
      elevation={0}
      sx={{
        p: 0,
        borderRadius: 4,
        background: "#ffffff",
        border: "1px solid",
        borderColor: "grey.100",
        boxShadow: "0 10px 30px -5px rgba(0,0,0,0.04)",
        overflow: "hidden",
      }}
    >
      <Box
        sx={{
          p: 3,
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
              color: "#0f172a",
              display: "flex",
              alignItems: "center",
            }}
          >
            {title}
            <Chip
              size="small"
              label={`${rows?.length ?? 0} POs`}
              sx={{
                ml: 2,
                fontWeight: 700,
                bgcolor: alpha("#4f46e5", 0.1),
                color: "#4f46e5",
              }}
            />
            <InfoTip text={infoText} />
          </Typography>
          {restrictedNotice && (
            <Typography
              variant="caption"
              sx={{
                color: "#64748b",
                fontWeight: 600,
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
                    sx={{ color: "text.secondary" }}
                  />
                </InputAdornment>
              ),
              sx: {
                borderRadius: 3,
                bgcolor: "#f8fafc",
                "& fieldset": { borderColor: "transparent" },
                "&:hover fieldset": { borderColor: "grey.300" },
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
                textTransform: "none",
                bgcolor: alpha("#4f46e5", 0.08),
                color: "#4f46e5",
                "&:hover": { bgcolor: alpha("#4f46e5", 0.16) },
              }}
            >
              Open PO Data page
            </Button>
          )}
        </Box>
      </Box>

      {loading ? (
        <Box sx={{ p: 3 }}>
          <Skeleton
            variant="rectangular"
            height={320}
            sx={{ borderRadius: 2 }}
          />
        </Box>
      ) : (
        <Box sx={{ display: "flex", position: "relative" }}>
          {/* ---- FROZEN COLUMN: PO Number, its own tiny non-scrolling-horizontally table ---- */}
          <Box
            sx={{
              flexShrink: 0,
              width: FROZEN_COL_WIDTH,
              bgcolor: "#fff",
              borderRight: "1px solid",
              borderColor: "grey.200",
              boxShadow: "3px 0 6px -4px rgba(0,0,0,0.12)",
              zIndex: 2,
              position: "relative",
            }}
          >
            <Box
              ref={frozenScrollRef}
              onScroll={handleFrozenScroll}
              sx={{
                maxHeight: BODY_MAX_HEIGHT,
                overflowY: "auto",
                overflowX: "hidden",
                "&::-webkit-scrollbar": { display: "none" },
                scrollbarWidth: "none",
              }}
            >
              <Table sx={{ width: FROZEN_COL_WIDTH, tableLayout: "fixed" }}>
                <TableHead>
                  <TableRow>
                    <TableCell sx={headerCellSx}>
                      <TableSortLabel
                        active={orderBy === "poNumber"}
                        direction={orderBy === "poNumber" ? order : "asc"}
                        onClick={() => toggleSort("poNumber")}
                      >
                        PO Number
                      </TableSortLabel>
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filtered.map((r) => (
                    <TableRow
                      key={r.poNumber}
                      hover
                      sx={rowSx}
                      onClick={(e) => openRowMenu(e, r)}
                    >
                      <TableCell
                        sx={{
                          fontWeight: 600,
                          color: "#0f172a",
                          whiteSpace: "nowrap",
                          height: ROW_HEIGHT,
                        }}
                      >
                        {r.poNumber}
                      </TableCell>
                    </TableRow>
                  ))}
                  {filtered.length === 0 && (
                    <TableRow sx={{ height: ROW_HEIGHT }}>
                      <TableCell />
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </Box>
          </Box>

          {/* ---- SCROLLABLE REGION: everything else ---- */}
          <Box
            ref={mainScrollRef}
            onScroll={handleMainScroll}
            sx={{
              flex: 1,
              maxHeight: BODY_MAX_HEIGHT,
              overflow: "auto",
              minWidth: 0,
            }}
          >
            <Table size="medium" sx={{ minWidth: tableMinWidth }}>
              <TableHead>
                <TableRow>
                  {scrollColumns.map((c) => (
                    <TableCell
                      key={c.key}
                      align={RIGHT_ALIGN_KEYS.has(c.key) ? "right" : "left"}
                      sx={{
                        ...headerCellSx,
                        minWidth: c.minWidth,
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
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {filtered.map((r) => (
                  <TableRow
                    key={r.poNumber}
                    hover
                    sx={rowSx}
                    onClick={(e) => openRowMenu(e, r)}
                  >
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
                            color: "#0f172a",
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
                      colSpan={scrollColumns.length}
                      align="center"
                      sx={{ color: "text.secondary" }}
                    >
                      No matching POs found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Box>
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
            onRowAction(menuRow, "breakdown");
            closeRowMenu();
          }}
        >
          <FactCheckRoundedIcon
            fontSize="small"
            sx={{ mr: 1.25, color: "text.secondary" }}
          />
          <Typography variant="body2" sx={{ fontWeight: 500 }}>
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
            sx={{ mr: 1.25, color: "text.secondary" }}
          />
          <Typography variant="body2" sx={{ fontWeight: 500 }}>
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
            sx={{ mr: 1.25, color: "text.secondary" }}
          />
          <Typography variant="body2" sx={{ fontWeight: 500 }}>
            View First Line Item Details
          </Typography>
        </MenuItem>
      </Menu>
    </Paper>
  );
};

export default PoWiseExceptionsTable;
