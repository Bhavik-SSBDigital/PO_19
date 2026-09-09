import { useEffect, useMemo, useState } from "react";
import moment from "moment";
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  IconButton,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  Chip,
  Divider,
  Select,
  MenuItem,
  FormControl,
} from "@mui/material";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import OpenInNewRoundedIcon from "@mui/icons-material/OpenInNewRounded";
import PanToolAltRoundedIcon from "@mui/icons-material/PanToolAltRounded";
import TaskAltRoundedIcon from "@mui/icons-material/TaskAltRounded";
import LockRoundedIcon from "@mui/icons-material/LockRounded";
import LockOpenRoundedIcon from "@mui/icons-material/LockOpenRounded";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import { toast } from "react-toastify";
import { post } from "utils/axiosApi";
import { setAuditResultCheckedStatus } from "../../../api/api-functions";
import PoHeaderChecksPanel from "./PoHeaderChecksPanel";
import SectionTallyBar from "../../../components/SectionTallyBar";
import PointRemarkPanel from "./PointRemarkPanel";

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
  "_id", "__v", "processDocuments", "multipleMatches", "results", "header",
  "headerResults", "exceptionPoints", "lineItems", "lineItemCount",
  "remarksLocked", "remarksLockedBy", "remarksLockedAt",
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

const PoDetailsPreviewDialog = ({ preview, onClose, onOpenFullPage, onHeaderChanged }) => {
  const [loading, setLoading] = useState(false);
  const [details, setDetails] = useState(null);
  const [error, setError] = useState("");

  const [lineLocked, setLineLocked] = useState(false);
  const [lineLockBusy, setLineLockBusy] = useState(false);

  // NEW — local, live-patchable copy of the line-level results.
  const [resultsRows, setResultsRows] = useState([]);

  const [lineItemOptions, setLineItemOptions] = useState([]);
  const [lineItemOptionsLoading, setLineItemOptionsLoading] = useState(false);

  const role = typeof window !== "undefined" ? localStorage.getItem("role") : "";
  const currentUserId = typeof window !== "undefined" ? localStorage.getItem("userId") : null;
  const roleFlags = {
    isBuyer: role === "isBuyer",
    isAdmin: role === "isAdmin",
    isProcurementManager: role === "isProcurementManager",
  };

  const load = async (lineItemOverride) => {
    if (!preview) return;
    setLoading(true);
    setError("");
    setDetails(null);
    const targetLineItem =
      lineItemOverride === undefined ? preview.lineItem : lineItemOverride;
    try {
      const res = await post("/getPOAuditResult", {
        po_number: preview.poNumber,
        po_line_item: targetLineItem || undefined,
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

  useEffect(() => {
    if (!preview?.poNumber) {
      setLineItemOptions([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setLineItemOptionsLoading(true);
      try {
        const res = await post("/reports/po-lines", { poNumber: preview.poNumber });
        if (!cancelled) setLineItemOptions(res?.lines || []);
      } catch (err) {
        if (!cancelled) setLineItemOptions([]);
      } finally {
        if (!cancelled) setLineItemOptionsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [preview?.poNumber]);

  const isHeaderOnly = details?.scope === "po-header";

  const currentLineItem = isHeaderOnly ? "" : (details?.lineItem ?? preview?.lineItem ?? "");

  const switchLineItem = (lineItem) => {
    load(lineItem || "");
  };

  const handleHeaderChanged = async () => {
    await load(currentLineItem);
    onHeaderChanged?.();
  };

  const toggleLineLock = async () => {
    if (!details?.po_number || !details?.lineItem) return;
    setLineLockBusy(true);
    try {
      const res = await setAuditResultCheckedStatus({
        poNumber: details.po_number,
        poLineItem: details.lineItem,
        checked: !lineLocked,
      });
      setLineLocked(Boolean(res?.remarksLocked));
      toast.success(
        res?.remarksLocked
          ? "Line item marked as checked"
          : "Line item reopened",
      );
      await load(details.lineItem);
      onHeaderChanged?.();
    } catch (err) {
      toast.error(
        err?.response?.data?.message || err?.message || "Failed to update checked status",
      );
    } finally {
      setLineLockBusy(false);
    }
  };

  useEffect(() => {
    setLineLocked(Boolean(details?.remarksLocked));
    // NEW — reseed the local, live-patchable results rows whenever
    // `details` changes (new fetch / line-item switch).
    setResultsRows(
      (details?.results || []).map((r) => ({
        ...r,
        checked: Boolean(r.checked),
        remarksCount: r.buyerRemarks?.length || 0,
      })),
    );
  }, [details]);

  // NEW — same contract as results-table.jsx's handlePointUpdate.
  const handleResultUpdate = (patch) => {
    setResultsRows((prev) =>
      prev.map((r) =>
        String(r.pointNo) === String(patch.pointNo)
          ? { ...r, checked: patch.checked, remarksCount: patch.remarksCount }
          : r,
      ),
    );
    if (patch.remarksLocked !== undefined) {
      setLineLocked(Boolean(patch.remarksLocked));
    }
  };

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

  const effectivePreview = preview
    ? { poNumber: preview.poNumber, lineItem: isHeaderOnly ? undefined : currentLineItem || undefined }
    : null;

  return (
    <Dialog open={!!preview} onClose={onClose} maxWidth="md" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
      <DialogTitle sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 800 }}>
            PO {preview?.poNumber}
            {!isHeaderOnly && currentLineItem ? ` — Line ${currentLineItem}` : ""}
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
        {preview?.poNumber && (
          <Box sx={{ mb: 2.5, display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
            <Typography variant="caption" sx={{ fontWeight: 700, color: "text.secondary" }}>
              Viewing:
            </Typography>
            <FormControl size="small" sx={{ minWidth: 280 }}>
              <Select
                displayEmpty
                value={currentLineItem}
                onChange={(e) => switchLineItem(e.target.value)}
                disabled={loading}
              >
                <MenuItem value="">
                  <em>PO Header — All Line Items</em>
                </MenuItem>
                {lineItemOptions.map((line) => (
                  <MenuItem key={line.lineItemKey || line.lineItem} value={line.lineItem || ""}>
                    Line {line.lineItem || "—"}
                    {line.material_disc
                      ? ` — ${line.material_disc}`
                      : line.material_code
                        ? ` — ${line.material_code}`
                        : ""}
                    {line.exceptionPoints?.length ? " ⚠" : ""}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            {lineItemOptionsLoading && <CircularProgress size={16} />}
            {!isHeaderOnly && currentLineItem && (
              <Button
                size="small"
                startIcon={<ArrowBackRoundedIcon fontSize="small" />}
                onClick={() => switchLineItem("")}
                sx={{ textTransform: "none", fontWeight: 700 }}
              >
                Back to PO Header &amp; All Line Items
              </Button>
            )}
          </Box>
        )}

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
              onChanged={handleHeaderChanged}
            />

            {Array.isArray(details.lineItems) && details.lineItems.length > 0 && (
              <Box sx={{ mt: 3 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>
                  Line Items ({details.lineItems.length})
                </Typography>
                <TableContainer component={Paper} variant="outlined">
                  <Table size="small">
                    <TableHead sx={{ bgcolor: "grey.50" }}>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 700 }}>Line Item</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Material</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Description</TableCell>
                        <TableCell sx={{ fontWeight: 700 }} align="right">Net Value</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Result</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                        <TableCell sx={{ fontWeight: 700 }} align="right">Action</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {details.lineItems.map((item) => (
                        <TableRow
                          key={item.id || item.lineItem}
                          hover
                          sx={{ cursor: "pointer" }}
                          onClick={() => switchLineItem(item.lineItem)}
                        >
                          <TableCell sx={{ fontWeight: 700 }}>{item.lineItem}</TableCell>
                          <TableCell>{item.materialCode || "—"}</TableCell>
                          <TableCell>
                            <Typography variant="body2" color="text.secondary" noWrap sx={{ maxWidth: 220 }}>
                              {item.materialDesc || "—"}
                            </Typography>
                          </TableCell>
                          <TableCell align="right">
                            {item.netValue ? Number(item.netValue).toLocaleString() : "—"}
                          </TableCell>
                          <TableCell>
                            {item.hasException ? (
                              <Chip size="small" label="Has Exception" sx={{ fontWeight: 700, bgcolor: "#fee2e2", color: "#dc2626" }} />
                            ) : (
                              <Chip size="small" label="Clean" sx={{ fontWeight: 700, bgcolor: "#dcfce7", color: "#059669" }} />
                            )}
                          </TableCell>
                          <TableCell>
                            {item.closed ? (
                              <Chip size="small" icon={<LockRoundedIcon fontSize="small" />} label="Closed" sx={{ fontWeight: 700, bgcolor: "#dcfce7", color: "#059669" }} />
                            ) : (
                              <Chip size="small" icon={<LockOpenRoundedIcon fontSize="small" />} label="Open" sx={{ fontWeight: 700, bgcolor: "#fef3c7", color: "#92400e" }} />
                            )}
                          </TableCell>
                          <TableCell align="right">
                            <Button
                              size="small"
                              onClick={(e) => {
                                e.stopPropagation();
                                switchLineItem(item.lineItem);
                              }}
                            >
                              View
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>
            )}
          </Box>
        )}

        {!loading && !error && details && !isHeaderOnly && (
          <Box>
            <PoSummaryHeader details={details} />

            {details.header && (
              <PoHeaderChecksPanel
                poNumber={details.po_number}
                header={details.header}
                currentUserId={currentUserId}
                isBuyer={roleFlags.isBuyer}
                isAdmin={roleFlags.isAdmin}
                isProcurementManager={roleFlags.isProcurementManager}
                variant="compact"
                onChanged={handleHeaderChanged}
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

            {resultsRows.length > 0 && (
              <Box sx={{ mb: 3 }}>
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    flexWrap: "wrap",
                    gap: 1,
                    mb: 1,
                  }}
                >
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                    Line-Level Checks
                  </Typography>

                  {details.po_number && details.lineItem && (
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                      <Chip
                        icon={
                          lineLocked ? (
                            <LockRoundedIcon fontSize="small" />
                          ) : (
                            <LockOpenRoundedIcon fontSize="small" />
                          )
                        }
                        label={lineLocked ? "Line Item Checked — Remarks Locked" : "Open"}
                        color={lineLocked ? "warning" : "default"}
                        size="small"
                        sx={{ fontWeight: 700 }}
                      />
                      {roleFlags.isBuyer && (
                        <Button
                          size="small"
                          variant="outlined"
                          disabled={lineLockBusy}
                          onClick={toggleLineLock}
                          sx={{ textTransform: "none", fontWeight: 600 }}
                        >
                          {lineLockBusy ? "…" : lineLocked ? "Reopen" : "Mark as Checked"}
                        </Button>
                      )}
                    </Box>
                  )}
                </Box>

                {/* Reads `resultsRows`, not details.results — live tally */}
                <SectionTallyBar points={resultsRows} locked={lineLocked} label="Line points reviewed" />

                <TableContainer component={Paper} variant="outlined">
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 700, width: "5%" }}>Pt #</TableCell>
                        <TableCell sx={{ fontWeight: 700, width: "20%" }}>Title &amp; Summary</TableCell>
                        <TableCell sx={{ fontWeight: 700, width: "20%" }}>Logic</TableCell>
                        <TableCell sx={{ fontWeight: 700, width: "7%" }}>Severity</TableCell>
                        <TableCell sx={{ fontWeight: 700, width: "12%" }}>Status</TableCell>
                        <TableCell sx={{ fontWeight: 700, width: "18%" }}>System Remarks</TableCell>
                        <TableCell sx={{ fontWeight: 700, width: "18%" }}>Buyer Remarks</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {resultsRows.map((row, idx) => (
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
                          <TableCell sx={{ verticalAlign: "top" }}>
                            {details.po_number && details.lineItem ? (
                              <PointRemarkPanel
                                poNumber={details.po_number}
                                poLineItem={details.lineItem}
                                pointNo={row.pointNo}
                                currentUserId={currentUserId}
                                isBuyer={roleFlags.isBuyer}
                                isAdmin={roleFlags.isAdmin}
                                isProcurementManager={roleFlags.isProcurementManager}
                                locked={lineLocked}
                                initialRemarks={row.buyerRemarks}
                                initialChecked={row.checked}
                                systemResult={row.systemResultLabel}
                                onRemarksChanged={handleResultUpdate}
                                compact
                              />
                            ) : (
                              <Typography variant="caption" color="text.secondary">
                                —
                              </Typography>
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
            <Button variant="outlined" startIcon={<OpenInNewRoundedIcon />} onClick={() => onOpenFullPage(effectivePreview, true)}>
              Open in New Tab
            </Button>
            <Button variant="contained" onClick={() => onOpenFullPage(effectivePreview, false)}>
              Go to Full Search Page
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default PoDetailsPreviewDialog;