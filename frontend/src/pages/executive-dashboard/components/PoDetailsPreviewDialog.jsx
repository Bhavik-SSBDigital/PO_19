import { useEffect, useMemo, useState } from "react";
import moment from "moment";
import {
  Box, Button, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogTitle, Grid, IconButton, Paper, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Typography, Chip, Divider,
} from "@mui/material";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import OpenInNewRoundedIcon from "@mui/icons-material/OpenInNewRounded";
import PanToolAltRoundedIcon from "@mui/icons-material/PanToolAltRounded";
import TaskAltRoundedIcon from "@mui/icons-material/TaskAltRounded";
import { post } from "utils/axiosApi";
import PoHeaderChecksPanel from "./PoHeaderChecksPanel";

// "results", "header" and "exceptionPoints" are rendered by dedicated
// blocks below, not the generic array-of-objects dumper — so exclude all
// three here.
const PO_SUMMARY_RAW_KEYS = new Set([
  "vendor_code", "vendorCode", "nameOfVendor", "vendorName",
  "GSTInOfVendor", "vendorGstin",
  "plant", "plantName",
  "po_type", "poType", "poTypeName", "poTypeIsAssumption",
  "purchase_group", "purchaseGroup", "purchaseGroupName",
  "payment_term", "paymentTerm", "paymentTermDescription",
  "tax_code", "taxCode",
  "purchase_req",
  "po_number", "poNumber", "lineItem", "po_line_item", "lineItemKey", "po_material_number",
]);

const PREVIEW_EXCLUDE_KEYS = new Set([
  "_id", "__v", "processDocuments", "multipleMatches", "results", "header", "headerResults", "exceptionPoints",
  ...PO_SUMMARY_RAW_KEYS,
]);

const PO_SUMMARY_FIELDS = [
  ["PO Number", (d) => d.po_number || d.poNumber],
  ["Line Item", (d) => d.lineItem || d.po_line_item],
  ["Vendor Code", (d) => d.vendorCode || d.vendor_code],
  ["Vendor", (d) => d.vendorName || d.nameOfVendor],
  ["GSTIN", (d) => d.vendorGstin || d.GSTInOfVendor],
  ["Plant", (d) => d.plantName || d.plant],
  ["PO Type", (d) => d.poTypeName || d.po_type],
  ["Purchasing Group", (d) => d.purchaseGroupName || d.purchase_group],
  ["Payment Term", (d) => d.paymentTermDescription || d.payment_term],
  ["Tax Code", (d) => d.taxCode || d.tax_code],
  ["PR Number", (d) => d.purchase_req],
  ["Net Value", (d) => d.net_value],
];

const humanizeKey = (k) =>
  k.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

const isTaggableKey = (key) => /status|verified|complian|result|remark/i.test(key);

const TAG_STYLES = [
  { test: /^(true|yes|verified|compliant|passed?|ok)$/i, bg: "#dcfce7", color: "#15803d" },
  { test: /^(false|no|not[\s_-]?verified|exception|failed?|non[\s_-]?compliant)$/i, bg: "#fee2e2", color: "#b91c1c" },
  { test: /^(n\/?a|not[\s_-]?applicable)$/i, bg: "#f1f5f9", color: "#475569" },
  { test: /^(manual([\s_-]?review)?|pending)$/i, bg: "#fef9c3", color: "#a16207" },
];

const isDateString = (key, value) => {
  if (typeof value !== "string") return false;
  const isDateKey = /date|at|on$/i.test(key);
  const isIsoFormat = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value);
  if (isDateKey || isIsoFormat) {
    return moment(value, moment.ISO_8601, true).isValid() || !isNaN(Date.parse(value));
  }
  return false;
};

const formatDateValue = (value) => {
  const m = moment(value);
  if (!m.isValid()) return String(value);
  if (typeof value === "string" && value.length > 10 && !value.endsWith("00:00:00.000Z") && !value.endsWith("00:00:00")) {
    return m.format("DD-MM-YYYY HH:mm");
  }
  return m.format("DD-MM-YYYY");
};

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
  if (isDateString(key, value)) {
    return (
      <Typography variant="body2" sx={{ fontWeight: 600, wordBreak: "break-word" }}>
        {formatDateValue(value)}
      </Typography>
    );
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

const PoSummaryHeader = ({ details }) => {
  if (!details) return null;
  return (
    <Box sx={{ mb: 3 }}>
      <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5, color: "text.secondary" }}>
        Line Item Summary
      </Typography>
      <Grid container spacing={2}>
        {PO_SUMMARY_FIELDS.map(([label, getValue]) => {
          const value = getValue(details);
          return (
            <Grid item xs={6} sm={4} key={label}>
              <Typography variant="caption" sx={{ color: "text.secondary", fontWeight: 700, display: "block", mb: 0.5 }}>
                {label}
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 600, wordBreak: "break-word" }}>
                {value === null || value === undefined || value === "" ? "—" : String(value)}
              </Typography>
            </Grid>
          );
        })}
      </Grid>
      <Divider sx={{ mt: 2.5 }} />
    </Box>
  );
};

/**
 * Shared, dependency-free preview of a PO line's audit details/results.
 * Used by the Executive Dashboard's PO-Wise Exceptions table, the
 * Drilldown dialog table, and the PO Data page.
 *
 * `details.header` (compact: { points, totalPoints, verifiedCount,
 * notVerifiedCount, locked, lockedBy, lockedAt }) is rendered via the SAME
 * PoHeaderChecksPanel used on the search page - compact by default here
 * (a one-line "Header Checks: Closed" banner, expandable), so header
 * status reads identically wherever it appears across the app. This
 * dialog does NOT show its own separate header table anymore.
 */
const PoDetailsPreviewDialog = ({ preview, onClose, onOpenFullPage }) => {
  const [loading, setLoading] = useState(false);
  const [details, setDetails] = useState(null);
  const [error, setError] = useState("");

  const role = typeof window !== "undefined" ? localStorage.getItem("role") : "";
  const currentUserId = typeof window !== "undefined" ? localStorage.getItem("userId") : null;
  const roleFlags = {
    isBuyer: role === "isBuyer",
    isAdmin: role === "isAdmin",
    isProcurementManager: role === "isProcurementManager",
  };

  const load = async () => {
    if (!preview) return;
    setLoading(true);
    setError("");
    setDetails(null);
    try {
      const res = await post("/getPOAuditResult", {
        po_number: preview.poNumber,
        po_line_item: preview.lineItem || undefined,
      });
      setDetails(res);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Failed to load PO details");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!preview) {
      setDetails(null);
      setError("");
      return;
    }
    let cancelled = false;
    (async () => {
      if (!cancelled) await load();
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview]);

  const isHeaderOnly = details?.scope === "po-header";

  const scalarEntries = useMemo(() => {
    if (!details || isHeaderOnly) return [];
    return Object.entries(details).filter(
      ([k, v]) => !PREVIEW_EXCLUDE_KEYS.has(k) && v !== null && v !== undefined && typeof v !== "object"
    );
  }, [details, isHeaderOnly]);

  const tableFields = useMemo(() => {
    if (!details || isHeaderOnly) return [];
    return Object.entries(details).filter(
      ([k, v]) => !PREVIEW_EXCLUDE_KEYS.has(k) && Array.isArray(v) && v.length && typeof v[0] === "object"
    );
  }, [details, isHeaderOnly]);

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

        {!loading && !error && details && isHeaderOnly && (
          <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {details.vendorName || details.vendorCode} · {details.plantName || "—"} ·{" "}
              {details.purchaseGroupName || details.purchaseGroup} · {details.lineItemCount} line item(s)
            </Typography>
            <PoHeaderChecksPanel
              poNumber={details.po_number}
              header={details.header}
              currentUserId={currentUserId}
              isBuyer={roleFlags.isBuyer}
              isAdmin={roleFlags.isAdmin}
              isProcurementManager={roleFlags.isProcurementManager}
              variant="full"
              onChanged={load}
            />
          </Box>
        )}

        {!loading && !error && details && !isHeaderOnly && (
          <Box>
            <PoSummaryHeader details={details} />

            {/* Compact header-status banner - same component/behavior as
                the search page, so status reads identically everywhere. */}
            {details.header && (
              <PoHeaderChecksPanel
                poNumber={details.po_number}
                header={details.header}
                currentUserId={currentUserId}
                isBuyer={roleFlags.isBuyer}
                isAdmin={roleFlags.isAdmin}
                isProcurementManager={roleFlags.isProcurementManager}
                variant="compact"
                onChanged={load}
              />
            )}

            {scalarEntries.length > 0 && (
              <Box sx={{ mb: 3 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5, color: "text.secondary" }}>
                  Other Fields
                </Typography>
                <Grid container spacing={2}>
                  {scalarEntries.map(([k, v]) => (
                    <Grid item xs={6} sm={4} key={k}>
                      <Typography variant="caption" sx={{ color: "text.secondary", fontWeight: 700, display: "block", mb: 0.5 }}>
                        {humanizeKey(k)}
                      </Typography>
                      {renderTagOrValue(k, v)}
                    </Grid>
                  ))}
                </Grid>
              </Box>
            )}

            {Array.isArray(details.results) && details.results.length > 0 && (
              <Box sx={{ mb: 3 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                  Line-Level Checks
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
        {!isHeaderOnly && (
          <>
            <Button variant="outlined" startIcon={<OpenInNewRoundedIcon />} onClick={() => onOpenFullPage(preview, true)}>
              Open in New Tab
            </Button>
            <Button variant="contained" onClick={() => onOpenFullPage(preview, false)}>
              Go to Full Search Page
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default PoDetailsPreviewDialog;