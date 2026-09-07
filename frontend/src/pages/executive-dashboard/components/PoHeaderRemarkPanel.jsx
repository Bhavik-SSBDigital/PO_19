import { useEffect, useState } from "react";
import {
  Box,
  Typography,
  TextField,
  Button,
  Stack,
  IconButton,
  CircularProgress,
  Chip,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
} from "@mui/material";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import SendRoundedIcon from "@mui/icons-material/SendRounded";
import LockRoundedIcon from "@mui/icons-material/LockRounded";
import CloseIcon from "@mui/icons-material/Close";
import { toast } from "react-toastify";
import {
  getPoHeaderRemarks,
  submitPoHeaderRemark,
  deletePoHeaderRemark,
} from "../../../api/api-functions";

/**
 * HEADER-LEVEL counterpart to PointRemarkPanel.jsx. Same UX, but keyed by
 * (po_number, pointNo) instead of (auditResultId / poNumber+poLineItem,
 * pointNo) - there's no single line item a header remark belongs to, and
 * whether it's locked is governed by the PO's own header lock
 * (`locked` prop, from PoHeaderResult.remarksLocked), completely
 * independent of any line item's lock state.
 */
const PoHeaderRemarkPanel = ({
  poNumber,
  pointNo,
  currentUserId,
  isBuyer,
  isAdmin,
  isProcurementManager,
  locked: lockedProp = false,
  // Remarks already embedded on the parent's response (e.g.
  // header.headerRemarksByPoint[pointNo] from getHeaderForPo /
  // getPoHeaderSummary). Seeds state immediately so the trigger button
  // shows the right label on first paint instead of "Add Remark" until
  // the dialog is opened once and load() has a chance to run.
  initialRemarks = [],
  // Optional — lets a parent re-sync its own copy (e.g. a summary count
  // elsewhere on the page) whenever this point's remarks change.
  onRemarksChanged,
  compact = false,
}) => {
  const canSubmit = isBuyer;

  const [remarks, setRemarks] = useState(initialRemarks);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);
  const [locked, setLocked] = useState(lockedProp);

  // Keep in sync whenever the parent re-fetches and hands down fresh
  // embedded remarks (e.g. after switching POs, or a header refresh).
  useEffect(() => {
    setRemarks(initialRemarks);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialRemarks]);

  const ownRemark = remarks.find(
    (r) => currentUserId != null && String(r.submittedBy) === String(currentUserId)
  );

  const applyRemarks = (next, nextLocked) => {
    setRemarks(next);
    if (nextLocked !== undefined) setLocked(nextLocked);
    onRemarksChanged?.(next);
  };

  const load = async () => {
    setLoading(true);
    try {
      const res = await getPoHeaderRemarks({ po_number: poNumber, pointNo });
      applyRemarks(res?.remarks || [], Boolean(res?.remarksLocked));
    } catch (error) {
      toast.error(error?.response?.data?.message || error?.message || "Failed to load remarks");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      load();
    } else {
      setDraft("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, poNumber, pointNo]);

  useEffect(() => {
    if (!open) return;
    // No "edit in place" flow here either — see canSubmit && !locked &&
    // !ownRemark below. The draft box is only ever used to add a brand
    // new remark, so it never needs to be prefilled from an existing one.
    if (!ownRemark) setDraft("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, remarks]);

  useEffect(() => {
    setLocked(lockedProp);
  }, [lockedProp]);

  const handleSubmit = async () => {
    if (!draft.trim() || ownRemark) return;
    setSubmitting(true);
    try {
      await submitPoHeaderRemark({
        po_number: poNumber,
        pointNo,
        remark: draft.trim(),
      });
      toast.success("Remark added");
      await load();
    } catch (error) {
      toast.error(error?.response?.data?.message || error?.message || "Failed to save remark");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await deletePoHeaderRemark(id);
      toast.success("Remark deleted");
      await load();
    } catch (error) {
      toast.error(error?.response?.data?.message || error?.message || "Failed to delete remark");
    }
  };

  return (
    <>
      <Button
        size="small"
        variant={remarks.length > 0 ? "contained" : "outlined"}
        color={
          remarks.length > 0
            ? ownRemark
              ? "primary"
              : "info"
            : canSubmit && locked
            ? "warning"
            : canSubmit
            ? "success"
            : "inherit"
        }
        onClick={() => setOpen(true)}
        startIcon={locked && canSubmit ? <LockRoundedIcon fontSize="small" /> : null}
        sx={{
          textTransform: "none",
          fontWeight: 700,
          borderRadius: "20px",
          minWidth: "120px",
        }}
      >
        {/* EXACTLY two labels once there's something to act on — "Add
            Remark" (nothing yet, you can submit one) or "View Remarks"
            (one or more exist — read-only trigger, never "update").
            Color follows the same rule: green = you can add one, blue/
            indigo = remarks exist to read, amber = locked. */}
        {remarks.length > 0
          ? "View Remarks"
          : canSubmit
          ? locked
            ? "Locked"
            : "Add Remark"
          : "No Remarks"}
      </Button>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
        <DialogTitle sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", bgcolor: "#eef2ff", borderBottom: "1px solid", borderColor: "divider" }}>
          <Typography variant="h6" fontWeight={700}>
            Header Point {pointNo} Remarks — PO {poNumber}
          </Typography>
          <IconButton onClick={() => setOpen(false)} size="small">
            <CloseIcon />
          </IconButton>
        </DialogTitle>

        <DialogContent sx={{ p: 3 }}>
          {canSubmit && !currentUserId && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              Could not identify the current user — try logging out and back
              in.
            </Alert>
          )}

          {loading ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
              <CircularProgress size={24} />
            </Box>
          ) : (
            <Stack spacing={2} sx={{ mb: canSubmit && !locked && !ownRemark ? 3 : 0 }}>
              {locked && (
                <Chip
                  icon={<LockRoundedIcon fontSize="small" />}
                  label="This PO's header checks are closed — remarks are locked"
                  color="warning"
                  variant="outlined"
                  sx={{ fontWeight: 600 }}
                />
              )}
              {remarks.length === 0 && (
                <Typography variant="body2" color="text.secondary" textAlign="center" py={2}>
                  No remarks have been added yet.
                </Typography>
              )}
              {remarks.map((r) => {
                const isMine = r.isMine ?? (currentUserId != null && String(r.submittedBy) === String(currentUserId));
                return (
                  <Box
                    key={r.id}
                    sx={{
                      p: 2,
                      borderRadius: 2,
                      bgcolor: isMine ? "#eff6ff" : "#f8fafc",
                      border: "1px solid",
                      borderColor: isMine ? "#bfdbfe" : "grey.200",
                      borderLeft: "4px solid",
                      borderLeftColor: isMine ? "#2563eb" : "#94a3b8",
                    }}
                  >
                    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <Typography
                        variant="body2"
                        sx={{ wordBreak: "break-word", pr: 2, fontWeight: 700, color: "text.primary" }}
                      >
                        {r.remark}
                      </Typography>
                      {isMine && canSubmit && !locked && (
                        <IconButton size="small" color="error" onClick={() => handleDelete(r.id)} sx={{ mt: -0.5, mr: -0.5 }}>
                          <DeleteOutlineRoundedIcon fontSize="small" />
                        </IconButton>
                      )}
                    </Box>
                    <Box sx={{ mt: 1.5, display: "flex", gap: 1, flexWrap: "wrap" }}>
                      <Chip
                        size="small"
                        color={isMine ? "primary" : "default"}
                        variant="outlined"
                        label={
                          r.submittedByName ||
                          `${r.submitter?.firstName || ""} ${r.submitter?.lastName || r.submitter?.username || ""}`.trim()
                        }
                        sx={{ height: 24, fontSize: "0.75rem", fontWeight: 600, bgcolor: "white" }}
                      />
                      {isMine && <Chip size="small" label="Your remark" sx={{ height: 24, fontSize: "0.7rem" }} />}
                    </Box>
                  </Box>
                );
              })}
            </Stack>
          )}

          {canSubmit && !locked && !ownRemark && (
            <Box sx={{ display: "flex", gap: 1, alignItems: "flex-start" }}>
              <TextField
                size="medium"
                fullWidth
                multiline
                maxRows={3}
                placeholder="Type your remark here..."
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit();
                  }
                }}
              />
              <Button
                variant="contained"
                color="success"
                disabled={submitting || !draft.trim()}
                onClick={handleSubmit}
                sx={{ height: "40px", px: 3, boxShadow: "none" }}
                startIcon={submitting ? <CircularProgress size={16} color="inherit" /> : <SendRoundedIcon />}
              >
                Add Remark
              </Button>
            </Box>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default PoHeaderRemarkPanel;