import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Dialog, DialogTitle, DialogContent, IconButton, Table, TableHead, TableRow,
  TableCell, TableBody, TableContainer, Paper, Chip, Box, Typography,
  Pagination, Skeleton, alpha,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import LayersRoundedIcon from "@mui/icons-material/LayersRounded";
import LockRoundedIcon from "@mui/icons-material/LockRounded";
import LockOpenRoundedIcon from "@mui/icons-material/LockOpenRounded";
import { post } from "utils/axiosApi";

const PAGE_SIZE = 25;

/**
 * The HEADER-LEVEL counterpart to DrilldownDialog. Rendered when a bar on
 * the "PO Header-Level Compliance" chart is clicked. Rows here are PO
 * NUMBERS, not PO line items - a header-level point's result belongs to
 * the whole PO, so there's nothing line-item-shaped to show. Clicking a
 * row navigates to the search page's PO-header view for that PO (NOT a
 * specific line item), where the full header panel (with remarks +
 * close/reopen) lives.
 */
const HeaderDrilldownDialog = ({ drilldown, appliedFilters, onClose }) => {
  const navigate = useNavigate();
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
        pointNo: drilldown.pointNo,
        statusFilter: drilldown.statusFilter,
        page: targetPage,
        pageSize: PAGE_SIZE,
      };
      const res = await post("/reports/executive-header-drilldown", body);
      setRows(res?.results || []);
      setTotal(res?.total || 0);
    } catch (err) {
      console.error("Error fetching header drilldown:", err);
    } finally {
      setLoading(false);
    }
  };

  const pageCount = Math.max(Math.ceil(total / PAGE_SIZE), 1);

  const openPoHeaderView = (poNumber) => {
    navigate(`/check-invoice-item?PONo=${encodeURIComponent(poNumber)}`);
    onClose();
  };

  return (
    <Dialog open={!!drilldown} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", bgcolor: "#eef2ff" }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <LayersRoundedIcon sx={{ color: "#4f46e5" }} />
          <Box>
            <Typography variant="h6">{drilldown?.title}</Typography>
            <Typography variant="caption" color="text.secondary">
              {total} PO(s) — each row is a whole PO, not a line item. Click a row to open its Header Checks.
            </Typography>
          </Box>
        </Box>
        <IconButton onClick={onClose}><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent dividers>
        {loading ? (
          <Skeleton variant="rectangular" height={360} />
        ) : (
          <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 500, borderColor: "#c7d2fe" }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ bgcolor: "#eef2ff" }}>PO Number</TableCell>
                  <TableCell sx={{ bgcolor: "#eef2ff" }}>Vendor</TableCell>
                  <TableCell sx={{ bgcolor: "#eef2ff" }}>PO Type</TableCell>
                  <TableCell sx={{ bgcolor: "#eef2ff" }}>Purchasing Group</TableCell>
                  <TableCell sx={{ bgcolor: "#eef2ff" }}>Result</TableCell>
                  <TableCell sx={{ bgcolor: "#eef2ff" }}>System Remarks</TableCell>
                  <TableCell sx={{ bgcolor: "#eef2ff" }}>Header Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.po_number} hover sx={{ cursor: "pointer" }} onClick={() => openPoHeaderView(r.po_number)}>
                    <TableCell sx={{ fontWeight: 700 }}>{r.po_number}</TableCell>
                    <TableCell>{r.vendorName || r.vendorCode || "—"}</TableCell>
                    <TableCell>{r.poTypeName || r.poType || "—"}</TableCell>
                    <TableCell>{r.purchaseGroupName || r.purchaseGroup || "—"}</TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={
                          r.result?.not_applicable ? "Not Applicable" :
                          r.result?.manual_verification ? "Manual Verify" :
                          r.result?.verified ? "Verified" : "Not Verified"
                        }
                        sx={{
                          fontWeight: 700,
                          bgcolor: r.result?.verified ? alpha("#059669", 0.1) : r.result?.not_applicable ? "grey.100" : alpha("#dc2626", 0.1),
                          color: r.result?.verified ? "#059669" : r.result?.not_applicable ? "text.secondary" : "#dc2626",
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      {(r.result?.remarks || []).join("; ") || "—"}
                    </TableCell>
                    <TableCell>
                      {r.headerLocked ? (
                        <Chip size="small" icon={<LockRoundedIcon fontSize="small" />} label="Closed" sx={{ fontWeight: 700, bgcolor: alpha("#059669", 0.1), color: "#059669" }} />
                      ) : (
                        <Chip size="small" icon={<LockOpenRoundedIcon fontSize="small" />} label="Open" sx={{ fontWeight: 700, bgcolor: alpha("#d97706", 0.1), color: "#d97706" }} />
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} align="center">No matching POs.</TableCell>
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

export default HeaderDrilldownDialog;