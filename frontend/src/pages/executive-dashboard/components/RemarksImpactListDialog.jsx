import { useCallback, useEffect, useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Box,
  Typography,
  Chip,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableContainer,
  Paper,
  CircularProgress,
  Button,
  ToggleButtonGroup,
  ToggleButton,
  Pagination,
  TextField,
  MenuItem,
  Stack,
  alpha,
} from "@mui/material";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import { post } from "utils/axiosApi";

const PAGE_SIZE = 25;

/**
 * The list behind one of the 3 "Remarks Impact" numbers (Total Not
 * Verified / Pending / Closed) for one section (header/line/rc). Backed
 * by POST /reports/remarks-impact-list, which uses the EXACT same
 * mandatory-points + coverage logic as the summary cards, so this list's
 * row count always matches the number that was clicked — never a looser
 * "approximately this many" drilldown.
 *
 * Real filtering, not decorative: a point-number dropdown (populated from
 * `availablePoints` the backend returns for THIS section+bucket — never a
 * static 1-19 list, since a bucket might not contain every point number),
 * plus the existing PO Corrected / System Altercation toggle for the
 * Closed bucket. Both combine and both reset the page.
 *
 * `trigger`: { section, title, bucket, closedLabel } or null (closed).
 */
const RemarksImpactListDialog = ({ trigger, onClose }) => {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [availablePoints, setAvailablePoints] = useState([]);
  // Only meaningful for bucket === "closed" — see effective-result.js
  // Dimension B. "" = both.
  const [correctedFilter, setCorrectedFilter] = useState("");
  const [pointFilter, setPointFilter] = useState("");

  const load = useCallback(
    async (pageToLoad, corrected, pointNo) => {
      if (!trigger) return;
      setLoading(true);
      try {
        const res = await post("/reports/remarks-impact-list", {
          section: trigger.section,
          bucket: trigger.bucket,
          isPoCorrected: trigger.bucket === "closed" ? corrected || undefined : undefined,
          pointNo: pointNo || undefined,
          page: pageToLoad,
          pageSize: PAGE_SIZE,
        });
        setRows(res?.rows || []);
        setTotal(res?.total || 0);
        // Only replace the point-filter option list when we're NOT
        // already filtering by point (a filtered response's
        // availablePoints would just be that one point) — keep the full
        // list available so the buyer can switch between points without
        // it collapsing to one option.
        if (!pointNo) setAvailablePoints(res?.availablePoints || []);
      } catch (err) {
        console.error("Error loading remarks impact list:", err);
        setRows([]);
        setTotal(0);
      } finally {
        setLoading(false);
      }
    },
    [trigger],
  );

  useEffect(() => {
    if (trigger) {
      setPage(1);
      setCorrectedFilter("");
      setPointFilter("");
      setAvailablePoints([]);
      load(1, "", "");
    }
  }, [trigger, load]);

  const bucketLabel =
    trigger?.bucket === "pending"
      ? "Pending"
      : trigger?.bucket === "closed"
      ? trigger?.closedLabel || "Closed"
      : "Total Not Verified";

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const isRc = trigger?.section === "rc";
  const isHeader = trigger?.section === "header";

  return (
    <Dialog open={!!trigger} onClose={onClose} maxWidth="xl" fullWidth>
      <DialogTitle
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          bgcolor: "#eef2ff",
          borderBottom: "1px solid",
          borderColor: "divider",
        }}
      >
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            {trigger?.title} — {bucketLabel}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {loading ? "Loading…" : `${total} item${total === 1 ? "" : "s"}`}
          </Typography>
        </Box>
        <IconButton onClick={onClose} size="small">
          <CloseRoundedIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ p: 3 }}>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ mb: 2 }} alignItems={{ sm: "center" }}>
          {!isRc && (
            <TextField
              select
              size="small"
              label="Point"
              value={pointFilter}
              onChange={(e) => {
                const val = e.target.value;
                setPointFilter(val);
                setPage(1);
                load(1, correctedFilter, val);
              }}
              sx={{ minWidth: 260 }}
              disabled={availablePoints.length === 0}
            >
              <MenuItem value="">
                <em>All points ({availablePoints.length})</em>
              </MenuItem>
              {availablePoints.map((p) => (
                <MenuItem key={p.pointNo} value={p.pointNo}>
                  #{p.pointNo} — {p.title}
                </MenuItem>
              ))}
            </TextField>
          )}

          {trigger?.bucket === "closed" && (
            <ToggleButtonGroup
              size="small"
              exclusive
              value={correctedFilter}
              onChange={(_, val) => {
                const next = val ?? "";
                setCorrectedFilter(next);
                setPage(1);
                load(1, next, pointFilter);
              }}
            >
              <ToggleButton value="">All</ToggleButton>
              <ToggleButton value="corrected">POs Corrected</ToggleButton>
              <ToggleButton value="altercation">System Altercations</ToggleButton>
            </ToggleButtonGroup>
          )}
        </Stack>

        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
            <CircularProgress size={28} />
          </Box>
        ) : rows.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: "center" }}>
            Nothing here{pointFilter ? " for this point" : ""}
            {correctedFilter ? " with this filter" : ""}.
          </Typography>
        ) : (
          <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 520, overflow: "auto" }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  {isRc ? (
                    <>
                      <TableCell sx={{ fontWeight: 700 }}>RC Number</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Vendor</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Material Code</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Valid From</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Valid To</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Purchase Group(s)</TableCell>
                    </>
                  ) : (
                    <>
                      <TableCell sx={{ fontWeight: 700 }}>PO Number</TableCell>
                      {!isHeader && <TableCell sx={{ fontWeight: 700 }}>Line</TableCell>}
                      <TableCell sx={{ fontWeight: 700 }}>PO Date</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>PO Type</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Plant</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Purch. Group</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Point</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Vendor</TableCell>
                    </>
                  )}
                  <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Latest Remark</TableCell>
                  {trigger?.bucket !== "pending" && (
                    <TableCell sx={{ fontWeight: 700 }}>Is PO Corrected?</TableCell>
                  )}
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((r, idx) => (
                  <TableRow key={r.key || idx} hover>
                    {isRc ? (
                      <>
                        <TableCell>{r.rcNumber}</TableCell>
                        <TableCell>{r.vendorName || r.vendorCode}</TableCell>
                        <TableCell>{r.materialCode}</TableCell>
                        <TableCell>{r.validFrom || "—"}</TableCell>
                        <TableCell>{r.validTo || "—"}</TableCell>
                        <TableCell>{r.purchaseGroups || "—"}</TableCell>
                      </>
                    ) : (
                      <>
                        <TableCell>{r.poNumber}</TableCell>
                        {!isHeader && <TableCell>{r.lineItem}</TableCell>}
                        <TableCell>{r.poDate || "—"}</TableCell>
                        <TableCell>{r.poType || "—"}</TableCell>
                        <TableCell>{r.plant || "—"}</TableCell>
                        <TableCell>{r.purchaseGroup || "—"}</TableCell>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            #{r.pointNo}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {r.pointTitle}
                          </Typography>
                        </TableCell>
                        <TableCell>{r.vendorName || r.vendorCode}</TableCell>
                      </>
                    )}
                    <TableCell>
                      <Chip
                        size="small"
                        label={r.status}
                        sx={{
                          fontWeight: 700,
                          bgcolor: r.status === "Closed" ? alpha("#059669", 0.1) : alpha("#dc2626", 0.1),
                          color: r.status === "Closed" ? "#059669" : "#dc2626",
                        }}
                      />
                    </TableCell>
                    <TableCell sx={{ maxWidth: 240 }}>
                      <Typography variant="body2" sx={{ whiteSpace: "normal", wordBreak: "break-word" }}>
                        {r.latestRemark || "—"}
                      </Typography>
                    </TableCell>
                    {trigger?.bucket !== "pending" && (
                      <TableCell>
                        {r.isPoCorrected ? (
                          <Chip
                            size="small"
                            label={r.isPoCorrected}
                            sx={{
                              fontWeight: 700,
                              bgcolor: r.isPoCorrected === "PO Corrected" ? alpha("#dc2626", 0.1) : "grey.200",
                              color: r.isPoCorrected === "PO Corrected" ? "#dc2626" : "#334155",
                            }}
                          />
                        ) : (
                          "—"
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}

        {pageCount > 1 && !loading && (
          <Box sx={{ display: "flex", justifyContent: "center", mt: 2 }}>
            <Pagination
              count={pageCount}
              page={page}
              onChange={(_, val) => {
                setPage(val);
                load(val, correctedFilter, pointFilter);
              }}
              size="small"
            />
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};

export default RemarksImpactListDialog;