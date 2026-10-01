import { useEffect, useState } from "react";
import {
  Dialog, DialogTitle, DialogContent, IconButton, Table, TableHead, TableRow,
  TableCell, TableBody, TableContainer, Paper, Chip, Box, Typography,
  Pagination, Skeleton, Tooltip as MuiTooltip, alpha,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import DescriptionRoundedIcon from "@mui/icons-material/DescriptionRounded";
import LockRoundedIcon from "@mui/icons-material/LockRounded";
import LockOpenRoundedIcon from "@mui/icons-material/LockOpenRounded";
import { post } from "utils/axiosApi";

const PAGE_SIZE = 25;
const RC_ACCENT = "#0d9488";
const RC_ACCENT_BG = "#f0fdfa";
const RC_BORDER = "#99f6e4";

const headCell = { bgcolor: RC_ACCENT_BG, fontWeight: 700 };

/**
 * The RC-LEVEL counterpart to HeaderKpiDrilldownDialog / DrilldownDialog.
 * Opened from the "RC Overlap Level" KPI cards and from the RC compliance
 * charts on the Executive Dashboard. Each row is one Rate Contract
 * (vendor + material + RC number), not a PO.
 *
 * `drilldown`: { dimension, title, value?, statusFilter? } or null.
 * Backed by POST /reports/executive-rc-drilldown (getExecutiveRcDrilldown).
 */
const RcKpiDrilldownDialog = ({ drilldown, appliedFilters, onClose }) => {
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
      const res = await post("/reports/executive-rc-drilldown", {
        ...appliedFilters,
        dimension: drilldown.dimension,
        value: drilldown.value,
        statusFilter: drilldown.statusFilter,
        page: targetPage,
        pageSize: PAGE_SIZE,
      });
      setRows(res?.results || []);
      setTotal(res?.total || 0);
    } catch (err) {
      console.error("Error fetching RC drilldown:", err);
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  const pageCount = Math.max(Math.ceil(total / PAGE_SIZE), 1);

  return (
    <Dialog open={!!drilldown} onClose={onClose} maxWidth="xl" fullWidth>
      <DialogTitle
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          bgcolor: RC_ACCENT_BG,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <DescriptionRoundedIcon sx={{ color: RC_ACCENT }} />
          <Box>
            <Typography variant="h6">{drilldown?.title}</Typography>
            <Typography variant="caption" color="text.secondary">
              {loading ? "Loading…" : `${total} RC(s)`} — each row is one Rate
              Contract, not a PO or line item.
            </Typography>
          </Box>
        </Box>
        <IconButton onClick={onClose}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        {loading ? (
          <Skeleton variant="rectangular" height={360} />
        ) : (
          <TableContainer
            component={Paper}
            variant="outlined"
            sx={{ maxHeight: 500, borderColor: RC_BORDER }}
          >
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell sx={headCell}>RC Number</TableCell>
                  <TableCell sx={headCell}>Vendor</TableCell>
                  <TableCell sx={headCell}>Material Code</TableCell>
                  <TableCell sx={headCell}>Valid From</TableCell>
                  <TableCell sx={headCell}>Valid To</TableCell>
                  <TableCell sx={headCell}>Purchasing Group(s)</TableCell>
                  <TableCell sx={headCell}>Overlapping RCs</TableCell>
                  <TableCell sx={headCell}>Result</TableCell>
                  <TableCell sx={headCell}>Review Status</TableCell>
                  <TableCell sx={headCell}>Latest Remark</TableCell>
                  <TableCell sx={headCell}>Is PO Corrected?</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((r) => {
                  const verified = r.result === "Verified";
                  return (
                    <TableRow key={r.key || r.id} hover>
                      <TableCell sx={{ fontWeight: 700 }}>{r.rcNumber}</TableCell>
                      <TableCell>{r.vendorName || r.vendorCode || "—"}</TableCell>
                      <TableCell>{r.materialCode || "—"}</TableCell>
                      <TableCell>{r.validFrom || "—"}</TableCell>
                      <TableCell>{r.validTo || "—"}</TableCell>
                      <TableCell>{r.purchaseGroups || "—"}</TableCell>
                      <TableCell sx={{ maxWidth: 200 }}>
                        <MuiTooltip title={r.overlappingRcs || ""}>
                          <Typography variant="body2" noWrap sx={{ maxWidth: 200 }}>
                            {r.overlappingRcs || "—"}
                          </Typography>
                        </MuiTooltip>
                      </TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={r.result || "—"}
                          sx={{
                            fontWeight: 700,
                            bgcolor: verified
                              ? alpha("#059669", 0.1)
                              : alpha("#dc2626", 0.1),
                            color: verified ? "#059669" : "#dc2626",
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        {verified ? (
                          <Typography variant="caption" color="text.secondary">
                            —
                          </Typography>
                        ) : r.locked ? (
                          <Chip
                            size="small"
                            icon={<LockRoundedIcon fontSize="small" />}
                            label="Closed"
                            sx={{
                              fontWeight: 700,
                              bgcolor: alpha("#059669", 0.1),
                              color: "#059669",
                            }}
                          />
                        ) : (
                          <Chip
                            size="small"
                            icon={<LockOpenRoundedIcon fontSize="small" />}
                            label="Pending"
                            sx={{
                              fontWeight: 700,
                              bgcolor: alpha("#d97706", 0.1),
                              color: "#d97706",
                            }}
                          />
                        )}
                      </TableCell>
                      <TableCell sx={{ maxWidth: 240 }}>
                        <Typography
                          variant="body2"
                          sx={{ whiteSpace: "normal", wordBreak: "break-word" }}
                        >
                          {r.latestRemark || "—"}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        {r.isPoCorrected ? (
                          <Chip
                            size="small"
                            label={r.isPoCorrected}
                            sx={{
                              fontWeight: 700,
                              bgcolor:
                                r.isPoCorrected === "PO Corrected"
                                  ? alpha("#dc2626", 0.1)
                                  : "grey.200",
                              color:
                                r.isPoCorrected === "PO Corrected"
                                  ? "#dc2626"
                                  : "#334155",
                            }}
                          />
                        ) : (
                          "—"
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={11} align="center">
                      No matching RCs.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}
        <Box display="flex" justifyContent="center" sx={{ mt: 2 }}>
          <Pagination
            count={pageCount}
            page={page}
            onChange={(_, v) => setPage(v)}
            color="primary"
          />
        </Box>
      </DialogContent>
    </Dialog>
  );
};

export default RcKpiDrilldownDialog;