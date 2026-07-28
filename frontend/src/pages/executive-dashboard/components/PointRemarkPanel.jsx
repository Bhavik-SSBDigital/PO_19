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
  getPoRemarks,
  submitPoRemark,
  updatePoRemark,
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
  compact = false,
}) => {
  // Only a Buyer can add/edit/delete. Admin and Procurement Manager are
  // read-only — they can open the dialog and see every remark, but never
  // get an input box or a delete button.
  const canSubmit = isBuyer;

  const [remarks, setRemarks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);
  const [locked, setLocked] = useState(lockedProp);

  const ownRemark = remarks.find(
    (r) => currentUserId != null && String(r.submittedBy) === String(currentUserId)
  );

  const load = async () => {
    setLoading(true);
    try {
      const payload = auditResultId
        ? { auditResultId, pointNo }
        : { poNumber, poLineItem, pointNo };
      const res = await getPoRemarks(payload);
      setRemarks(res?.remarks || []);
      setLocked(Boolean(res?.remarksLocked));
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
      // Clear the draft the moment the dialog closes, so reopening it
      // (for this point or a different one) never shows leftover text.
      setDraft("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, auditResultId, poNumber, poLineItem, pointNo]);

  // Draft always mirrors the current remark state instead of being left as
  // whatever was last typed:
  //  - own remark exists  -> draft shows that remark's text (edit mode)
  //  - no own remark      -> draft is empty (add mode)
  // Re-runs whenever `remarks` changes (e.g. right after a successful
  // submit), so the box switches to edit mode with correct text
  // immediately — no stale leftover input.
  useEffect(() => {
    if (!open) return;
    setDraft(ownRemark ? ownRemark.remark : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, remarks]);

  const handleSubmit = async () => {
    if (!draft.trim()) return;
    setSubmitting(true);
    try {
      if (ownRemark) {
        await updatePoRemark({ id: ownRemark.id, remark: draft.trim() });
        toast.success("Remark updated");
      } else {
        const payload = auditResultId
          ? { auditResultId, pointNo, remark: draft.trim() }
          : { poNumber, poLineItem, pointNo, remark: draft.trim() };
        await submitPoRemark(payload);
        toast.success("Remark added");
      }
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

  return (
    <>
      <Button
        size="small"
        variant="outlined"
        onClick={() => setOpen(true)}
        startIcon={locked && canSubmit ? <LockRoundedIcon fontSize="small" /> : null}
        sx={{ textTransform: "none", fontWeight: 600, borderRadius: "20px", minWidth: "120px" }}
      >
        {remarks.length > 0
          ? `Remarks (${remarks.length})`
          : canSubmit
          ? locked
            ? "Locked"
            : "Add Remark"
          : "No Remarks"}
      </Button>

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
            <Stack spacing={2} sx={{ mb: canSubmit && !locked ? 3 : 0 }}>
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
                const isMine = currentUserId != null && String(r.submittedBy) === String(currentUserId);
                return (
                  <Box
                    key={r.id}
                    sx={{
                      p: 2,
                      borderRadius: 2,
                      bgcolor: isMine ? "#eff6ff" : "#f8fafc",
                      border: "1px solid",
                      borderColor: isMine ? "#bfdbfe" : "grey.200",
                    }}
                  >
                    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <Typography variant="body2" sx={{ wordBreak: "break-word", pr: 2 }}>
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
                        label={`${r.submitter?.firstName || ""} ${r.submitter?.lastName || r.submitter?.username || ""}`.trim()}
                        sx={{ height: 24, fontSize: "0.75rem", fontWeight: 600, bgcolor: "white" }}
                      />
                      {isMine && <Chip size="small" label="Your remark" sx={{ height: 24, fontSize: "0.7rem" }} />}
                    </Box>
                  </Box>
                );
              })}
            </Stack>
          )}

          {canSubmit && !locked && (
            <Box sx={{ display: "flex", gap: 1, alignItems: "flex-start" }}>
              <TextField
                size="medium"
                fullWidth
                multiline
                maxRows={3}
                placeholder={ownRemark ? "Edit your remark..." : "Type your remark here..."}
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
                disabled={submitting || !draft.trim()}
                onClick={handleSubmit}
                sx={{ height: "40px", px: 3, boxShadow: "none" }}
                startIcon={submitting ? <CircularProgress size={16} color="inherit" /> : <SendRoundedIcon />}
              >
                {ownRemark ? "Update" : "Send"}
              </Button>
            </Box>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default PointRemarkPanel;