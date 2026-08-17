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
  updatePoHeaderRemark,
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
  compact = false,
}) => {
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
      const res = await getPoHeaderRemarks({ po_number: poNumber, pointNo });
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
      setDraft("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, poNumber, pointNo]);

  useEffect(() => {
    if (!open) return;
    setDraft(ownRemark ? ownRemark.remark : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, remarks]);

  useEffect(() => {
    setLocked(lockedProp);
  }, [lockedProp]);

  const handleSubmit = async () => {
    if (!draft.trim()) return;
    setSubmitting(true);
    try {
      if (ownRemark) {
        await updatePoHeaderRemark({ id: ownRemark.id, remark: draft.trim() });
        toast.success("Remark updated");
      } else {
        await submitPoHeaderRemark({
          po_number: poNumber,
          pointNo,
          remark: draft.trim(),
        });
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
        variant="outlined"
        onClick={() => setOpen(true)}
        startIcon={locked && canSubmit ? <LockRoundedIcon fontSize="small" /> : null}
        sx={{
          textTransform: "none",
          fontWeight: 600,
          borderRadius: "20px",
          minWidth: "120px",
          borderColor: "#c7d2fe",
          color: "#4338ca",
        }}
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
            <Stack spacing={2} sx={{ mb: canSubmit && !locked ? 3 : 0 }}>
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

export default PoHeaderRemarkPanel;