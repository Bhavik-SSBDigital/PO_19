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
  Tooltip,
} from "@mui/material";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import SendRoundedIcon from "@mui/icons-material/SendRounded";
import LockRoundedIcon from "@mui/icons-material/LockRounded";
import AddCommentRoundedIcon from "@mui/icons-material/AddCommentRounded";
import ChatBubbleRoundedIcon from "@mui/icons-material/ChatBubbleRounded";
import CloseIcon from "@mui/icons-material/Close";
import { toast } from "react-toastify";
import {
  getPoRemarks,
  submitPoRemark,
  deletePoRemark,
} from "../../../api/api-functions";

const PointRemarkPanel = ({
  auditResultId,
  poNumber,
  poLineItem,
  pointNo,
  currentUserId,
  isBuyer,
  isAdmin,
  isProcurementManager,
  locked: lockedProp = false,
  // NEW: remarks already embedded on the search response (row.buyerRemarks
  // for this point). Seeds state immediately so the trigger is correct on
  // first paint instead of showing "No Remarks" until the dialog opens.
  initialRemarks = [],
  // NEW: optional — lets a parent list re-sync its own copy (e.g. a
  // summary count somewhere else on the page) whenever this point's
  // remarks change. Safe to omit.
  onRemarksChanged,
  compact = false,
}) => {
  // Only a Buyer can add/edit/delete. Admin and Procurement Manager are
  // read-only — they can open the dialog and see every remark, but never
  // get an input box or a delete button.
  const canSubmit = isBuyer;

  const [remarks, setRemarks] = useState(initialRemarks);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);
  const [locked, setLocked] = useState(lockedProp);

  // Keep in sync whenever the parent re-fetches the search page and hands
  // down fresh embedded remarks (e.g. after switching line items).
  useEffect(() => {
    setRemarks(initialRemarks);
  }, [initialRemarks]);

  useEffect(() => {
    setLocked(lockedProp);
  }, [lockedProp]);

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
      const payload = auditResultId
        ? { auditResultId, pointNo }
        : { poNumber, poLineItem, pointNo };
      const res = await getPoRemarks(payload);
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
  }, [open, auditResultId, poNumber, poLineItem, pointNo]);

  useEffect(() => {
    if (!open) return;
    // Only ever prefill the box for a NEW remark. There is no "edit in
    // place" flow — once a buyer has their own remark on this point, the
    // input is hidden entirely (see canSubmit && !locked && !ownRemark
    // below); to change wording they delete their remark and add a new
    // one. So the draft box never needs to carry an existing remark's text.
    if (!ownRemark) setDraft("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, remarks]);

  const handleSubmit = async () => {
    if (!draft.trim() || ownRemark) return;
    setSubmitting(true);
    try {
      const payload = auditResultId
        ? { auditResultId, pointNo, remark: draft.trim() }
        : { poNumber, poLineItem, pointNo, remark: draft.trim() };
      await submitPoRemark(payload);
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
      await deletePoRemark(id);
      toast.success("Remark deleted");
      await load();
    } catch (error) {
      toast.error(error?.response?.data?.message || error?.message || "Failed to delete remark");
    }
  };

  const count = remarks.length;
  const latest = remarks[0]; // already ordered newest-first by the API

  // ── Trigger chip: EXACTLY two labels once there's something to act on
  // — "Add Remark" (nothing exists yet, you can submit one) or "View
  // Remarks" (one or more exist — open the dialog to read them, never to
  // "update" anything). "Locked"/"No Remarks" are the only other states,
  // for when there's genuinely nothing to add or view. Colors are
  // distinct per state so the button reads correctly at a glance: green
  // = you can add one, blue = remarks exist to read, amber = locked.
  let chipLabel;
  let chipColor = "default";
  let chipIcon = <ChatBubbleRoundedIcon fontSize="small" />;
  let chipVariant = "outlined";

  if (count > 0) {
    chipLabel = "View Remarks";
    chipColor = ownRemark ? "primary" : "info";
    chipVariant = "filled";
  } else if (canSubmit && locked) {
    chipLabel = "Locked";
    chipColor = "warning";
    chipIcon = <LockRoundedIcon fontSize="small" />;
  } else if (canSubmit) {
    chipLabel = "Add Remark";
    chipColor = "success";
    chipVariant = "outlined";
    chipIcon = <AddCommentRoundedIcon fontSize="small" />;
  } else {
    chipLabel = "No Remarks";
  }

  return (
    <>
      <Stack spacing={0.5} alignItems="flex-start">
        <Chip
          size="small"
          clickable
          onClick={() => setOpen(true)}
          icon={chipIcon}
          label={chipLabel}
          color={chipColor}
          variant={chipVariant}
          sx={{ fontWeight: 700, borderRadius: "16px" }}
        />
        {latest && (
          <Tooltip title={latest.remark}>
            <Typography
              variant="caption"
              color="text.secondary"
              onClick={() => setOpen(true)}
              sx={{
                cursor: "pointer",
                maxWidth: 220,
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
                lineHeight: 1.3,
              }}
            >
              {latest.submittedByName || "Buyer"}{latest.isMine ? " (you)" : ""}:{" "}
              <Box component="span" sx={{ fontWeight: 700, color: "text.primary" }}>
                {latest.remark}
              </Box>
            </Typography>
          </Tooltip>
        )}
      </Stack>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
        <DialogTitle sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", bgcolor: "grey.50", borderBottom: "1px solid", borderColor: "divider" }}>
          <Typography variant="h6" fontWeight={700}>
            Point {pointNo} Remarks
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
                  label="This line item is checked — remarks are locked"
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
                      {r.submittedAt && (
                        <Chip
                          size="small"
                          variant="outlined"
                          label={new Date(r.submittedAt).toLocaleString()}
                          sx={{ height: 24, fontSize: "0.7rem", bgcolor: "white" }}
                        />
                      )}
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

export default PointRemarkPanel;