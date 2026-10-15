import { useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TableSortLabel,
  TextField,
  Tooltip as MuiTooltip,
  Typography,
  alpha,
} from "@mui/material";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import OpenInNewRoundedIcon from "@mui/icons-material/OpenInNewRounded";
import { post } from "utils/axiosApi";
import { buildSearchUrl } from "utils/po-link-utils";
import { formatFileTimestamp } from "utils/formatFileTimestamp";
import { STATUS_META } from "./PoStatusSummaryTables";
import PoStatusDetailDialog from "./PoStatusDetailDialog";
import {
  SIDE_OPTIONS,
  SIDE_OPTIONS_SIMPLE,
  issueBucket,
  matchPo,
  parsePoNumbers,
} from "./poListFilters";

// ---------------------------------------------------------------------------
// PoListDialog - the drill-down behind EVERY PO number on the dashboard.
//
//   spec  : which POs (see poListFilters.matchPo) - the same rule that produced
//           the number the user clicked, so the list always has exactly that
//           many rows.
//   rows  : the dashboard's per-PO rows (already in memory -> opens instantly)
//
// Click a row, or a Header / Line cell, to open that PO's exact header points
// and line items (PoStatusDetailDialog) - where the buyer can add remarks and
// close points. The last column is a real link that opens the PO's own page
// in a new tab.
//
// `onChanged` (optional): called after a remark/check is saved inside the
// detail dialog, so the parent can refetch the dashboard numbers.
// ---------------------------------------------------------------------------

const PAGE = 50;
const GREEN = "#059669";
const RED = "#dc2626";
const th = {
  fontWeight: 800,
  fontSize: 12,
  color: "#334155",
  bgcolor: "#f8fafc",
  whiteSpace: "nowrap",
  py: 1,
};
const num = { fontVariantNumeric: "tabular-nums", fontWeight: 700 };

const SIDE_META = {
  header: { label: "Header", color: "#4f46e5" },
  line: { label: "Line", color: "#475569" },
  both: { label: "Header + Line", color: "#b45309" },
};

// Opens the PO's own page in a new tab using the app's own link builder
// (same one "Open in New Tab" uses). That page needs a real line item, and
// this list only has PO-level rows, so we look up the PO's lines first
// (most pending points first). The tab is opened immediately on click so
// the browser's pop-up blocker allows it, then pointed at the right URL.
const openPoPage = async (poNumber) => {
  const tab = window.open("", "_blank");
  try {
    const res = await post("/reports/po-status-detail", { poNumber });
    const first = [...(res?.lines || [])].sort(
      (a, b) => (b.pending || 0) - (a.pending || 0),
    )[0];
    const url = buildSearchUrl(poNumber, first?.lineItem, first?.source_file_ts);
    if (tab) tab.location.href = url;
    else window.open(url, "_blank");
  } catch (err) {
    if (tab) tab.close();
    console.error("Could not open PO page:", err);
  }
};

// "2 NV · 1 pending" - one compact cell instead of two wide number columns.
const NvPending = ({ nv, pending, onClick, title }) => (
  <Box
    sx={{
      display: "inline-flex",
      gap: 0.75,
      alignItems: "baseline",
      whiteSpace: "nowrap",
      fontSize: 13,
    }}
  >
    <Clickable onClick={onClick} title={title}>
      {nv ?? 0}
    </Clickable>
    <Box
      component="span"
      sx={{ color: "#94a3b8", fontSize: 11, fontWeight: 600 }}
    >
      NV
    </Box>
    <Box component="span" sx={{ color: "#cbd5e1" }}>
      ·
    </Box>
    <Box component="span" sx={{ color: pending ? RED : "#94a3b8" }}>
      <Clickable onClick={onClick} title={title}>
        {pending ?? 0}
      </Clickable>
    </Box>
    <Box
      component="span"
      sx={{ color: "#94a3b8", fontSize: 11, fontWeight: 600 }}
    >
      pending
    </Box>
  </Box>
);

const Clickable = ({ onClick, title, children }) => (
  <MuiTooltip title={title}>
    <Box
      component="span"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      sx={{
        cursor: "pointer",
        borderRadius: 1,
        px: 0.75,
        mx: -0.75,
        "&:hover": { bgcolor: alpha("#4f46e5", 0.1) },
      }}
    >
      {children}
    </Box>
  </MuiTooltip>
);

const PoListDialog = ({
  dialog,
  rows = [],
  onClose,
  onWork,
  onChanged,
  version,
}) => {
  const open = Boolean(dialog);
  const [side, setSide] = useState("any");
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const [detail, setDetail] = useState(null);
  const [timestampSort, setTimestampSort] = useState(0);

  // reset when a different list is opened
  useEffect(() => {
    if (!dialog) return;
    setSide(dialog.spec?.side || "any");
    setSearch("");
    setLimit(PAGE);
  }, [dialog]);

  useEffect(() => {
    setLimit(PAGE);
  }, [side, search]);

  const base = useMemo(() => {
    if (!dialog) return [];
    const spec = { ...dialog.spec, side: "any" }; // side is adjustable below
    return rows.filter((r) => matchPo(r, spec));
  }, [dialog, rows]);

  const filtered = useMemo(() => {
    const term = search.trim();
    const exact = parsePoNumbers(term);
    const lower = term.toLowerCase();
    return base
      .filter((r) => matchPo(r, { side }))
      .filter((r) => {
        if (!term) return true;
        if (exact.length > 1) return exact.includes(String(r.poNumber));
        return [r.poNumber, r.vendorName, r.vendorCode, r.purchaseGroup]
          .filter(Boolean)
          .some((f) => String(f).toLowerCase().includes(lower));
      })
      .sort(
        (a, b) =>
          (b.totalPendingPoints || 0) - (a.totalPendingPoints || 0) ||
          String(a.poNumber).localeCompare(String(b.poNumber)),
      );
  }, [base, side, search]);

  const visible = (timestampSort ? [...filtered].sort((a, b) => {
    const av = new Date(a.source_file_ts || 0).getTime();
    const bv = new Date(b.source_file_ts || 0).getTime();
    return (av - bv) * timestampSort;
  }) : filtered).slice(0, limit);

  // Short dropdown; if a list was opened with a side that isn't in it
  // (e.g. "headerAny" from the Purchase Group table) keep that one option so
  // the select never shows blank while still filtering.
  const sideOptions = SIDE_OPTIONS_SIMPLE.some((o) => o.value === side)
    ? SIDE_OPTIONS_SIMPLE
    : [
        ...SIDE_OPTIONS_SIMPLE,
        SIDE_OPTIONS.find((o) => o.value === side),
      ].filter(Boolean);

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        maxWidth="xl"
        fullWidth
        PaperProps={{ sx: { borderRadius: 4 } }}
      >
        <DialogTitle sx={{ pb: 1 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
            <Typography variant="h6" sx={{ fontWeight: 800, flex: 1 }}>
              {dialog?.title}
              <Chip
                size="small"
                label={`${filtered.length.toLocaleString()} POs`}
                sx={{
                  ml: 1.5,
                  fontWeight: 700,
                  bgcolor: alpha("#4f46e5", 0.1),
                  color: "#4f46e5",
                }}
              />
            </Typography>
            <IconButton onClick={onClose} size="small">
              <CloseRoundedIcon />
            </IconButton>
          </Box>
          <Box sx={{ display: "flex", gap: 1.5, mt: 1.5, flexWrap: "wrap" }}>
            <TextField
              size="small"
              placeholder="Search PO / vendor / group, or paste several PO numbers"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchRoundedIcon fontSize="small" />
                  </InputAdornment>
                ),
              }}
              sx={{ minWidth: 340 }}
            />
            <TextField
              select
              size="small"
              label="Problem in"
              value={side}
              onChange={(e) => setSide(e.target.value)}
              sx={{ minWidth: 240 }}
            >
              {sideOptions.map((o) => (
                <MenuItem key={o.value} value={o.value}>
                  {o.label}
                </MenuItem>
              ))}
            </TextField>
          </Box>
        </DialogTitle>

        <DialogContent dividers sx={{ p: 0 }}>
          <Box sx={{ overflow: "auto", maxHeight: "62vh" }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell sx={th}>PO Number</TableCell>
                  <TableCell sx={th}><TableSortLabel active={timestampSort !== 0} direction={timestampSort < 0 ? "desc" : "asc"} onClick={() => setTimestampSort((v) => v === 0 ? 1 : v === 1 ? -1 : 1)}>File Timestamp</TableSortLabel></TableCell>
                  <TableCell sx={th}>Status</TableCell>
                  <TableCell sx={th}>Problem in</TableCell>
                  <TableCell sx={th}>Purchase group</TableCell>
                  <TableCell sx={th}>Vendor</TableCell>
                  <TableCell
                    sx={{ ...th, bgcolor: "#eef2ff", color: "#4f46e5" }}
                  >
                    <MuiTooltip title="Header points of the PO. NV = Not Verified points the system flagged. Pending = NV points nobody has checked or remarked yet.">
                      <span>Header (NV · pending)</span>
                    </MuiTooltip>
                  </TableCell>
                  <TableCell sx={{ ...th, bgcolor: "#f1f5f9" }}>
                    <MuiTooltip title="Line-item points across all lines of the PO. NV = Not Verified points the system flagged. Pending = NV points nobody has checked or remarked yet.">
                      <span>Lines (NV · pending)</span>
                    </MuiTooltip>
                  </TableCell>
                  <TableCell sx={th} align="center">
                    PO page
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {visible.map((r) => {
                  const m = STATUS_META[r.poStatus];
                  const b = issueBucket(r);
                  const sm = SIDE_META[b];
                  const openHeader = () =>
                    setDetail({ poNumber: r.poNumber, source_file_ts: r.source_file_ts, tab: "header" });
                  const openLines = () =>
                    setDetail({ poNumber: r.poNumber, source_file_ts: r.source_file_ts, tab: "lines" });
                  return (
                    <TableRow
                      key={`${r.poNumber}:${r.source_file_ts || ""}`}
                      hover
                      sx={{ cursor: "pointer" }}
                      onClick={() =>
                        setDetail({
                          poNumber: r.poNumber,
                          source_file_ts: r.source_file_ts,
                          tab: b === "line" ? "lines" : "header",
                        })
                      }
                    >
                      <TableCell sx={{ fontWeight: 800 }}>
                        {r.poNumber}
                      </TableCell>
                      <TableCell sx={{ whiteSpace: "nowrap", fontSize: 12 }}>{formatFileTimestamp(r.source_file_ts)}</TableCell>
                      <TableCell>
                        {m && (
                          <Chip
                            size="small"
                            label={m.label}
                            sx={{
                              height: 22,
                              fontWeight: 700,
                              bgcolor: alpha(m.color, 0.1),
                              color: m.color,
                            }}
                          />
                        )}
                      </TableCell>
                      <TableCell>
                        {sm ? (
                          <Chip
                            size="small"
                            label={sm.label}
                            sx={{
                              height: 22,
                              fontWeight: 700,
                              bgcolor: alpha(sm.color, 0.1),
                              color: sm.color,
                            }}
                          />
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell>{r.purchaseGroup || "Unassigned"}</TableCell>
                      <TableCell sx={{ maxWidth: 240 }}>
                        <Typography variant="body2" noWrap>
                          {r.vendorName || r.vendorCode || "—"}
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ bgcolor: alpha("#4f46e5", 0.03) }}>
                        <NvPending
                          nv={r.headerNotVerified}
                          pending={r.headerPendingPoints}
                          onClick={openHeader}
                          title="Open header points"
                        />
                      </TableCell>
                      <TableCell sx={{ bgcolor: alpha("#475569", 0.03) }}>
                        <NvPending
                          nv={r.lineNotVerified}
                          pending={r.linePendingPoints}
                          onClick={openLines}
                          title="Open line items"
                        />
                      </TableCell>
                      <TableCell
                        align="center"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <MuiTooltip title="Open this PO's page in a new tab">
                          <IconButton
                            size="small"
                            onClick={() => openPoPage(r.poNumber)}
                            sx={{ color: GREEN }}
                          >
                            <OpenInNewRoundedIcon fontSize="small" />
                          </IconButton>
                        </MuiTooltip>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      align="center"
                      sx={{ py: 5, color: "#64748b" }}
                    >
                      No POs match.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Box>
          {filtered.length > visible.length && (
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 1.5,
                py: 1.5,
                borderTop: "1px solid",
                borderColor: "grey.100",
              }}
            >
              <Typography
                variant="caption"
                sx={{ color: "#64748b", fontWeight: 600 }}
              >
                Showing {visible.length} of {filtered.length} POs
              </Typography>
              <Button size="small" onClick={() => setLimit((l) => l + 100)}>
                Show 100 more
              </Button>
              <Button size="small" onClick={() => setLimit(filtered.length)}>
                Show all
              </Button>
            </Box>
          )}
        </DialogContent>
      </Dialog>

      <PoStatusDetailDialog
        detail={detail}
        onClose={() => setDetail(null)}
        onWork={onWork}
        onChanged={onChanged}
        version={version}
      />
    </>
  );
};

export default PoListDialog;
