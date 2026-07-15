import { useEffect, useState } from "react";
import {
  Box,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Pagination,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from "@mui/material";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import OpenInNewRoundedIcon from "@mui/icons-material/OpenInNewRounded";
import moment from "moment";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";

import { post } from "utils/axiosApi";
import PoAuditResultDialog from "pages/po-audit-results/components/po-audit-result-dialog";

const PAGE_SIZE = 10;

const SEVERITY_COLORS = { Critical: "error", High: "warning", Medium: "info", Low: "default" };

// Maps a dashboard drilldown dimension to the PO Audit Results page's deep
// link query params (see pages/po-audit-results/index.jsx DEEP_LINK_KEYS) so
// "open the full workspace" lands pre-filtered to exactly what was clicked.
function toDeepLinkParams(dimension, value) {
  switch (dimension) {
    case "plant": return { plant: value };
    case "vendor": return { vendorCode: value };
    case "purchaseGroup": return { purchaseGroup: value };
    case "poType": return { poType: value };
    case "severity": return { severity: value };
    case "pointNo": return { notVerifiedPointNo: value };
    case "month": return { month: value };
    case "holdBucket": return { holdOnly: "true", holdBucket: value === "Overdue" ? "overdue" : "not_due" };
    case "hold": return { holdOnly: "true" };
    default: return {};
  }
}

/**
 * drilldown: { dimension, value, title } | null
 * appliedFilters: the executive dashboard's currently-applied filter set,
 *   forwarded so the drilldown always matches what produced the chart.
 */
const DrilldownDialog = ({ drilldown, appliedFilters, onClose }) => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [detailId, setDetailId] = useState(null);

  useEffect(() => {
    if (!drilldown) return;
    setPage(1);
    fetchPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drilldown]);

  useEffect(() => {
    if (!drilldown) return;
    fetchPage(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const fetchPage = async (targetPage) => {
    setLoading(true);
    try {
      const body = {
        ...appliedFilters,
        dimension: drilldown.dimension,
        value: drilldown.value,
        ...(drilldown.statusFilter && { statusFilter: drilldown.statusFilter }),
        page: targetPage,
        pageSize: PAGE_SIZE,
      };
      const res = await post("/reports/executive-drilldown", body);
      setRows(res?.results || []);
      setTotal(res?.total || 0);
    } catch (err) {
      console.error("Error fetching drilldown:", err);
      toast.error("Failed to load underlying PO lines");
    } finally {
      setLoading(false);
    }
  };

  const openFullWorkspace = () => {
    const params = new URLSearchParams(toDeepLinkParams(drilldown.dimension, drilldown.value));
    navigate(`/po-audit-results?${params.toString()}`);
    onClose();
  };

  const pageCount = Math.max(Math.ceil(total / PAGE_SIZE), 1);

  return (
    <>
      <Dialog open={!!drilldown} onClose={onClose} maxWidth="lg" fullWidth>
        <DialogTitle sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              {drilldown?.title}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {total} matching PO line{total === 1 ? "" : "s"}
              {drilldown?.statusFilter === "verified" && " - showing lines with at least one verified checkpoint"}
              {drilldown?.statusFilter === "notVerified" && " - showing lines with at least one exception"}
            </Typography>
          </Box>
          <Box sx={{ display: "flex", gap: 1 }}>
            <Tooltip title="Open the full PO Audit Results workspace, filtered the same way">
              <IconButton onClick={openFullWorkspace} size="small">
                <OpenInNewRoundedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <IconButton onClick={onClose} size="small">
              <CloseRoundedIcon fontSize="small" />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent dividers>
          {loading ? (
            <Skeleton variant="rectangular" height={360} />
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ backgroundColor: "action.hover" }}>
                    <TableCell>PO Number</TableCell>
                    <TableCell>PR Number</TableCell>
                    <TableCell>Vendor</TableCell>
                    <TableCell>Plant</TableCell>
                    <TableCell>Purch. Group</TableCell>
                    <TableCell>PO Type</TableCell>
                    <TableCell align="right">Net Value</TableCell>
                    <TableCell>PO Created</TableCell>
                    <TableCell>
                      <span title="Only 'H' is decoded by this app (as 'On Hold'). Any other value is a raw status code from the source system that this app doesn't interpret.">
                        Status
                      </span>
                    </TableCell>
                    <TableCell>Failed Rules</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} align="center">
                        No matching PO lines
                      </TableCell>
                    </TableRow>
                  ) : (
                    rows.map((row) => (
                      <TableRow key={row.id} hover sx={{ cursor: "pointer" }} onClick={() => setDetailId(row.id)}>
                        <TableCell>{row.po_number || "-"}</TableCell>
                        <TableCell>{row.purchase_req || "-"}</TableCell>
                        <TableCell>{row.nameOfVendor || row.vendor_code || "-"}</TableCell>
                        <TableCell>{row.plant || "-"}</TableCell>
                        <TableCell>{row.purchase_group || "-"}</TableCell>
                        <TableCell>{row.po_type || "-"}</TableCell>
                        <TableCell align="right">{row.net_value ? Number(String(row.net_value).replace(/,/g, "")).toLocaleString() : "-"}</TableCell>
                        <TableCell>{row.po_created_date ? moment(row.po_created_date).format("DD-MMM-YYYY") : "-"}</TableCell>
                        <TableCell>
                          {row.po_status === "H" ? (
                            <Tooltip title="This app treats status code 'H' as On Hold - it's the only status value this codebase decodes.">
                              <Chip size="small" color="warning" label="On Hold" />
                            </Tooltip>
                          ) : row.po_status ? (
                            <Tooltip title={`Raw status code "${row.po_status}" from the source system - not decoded by this app (only "H"/On Hold is).`}>
                              <Chip size="small" variant="outlined" label={row.po_status} />
                            </Tooltip>
                          ) : (
                            <Tooltip title="No status code was present on this record in the source data.">
                              <Chip size="small" variant="outlined" label="No status" sx={{ opacity: 0.6 }} />
                            </Tooltip>
                          )}
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", maxWidth: 240 }}>
                            {(row.exceptionPoints || []).length === 0 && "-"}
                            {(row.exceptionPoints || []).slice(0, 4).map((p) => (
                              <Tooltip
                                key={p.pointNo}
                                title={`${p.label || `Point ${p.pointNo}`} (${p.severity})${(p.remarks || []).length ? " - " + p.remarks.join("; ") : ""}`}
                              >
                                <Chip size="small" color={SEVERITY_COLORS[p.severity] || "default"} label={`#${p.pointNo}`} />
                              </Tooltip>
                            ))}
                            {(row.exceptionPoints || []).length > 4 && (
                              <Chip size="small" variant="outlined" label={`+${row.exceptionPoints.length - 4}`} />
                            )}
                          </Box>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          )}

          <Box sx={{ display: "flex", justifyContent: "center", mt: 2 }}>
            <Pagination count={pageCount} page={page} onChange={(_, v) => setPage(v)} color="primary" size="small" />
          </Box>
        </DialogContent>
      </Dialog>

      <PoAuditResultDialog id={detailId} onClose={() => setDetailId(null)} />
    </>
  );
};

export default DrilldownDialog;
