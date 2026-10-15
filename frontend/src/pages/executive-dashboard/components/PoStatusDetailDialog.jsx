import { useEffect, useMemo, useRef, useState } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  MenuItem,
  Switch,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tabs,
  Typography,
  TextField,
  alpha,
} from "@mui/material";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import OpenInNewRoundedIcon from "@mui/icons-material/OpenInNewRounded";
import { post } from "utils/axiosApi";
import { buildSearchUrl } from "utils/po-link-utils";
import { formatFileTimestamp } from "utils/formatFileTimestamp";
import { STATUS_META } from "./PoStatusSummaryTables";
// NOTE: these two are the SAME remark components already used by
// PoDetailsPreviewDialog / PoHeaderChecksPanel, so adding a remark here
// uses the exact same APIs and rules (buyer-only, one remark per buyer,
// locked sections, auto-close) - no new backend needed.
import PointRemarkPanel from "./PointRemarkPanel";
import PoHeaderRemarkPanel from "./PoHeaderRemarkPanel";

// ---------------------------------------------------------------------------
// PoStatusDetailDialog
//
// Opens from the PO-Wise Review Status table (dashboard AND PO Data page):
//   - click a PO row            -> menu -> "Header points" / "Line items"
//   - click a Header/Line count -> opens straight on that tab
//
//   - every point row has an "Add / View remark" control (buyers can add a
//     remark or mark the point checked right here; others can view).
//   - "Open PO page" / "Open line page" links open the PO's own page in a
//     new tab.
//   - after any remark/check change the dialog PATCHES its own numbers
//     instantly (no waiting), then refetches silently in the background and
//     calls `onChanged` so the dashboard behind it can refresh too.
//
// Data is fetched on click only (POST /reports/po-status-detail).
// ---------------------------------------------------------------------------

// ---- readable colours (all high-contrast on white) -------------------------
const GREEN = "#047857";
const RED = "#b91c1c";
const AMBER = "#b45309";
const INDIGO = "#4338ca";
const SLATE = "#334155";
const TEXT_STRONG = "#0f172a";
const TEXT_BODY = "#1e293b";
const TEXT_MUTED = "#475569"; // was #64748b / #94a3b8 - too faint

// Stable empty array. PointRemarkPanel / PoHeaderRemarkPanel have an effect
// that depends on `initialRemarks`; passing a fresh [] each render would make
// them re-render forever.
const NO_REMARKS = [];

const STATE_META = {
  verified: { label: "Verified", color: GREEN },
  na: { label: "Not Applicable", color: "#475569" },
  manual: { label: "Manual", color: AMBER },
  closed: { label: "Not Verified · Closed", color: "#1d4ed8" },
  pending: { label: "Not Verified · Pending", color: RED },
};

// What the SYSTEM said for this point (the remark panel uses it as the
// default "buyer result" for informative remarks).
const SYSTEM_RESULT_BY_STATE = {
  verified: "Verified",
  na: "Not Applicable",
  manual: "",
  closed: "Not Verified",
  pending: "Not Verified",
};

const SEVERITY_COLOR = {
  Critical: "#991b1b",
  High: "#b91c1c",
  Medium: "#b45309",
  Low: "#475569",
};

const th = {
  fontWeight: 800,
  fontSize: 13.5,
  color: TEXT_BODY,
  bgcolor: "#f1f5f9",
  whiteSpace: "nowrap",
  py: 1,
};

const td = { fontSize: 14, color: TEXT_BODY };

// ---- instant local patching (no waiting for the refetch) -------------------
const isNvState = (s) => s === "closed" || s === "pending";

const tallyOf = (points) => {
  let closed = 0;
  let pending = 0;
  for (const p of points) {
    if (p.state === "closed") closed++;
    else if (p.state === "pending") pending++;
  }
  return { notVerified: closed + pending, closed, pending };
};

const patchPoints = (points, pointNo, patch) =>
  points.map((p) => {
    if (String(p.pointNo) !== String(pointNo)) return p;
    const state = isNvState(p.state)
      ? patch.remarksCount > 0 || patch.checked
        ? "closed"
        : "pending"
      : p.state;
    return {
      ...p,
      state,
      remark: patch.latestRemark ?? (patch.remarksCount > 0 ? p.remark : ""),
    };
  });

const applyPointPatch = (data, pointNo, patch, ctx) => {
  if (!data) return data;
  if (ctx?.kind === "header" && data.header) {
    const points = patchPoints(data.header.points || [], pointNo, patch);
    return { ...data, header: { ...data.header, points, ...tallyOf(points) } };
  }
  if (ctx?.kind === "line") {
    const lines = (data.lines || []).map((l) => {
      if (String(l.lineItem) !== String(ctx.lineItem)) return l;
      const points = patchPoints(l.points || [], pointNo, patch);
      return { ...l, points, ...tallyOf(points) };
    });
    const sum = lines.reduce(
      (a, l) => ({
        notVerified: a.notVerified + (l.notVerified || 0),
        closed: a.closed + (l.closed || 0),
        pending: a.pending + (l.pending || 0),
      }),
      { notVerified: 0, closed: 0, pending: 0 },
    );
    return { ...data, lines, lineTotals: { ...data.lineTotals, ...sum } };
  }
  return data;
};

const Pill = ({ label, color }) => (
  <Chip
    size="small"
    label={label}
    sx={{
      height: 28,
      fontWeight: 700,
      fontSize: 13,
      bgcolor: alpha(color, 0.12),
      color,
    }}
  />
);

const Counts = ({ d }) => (
  <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap" }}>
    <Pill label={`Not Verified ${d.notVerified}`} color={SLATE} />
    <Pill label={`Closed ${d.closed}`} color={GREEN} />
    <Pill
      label={`Pending ${d.pending}`}
      color={d.pending > 0 ? RED : TEXT_MUTED}
    />
  </Box>
);

// Real link (middle-click / right-click work) that opens the PO's page in a
// new tab. Header link = the PO-header view; line link = that exact line.
const PageLink = ({ poNumber, lineItem, label, sourceFileTs }) => {
  const href = buildSearchUrl(poNumber, lineItem, sourceFileTs);
  return (
    <Button
      size="small"
      component="a"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      startIcon={<OpenInNewRoundedIcon fontSize="small" />}
      sx={{
        textTransform: "none",
        fontWeight: 700,
        fontSize: 14,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </Button>
  );
};

// `kind`: "header" | "line". `onPointChanged(point, patch, ctx)` fires after
// a remark / check change inside the remark panel.
const PointsTable = ({
  points,
  onlyNv,
  kind,
  poNumber,
  lineItem,
  sourceFileTs,
  user,
  onPointChanged,
}) => {
  const rows = onlyNv
    ? points.filter((p) => p.state === "closed" || p.state === "pending")
    : points;
  if (!rows.length) {
    return (
      <Typography
        variant="body2"
        sx={{ color: TEXT_MUTED, fontSize: 14.5, p: 2 }}
      >
        {onlyNv
          ? "No Not Verified points here. Switch off “Only Not Verified” to see every point."
          : "No points."}
      </Typography>
    );
  }
  return (
    <Box sx={{ overflowX: "auto" }}>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell sx={th}>Point</TableCell>
            <TableCell sx={th}>Check</TableCell>
            <TableCell sx={th}>Severity</TableCell>
            <TableCell sx={th}>Result</TableCell>
            <TableCell sx={th}>Buyer remark</TableCell>
            <TableCell sx={th}>Add / view remark</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((p) => {
            const m = STATE_META[p.state] || STATE_META.verified;
            const systemResult = SYSTEM_RESULT_BY_STATE[p.state] ?? "";
            const common = {
              pointNo: p.pointNo,
              sourceFileTs,
              currentUserId: user.id,
              isBuyer: user.isBuyer,
              isAdmin: user.isAdmin,
              isProcurementManager: user.isProcurementManager,
              initialRemarks: NO_REMARKS,
              // The row already knows if a remark exists -> the button says
              // "View Remarks" immediately, no need to open it first.
              initialHasRemark: Boolean(p.remark),
              initialChecked: p.state === "closed" && !p.remark,
              systemResult,
              onRemarksChanged: (patch) =>
                onPointChanged?.(p, patch, { kind, lineItem }),
              compact: true,
            };
            return (
              <TableRow key={p.pointNo} hover>
                <TableCell sx={{ ...td, fontWeight: 800 }}>{p.pointNo}</TableCell>
                <TableCell sx={{ ...td, minWidth: 220 }}>
                  {p.title || "—"}
                </TableCell>
                <TableCell sx={td}>
                  <Typography
                    variant="caption"
                    sx={{
                      fontWeight: 700,
                      fontSize: 13.5,
                      color: SEVERITY_COLOR[p.severity] || SLATE,
                    }}
                  >
                    {p.severity || "—"}
                  </Typography>
                </TableCell>
                <TableCell sx={td}>
                  <Pill label={m.label} color={m.color} />
                </TableCell>
                <TableCell sx={{ ...td, minWidth: 220 }}>
                  {p.remark ? (
                    <>
                      {p.remark}
                      {p.systemWrong !== null &&
                        p.systemWrong !== undefined && (
                          <Typography
                            variant="caption"
                            sx={{
                              display: "block",
                              fontSize: 13,
                              color: TEXT_MUTED,
                            }}
                          >
                            {p.systemWrong
                              ? "PO corrected"
                              : "System result confirmed"}
                          </Typography>
                        )}
                    </>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell sx={{ ...td, minWidth: 170, verticalAlign: "top" }}>
                  {kind === "header" ? (
                    <PoHeaderRemarkPanel poNumber={poNumber} sourceFileTs={common.sourceFileTs} {...common} />
                  ) : (
                    <PointRemarkPanel
                      poNumber={poNumber}
                      poLineItem={lineItem}
                      sourceFileTs={common.sourceFileTs}
                      {...common}
                    />
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Box>
  );
};

const WorkButton = ({ label, onClick }) => (
  <Button
    size="small"
    variant="contained"
    disableElevation
    onClick={(e) => {
      e.stopPropagation();
      onClick();
    }}
    sx={{
      textTransform: "none",
      fontWeight: 700,
      fontSize: 14,
      borderRadius: 2,
      bgcolor: INDIGO,
      whiteSpace: "nowrap",
    }}
  >
    {label}
  </Button>
);

// `onWork({ poNumber, lineItem? })` opens the buyer's existing full remark /
// close dialog for that PO (header) or line.
// `onChanged()` (optional) is called after any remark/check change so the
// dashboard behind this dialog can refetch its numbers.
// `version` changes whenever the dashboard data refreshes and makes this
// dialog reload its numbers.
const PoStatusDetailDialog = ({
  detail,
  onClose,
  onWork,
  onChanged,
  version,
}) => {
  const poNumber = detail?.poNumber;
  const [tab, setTab] = useState("header");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [onlyNv, setOnlyNv] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [selectedTimestamp, setSelectedTimestamp] = useState(detail?.source_file_ts || "");

  const role =
    typeof window !== "undefined" ? localStorage.getItem("role") : "";
  const user = {
    id: typeof window !== "undefined" ? localStorage.getItem("userId") : null,
    isBuyer: role === "isBuyer",
    isAdmin: role === "isAdmin",
    isProcurementManager: role === "isProcurementManager",
  };

  // which tab to land on (only when a different PO / tab is requested)
  useEffect(() => {
    if (poNumber) setTab(detail.tab || "header");
  }, [poNumber, detail?.tab]);

  useEffect(() => {
    setSelectedTimestamp(detail?.source_file_ts || "");
  }, [poNumber, detail?.source_file_ts]);

  const lastPo = useRef(null);
  useEffect(() => {
    if (!poNumber) {
      lastPo.current = null;
      return undefined;
    }
    let cancelled = false;
    // keep the old numbers on screen while refreshing the SAME PO
    if (lastPo.current !== poNumber) setData(null);
    lastPo.current = poNumber;
    setError("");
    setLoading(true);
    post("/reports/po-status-detail", {
      poNumber,
      source_file_ts: selectedTimestamp || undefined,
    })
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err) => {
        if (!cancelled)
          setError(
            err?.response?.data?.message || "Could not load this PO's detail.",
          );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [poNumber, selectedTimestamp, version, refresh]);

  // Called by the remark panel after add / delete / check. The numbers are
  // patched locally RIGHT AWAY; the refetch below only reconciles quietly.
  // (Opening the panel also reports, so only act when something that
  // affects the numbers actually changed.)
  const handlePointChanged = (point, patch, ctx) => {
    const isNv = isNvState(point.state);
    const wasClosed = point.state === "closed";
    const nowClosed = (patch.remarksCount || 0) > 0 || Boolean(patch.checked);
    const remarkChanged = Boolean(point.remark) !== patch.remarksCount > 0;
    if ((isNv && wasClosed !== nowClosed) || remarkChanged) {
      setData((prev) => applyPointPatch(prev, point.pointNo, patch, ctx));
      setRefresh((r) => r + 1);
      onChanged?.();
    }
  };

  const lines = data?.lines || [];
  const lineView = useMemo(
    () => (onlyNv ? [...lines].sort((a, b) => b.pending - a.pending) : lines),
    [lines, onlyNv],
  );
  const meta = data ? STATUS_META[data.poStatus] : null;
  // The PO page is opened on a real line item (the one with most pending
  // points first), exactly like the existing "Open in New Tab" does.
  const firstLineItem = [...lines].sort(
    (a, b) => (b.pending || 0) - (a.pending || 0),
  )[0]?.lineItem;

  return (
    <Dialog
      open={Boolean(poNumber)}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      PaperProps={{ sx: { borderRadius: 4 } }}
    >
      <DialogTitle sx={{ pb: 1 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          <Typography
            variant="h6"
            sx={{ fontWeight: 800, color: TEXT_STRONG, flex: 1 }}
          >
            PO {poNumber}
            {meta && (
              <Chip
                size="small"
                label={meta.label}
                sx={{
                  ml: 1.5,
                  height: 28,
                  fontWeight: 700,
                  fontSize: 13,
                  bgcolor: alpha(meta.color, 0.14),
                  color: meta.color,
                }}
              />
            )}
          </Typography>
          {poNumber && firstLineItem && (
            <PageLink
              poNumber={poNumber}
              lineItem={firstLineItem}
              sourceFileTs={data?.source_file_ts || detail?.source_file_ts}
              label="Open PO page"
            />
          )}
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={onlyNv}
                onChange={(e) => setOnlyNv(e.target.checked)}
              />
            }
            label={
              <Typography
                variant="caption"
                sx={{ fontWeight: 700, fontSize: 14, color: TEXT_BODY }}
              >
                Only Not Verified
              </Typography>
            }
          />
          <IconButton onClick={onClose} size="small">
            <CloseRoundedIcon />
          </IconButton>
        </Box>
        {data?.available_source_file_timestamps?.length > 0 && (
          <TextField
            select
            size="small"
            label="PO file timestamp"
            value={selectedTimestamp || data.source_file_ts || ""}
            onChange={(event) => setSelectedTimestamp(event.target.value)}
            sx={{ mt: 1, minWidth: 300 }}
          >
            {data.available_source_file_timestamps.map((timestamp, index) => (
              <MenuItem key={timestamp} value={timestamp}>
                {index === 0 ? "Latest — " : ""}{formatFileTimestamp(timestamp)}
              </MenuItem>
            ))}
          </TextField>
        )}
        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v)}
          sx={{ mt: 1, minHeight: 40 }}
        >
          <Tab
            value="header"
            sx={{
              textTransform: "none",
              fontWeight: 800,
              fontSize: 15,
              color: INDIGO,
            }}
            label={`Header${data?.header ? ` · ${data.header.pending} pending` : ""}`}
          />
          <Tab
            value="lines"
            sx={{
              textTransform: "none",
              fontWeight: 800,
              fontSize: 15,
              color: TEXT_BODY,
            }}
            label={`Line items${data ? ` · ${lines.length} lines, ${data.lineTotals.pending} pending` : ""}`}
          />
        </Tabs>
      </DialogTitle>

      <DialogContent dividers>
        {/* Spinner only on the FIRST load. Background refreshes after a
            remark are silent, so the content never jumps. */}
        {loading && !data && (
          <Box sx={{ display: "flex", justifyContent: "center", p: 6 }}>
            <CircularProgress size={28} />
          </Box>
        )}
        {error && (
          <Typography
            sx={{ color: RED, fontWeight: 600, fontSize: 15, p: 2 }}
          >
            {error}
          </Typography>
        )}

        {data && tab === "header" && (
          <>
            {data.header ? (
              <>
                <Box
                  sx={{
                    mb: 1.5,
                    display: "flex",
                    alignItems: "center",
                    gap: 2,
                    flexWrap: "wrap",
                  }}
                >
                  <Counts d={data.header} />
                  {onWork && (
                    <WorkButton
                      label="Full header view"
                      onClick={() => onWork({ poNumber, source_file_ts: data?.source_file_ts || detail?.source_file_ts })}
                    />
                  )}
                </Box>
                <PointsTable
                  points={data.header.points}
                  onlyNv={onlyNv}
                  kind="header"
                  poNumber={poNumber}
                  sourceFileTs={data?.source_file_ts || detail?.source_file_ts}
                  user={user}
                  onPointChanged={handlePointChanged}
                />
              </>
            ) : (
              <Typography sx={{ color: TEXT_MUTED, fontSize: 15, p: 2 }}>
                No header audit data has been loaded for this PO.
              </Typography>
            )}
          </>
        )}

        {data && tab === "lines" && (
          <>
            <Box sx={{ mb: 1.5 }}>
              <Counts d={data.lineTotals} />
            </Box>
            {lineView.map((l, i) => {
              const m = STATUS_META[l.status];
              return (
                <Accordion
                  key={`${l.lineItem}-${l.source_file_ts || data?.source_file_ts || ""}-${i}`}
                  disableGutters
                  defaultExpanded={l.pending > 0 && i < 3}
                  elevation={0}
                  sx={{
                    border: "1px solid",
                    borderColor: "grey.300",
                    borderRadius: 2,
                    mb: 1,
                    "&:before": { display: "none" },
                  }}
                >
                  <AccordionSummary expandIcon={<ExpandMoreRoundedIcon />}>
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 1.5,
                        flexWrap: "wrap",
                        width: "100%",
                      }}
                    >
                      <Typography
                        sx={{ fontWeight: 800, fontSize: 15, color: TEXT_STRONG }}
                      >
                        Line {l.lineItem} · File Timestamp {formatFileTimestamp(data?.source_file_ts || detail?.source_file_ts)}
                      </Typography>
                      {m && <Pill label={m.label} color={m.color} />}
                      <Typography
                        variant="caption"
                        sx={{
                          color: TEXT_MUTED,
                          fontSize: 13.5,
                          flex: 1,
                          minWidth: 120,
                        }}
                      >
                        {[l.materialCode, l.materialDescription]
                          .filter(Boolean)
                          .join(" · ")}
                      </Typography>
                      <Counts d={l} />
                      <PageLink
                        poNumber={poNumber}
                        lineItem={l.lineItem}
                        sourceFileTs={data?.source_file_ts || detail?.source_file_ts}
                        label="Open line page"
                      />
                      {onWork && (
                        <WorkButton
                          label="Full line view"
                          onClick={() =>
                            onWork({ poNumber, lineItem: l.lineItem, source_file_ts: data?.source_file_ts || detail?.source_file_ts })
                          }
                        />
                      )}
                    </Box>
                  </AccordionSummary>
                  <AccordionDetails sx={{ pt: 0 }}>
                    <PointsTable
                      points={l.points}
                      onlyNv={onlyNv}
                      kind="line"
                      poNumber={poNumber}
                      lineItem={l.lineItem}
                      sourceFileTs={data?.source_file_ts || detail?.source_file_ts}
                      user={user}
                      onPointChanged={handlePointChanged}
                    />
                  </AccordionDetails>
                </Accordion>
              );
            })}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default PoStatusDetailDialog;
