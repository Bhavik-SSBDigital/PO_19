import { useMemo, useState } from "react";
import {
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  IconButton,
  Collapse,
  LinearProgress,
  Skeleton,
  alpha,
  Tooltip as MuiTooltip,
} from "@mui/material";
import KeyboardArrowDownRoundedIcon from "@mui/icons-material/KeyboardArrowDownRounded";
import KeyboardArrowRightRoundedIcon from "@mui/icons-material/KeyboardArrowRightRounded";
import Groups2RoundedIcon from "@mui/icons-material/Groups2Rounded";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import CheckCircleOutlineRoundedIcon from "@mui/icons-material/CheckCircleOutlineRounded";

// Matches the palette already established in ExecutiveDashboard.jsx —
// this table is meant to look like it belongs on the same page, not like
// a bolted-on widget.
const PENDING_COLOR = "#dc2626";
const CLOSED_COLOR = "#059669";
const ACCENT = "#4f46e5";
const ACCENT_BG = "#eef2ff";

const closedPct = (closed, total) =>
  total > 0 ? Math.round((closed / total) * 100) : null;

const progressColor = (pct) => {
  if (pct == null) return "#94a3b8";
  if (pct >= 80) return CLOSED_COLOR;
  if (pct >= 50) return "#d97706";
  return PENDING_COLOR;
};

// Pulls the exact count for one section + bucket straight out of the
// group's already-computed header/line/rc shape objects
// ({ systemGenerated, closed, pending }) — no extra fetch needed, and it
// can never disagree with what's on screen since it's the same numbers
// the row itself renders.
const countFor = (group, sectionKey, bucket) => {
  const s = group[sectionKey] || { systemGenerated: 0, closed: 0, pending: 0 };
  return bucket === "total" ? s.systemGenerated : (s[bucket] ?? 0);
};

// One clickable stat — mirrors the RemarksImpactNumber pattern already
// used elsewhere on the dashboard so the interaction feels familiar.
const Stat = ({ value, color, onClick, dense }) => (
  <Box
    onClick={onClick}
    sx={{
      display: "inline-flex",
      alignItems: "baseline",
      justifyContent: "flex-end",
      minWidth: dense ? 34 : 42,
      cursor: onClick ? "pointer" : "default",
      borderRadius: 1.5,
      px: 0.75,
      "&:hover": onClick ? { bgcolor: alpha(color, 0.1) } : undefined,
    }}
  >
    <Typography
      variant={dense ? "body2" : "body1"}
      sx={{
        fontWeight: 800,
        color,
        textDecoration: onClick ? "underline" : "none",
        textDecorationColor: alpha(color, 0.3),
        textUnderlineOffset: 3,
      }}
    >
      {value}
    </Typography>
  </Box>
);

// Expanded breakdown row: Header / Line / RC, each with its own
// Total / Pending / Closed, each number independently clickable.
const SectionBreakdown = ({ group, onDrill }) => {
  const sections = [
    { key: "header", label: "Header", closedLabel: "Points Closed" },
    { key: "line", label: "Line Item", closedLabel: "Points Closed" },
    { key: "rc", label: "RC Overlap", closedLabel: "RCs Closed" },
  ];
  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "1fr", sm: "repeat(3, 1fr)" },
        gap: 1.5,
        py: 2,
        px: { xs: 1, sm: 2 },
      }}
    >
      {sections.map(({ key, label, closedLabel }) => {
        const s = group[key] || { systemGenerated: 0, pending: 0, closed: 0 };
        return (
          <Box
            key={key}
            sx={{
              borderRadius: 3,
              border: "1px solid",
              borderColor: "grey.100",
              bgcolor: "#fbfbff",
              px: 2,
              py: 1.5,
            }}
          >
            <Typography
              variant="caption"
              sx={{ fontWeight: 700, color: "#475569", display: "block", mb: 1 }}
            >
              {label}
            </Typography>
            {s.systemGenerated === 0 ? (
              <Typography variant="caption" sx={{ color: "#94a3b8" }}>
                Nothing flagged
              </Typography>
            ) : (
              <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                <Box>
                  <Stat
                    dense
                    value={s.pending}
                    color={PENDING_COLOR}
                    onClick={
                      s.pending > 0
                        ? () =>
                            onDrill({
                              section: key,
                              title: `${label} — ${group.purchaseGroupName || group.purchaseGroup}`,
                              bucket: "pending",
                              closedLabel,
                              purchaseGroup: group.purchaseGroup,
                            })
                        : undefined
                    }
                  />
                  <Typography variant="caption" sx={{ color: "#94a3b8", display: "block" }}>
                    Pending
                  </Typography>
                </Box>
                <Box>
                  <Stat
                    dense
                    value={s.closed}
                    color={CLOSED_COLOR}
                    onClick={
                      s.closed > 0
                        ? () =>
                            onDrill({
                              section: key,
                              title: `${label} — ${group.purchaseGroupName || group.purchaseGroup}`,
                              bucket: "closed",
                              closedLabel,
                              purchaseGroup: group.purchaseGroup,
                            })
                        : undefined
                    }
                  />
                  <Typography variant="caption" sx={{ color: "#94a3b8", display: "block" }}>
                    Closed
                  </Typography>
                </Box>
                <Box>
                  <Stat
                    dense
                    value={s.systemGenerated}
                    color="#475569"
                    onClick={() =>
                      onDrill({
                        section: key,
                        title: `${label} — ${group.purchaseGroupName || group.purchaseGroup}`,
                        bucket: "total",
                        closedLabel,
                        purchaseGroup: group.purchaseGroup,
                      })
                    }
                  />
                  <Typography variant="caption" sx={{ color: "#94a3b8", display: "block" }}>
                    Total
                  </Typography>
                </Box>
              </Box>
            )}
          </Box>
        );
      })}
    </Box>
  );
};

const GroupRow = ({ group, onDrill }) => {
  const [open, setOpen] = useState(false);
  const total = group.total?.systemGenerated ?? 0;
  const pending = group.total?.pending ?? 0;
  const closed = group.total?.closed ?? 0;
  const pct = closedPct(closed, total);

  // Combined (row-level) click: this number is Header + Line + RC added
  // together, so the trigger carries each section's exact contribution
  // (sectionCounts) alongside it. The popup uses this to show
  // "Header 2 · Line Item 2 · RC Overlap 1" instead of leaving the person
  // to wonder how a single list could ever add up to this total.
  const combinedTrigger = (bucket) => ({
    section: null,
    title: `${bucket === "pending" ? "Pending" : bucket === "closed" ? "Closed" : "Not Verified"} — ${group.purchaseGroupName || group.purchaseGroup} (Header + Line + RC)`,
    bucket,
    purchaseGroup: group.purchaseGroup,
    sectionCounts: {
      header: countFor(group, "header", bucket),
      line: countFor(group, "line", bucket),
      rc: countFor(group, "rc", bucket),
    },
  });

  return (
    <>
      <TableRow
        hover
        sx={{
          "& > *": { borderBottom: open ? "none" : undefined },
          cursor: "pointer",
          bgcolor: pending === 0 && total > 0 ? alpha(CLOSED_COLOR, 0.03) : undefined,
        }}
        onClick={() => setOpen((v) => !v)}
      >
        <TableCell sx={{ width: 40 }}>
          <IconButton size="small">
            {open ? (
              <KeyboardArrowDownRoundedIcon fontSize="small" />
            ) : (
              <KeyboardArrowRightRoundedIcon fontSize="small" />
            )}
          </IconButton>
        </TableCell>
        <TableCell>
          <Typography variant="body2" sx={{ fontWeight: 800, color: "#0f172a" }}>
            {group.purchaseGroup}
          </Typography>
          {group.purchaseGroupName && group.purchaseGroupName !== group.purchaseGroup && (
            <Typography variant="caption" sx={{ color: "#94a3b8" }}>
              {group.purchaseGroupName}
            </Typography>
          )}
        </TableCell>
        <TableCell align="right">
          <Stat
            value={total}
            color="#475569"
            onClick={(e) => {
              e.stopPropagation();
              onDrill(combinedTrigger("total"));
            }}
          />
        </TableCell>
        <TableCell align="right">
          <Stat
            value={closed}
            color={CLOSED_COLOR}
            onClick={
              closed > 0
                ? (e) => {
                    e.stopPropagation();
                    onDrill(combinedTrigger("closed"));
                  }
                : undefined
            }
          />
        </TableCell>
        <TableCell align="right">
          <Stat
            value={pending}
            color={PENDING_COLOR}
            onClick={
              pending > 0
                ? (e) => {
                    e.stopPropagation();
                    onDrill(combinedTrigger("pending"));
                  }
                : undefined
            }
          />
        </TableCell>
        <TableCell sx={{ width: 160 }}>
          {total === 0 ? (
            <Typography variant="caption" sx={{ color: "#94a3b8" }}>
              —
            </Typography>
          ) : (
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <LinearProgress
                variant="determinate"
                value={pct}
                sx={{
                  flex: 1,
                  height: 7,
                  borderRadius: 4,
                  bgcolor: alpha(progressColor(pct), 0.12),
                  "& .MuiLinearProgress-bar": {
                    borderRadius: 4,
                    bgcolor: progressColor(pct),
                  },
                }}
              />
              <Typography
                variant="caption"
                sx={{ fontWeight: 700, color: progressColor(pct), minWidth: 32, textAlign: "right" }}
              >
                {pct}%
              </Typography>
            </Box>
          )}
        </TableCell>
      </TableRow>
      <TableRow>
        <TableCell colSpan={6} sx={{ p: 0, borderBottom: open ? "1px solid" : "none", borderColor: "grey.100" }}>
          <Collapse in={open} timeout={200} unmountOnExit>
            <SectionBreakdown group={group} onDrill={onDrill} />
          </Collapse>
        </TableCell>
      </TableRow>
    </>
  );
};

/**
 * Per-purchasing-group breakdown of the "Remarks Impact" numbers
 * (Header + Line + RC Overlap combined), for Admin / Procurement Manager
 * / SSB Digital only.
 *
 * The restriction is enforced server-side: getRemarksImpactSummary only
 * populates `byPurchaseGroup` in its response when the caller is
 * unrestricted (the same check that drives `scope` being null for these
 * roles). So this component simply renders nothing if the prop is
 * missing/empty — a Buyer's response will never contain it, regardless
 * of what the frontend does.
 *
 * Usage in ExecutiveDashboard.jsx:
 *
 *   <PurchaseGroupRemarksImpactTable
 *     groups={remarksImpact?.byPurchaseGroup}
 *     loading={remarksImpactLoading}
 *     onDrilldown={(trigger) => setRemarksImpactDialog(trigger)}
 *   />
 *
 * `onDrilldown` receives the same shape RemarksImpactListDialog already
 * expects ({ section, title, bucket, closedLabel }), plus a
 * `purchaseGroup` field, and — for the combined row-level Total/Closed/
 * Pending clicks only — a `sectionCounts: { header, line, rc }` field so
 * the dialog can badge its Header/Line/RC switcher with the exact count
 * behind each section instead of leaving the person to guess how the
 * combined number breaks down.
 */
const PurchaseGroupRemarksImpactTable = ({ groups, loading, onDrilldown }) => {
  const sortedGroups = useMemo(
    () => [...(groups || [])].sort((a, b) => (b.total?.pending ?? 0) - (a.total?.pending ?? 0)),
    [groups],
  );

  if (!loading && (!groups || groups.length === 0)) return null;

  const grandTotal = sortedGroups.reduce((s, g) => s + (g.total?.systemGenerated ?? 0), 0);
  const grandPending = sortedGroups.reduce((s, g) => s + (g.total?.pending ?? 0), 0);
  const grandClosed = sortedGroups.reduce((s, g) => s + (g.total?.closed ?? 0), 0);

  return (
    <Paper
      elevation={0}
      sx={{
        borderRadius: 4,
        border: "1px solid",
        borderColor: "grey.100",
        boxShadow: "0 10px 30px -5px rgba(0,0,0,0.04)",
        overflow: "hidden",
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          p: 3,
          pb: 2,
          flexWrap: "wrap",
          gap: 2,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1.5 }}>
          <Box
            sx={{
              width: 40,
              height: 40,
              borderRadius: 2.5,
              bgcolor: ACCENT_BG,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Groups2RoundedIcon sx={{ color: ACCENT, fontSize: 22 }} />
          </Box>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 800, color: "#0f172a", display: "flex", alignItems: "center" }}>
              Purchase Group Compliance
              <MuiTooltip
                arrow
                placement="top"
                title="Not Verified, Closed and Pending counts across Header, Line-Item and RC Overlap checks combined, one row per purchasing group. Expand a row to see the Header / Line / RC split. Visible to Admin, Procurement Manager and SSB Digital only."
              >
                <InfoOutlinedIcon sx={{ fontSize: 18, ml: 0.75, color: "text.disabled", cursor: "help" }} />
              </MuiTooltip>
            </Typography>
            <Typography variant="body2" sx={{ color: "#64748b", mt: 0.5 }}>
              Worst groups first. Click any number to see the exact list; click a row to expand its Header / Line / RC breakdown.
            </Typography>
          </Box>
        </Box>
        {!loading && grandTotal > 0 && (
          <Box sx={{ display: "flex", gap: 3, textAlign: "right" }}>
            <Box>
              <Typography variant="h5" sx={{ fontWeight: 800, color: PENDING_COLOR }}>
                {grandPending}
              </Typography>
              <Typography variant="caption" sx={{ color: "#94a3b8" }}>
                Pending across all groups
              </Typography>
            </Box>
            <Box>
              <Typography variant="h5" sx={{ fontWeight: 800, color: CLOSED_COLOR }}>
                {grandClosed}
              </Typography>
              <Typography variant="caption" sx={{ color: "#94a3b8" }}>
                Closed across all groups
              </Typography>
            </Box>
          </Box>
        )}
      </Box>

      {loading ? (
        <Box sx={{ px: 3, pb: 3 }}>
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} height={52} sx={{ borderRadius: 1 }} />
          ))}
        </Box>
      ) : grandTotal === 0 ? (
        <Box sx={{ px: 3, pb: 4, display: "flex", alignItems: "center", gap: 1.5 }}>
          <CheckCircleOutlineRoundedIcon sx={{ color: CLOSED_COLOR }} />
          <Typography variant="body1" sx={{ fontWeight: 700, color: CLOSED_COLOR }}>
            No Not Verified items in any purchasing group — nothing pending here.
          </Typography>
        </Box>
      ) : (
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ "& th": { fontWeight: 700, color: "#64748b", borderBottom: "1px solid", borderColor: "grey.100" } }}>
                <TableCell sx={{ width: 40 }} />
                <TableCell>Purchase Group</TableCell>
                <TableCell align="right">Total Not Verified</TableCell>
                <TableCell align="right">Closed</TableCell>
                <TableCell align="right">Pending</TableCell>
                <TableCell>% Closed</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sortedGroups.map((g) => (
                <GroupRow key={g.purchaseGroup} group={g} onDrill={onDrilldown} />
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Paper>
  );
};

export default PurchaseGroupRemarksImpactTable;