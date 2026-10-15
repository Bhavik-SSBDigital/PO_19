import { useMemo, useState } from "react";
import {
  Box,
  Paper,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip as MuiTooltip,
  Typography,
  alpha,
} from "@mui/material";
import { bifurcate, issueSide } from "./poListFilters";

// ---------------------------------------------------------------------------
// PoStatusSummaryTables
//
// ONE definition of "Closed" everywhere (no "locked" concept):
//   Verified / Not Applicable point        -> Closed
//   Not Verified point WITH check/remark   -> Closed
//   Not Verified point WITHOUT either      -> Pending (the ONLY thing pending)
//   Manual point                           -> neither; reported on its own
//
// A PO is CLOSED when it has no pending point:
//   Auto-Closed = never had a Not Verified point
//   Reviewed    = had Not Verified points, all now checked / remarked
// A PO is PENDING (open) when a Not Verified point is still waiting:
//   In Review   = some already checked / remarked, some still waiting
//   Pending     = nothing acted on yet
//
// EVERY number here is clickable:
//   - PO counts      -> onList(spec, title)   -> PoListDialog (same rule as the number)
//   - Not Verified points -> onPoints(trigger) -> existing Remarks Impact point list
// ---------------------------------------------------------------------------

export const STATUS_META = {
  perfect: {
    label: "Auto-Closed",
    tabLabel: "Auto-Closed POs",
    color: "#059669",
    help: "The system found no Not Verified point on the PO (header or lines). Nothing to do - closed automatically.",
    counts: "Closed",
  },
  reviewed: {
    label: "Reviewed",
    tabLabel: "POs Reviewed",
    color: "#2563eb",
    help: "The system flagged Not Verified points and ALL of them now have a check or remark. Nothing pending.",
    counts: "Closed",
  },
  in_review: {
    label: "In Review",
    tabLabel: "POs In Review",
    color: "#d97706",
    help: "Some Not Verified points are already checked or remarked, but at least one is still waiting.",
    counts: "Pending",
  },
  pending: {
    label: "Pending",
    tabLabel: "Pending POs",
    color: "#dc2626",
    help: "Not Verified points exist and nobody has acted on this PO yet (no check or remark on any of them).",
    counts: "Pending",
  },
};

const GREEN = "#059669";
const RED = "#dc2626";
const AMBER = "#d97706";
const SLATE = "#475569";
const INDIGO = "#4f46e5";
const TEAL = "#0d9488";

const n = (v) => (typeof v === "number" ? v.toLocaleString() : "—");
const pct = (a, b) => (b > 0 ? `${((a / b) * 100).toFixed(1)}%` : "—");

const th = {
  fontWeight: 800,
  fontSize: 12,
  color: "#334155",
  bgcolor: "#f8fafc",
  whiteSpace: "nowrap",
  borderBottom: "2px solid #e2e8f0",
  py: 1,
};
const num = { fontVariantNumeric: "tabular-nums", fontWeight: 700 };

// A number that opens its list when clicked (plain text when it is 0).
const Drill = ({
  value,
  onClick,
  color,
  title = "Click to see the list",
  children,
}) => {
  const shown = children ?? n(value);
  if (!onClick || !value) {
    return (
      <Box component="span" sx={{ color: value ? color : "#94a3b8" }}>
        {shown}
      </Box>
    );
  }
  return (
    <MuiTooltip title={title}>
      <Box
        component="span"
        onClick={onClick}
        sx={{
          cursor: "pointer",
          color,
          borderRadius: 1,
          px: 0.75,
          mx: -0.75,
          textDecoration: "underline",
          textDecorationStyle: "dotted",
          textUnderlineOffset: 3,
          "&:hover": { bgcolor: alpha(color || "#4f46e5", 0.12) },
        }}
      >
        {shown}
      </Box>
    </MuiTooltip>
  );
};

const Card = ({ title, hint, right, children, sx }) => (
  <Paper
    elevation={0}
    sx={{
      borderRadius: 4,
      border: "1px solid",
      borderColor: "grey.100",
      boxShadow: "0 10px 30px -5px rgba(0,0,0,0.04)",
      overflow: "hidden",
      ...sx,
    }}
  >
    <Box
      sx={{
        px: 3,
        pt: 2.5,
        pb: 1.5,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 2,
        flexWrap: "wrap",
      }}
    >
      <Box>
        <Typography variant="h6" sx={{ fontWeight: 800, color: "#0f172a" }}>
          {title}
        </Typography>
        {hint && (
          <Typography
            variant="caption"
            sx={{
              color: "#64748b",
              fontWeight: 500,
              display: "block",
              maxWidth: 900,
            }}
          >
            {hint}
          </Typography>
        )}
      </Box>
      {right}
    </Box>
    <Box sx={{ overflowX: "auto" }}>{children}</Box>
  </Paper>
);

const LoadingRows = ({ cols }) =>
  [0, 1, 2].map((i) => (
    <TableRow key={i}>
      <TableCell colSpan={cols}>
        <Skeleton height={28} />
      </TableCell>
    </TableRow>
  ));

// ------------------------------------------------------- Total = Closed + Pending
const Equation = ({ total, closed, pending, loading, onList }) => {
  const Part = ({ value, label, color, spec, title }) => (
    <Box sx={{ textAlign: "center", minWidth: 120 }}>
      {loading ? (
        <Skeleton width={80} height={48} sx={{ mx: "auto" }} />
      ) : (
        <Typography
          sx={{ fontSize: 36, fontWeight: 800, lineHeight: 1.1, color }}
        >
          <Drill
            value={value}
            color={color}
            onClick={onList ? () => onList(spec, title) : undefined}
          />
        </Typography>
      )}
      <Typography
        variant="caption"
        sx={{ color: "#64748b", fontWeight: 700, letterSpacing: 0.5 }}
      >
        {label}
      </Typography>
    </Box>
  );
  const Sign = ({ children }) => (
    <Typography sx={{ fontSize: 28, fontWeight: 300, color: "#cbd5e1" }}>
      {children}
    </Typography>
  );
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: { xs: 2, md: 4 },
        flexWrap: "wrap",
        py: 2.5,
        px: 3,
      }}
    >
      <Part
        value={total}
        label="TOTAL POs"
        color="#0f172a"
        spec={{ status: "all" }}
        title="All POs"
      />
      <Sign>=</Sign>
      <Part
        value={closed}
        label="CLOSED (Auto-Closed + Reviewed)"
        color={GREEN}
        spec={{ status: "closed" }}
        title="Closed POs (Auto-Closed + Reviewed)"
      />
      <Sign>+</Sign>
      <Part
        value={pending}
        label="PENDING (In Review + Pending)"
        color={RED}
        spec={{ status: "open" }}
        title="Pending POs (In Review + Pending)"
      />
    </Box>
  );
};

const StatusBar = ({ counts, total }) => {
  if (!total) return null;
  const order = ["perfect", "reviewed", "in_review", "pending"];
  return (
    <Box
      sx={{
        display: "flex",
        height: 12,
        borderRadius: 6,
        overflow: "hidden",
        mx: 3,
        mb: 2,
        bgcolor: "#f1f5f9",
      }}
    >
      {order.map((k) =>
        counts[k] > 0 ? (
          <Box
            key={k}
            title={`${STATUS_META[k].label}: ${counts[k]}`}
            sx={{
              width: `${(counts[k] / total) * 100}%`,
              bgcolor: STATUS_META[k].color,
            }}
          />
        ) : null,
      )}
    </Box>
  );
};

// ------------------------------------------------------------------ status table
const StatusTable = ({ rows, total, loading, onList }) => {
  const order = ["pending", "in_review", "reviewed", "perfect"];
  const split = useMemo(() => {
    const out = {};
    for (const k of order) out[k] = bifurcate(rows, k);
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  const cell = (k, side, label) => {
    const v = split[k]?.[side] ?? 0;
    return (
      <TableCell align="right" sx={num}>
        <Drill
          value={v}
          color={STATUS_META[k].color}
          onClick={
            onList
              ? () =>
                  onList(
                    { status: k, side },
                    `${STATUS_META[k].tabLabel} — ${label}`,
                  )
              : undefined
          }
        />
      </TableCell>
    );
  };

  return (
    <Table size="small">
      <TableHead>
        <TableRow>
          <TableCell sx={th}>PO Status</TableCell>
          <TableCell sx={th}>Counts as</TableCell>
          <TableCell sx={th} align="right">
            POs
          </TableCell>
          <TableCell sx={th} align="right">
            % of POs
          </TableCell>
          <TableCell
            sx={{ ...th, bgcolor: "#eef2ff", color: INDIGO }}
            align="right"
          >
            Header only
          </TableCell>
          <TableCell sx={{ ...th, bgcolor: "#f1f5f9" }} align="right">
            Line only
          </TableCell>
          <TableCell
            sx={{ ...th, bgcolor: alpha(AMBER, 0.1), color: "#b45309" }}
            align="right"
          >
            Header + Line
          </TableCell>
          <TableCell sx={th}>What it means</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {loading && !rows.length ? (
          <LoadingRows cols={8} />
        ) : (
          order.map((k) => {
            const m = STATUS_META[k];
            const count = split[k]?.total ?? 0;
            return (
              <TableRow key={k} hover>
                <TableCell sx={{ fontWeight: 800, color: m.color }}>
                  <Box
                    component="span"
                    sx={{
                      display: "inline-block",
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      bgcolor: m.color,
                      mr: 1,
                    }}
                  />
                  {m.label}
                </TableCell>
                <TableCell
                  sx={{
                    fontWeight: 700,
                    color: m.counts === "Closed" ? GREEN : RED,
                  }}
                >
                  {m.counts}
                </TableCell>
                <TableCell align="right" sx={num}>
                  <Drill
                    value={count}
                    color={m.color}
                    onClick={
                      onList
                        ? () => onList({ status: k }, m.tabLabel)
                        : undefined
                    }
                  />
                </TableCell>
                <TableCell align="right" sx={{ color: "#64748b" }}>
                  {pct(count, total)}
                </TableCell>
                {k === "perfect" ? (
                  <TableCell
                    colSpan={3}
                    align="center"
                    sx={{ color: "#94a3b8" }}
                  >
                    no issue anywhere
                  </TableCell>
                ) : (
                  <>
                    {cell(k, "header", "problem in Header only")}
                    {cell(k, "line", "problem in Line items only")}
                    {cell(k, "both", "problem in Header and Line items")}
                  </>
                )}
                <TableCell sx={{ color: "#475569", minWidth: 320 }}>
                  {m.help}
                </TableCell>
              </TableRow>
            );
          })
        )}
        <TableRow sx={{ bgcolor: "#f8fafc" }}>
          <TableCell sx={{ fontWeight: 800 }}>All POs</TableCell>
          <TableCell />
          <TableCell align="right" sx={{ ...num, fontWeight: 800 }}>
            <Drill
              value={total}
              color="#0f172a"
              onClick={
                onList ? () => onList({ status: "all" }, "All POs") : undefined
              }
            />
          </TableCell>
          <TableCell align="right" sx={{ color: "#64748b" }}>
            {total ? "100%" : "—"}
          </TableCell>
          <TableCell colSpan={4} sx={{ color: "#64748b" }}>
            Closed = Auto-Closed + Reviewed. Pending = In Review + Pending.
            “Header only / Line only / Header + Line” says where the pending
            points are (for Reviewed: where the Not Verified points were).
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
  );
};

// ------------------------------------------------------------------ level table
const LevelTable = ({ data, loading, onList }) => {
  const s = data?.poSummary || {};
  const total = s.total ?? 0;
  const lines = [
    {
      key: "header",
      label: "Header level",
      color: INDIGO,
      closed: s.header?.closed ?? 0,
      pending: s.header?.pending ?? 0,
      closedSpec: { metric: "headerClosed" },
      pendingSpec: { metric: "headerOpen" },
    },
    {
      key: "line",
      label: "Line-item level",
      color: SLATE,
      closed: s.line?.closed ?? 0,
      pending: s.line?.pending ?? 0,
      closedSpec: { metric: "lineClosed" },
      pendingSpec: { metric: "lineOpen" },
    },
  ];
  const go = (spec, title) => (onList ? () => onList(spec, title) : undefined);
  return (
    <Table size="small">
      <TableHead>
        <TableRow>
          <TableCell sx={th}>Level (unit: POs)</TableCell>
          <TableCell sx={th} align="right">
            Total POs
          </TableCell>
          <TableCell sx={th} align="right">
            POs Closed
          </TableCell>
          <TableCell sx={th} align="right">
            POs Pending
          </TableCell>
          <TableCell sx={th} align="right">
            % Closed
          </TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {loading && !data ? (
          <LoadingRows cols={5} />
        ) : (
          <>
            {lines.map((l) => (
              <TableRow key={l.key} hover>
                <TableCell sx={{ fontWeight: 800, color: l.color }}>
                  {l.label}
                </TableCell>
                <TableCell align="right" sx={num}>
                  <Drill
                    value={total}
                    color="#0f172a"
                    onClick={go({ status: "all" }, "All POs")}
                  />
                </TableCell>
                <TableCell align="right" sx={num}>
                  <Drill
                    value={l.closed}
                    color={GREEN}
                    onClick={go(
                      l.closedSpec,
                      `POs closed at ${l.label.toLowerCase()}`,
                    )}
                  />
                </TableCell>
                <TableCell align="right" sx={num}>
                  <Drill
                    value={l.pending}
                    color={RED}
                    onClick={go(
                      l.pendingSpec,
                      `POs pending at ${l.label.toLowerCase()}`,
                    )}
                  />
                </TableCell>
                <TableCell align="right" sx={{ color: "#64748b" }}>
                  {pct(l.closed, total)}
                </TableCell>
              </TableRow>
            ))}
            <TableRow sx={{ bgcolor: "#f8fafc" }}>
              <TableCell sx={{ fontWeight: 800 }}>
                Whole PO (header + lines)
              </TableCell>
              <TableCell align="right" sx={{ ...num, fontWeight: 800 }}>
                <Drill
                  value={total}
                  color="#0f172a"
                  onClick={go({ status: "all" }, "All POs")}
                />
              </TableCell>
              <TableCell align="right" sx={num}>
                <Drill
                  value={s.closed}
                  color={GREEN}
                  onClick={go({ status: "closed" }, "Closed POs")}
                />
              </TableCell>
              <TableCell align="right" sx={num}>
                <Drill
                  value={s.pending}
                  color={RED}
                  onClick={go({ status: "open" }, "Pending POs")}
                />
              </TableCell>
              <TableCell align="right" sx={{ color: "#64748b" }}>
                {pct(s.closed ?? 0, total)}
              </TableCell>
            </TableRow>
          </>
        )}
      </TableBody>
    </Table>
  );
};

// ----------------------------------------------------------------- points table
const PointsTable = ({ block, loading, color, level, onPoints, onList }) => {
  const rows = block?.rows || [];
  const tot = block?.total || {};
  const section = level === "header" ? "header" : "line";
  const title = level === "header" ? "Header" : "Line Item";
  const pointGo = (bucket) =>
    onPoints
      ? () => onPoints({ section, title, bucket, closedLabel: "Points Closed" })
      : undefined;
  return (
    <Table size="small">
      <TableHead>
        <TableRow>
          <TableCell sx={{ ...th, color }}>Point result</TableCell>
          <TableCell sx={th} align="right">
            Total
          </TableCell>
          <TableCell sx={th} align="right">
            Closed
          </TableCell>
          <TableCell sx={th} align="right">
            Pending
          </TableCell>
          <TableCell sx={th} align="right">
            Manual
          </TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {loading && !block ? (
          <LoadingRows cols={5} />
        ) : (
          <>
            {rows.map((r) => {
              const isNv = r.key === "notVerified";
              const isManual = r.key === "manual";
              return (
                <TableRow key={r.key} hover>
                  <TableCell sx={{ fontWeight: 700 }}>{r.label}</TableCell>
                  <TableCell align="right" sx={num}>
                    <Drill
                      value={r.total}
                      onClick={isNv ? pointGo("total") : undefined}
                      title="Click to see every Not Verified point"
                    />
                  </TableCell>
                  <TableCell
                    align="right"
                    sx={{ ...num, color: r.closed ? GREEN : "#94a3b8" }}
                  >
                    <Drill
                      value={r.closed}
                      color={GREEN}
                      onClick={isNv ? pointGo("closed") : undefined}
                      title="Click to see the closed Not Verified points"
                    />
                  </TableCell>
                  <TableCell
                    align="right"
                    sx={{ ...num, color: r.pending ? RED : "#94a3b8" }}
                  >
                    <Drill
                      value={r.pending}
                      color={RED}
                      onClick={isNv ? pointGo("pending") : undefined}
                      title="Click to see the pending Not Verified points"
                    />
                  </TableCell>
                  <TableCell
                    align="right"
                    sx={{ ...num, color: r.manual ? AMBER : "#94a3b8" }}
                  >
                    <Drill
                      value={r.manual}
                      color={AMBER}
                      onClick={
                        isManual && onList
                          ? () =>
                              onList(
                                {
                                  metric:
                                    level === "header"
                                      ? "headerManual"
                                      : "lineManual",
                                },
                                `POs with Manual ${title.toLowerCase()} points`,
                              )
                          : undefined
                      }
                      title="Click to see POs with Manual points"
                    />
                  </TableCell>
                </TableRow>
              );
            })}
            <TableRow sx={{ bgcolor: "#f8fafc" }}>
              <TableCell sx={{ fontWeight: 800 }}>All points</TableCell>
              <TableCell align="right" sx={{ ...num, fontWeight: 800 }}>
                {n(tot.total)}
              </TableCell>
              <TableCell align="right" sx={{ ...num, color: GREEN }}>
                {n(tot.closed)}
              </TableCell>
              <TableCell align="right" sx={{ ...num, color: RED }}>
                {n(tot.pending)}
              </TableCell>
              <TableCell align="right" sx={{ ...num, color: AMBER }}>
                {n(tot.manual)}
              </TableCell>
            </TableRow>
          </>
        )}
      </TableBody>
    </Table>
  );
};

// -------------------------------------------------------- purchase group table
function buildGroups(rows) {
  const m = new Map();
  for (const r of rows) {
    const key = r.purchaseGroup || "Unassigned";
    let g = m.get(key);
    if (!g) {
      g = {
        purchaseGroup: key,
        purchaseGroupName: r.purchaseGroupName,
        totalPOs: 0,
        perfect: 0,
        reviewed: 0,
        inReview: 0,
        pending: 0,
        headerIssuePOs: 0,
        lineIssuePOs: 0,
        hNv: 0,
        hClosed: 0,
        hPending: 0,
        hManual: 0,
        lNv: 0,
        lClosed: 0,
        lPending: 0,
        lManual: 0,
      };
      m.set(key, g);
    }
    g.totalPOs += 1;
    if (r.poStatus === "perfect") g.perfect += 1;
    else if (r.poStatus === "reviewed") g.reviewed += 1;
    else if (r.poStatus === "in_review") g.inReview += 1;
    else g.pending += 1;
    const s = issueSide(r);
    if (s.header) g.headerIssuePOs += 1;
    if (s.line) g.lineIssuePOs += 1;
    g.hNv += r.headerNotVerified || 0;
    g.hClosed += r.headerClosedPoints || 0;
    g.hPending += r.headerPendingPoints || 0;
    g.hManual += r.headerManualPoints || 0;
    g.lNv += r.lineNotVerified || 0;
    g.lClosed += r.lineClosedPoints || 0;
    g.lPending += r.linePendingPoints || 0;
    g.lManual += r.lineManualPoints || 0;
  }
  return [...m.values()]
    .map((g) => ({
      ...g,
      closed: g.perfect + g.reviewed,
      open: g.inReview + g.pending,
    }))
    .sort(
      (a, b) =>
        b.open - a.open || a.purchaseGroup.localeCompare(b.purchaseGroup),
    );
}

const GroupTable = ({ rows, summary, loading, onList, rcByGroup }) => {
  const [view, setView] = useState("po");
  const groups = useMemo(() => buildGroups(rows), [rows]);
  const rcMap = useMemo(() => {
    const m = new Map();
    for (const g of rcByGroup || []) m.set(g.purchaseGroup, g.rc);
    return m;
  }, [rcByGroup]);

  // "POs Corrected" = UNIQUE POs a buyer corrected ("Is PO corrected? = Yes"),
  // Store both the count and the exact array of PO numbers.
  const corrMap = useMemo(() => {
    const m = new Map();
    for (const g of rcByGroup || []) {
      m.set(g.purchaseGroup, {
        count: g.posCorrected ?? 0,
        poNumbers: g.correctedPoNumbers || [],
      });
    }
    return m;
  }, [rcByGroup]);

  const corrTotal = rcByGroup
    ? rcByGroup.reduce((a, x) => a + (x.posCorrected || 0), 0)
    : null;

  const corrTotalList = useMemo(() => {
    if (!rcByGroup) return [];
    const all = new Set();
    rcByGroup.forEach((g) => {
      (g.correctedPoNumbers || []).forEach((po) => all.add(po));
    });
    return Array.from(all);
  }, [rcByGroup]);

  const corrValue = (g) =>
    g ? (rcByGroup ? (corrMap.get(g.purchaseGroup)?.count ?? 0) : null) : corrTotal;

  const corrList = (g) =>
    g ? (rcByGroup ? (corrMap.get(g.purchaseGroup)?.poNumbers ?? []) : []) : corrTotalList;

  const go = (g, spec, label) =>
    onList
      ? () =>
          onList(
            { ...spec, group: g ? g.purchaseGroup : undefined },
            `${g ? g.purchaseGroup : "All purchase groups"} — ${label}`,
          )
      : undefined;

  const corrHead = (
    <TableCell
      sx={{ ...th, bgcolor: alpha(INDIGO, 0.08), color: INDIGO }}
      align="right"
    >
      POs Corrected
      <Typography
        component="span"
        sx={{ display: "block", fontSize: 10, fontWeight: 600 }}
      >
        by buyers (unique POs)
      </Typography>
    </TableCell>
  );

  const corrCell = (g) => {
    const v = corrValue(g);
    const list = corrList(g);
    return (
      <TableCell
        align="right"
        sx={{ ...num, color: INDIGO, ...(!g && { fontWeight: 800 }) }}
      >
        {v == null ? (
          "—"
        ) : (
          <Drill
            value={v}
            color={INDIGO}
            onClick={go(g, { metric: "poCorrected", correctedPoNumbers: list }, "POs Corrected")}
          />
        )}
      </TableCell>
    );
  };

  const sum = (k) => groups.reduce((a, g) => a + (g[k] || 0), 0);
  const T = {
    totalPOs: sum("totalPOs"),
    perfect: sum("perfect"),
    reviewed: sum("reviewed"),
    closed: sum("closed"),
    inReview: sum("inReview"),
    pending: sum("pending"),
    open: sum("open"),
    headerIssuePOs: sum("headerIssuePOs"),
    lineIssuePOs: sum("lineIssuePOs"),
    hNv: sum("hNv"),
    hClosed: sum("hClosed"),
    hPending: sum("hPending"),
    hManual: sum("hManual"),
    lNv: sum("lNv"),
    lClosed: sum("lClosed"),
    lPending: sum("lPending"),
    lManual: sum("lManual"),
  };
  const matches =
    summary && T.totalPOs === summary.total && T.closed === summary.closed;

  const C = ({ g, value, spec, label, color, bold }) => (
    <TableCell align="right" sx={{ ...num, ...(bold && { fontWeight: 800 }) }}>
      <Drill value={value} color={color} onClick={go(g, spec, label)} />
    </TableCell>
  );

  const poHeader = (
    <TableRow>
      <TableCell sx={th}>Purchase group</TableCell>
      <TableCell sx={th} align="right">
        Total POs
      </TableCell>
      {corrHead}
      <TableCell sx={th} align="right">
        Auto-Closed
      </TableCell>
      <TableCell sx={th} align="right">
        Reviewed
      </TableCell>
      <TableCell
        sx={{ ...th, color: GREEN, bgcolor: alpha(GREEN, 0.08) }}
        align="right"
      >
        Closed
        <Typography
          component="span"
          sx={{ display: "block", fontSize: 10, fontWeight: 600 }}
        >
          Auto-Closed + Reviewed
        </Typography>
      </TableCell>
      <TableCell sx={th} align="right">
        In Review
      </TableCell>
      <TableCell sx={th} align="right">
        Pending
      </TableCell>
      <TableCell
        sx={{ ...th, color: RED, bgcolor: alpha(RED, 0.08) }}
        align="right"
      >
        Open
        <Typography
          component="span"
          sx={{ display: "block", fontSize: 10, fontWeight: 600 }}
        >
          In Review + Pending
        </Typography>
      </TableCell>
      <TableCell
        sx={{ ...th, bgcolor: "#eef2ff", color: INDIGO }}
        align="right"
      >
        Problem in Header
      </TableCell>
      <TableCell sx={{ ...th, bgcolor: "#f1f5f9" }} align="right">
        Problem in Lines
      </TableCell>
      <TableCell sx={th} align="right">
        % Closed
      </TableCell>
    </TableRow>
  );

  const poRow = (g, key) => (
    <TableRow key={key} hover sx={!g ? { bgcolor: "#f8fafc" } : undefined}>
      <TableCell sx={{ fontWeight: 800 }}>
        {g ? (
          <Drill
            value={g.totalPOs}
            color="#0f172a"
            onClick={go(g, { status: "all" }, "All POs")}
          >
            {g.purchaseGroup}
          </Drill>
        ) : (
          "All groups"
        )}
        {g?.purchaseGroupName && g.purchaseGroupName !== g.purchaseGroup && (
          <Typography
            component="span"
            variant="caption"
            sx={{ color: "#64748b", ml: 1, fontWeight: 500 }}
          >
            {g.purchaseGroupName}
          </Typography>
        )}
      </TableCell>
      {(() => {
        const d = g || T;
        return (
          <>
            <C
              g={g}
              value={d.totalPOs}
              spec={{ status: "all" }}
              label="All POs"
              color="#0f172a"
              bold={!g}
            />
            {corrCell(g)}
            <C
              g={g}
              value={d.perfect}
              spec={{ status: "perfect" }}
              label="Auto-Closed POs"
              color={STATUS_META.perfect.color}
            />
            <C
              g={g}
              value={d.reviewed}
              spec={{ status: "reviewed" }}
              label="POs Reviewed"
              color={STATUS_META.reviewed.color}
            />
            <C
              g={g}
              value={d.closed}
              spec={{ status: "closed" }}
              label="Closed POs"
              color={GREEN}
              bold
            />
            <C
              g={g}
              value={d.inReview}
              spec={{ status: "in_review" }}
              label="POs In Review"
              color={STATUS_META.in_review.color}
            />
            <C
              g={g}
              value={d.pending}
              spec={{ status: "pending" }}
              label="Pending POs"
              color={STATUS_META.pending.color}
            />
            <C
              g={g}
              value={d.open}
              spec={{ status: "open" }}
              label="Open POs"
              color={RED}
              bold
            />
            <C
              g={g}
              value={d.headerIssuePOs}
              spec={{ side: "headerAny" }}
              label="problem in Header"
              color={INDIGO}
            />
            <C
              g={g}
              value={d.lineIssuePOs}
              spec={{ side: "lineAny" }}
              label="problem in Line items"
              color={SLATE}
            />
            <TableCell align="right" sx={{ color: "#64748b" }}>
              {pct(d.closed, d.totalPOs)}
            </TableCell>
          </>
        );
      })()}
    </TableRow>
  );

  const pointHeader = (
    <TableRow>
      <TableCell sx={th}>Purchase group</TableCell>
      {corrHead}
      <TableCell
        sx={{ ...th, bgcolor: "#eef2ff", color: INDIGO }}
        align="right"
      >
        Header NV
      </TableCell>
      <TableCell
        sx={{ ...th, bgcolor: "#eef2ff", color: INDIGO }}
        align="right"
      >
        Header closed
      </TableCell>
      <TableCell
        sx={{ ...th, bgcolor: "#eef2ff", color: INDIGO }}
        align="right"
      >
        Header pending
      </TableCell>
      <TableCell
        sx={{ ...th, bgcolor: "#eef2ff", color: INDIGO }}
        align="right"
      >
        Header manual
      </TableCell>
      <TableCell sx={{ ...th, bgcolor: "#f1f5f9" }} align="right">
        Line NV
      </TableCell>
      <TableCell sx={{ ...th, bgcolor: "#f1f5f9" }} align="right">
        Line closed
      </TableCell>
      <TableCell sx={{ ...th, bgcolor: "#f1f5f9" }} align="right">
        Line pending
      </TableCell>
      <TableCell sx={{ ...th, bgcolor: "#f1f5f9" }} align="right">
        Line manual
      </TableCell>
      <TableCell sx={th} align="right">
        Total NV
      </TableCell>
      <TableCell
        sx={{ ...th, color: GREEN, bgcolor: alpha(GREEN, 0.08) }}
        align="right"
      >
        Closed
      </TableCell>
      <TableCell
        sx={{ ...th, color: RED, bgcolor: alpha(RED, 0.08) }}
        align="right"
      >
        Pending
      </TableCell>
      <TableCell sx={th} align="right">
        % points closed
      </TableCell>
      <TableCell
        sx={{ ...th, bgcolor: alpha(TEAL, 0.08), color: TEAL }}
        align="right"
      >
        RC NV
      </TableCell>
      <TableCell
        sx={{ ...th, bgcolor: alpha(TEAL, 0.08), color: TEAL }}
        align="right"
      >
        RC closed
      </TableCell>
      <TableCell
        sx={{ ...th, bgcolor: alpha(TEAL, 0.08), color: TEAL }}
        align="right"
      >
        RC pending
      </TableCell>
    </TableRow>
  );

  const pointRow = (g, key) => {
    const d = g || T;
    const nv = d.hNv + d.lNv;
    const closed = d.hClosed + d.lClosed;
    const pending = d.hPending + d.lPending;
    const rc = g
      ? rcMap.get(g.purchaseGroup)
      : (rcByGroup || []).reduce(
          (a, x) => ({
            systemGenerated: a.systemGenerated + (x.rc?.systemGenerated || 0),
            closed: a.closed + (x.rc?.closed || 0),
            pending: a.pending + (x.rc?.pending || 0),
          }),
          { systemGenerated: 0, closed: 0, pending: 0 },
        );
    return (
      <TableRow key={key} hover sx={!g ? { bgcolor: "#f8fafc" } : undefined}>
        <TableCell sx={{ fontWeight: 800 }}>
          {g ? g.purchaseGroup : "All groups"}
        </TableCell>
        {corrCell(g)}
        <C
          g={g}
          value={d.hNv}
          spec={{ metric: "headerNv" }}
          label="POs with Not Verified header points"
          color={INDIGO}
        />
        <C
          g={g}
          value={d.hClosed}
          spec={{ metric: "headerPtClosed" }}
          label="POs with closed header points"
          color={GREEN}
        />
        <C
          g={g}
          value={d.hPending}
          spec={{ metric: "headerPtPending" }}
          label="POs with pending header points"
          color={RED}
        />
        <C
          g={g}
          value={d.hManual}
          spec={{ metric: "headerManual" }}
          label="POs with Manual header points"
          color={AMBER}
        />
        <C
          g={g}
          value={d.lNv}
          spec={{ metric: "lineNv" }}
          label="POs with Not Verified line points"
          color={SLATE}
        />
        <C
          g={g}
          value={d.lClosed}
          spec={{ metric: "linePtClosed" }}
          label="POs with closed line points"
          color={GREEN}
        />
        <C
          g={g}
          value={d.lPending}
          spec={{ metric: "linePtPending" }}
          label="POs with pending line points"
          color={RED}
        />
        <C
          g={g}
          value={d.lManual}
          spec={{ metric: "lineManual" }}
          label="POs with Manual line points"
          color={AMBER}
        />
        <C
          g={g}
          value={nv}
          spec={{ metric: "anyNv" }}
          label="POs with Not Verified points"
          color="#0f172a"
          bold
        />
        <C
          g={g}
          value={closed}
          spec={{ metric: "anyPtClosed" }}
          label="POs with closed points"
          color={GREEN}
          bold
        />
        <C
          g={g}
          value={pending}
          spec={{ metric: "anyPtPending" }}
          label="POs with pending points"
          color={RED}
          bold
        />
        <TableCell align="right" sx={{ color: "#64748b" }}>
          {pct(closed, nv)}
        </TableCell>
        <TableCell align="right" sx={num}>
          {rc ? n(rc.systemGenerated) : "—"}
        </TableCell>
        <TableCell align="right" sx={num}>
          {rc ? n(rc.closed) : "—"}
        </TableCell>
        <TableCell align="right" sx={num}>
          {rc ? n(rc.pending) : "—"}
        </TableCell>
      </TableRow>
    );
  };

  return (
    <Card
      title="Purchase Group Compliance"
      hint={
        view === "po"
          ? "Total POs = Closed + Open. Closed = Auto-Closed + Reviewed. Open = In Review + Pending (Not Verified points only). Click any number for its PO list; click a PO for its header points and line items."
          : "Points per group, split Header / Line. NV = Not Verified; Closed + Pending = NV. Manual points are tracked on their own. Click a number for the POs that hold those points."
      }
      right={
        <ToggleButtonGroup
          size="small"
          exclusive
          value={view}
          onChange={(_, v) => v && setView(v)}
        >
          <ToggleButton
            value="po"
            sx={{ textTransform: "none", fontWeight: 700, px: 2 }}
          >
            PO view
          </ToggleButton>
          <ToggleButton
            value="points"
            sx={{ textTransform: "none", fontWeight: 700, px: 2 }}
          >
            Point view
          </ToggleButton>
        </ToggleButtonGroup>
      }
    >
      <Table size="small">
        <TableHead>{view === "po" ? poHeader : pointHeader}</TableHead>
        <TableBody>
          {loading && !groups.length ? (
            <LoadingRows cols={view === "po" ? 12 : 17} />
          ) : (
            <>
              {groups.map((g) =>
                view === "po"
                  ? poRow(g, g.purchaseGroup)
                  : pointRow(g, g.purchaseGroup),
              )}
              {view === "po" ? poRow(null, "total") : pointRow(null, "total")}
            </>
          )}
        </TableBody>
      </Table>
      {!loading && summary && (
        <Typography
          variant="caption"
          sx={{
            display: "block",
            px: 3,
            py: 1.5,
            fontWeight: 700,
            color: matches ? GREEN : AMBER,
          }}
        >
          {matches
            ? `✔ Group totals match the overall numbers: ${n(T.totalPOs)} POs, ${n(T.closed)} closed.`
            : `⚠ Group totals (${n(T.totalPOs)} POs, ${n(T.closed)} closed) differ from overall (${n(summary.total)} POs, ${n(summary.closed)} closed).`}
        </Typography>
      )}
    </Card>
  );
};

// --------------------------------------------------------------- component
const PoStatusSummaryTables = ({
  data,
  loading,
  onList,
  onPoints,
  rcByGroup,
}) => {
  const s = data?.poSummary || {};
  const scope = data?.scopeNote;
  const rows = data?.poRows || [];
  const showGroups = Boolean(data?.byPurchaseGroup);

  return (
    <Box sx={{ mb: 5 }}>
      <Typography
        variant="overline"
        sx={{
          fontWeight: 800,
          color: "#64748b",
          letterSpacing: 1.5,
          display: "block",
          mb: 1.5,
        }}
      >
        PO Status Summary — one definition of Closed everywhere. Every number is
        clickable.
      </Typography>

      <Card
        title="PO Status"
        hint="Closed = no pending point on the PO (header or lines). The PO list below and the PO Data page use exactly these numbers."
        sx={{ mb: 3 }}
      >
        <Equation
          total={s.total}
          closed={s.closed}
          pending={s.pending}
          loading={loading && !data}
          onList={onList}
        />
        <StatusBar counts={data?.statusCounts || {}} total={s.total || 0} />
        <StatusTable
          rows={rows}
          total={s.total ?? 0}
          loading={loading}
          onList={onList}
        />
        {scope?.excludedPlaceholderPOs > 0 && (
          <Typography
            variant="caption"
            sx={{ display: "block", px: 3, py: 1.5, color: "#64748b" }}
          >
            {n(scope.excludedPlaceholderPOs)} RC-placeholder POs (types{" "}
            {(scope.excludedPoTypes || []).join(", ")}) are not real POs, so
            they are left out of every PO count on this dashboard and on the PO
            Data page.
          </Typography>
        )}
      </Card>

      <Card
        title="Where is the pending work?"
        hint={`Same ${n(s.total)} POs counted by header and by line items. ${n(s.bothPending)} POs are pending at BOTH levels.`}
        sx={{ mb: 3 }}
      >
        <LevelTable data={data} loading={loading} onList={onList} />
        {!loading && s.total > 0 && (
          <Typography
            variant="caption"
            sx={{
              display: "block",
              px: 3,
              py: 1.5,
              color: "#475569",
              fontWeight: 600,
            }}
          >
            A whole PO is closed only when BOTH its header and all its lines are
            closed: {n(s.header?.closed)} header-closed −{" "}
            {n(Math.max((s.header?.closed ?? 0) - (s.closed ?? 0), 0))} POs that
            are still pending on line items = {n(s.closed)} closed POs.
          </Typography>
        )}
      </Card>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", lg: "1fr 1fr" },
          gap: 3,
          mb: 3,
        }}
      >
        <Card
          title="Header points"
          hint={`${n(data?.headerPoints?.pointsPerPO ?? 9)} points × ${n(data?.headerPoints?.totalPOs)} POs (unit: points). Total = Closed + Pending + Manual. Pending = Not Verified without a check/remark only. Click the Not Verified numbers for the point list.`}
        >
          <PointsTable
            block={data?.headerPoints}
            loading={loading}
            color={INDIGO}
            level="header"
            onPoints={onPoints}
            onList={onList}
          />
        </Card>
        <Card
          title="Line-item points"
          hint={`${n(data?.linePoints?.pointsPerLine ?? 10)} points × ${n(data?.linePoints?.totalLines)} lines (unit: points). Total = Closed + Pending + Manual. Click the Not Verified numbers for the point list.`}
        >
          <PointsTable
            block={data?.linePoints}
            loading={loading}
            color={SLATE}
            level="line"
            onPoints={onPoints}
            onList={onList}
          />
        </Card>
      </Box>

      {showGroups && (
        <GroupTable
          rows={rows}
          summary={s}
          loading={loading}
          onList={onList}
          rcByGroup={rcByGroup}
        />
      )}
    </Box>
  );
};

export default PoStatusSummaryTables;