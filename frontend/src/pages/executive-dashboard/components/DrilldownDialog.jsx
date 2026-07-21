import { useEffect, useState } from "react";
import {
  Dialog, DialogTitle, DialogContent, IconButton, Table, TableHead, TableRow,
  TableCell, TableBody, TableContainer, Paper, Chip, Box, Typography,
  Pagination, Skeleton, Tooltip as MuiTooltip,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { post } from "utils/axiosApi";

const SEVERITY_COLORS = { Critical: "#c0392b", High: "#e67e22", Medium: "#f1c40f", Low: "#95a5a6" };
const PAGE_SIZE = 25;

// NOTE: this table intentionally has NO "Status" column. po_status ("H" for
// SAP Hold, etc.) is raw backend data, not a display field - it was
// previously being rendered here as "PO HOLD" and the client does not want
// that column anywhere in the app's drilldown tables.
const DrilldownDialog = ({ drilldown, appliedFilters, onClose }) => {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

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
        statusFilter: drilldown.statusFilter,
        page: targetPage,
        pageSize: PAGE_SIZE,
      };
      const res = await post("/reports/executive-drilldown", body);
      setRows(res?.results || []);
      setTotal(res?.total || 0);
    } catch (err) {
      console.error("Error fetching drilldown:", err);
    } finally {
      setLoading(false);
    }
  };

  const pageCount = Math.max(Math.ceil(total / PAGE_SIZE), 1);

  return (
    <Dialog open={!!drilldown} onClose={onClose} maxWidth="xl" fullWidth>
      <DialogTitle sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Box>
          <Typography variant="h6">{drilldown?.title}</Typography>
          <Typography variant="caption" color="text.secondary">{total} PO line(s)</Typography>
        </Box>
        <IconButton onClick={onClose}><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent dividers>
        {loading ? (
          <Skeleton variant="rectangular" height={360} />
        ) : (
          <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 500 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell>PO Number</TableCell>
                  <TableCell>Line Item</TableCell>
                  <TableCell>Vendor</TableCell>
                  <TableCell>Plant</TableCell>
                  <TableCell>PO Type</TableCell>
                  <TableCell>Purchasing Group</TableCell>
                  <TableCell>Payment Term</TableCell>
                  <TableCell>Material</TableCell>
                  <TableCell>Net Value</TableCell>
                  <TableCell>Failing Points</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id} hover>
                    <TableCell>{r.po_number || "—"}</TableCell>
                    <TableCell>{r.lineItem || "—"}</TableCell>
                    <TableCell>{r.vendorName || r.vendorCode || "—"}</TableCell>
                    <TableCell>{r.plantName || r.plant || "—"}</TableCell>
                    <TableCell>{r.poTypeName || r.poType || "—"}</TableCell>
                    <TableCell>{r.purchaseGroupName || r.purchaseGroup || "—"}</TableCell>
                    <TableCell>{r.paymentTermDescription || r.paymentTerm || "—"}</TableCell>
                    <TableCell>
                      <MuiTooltip title={r.material_disc || ""}>
                        <span>{r.material_code || "—"}</span>
                      </MuiTooltip>
                    </TableCell>
                    <TableCell>{r.net_value ? Number(r.net_value).toLocaleString() : "—"}</TableCell>
                    <TableCell>
                      {(r.exceptionPoints || []).length === 0 ? (
                        <Typography variant="caption" color="text.secondary">—</Typography>
                      ) : (
                        (r.exceptionPoints || []).map((ep) => (
                          <MuiTooltip
                            key={ep.pointNo}
                            title={`${ep.title || `Point ${ep.pointNo}`}: ${ep.summary || ""}${
                              ep.remarks?.length ? ` — ${ep.remarks.join("; ")}` : ""
                            }`}
                          >
                            <Chip
                              size="small"
                              label={`#${ep.pointNo}`}
                              sx={{ bgcolor: SEVERITY_COLORS[ep.severity] || "#999", color: "#fff", mr: 0.5, mb: 0.5 }}
                            />
                          </MuiTooltip>
                        ))
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={10} align="center">No matching PO lines.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}
        <Box display="flex" justifyContent="center" sx={{ mt: 2 }}>
          <Pagination count={pageCount} page={page} onChange={(_, v) => setPage(v)} color="primary" />
        </Box>
      </DialogContent>
    </Dialog>
  );
};

export default DrilldownDialog;