import { useEffect, useMemo, useState } from "react";
import {
  Box, Button, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogTitle, Grid, IconButton, Paper, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Typography, Chip,
} from "@mui/material";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import OpenInNewRoundedIcon from "@mui/icons-material/OpenInNewRounded";
import PanToolAltRoundedIcon from "@mui/icons-material/PanToolAltRounded";
import TaskAltRoundedIcon from "@mui/icons-material/TaskAltRounded";
import { post } from "utils/axiosApi";

// "results" and "exceptionPoints" are rendered by the dedicated block below,
// not the generic array-of-objects dumper — so exclude both here.
const PREVIEW_EXCLUDE_KEYS = new Set([
  "_id", "__v", "processDocuments", "multipleMatches", "results", "exceptionPoints",
]);

const humanizeKey = (k) =>
  k.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

const isTaggableKey = (key) => /status|verified|complian|result|remark/i.test(key);

const TAG_STYLES = [
  { test: /^(true|yes|verified|compliant|passed?|ok)$/i, bg: "#dcfce7", color: "#15803d" },
  { test: /^(false|no|not[\s_-]?verified|exception|failed?|non[\s_-]?compliant)$/i, bg: "#fee2e2", color: "#b91c1c" },
  { test: /^(n\/?a|not[\s_-]?applicable)$/i, bg: "#f1f5f9", color: "#475569" },
  { test: /^(manual([\s_-]?review)?|pending)$/i, bg: "#fef9c3", color: "#a16207" },
];

const renderTagOrValue = (key, value) => {
  if (typeof value === "boolean") {
    return (
      <Chip size="small" label={value ? "Verified" : "Not Verified"}
        sx={{ bgcolor: value ? "#dcfce7" : "#fee2e2", color: value ? "#15803d" : "#b91c1c", fontWeight: 700 }} />
    );
  }
  if (isTaggableKey(key) && typeof value === "string") {
    const match = TAG_STYLES.find((m) => m.test.test(value.trim()));
    if (match) {
      return <Chip size="small" label={value} sx={{ bgcolor: match.bg, color: match.color, fontWeight: 700 }} />;
    }
  }
  return (
    <Typography variant="body2" sx={{ fontWeight: 600, wordBreak: "break-word" }}>
      {String(value)}
    </Typography>
  );
};

const getSeverityColor = (severity) => {
  switch (severity?.toLowerCase()) {
    case "critical": return "error";
    case "high": return "warning";
    case "medium": return "info";
    case "low": return "success";
    default: return "default";
  }
};

// Same status chip used by the search page's results-table.jsx — kept local
// here (rather than imported) since this dialog can be mounted from more
// than one folder depth and the relative import path isn't guaranteed.
const VerificationChip = ({ result }) => {
  if (result.manual_verification) {
    return (
      <Chip
        icon={<PanToolAltRoundedIcon style={{ fontSize: "13px", color: "#b45309" }} />}
        size="small"
        label="Manual Verify"
        sx={{ borderRadius: "20px", fontSize: "12px", fontWeight: "700", bgcolor: "#fef9c3", color: "#854d0e", border: "1px solid #fde047", "& .MuiChip-icon": { color: "#b45309" } }}
      />
    );
  }
  if (result.not_applicable) {
    return <Chip icon={<TaskAltRoundedIcon style={{ fontSize: "13px" }} />} size="small" label="Not Applicable" color="default" sx={{ borderRadius: "20px", fontSize: "12px", fontWeight: "700" }} />;
  }
  if (result.missing_data) {
    return <Chip icon={<TaskAltRoundedIcon style={{ fontSize: "13px" }} />} size="small" label="Data Missing" color="warning" sx={{ borderRadius: "20px", fontSize: "12px", fontWeight: "700" }} />;
  }
  if (result.verified) {
    return <Chip icon={<TaskAltRoundedIcon style={{ fontSize: "13px" }} />} size="small" label="Verified" color="success" sx={{ borderRadius: "20px", fontSize: "12px", fontWeight: "700" }} />;
  }
  return <Chip icon={<TaskAltRoundedIcon style={{ fontSize: "13px" }} />} size="small" label="Not Verified" color="error" sx={{ borderRadius: "20px", fontSize: "12px", fontWeight: "700" }} />;
};

/**
 * Shared, dependency-free preview of a PO line's audit details/results.
 * Used by BOTH the Executive Dashboard's PO-Wise Exceptions table AND the
 * Drilldown dialog table (and any future table listing PO lines), so the
 * "Open in New Tab" / "View Details Here" behavior is not tied to a single
 * table anymore.
 */
const PoDetailsPreviewDialog = ({ preview, onClose, onOpenFullPage }) => {
  const [loading, setLoading] = useState(false);
  const [details, setDetails] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!preview) {
      setDetails(null);
      setError("");
      return;
    }
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError("");
      setDetails(null);
      try {
        const res = await post("/getPOAuditResult", {
          po_number: preview.poNumber,
          po_line_item: preview.lineItem || undefined,
        });
        if (cancelled) return;
        if (res?.multipleMatches) {
          setError("This PO has multiple line items. Please open the full search page to choose one.");
        } else {
          setDetails(res);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err?.response?.data?.message || err?.message || "Failed to load PO details");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [preview]);

  const scalarEntries = useMemo(() => {
    if (!details) return [];
    return Object.entries(details).filter(
      ([k, v]) => !PREVIEW_EXCLUDE_KEYS.has(k) && v !== null && v !== undefined && typeof v !== "object"
    );
  }, [details]);

  const tableFields = useMemo(() => {
    if (!details) return [];
    return Object.entries(details).filter(
      ([k, v]) => !PREVIEW_EXCLUDE_KEYS.has(k) && Array.isArray(v) && v.length && typeof v[0] === "object"
    );
  }, [details]);

  return (
    <Dialog open={!!preview} onClose={onClose} maxWidth="md" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
      <DialogTitle sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 800 }}>
            PO {preview?.poNumber}
            {preview?.lineItem ? ` — Line ${preview.lineItem}` : ""}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Quick preview of audit data &amp; results
          </Typography>
        </Box>
        <IconButton onClick={onClose} size="small">
          <CloseRoundedIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        {loading && (
          <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
            <CircularProgress size={28} />
          </Box>
        )}
        {!loading && error && (
          <Typography color="error" sx={{ py: 2 }}>
            {error}
          </Typography>
        )}
        {!loading && !error && details && (
          <Box>
            <Grid container spacing={2} sx={{ mb: 3 }}>
              {scalarEntries.map(([k, v]) => (
                <Grid item xs={6} sm={4} key={k}>
                  <Typography variant="caption" sx={{ color: "text.secondary", fontWeight: 700, display: "block", mb: 0.5 }}>
                    {humanizeKey(k)}
                  </Typography>
                  {renderTagOrValue(k, v)}
                </Grid>
              ))}
              {scalarEntries.length === 0 && (
                <Grid item xs={12}>
                  <Typography color="text.secondary">No summary fields returned.</Typography>
                </Grid>
              )}
            </Grid>

            {Array.isArray(details.results) && details.results.length > 0 && (
              <Box sx={{ mb: 3 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                  Audit Check Results
                </Typography>
                <TableContainer component={Paper} variant="outlined">
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 700, width: "5%" }}>Pt #</TableCell>
                        <TableCell sx={{ fontWeight: 700, width: "25%" }}>Title &amp; Summary</TableCell>
                        <TableCell sx={{ fontWeight: 700, width: "27%" }}>Logic</TableCell>
                        <TableCell sx={{ fontWeight: 700, width: "8%" }}>Severity</TableCell>
                        <TableCell sx={{ fontWeight: 700, width: "13%" }}>Status</TableCell>
                        <TableCell sx={{ fontWeight: 700, width: "22%" }}>Remarks</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {details.results.map((row, idx) => (
                        <TableRow key={row.pointNo ?? idx}>
                          <TableCell sx={{ verticalAlign: "top", fontWeight: 700 }}>{row.pointNo}</TableCell>
                          <TableCell sx={{ verticalAlign: "top" }}>
                            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                              {row.title || `Point ${row.pointNo}`}
                            </Typography>
                            {row.summary && (
                              <Typography variant="body2" color="textSecondary" sx={{ mt: 0.5 }}>
                                {row.summary}
                              </Typography>
                            )}
                          </TableCell>
                          <TableCell sx={{ verticalAlign: "top" }}>
                            <Typography variant="body2">{row.logic || "N/A"}</Typography>
                          </TableCell>
                          <TableCell sx={{ verticalAlign: "top" }}>
                            {row.severity && (
                              <Chip label={row.severity} size="small" color={getSeverityColor(row.severity)} variant="outlined" />
                            )}
                          </TableCell>
                          <TableCell sx={{ verticalAlign: "top" }}>
                            <VerificationChip result={row} />
                          </TableCell>
                          <TableCell sx={{ verticalAlign: "top" }}>
                            {row.remarks && row.remarks.length > 0 ? (
                              <ul style={{ margin: 0, paddingLeft: "20px" }}>
                                {row.remarks.map((remark, rIdx) => (
                                  <li key={rIdx}>
                                    <Typography variant="body2">{remark}</Typography>
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <Typography variant="body2" color="textSecondary">None</Typography>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>
            )}

            {tableFields.map(([k, rows]) => (
              <Box key={k} sx={{ mb: 3 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                  {humanizeKey(k)}
                </Typography>
                <TableContainer component={Paper} variant="outlined">
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        {Object.keys(rows[0]).map((col) => (
                          <TableCell key={col} sx={{ fontWeight: 700 }}>
                            {humanizeKey(col)}
                          </TableCell>
                        ))}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {rows.map((row, idx) => (
                        <TableRow key={idx}>
                          {Object.keys(rows[0]).map((col) => (
                            <TableCell key={col}>
                              {row[col] !== null && typeof row[col] === "object"
                                ? JSON.stringify(row[col])
                                : renderTagOrValue(col, row[col] ?? "—")}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>
            ))}
          </Box>
        )}
        {!loading && !error && !details && (
          <Typography color="text.secondary" sx={{ py: 4, textAlign: "center" }}>
            No details found for this PO.
          </Typography>
        )}
      </DialogContent>
      <DialogActions sx={{ p: 2 }}>
        <Button onClick={onClose}>Close</Button>
        <Button variant="outlined" startIcon={<OpenInNewRoundedIcon />} onClick={() => onOpenFullPage(preview, true)}>
          Open in New Tab
        </Button>
        <Button variant="contained" onClick={() => onOpenFullPage(preview, false)}>
          Go to Full Search Page
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default PoDetailsPreviewDialog;