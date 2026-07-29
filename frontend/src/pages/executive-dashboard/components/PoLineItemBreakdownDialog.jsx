import moment from "moment";
import {
  Box, Button, Dialog, DialogActions, DialogContent, DialogTitle,
  Grid, IconButton, Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Typography, Chip, Divider, alpha,
} from "@mui/material";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import OpenInNewRoundedIcon from "@mui/icons-material/OpenInNewRounded";
import VisibilityRoundedIcon from "@mui/icons-material/VisibilityRounded";
import LockRoundedIcon from "@mui/icons-material/LockRounded";
import LockOpenRoundedIcon from "@mui/icons-material/LockOpenRounded";

// Same 3-way review-status labels/colors used on the PO Data page's tabs,
// so a PO's own summary chip here reads consistently with which tab it's
// sitting in.
const REVIEW_STATUS_META = {
  pending: { label: "Pending to be Reviewed", bg: "#fee2e2", color: "#b91c1c" },
  in_progress: { label: "Being Reviewed", bg: "#fef3c7", color: "#92400e" },
  reviewed: { label: "Reviewed", bg: "#dcfce7", color: "#15803d" },
};

const LineStatusChip = ({ closed }) =>
  closed ? (
    <Chip
      size="small"
      icon={<LockRoundedIcon style={{ fontSize: 14 }} />}
      label="Closed"
      sx={{ height: 24, fontWeight: 700, fontSize: "0.75rem", bgcolor: alpha("#059669", 0.1), color: "#059669", "& .MuiChip-icon": { color: "#059669" } }}
    />
  ) : (
    <Chip
      size="small"
      icon={<LockOpenRoundedIcon style={{ fontSize: 14 }} />}
      label="Open"
      sx={{ height: 24, fontWeight: 700, fontSize: "0.75rem", bgcolor: alpha("#d97706", 0.1), color: "#d97706", "& .MuiChip-icon": { color: "#d97706" } }}
    />
  );

const formatLockedAt = (value) => {
  if (!value) return "—";
  const m = moment(value);
  return m.isValid() ? m.format("DD-MM-YYYY HH:mm") : "—";
};

/**
 * Shows every line item under one PO with its closed/open status side by
 * side — the "which line item is closed and which isn't" view that opens
 * when a PO row is clicked from the PO Data page (any of the three tabs).
 *
 * Fed entirely from data already returned by /reports/po-data
 * (`po.lineItemDetails`), so opening this dialog needs no extra request.
 * Drilling into ONE line item's full audit-check detail (all 19 points,
 * remarks, etc.) still goes through the existing PoDetailsPreviewDialog —
 * this dialog is the "which lines" layer sitting above it.
 */
const PoLineItemBreakdownDialog = ({ po, onClose, onViewLineItem, onOpenLineItemNewTab }) => {
  const details = po?.lineItemDetails || [];
  const statusMeta = REVIEW_STATUS_META[po?.reviewStatus] || REVIEW_STATUS_META.pending;

  return (
    <Dialog open={!!po} onClose={onClose} maxWidth="md" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
      <DialogTitle sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 800 }}>
            PO {po?.poNumber}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Line-item review breakdown
          </Typography>
        </Box>
        <IconButton onClick={onClose} size="small">
          <CloseRoundedIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        {po && (
          <Box>
            <Box sx={{ mb: 3 }}>
              <Grid container spacing={2} alignItems="center">
                <Grid item xs={12} sm={4}>
                  <Typography variant="caption" sx={{ color: "text.secondary", fontWeight: 700, display: "block", mb: 0.5 }}>
                    Vendor
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {po.vendorName || po.vendorCode || "—"}
                  </Typography>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Typography variant="caption" sx={{ color: "text.secondary", fontWeight: 700, display: "block", mb: 0.5 }}>
                    Purchasing Group
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {po.purchaseGroupName || po.purchaseGroup || "—"}
                  </Typography>
                </Grid>
                <Grid item xs={6} sm={2}>
                  <Typography variant="caption" sx={{ color: "text.secondary", fontWeight: 700, display: "block", mb: 0.5 }}>
                    Progress
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                    {po.closedLineCount ?? 0}/{po.totalLineCount ?? 0} closed
                  </Typography>
                </Grid>
                <Grid item xs={12} sm={3} sx={{ textAlign: { xs: "left", sm: "right" } }}>
                  <Chip
                    size="small"
                    label={statusMeta.label}
                    sx={{ fontWeight: 700, bgcolor: statusMeta.bg, color: statusMeta.color }}
                  />
                </Grid>
              </Grid>
              <Divider sx={{ mt: 2.5 }} />
            </Box>

            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700 }}>Line Item</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Material Code</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Exceptions</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Closed On</TableCell>
                    <TableCell sx={{ fontWeight: 700 }} align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {details.map((d, idx) => (
                    <TableRow key={`${d.lineItem}-${idx}`} hover>
                      <TableCell sx={{ fontWeight: 700 }}>{d.lineItem}</TableCell>
                      <TableCell>{d.materialCode || "—"}</TableCell>
                      <TableCell><LineStatusChip closed={d.closed} /></TableCell>
                      <TableCell>
                        {d.hasException ? (
                          <Chip size="small" label="Exception" sx={{ height: 22, fontWeight: 700, fontSize: "0.7rem", bgcolor: alpha("#dc2626", 0.1), color: "#dc2626" }} />
                        ) : (
                          <Chip size="small" label="Clean" sx={{ height: 22, fontWeight: 700, fontSize: "0.7rem", bgcolor: alpha("#059669", 0.1), color: "#059669" }} />
                        )}
                      </TableCell>
                      <TableCell>{d.closed ? formatLockedAt(d.remarksLockedAt) : "—"}</TableCell>
                      <TableCell align="right">
                        <IconButton size="small" title="View full audit details" onClick={() => onViewLineItem(po.poNumber, d.lineItem)}>
                          <VisibilityRoundedIcon fontSize="small" />
                        </IconButton>
                        <IconButton size="small" title="Open in new tab" onClick={() => onOpenLineItemNewTab(po.poNumber, d.lineItem)}>
                          <OpenInNewRoundedIcon fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                  {details.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} align="center" sx={{ color: "text.secondary", py: 3 }}>
                        No line items found for this PO.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ p: 2 }}>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};

export default PoLineItemBreakdownDialog;