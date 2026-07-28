import { useEffect, useState } from "react";
import {
  Dialog, DialogTitle, DialogContent, DialogActions, IconButton, Box,
  Typography, Chip, Grid, Divider, CircularProgress, Button, alpha,
} from "@mui/material";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import { post } from "utils/axiosApi";

const STATUS_COLORS = {
  Verified: { bg: alpha("#059669", 0.1), color: "#059669" },
  "Not Verified": { bg: alpha("#dc2626", 0.1), color: "#dc2626" },
};

const formatDate = (v) => {
  if (!v) return "—";
  const d = new Date(v);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB");
};

const Field = ({ label, value }) => (
  <Grid item xs={6} sm={4}>
    <Typography variant="caption" sx={{ color: "text.secondary", fontWeight: 700, display: "block", mb: 0.5 }}>
      {label}
    </Typography>
    <Typography variant="body2" sx={{ fontWeight: 600, wordBreak: "break-word" }}>
      {value === null || value === undefined || value === "" ? "—" : String(value)}
    </Typography>
  </Grid>
);

// Falls back to raw codes if purchaseGroupNames wasn't sent, same guard as
// the table component.
const purchaseGroupChips = (record) => {
  if (record?.purchaseGroupNames && record.purchaseGroupNames.length > 0) {
    return record.purchaseGroupNames;
  }
  return (record?.purchaseGroups || []).map((code) => ({ code, name: code }));
};

/**
 * Detail dialog for a single RC Overlap record — shown when a row is
 * clicked in RcOverlapTable. Fetches /reports/rc-overlap-detail, which
 * also resolves the sibling RC records this one overlaps with (already
 * filtered server-side to whatever the current user is allowed to see).
 *
 * Vendor and Purchase Group fields are enriched server-side via
 * rc-overlap-controller.js's enrichRcOverlapRow() (vendorName, vendorGstin,
 * purchaseGroupNames), same as the list table. Purchase Group chips print
 * BOTH the code and resolved name directly ("P15 — Packaging") instead of
 * hiding the name behind a hover tooltip, matching the table's treatment.
 */
const RcOverlapDetailDialog = ({ rcId, onClose }) => {
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!rcId) {
      setDetail(null);
      setError("");
      return;
    }
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const res = await post("/reports/rc-overlap-detail", { id: rcId });
        if (!cancelled) setDetail(res);
      } catch (err) {
        if (!cancelled) {
          setError(err?.response?.data?.message || err?.message || "Failed to load RC detail");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [rcId]);

  return (
    <Dialog open={!!rcId} onClose={onClose} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
      <DialogTitle sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 800 }}>
            RC {detail?.rcNumber || ""}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            RC Overlap detail
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
          <Typography color="error" sx={{ py: 2 }}>{error}</Typography>
        )}
        {!loading && !error && detail && (
          <Box>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={8}>
                <Typography variant="caption" sx={{ color: "text.secondary", fontWeight: 700, display: "block", mb: 0.5 }}>
                  Vendor
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                  {detail.vendorCode || "—"}
                  {detail.vendorName && detail.vendorName !== detail.vendorCode
                    ? ` — ${detail.vendorName}`
                    : ""}
                </Typography>
                {detail.vendorGstin && (
                  <Typography variant="caption" color="text.secondary">
                    GSTIN: {detail.vendorGstin}
                  </Typography>
                )}
              </Grid>
              <Field label="Material Code" value={detail.rcMaterialCode} />
              <Field label="RC Number" value={detail.rcNumber} />
              <Field label="Valid From" value={formatDate(detail.validFrom)} />
              <Field label="Valid To" value={formatDate(detail.validTo)} />
              <Grid item xs={6} sm={4}>
                <Typography variant="caption" sx={{ color: "text.secondary", fontWeight: 700, display: "block", mb: 0.5 }}>
                  Status
                </Typography>
                <Chip
                  size="small"
                  label={detail.status}
                  sx={{
                    fontWeight: 700,
                    bgcolor: STATUS_COLORS[detail.status]?.bg || "grey.100",
                    color: STATUS_COLORS[detail.status]?.color || "text.secondary",
                  }}
                />
              </Grid>
              <Grid item xs={12} sm={8}>
                <Typography variant="caption" sx={{ color: "text.secondary", fontWeight: 700, display: "block", mb: 0.5 }}>
                  Purchase Group(s)
                </Typography>
                {purchaseGroupChips(detail).length > 0 ? (
                  <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                    {purchaseGroupChips(detail).map((g) => (
                      <Chip
                        key={g.code}
                        size="small"
                        label={g.name && g.name !== g.code ? `${g.code} — ${g.name}` : g.code}
                        sx={{ fontWeight: 700, bgcolor: "grey.100", color: "#334155" }}
                      />
                    ))}
                  </Box>
                ) : (
                  <Typography variant="body2" color="text.secondary">—</Typography>
                )}
              </Grid>
            </Grid>

            {detail.remark && (
              <Typography variant="body2" sx={{ mt: 2, color: "text.secondary" }}>
                {detail.remark}
              </Typography>
            )}

            {detail.overlappingRecords?.length > 0 && (
              <Box sx={{ mt: 3 }}>
                <Divider sx={{ mb: 2 }} />
                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>
                  Overlapping RC(s)
                </Typography>
                {detail.overlappingRecords.map((o) => (
                  <Box
                    key={o.id}
                    sx={{
                      p: 1.5, mb: 1, borderRadius: 2, border: "1px solid",
                      borderColor: "grey.100", bgcolor: "#f8fafc",
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                    }}
                  >
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>RC {o.rcNumber}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {formatDate(o.validFrom)} – {formatDate(o.validTo)}
                      </Typography>
                    </Box>
                    <Chip
                      size="small"
                      label={o.status}
                      sx={{
                        fontWeight: 700,
                        bgcolor: STATUS_COLORS[o.status]?.bg || "grey.100",
                        color: STATUS_COLORS[o.status]?.color || "text.secondary",
                      }}
                    />
                  </Box>
                ))}
              </Box>
            )}
          </Box>
        )}
        {!loading && !error && !detail && (
          <Typography color="text.secondary" sx={{ py: 4, textAlign: "center" }}>
            No detail found for this RC.
          </Typography>
        )}
      </DialogContent>
      <DialogActions sx={{ p: 2 }}>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};

export default RcOverlapDetailDialog;