import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Dialog, DialogTitle, DialogContent, IconButton, Table, TableHead, TableRow,
  TableCell, TableBody, TableContainer, Paper, Chip, Box, Typography,
  Pagination, Skeleton, Tooltip as MuiTooltip, Menu, MenuItem,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import OpenInNewRoundedIcon from "@mui/icons-material/OpenInNewRounded";
import VisibilityRoundedIcon from "@mui/icons-material/VisibilityRounded";
import { post } from "utils/axiosApi";
import PoDetailsPreviewDialog from "./PoDetailsPreviewDialog";
import { buildSearchUrl } from "utils/po-link-utils";

const SEVERITY_COLORS = { Critical: "#c0392b", High: "#e67e22", Medium: "#f1c40f", Low: "#95a5a6" };
const PAGE_SIZE = 25;

// NOTE: this table intentionally has NO "Status" column. po_status ("H" for
// SAP Hold, etc.) is raw backend data, not a display field - it was
// previously being rendered here as "PO HOLD" and the client does not want
// that column anywhere in the app's drilldown tables.
const DrilldownDialog = ({ drilldown, appliedFilters, onClose }) => {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  // Row-level "Open in New Tab" / "View Details Here" facility - same one
  // the Executive Dashboard's PO-Wise Exceptions table has, now on every
  // drilldown table too, not only PO-Wise Exceptions.
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [menuRow, setMenuRow] = useState(null);
  const [poPreview, setPoPreview] = useState(null);

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

  const openRowMenu = (event, row) => {
    setMenuAnchor(event.currentTarget);
    setMenuRow(row);
  };
  const closeRowMenu = () => {
    setMenuAnchor(null);
    setMenuRow(null);
  };

  const handleRowAction = (row, mode) => {
    if (!row) return;
    if (mode === "newtab") {
      window.open(buildSearchUrl(row.po_number, row.lineItem), "_blank", "noopener,noreferrer");
    } else {
      setPoPreview({ poNumber: row.po_number, lineItem: row.lineItem });
    }
  };

  const openFullSearchPage = (preview, newTab) => {
    if (!preview) return;
    const url = buildSearchUrl(preview.poNumber, preview.lineItem);
    if (newTab) {
      window.open(url, "_blank", "noopener,noreferrer");
    } else {
      navigate(url);
    }
    setPoPreview(null);
  };

  return (
    <Dialog open={!!drilldown} onClose={onClose} maxWidth="xl" fullWidth>
      <DialogTitle sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Box>
          <Typography variant="h6">{drilldown?.title}</Typography>
          <Typography variant="caption" color="text.secondary">
            {total} PO line(s) — click any row to open its PO Data &amp; Results
          </Typography>
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
                  <TableCell>PR Number</TableCell>
                  <TableCell>Vendor</TableCell>
                  <TableCell>GSTIN</TableCell>
                  <TableCell>Plant</TableCell>
                  <TableCell>PO Type</TableCell>
                  <TableCell>Tax Code</TableCell>
                  <TableCell>Purchasing Group</TableCell>
                  <TableCell>Payment Term</TableCell>
                  <TableCell>Material</TableCell>
                  <TableCell>Net Value</TableCell>
                  <TableCell>Failing Points</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((r) => (
                  <TableRow
                    key={r.id}
                    hover
                    sx={{ cursor: "pointer" }}
                    onClick={(e) => openRowMenu(e, r)}
                  >
                    <TableCell>{r.po_number || "—"}</TableCell>
                    <TableCell>{r.lineItem || "—"}</TableCell>
                    <TableCell>{r.purchase_req || "—"}</TableCell>
                    <TableCell>{r.vendorName || r.vendorCode || "—"}</TableCell>
                    <TableCell>{r.vendorGstin || "—"}</TableCell>
                    <TableCell>{r.plantName || r.plant || "—"}</TableCell>
                    <TableCell>{r.poTypeName || r.poType || "—"}</TableCell>
                    <TableCell>{r.taxCode || "—"}</TableCell>
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
                    <TableCell colSpan={13} align="center">No matching PO lines.</TableCell>
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

      <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={closeRowMenu}>
        <MenuItem onClick={() => { handleRowAction(menuRow, "newtab"); closeRowMenu(); }}>
          <OpenInNewRoundedIcon fontSize="small" sx={{ mr: 1.25, color: "text.secondary" }} />
          Open in New Tab
        </MenuItem>
        <MenuItem onClick={() => { handleRowAction(menuRow, "modal"); closeRowMenu(); }}>
          <VisibilityRoundedIcon fontSize="small" sx={{ mr: 1.25, color: "text.secondary" }} />
          View Details Here
        </MenuItem>
      </Menu>

      <PoDetailsPreviewDialog
        preview={poPreview}
        onClose={() => setPoPreview(null)}
        onOpenFullPage={openFullSearchPage}
      />
    </Dialog>
  );
};

export default DrilldownDialog;