import {
  Table, TableHead, TableRow, TableCell, TableBody, TableContainer, Paper,
  Chip, Typography, Tooltip as MuiTooltip,
} from "@mui/material";

const SEVERITY_COLORS = { Critical: "#c0392b", High: "#e67e22", Medium: "#f1c40f", Low: "#95a5a6" };

const CLASSIFICATION_LABEL = (p) => {
  if (p.not_applicable) return { label: "Not Applicable", color: "default" };
  if (p.manual_verification || p.missing_data) return { label: "Manual Review", color: "warning" };
  if (p.verified) return { label: "Verified", color: "success" };
  return { label: "Not Verified", color: "error" };
};

// `results` is the auditResult.results array as returned by po-controller.js
// (each item already carries title/summary/severity - see withPointReference
// in the backend). Renders all 19 points, in order, with what each one
// checks. Intentionally has NO "Status" column (po_status/"PO HOLD" is a
// PO-level field, not a per-point one, and shouldn't appear here or anywhere).
const AuditPointsBreakdown = ({ results = [] }) => {
  const sorted = [...results].sort((a, b) => Number(a.pointNo) - Number(b.pointNo));

  return (
    <TableContainer component={Paper} variant="outlined">
      <Table size="small">
        <TableHead sx={{ bgcolor: "#f5f5f5" }}>
          <TableRow>
            <TableCell sx={{ width: 50, fontWeight: 600 }}>#</TableCell>
            <TableCell sx={{ fontWeight: 600 }}>Audit Point</TableCell>
            <TableCell sx={{ fontWeight: 600 }}>What It Checks</TableCell>
            <TableCell sx={{ fontWeight: 600, width: 110 }}>Criticality</TableCell>
            <TableCell sx={{ fontWeight: 600, width: 140 }}>Result</TableCell>
            <TableCell sx={{ fontWeight: 600 }}>Remark</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {sorted.map((p) => {
            const classification = CLASSIFICATION_LABEL(p);
            return (
              <TableRow key={p.pointNo} hover>
                <TableCell sx={{ fontWeight: 600 }}>{p.pointNo}</TableCell>
                <TableCell>{p.title || `Point ${p.pointNo}`}</TableCell>
                <TableCell>
                  <Typography variant="body2" color="text.secondary">{p.summary || "—"}</Typography>
                </TableCell>
                <TableCell>
                  <Chip size="small" label={p.severity || "Medium"} sx={{ bgcolor: SEVERITY_COLORS[p.severity] || "#999", color: "#fff" }} />
                </TableCell>
                <TableCell>
                  <Chip size="small" label={classification.label} color={classification.color} variant={classification.label === "Not Applicable" ? "outlined" : "filled"} />
                </TableCell>
                <TableCell>
                  <MuiTooltip title={p.logic || ""}>
                    <Typography variant="body2">{(p.remarks || []).join("; ") || "—"}</Typography>
                  </MuiTooltip>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
};

export default AuditPointsBreakdown;