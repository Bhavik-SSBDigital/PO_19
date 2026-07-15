import { Box, Chip, Divider, Typography } from "@mui/material";

const money = (n) => (n || n === 0 ? Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 }) : "-");

const SEVERITY_COLOR = { Critical: "#c0392b", High: "#e67e22", Medium: "#f1c40f", Low: "#95a5a6" };

const Frame = ({ children }) => (
  <Box
    sx={{
      bgcolor: "background.paper",
      border: "1px solid",
      borderColor: "divider",
      borderRadius: 1,
      boxShadow: 3,
      p: 1.25,
      minWidth: 200,
    }}
  >
    {children}
  </Box>
);

const Hint = () => (
  <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5, fontStyle: "italic" }}>
    Click to see the underlying PO lines
  </Typography>
);

export const ControlWiseTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const total = (d.verified || 0) + (d.notVerified || 0);
  return (
    <Frame>
      <Typography variant="subtitle2">Point #{d.pointNo}: {d.label}</Typography>
      <Chip size="small" label={d.severity} sx={{ bgcolor: SEVERITY_COLOR[d.severity], color: "#fff", my: 0.5 }} />
      <Divider sx={{ my: 0.5 }} />
      <Typography variant="body2">Compliance: {d.compliancePct == null ? "N/A" : `${d.compliancePct}%`}</Typography>
      <Typography variant="body2">Verified: {d.verified} / {total} lines</Typography>
      <Typography variant="body2" color="error.main">Not verified: {d.notVerified}</Typography>
      <Hint />
    </Frame>
  );
};

export const SeverityTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <Frame>
      <Typography variant="subtitle2">{d.severity} severity exceptions</Typography>
      <Typography variant="body2">{d.count} exception{d.count === 1 ? "" : "s"} ({d.pct}% of all exceptions)</Typography>
      <Hint />
    </Frame>
  );
};

export const PoTypeTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const total = (d.verified || 0) + (d.notVerified || 0);
  return (
    <Frame>
      <Typography variant="subtitle2">PO Type: {label}</Typography>
      <Typography variant="body2">Compliance: {d.compliancePct == null ? "N/A" : `${d.compliancePct}%`}</Typography>
      <Typography variant="body2" color="success.main">● Verified: {d.verified}</Typography>
      <Typography variant="body2" color="error.main">● Not verified: {d.notVerified}</Typography>
      <Typography variant="caption" color="text.secondary">{total} total lines</Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5, fontStyle: "italic" }}>
        Click the green part for verified lines, the red part for exceptions
      </Typography>
    </Frame>
  );
};

export const MonthlyTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <Frame>
      <Typography variant="subtitle2">{label}</Typography>
      <Typography variant="body2">{d.count} exception line{d.count === 1 ? "" : "s"}</Typography>
      <Typography variant="body2">Value exposure: {money(d.valueExposure)}</Typography>
      <Hint />
    </Frame>
  );
};

export const BucketTooltip = ({ active, payload, label, unit = "" }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <Frame>
      <Typography variant="subtitle2">{d.key ?? label}</Typography>
      <Typography variant="body2">{d.value} exception line{d.value === 1 ? "" : "s"}</Typography>
      {d.poCount != null && <Typography variant="body2">Across {d.poCount} distinct PO{d.poCount === 1 ? "" : "s"}</Typography>}
      {d.valueExposure != null && <Typography variant="body2">Value exposure: {money(d.valueExposure)}{unit}</Typography>}
      {d.name && <Typography variant="caption" color="text.secondary">{d.name}</Typography>}
      <Hint />
    </Frame>
  );
};

export const HoldAgeingTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <Frame>
      <Typography variant="subtitle2">{label}</Typography>
      <Typography variant="body2">{d.count} hold line{d.count === 1 ? "" : "s"}</Typography>
      {d.poCount != null && <Typography variant="body2">{d.poCount} distinct PO{d.poCount === 1 ? "" : "s"}</Typography>}
      <Hint />
    </Frame>
  );
};
