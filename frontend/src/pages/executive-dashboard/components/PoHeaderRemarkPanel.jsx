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
  Radio,
  RadioGroup,
  FormControlLabel,
  FormControl,
  FormLabel,
  MenuItem,
  Divider,
} from "@mui/material";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import SendRoundedIcon from "@mui/icons-material/SendRounded";
import LockRoundedIcon from "@mui/icons-material/LockRounded";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import CheckCircleOutlineRoundedIcon from "@mui/icons-material/CheckCircleOutlineRounded";
import CloseIcon from "@mui/icons-material/Close";
import { toast } from "react-toastify";
import {
  getPoHeaderRemarks,
  submitPoHeaderRemark,
  deletePoHeaderRemark,
  toggleHeaderPointChecked,
} from "../../../api/api-functions";

const SYSTEM_RESULT_OPTIONS = [
  "Verified",
  "Not Verified",
  "Not Applicable",
];

const PoHeaderRemarkPanel = ({
  poNumber,
  pointNo,
  currentUserId,
  isBuyer,
  isAdmin,
  isProcurementManager,
  locked: lockedProp = false,
  initialRemarks = [],
  initialChecked = false,
  systemResult = "",
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
  const [checked, setChecked] = useState(initialChecked);
  const [checkBusy, setCheckBusy] = useState(false);
  const [isSystemResultWrong, setIsSystemResultWrong] = useState("informative");
  const [buyerResult, setBuyerResult] = useState(systemResult || "");

  // Reset buyerResult to systemResult when switching to "informative"
  useEffect(() => {
    if (isSystemResultWrong === "informative") {
      setBuyerResult(systemResult || "");
    }
  }, [isSystemResultWrong, systemResult]);

  useEffect(() => {
    setRemarks(initialRemarks);
  }, [initialRemarks]);

  const ownRemark = remarks.find(
    (r) => currentUserId != null && String(r.submittedBy) === String(currentUserId)
  );

  const notifyParent = (nextRemarks, nextLocked, nextChecked) => {
    onRemarksChanged?.({
      pointNo,
      remarksCount: nextRemarks.length,
      checked: nextChecked,
      remarksLocked: nextLocked,
    });
  };

  const applyRemarks = (next, nextLocked, nextChecked) => {
    setRemarks(next);
    if (nextLocked !== undefined) setLocked(nextLocked);
    if (nextChecked !== undefined) setChecked(nextChecked);
    notifyParent(
      next,
      nextLocked !== undefined ? nextLocked : locked,
      nextChecked !== undefined ? nextChecked : checked,
    );
  };

  const load = async () => {
    setLoading(true);
    try {
      const res = await getPoHeaderRemarks({ po_number: poNumber, pointNo });
      const stillChecked = (res?.checkedPoints || []).includes(Number(pointNo));
      applyRemarks(res?.remarks || [], Boolean(res?.remarksLocked), stillChecked);
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
      setIsSystemResultWrong("informative");
      setBuyerResult(systemResult || "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, poNumber, pointNo]);

  useEffect(() => {
    if (!open) return;
    if (!ownRemark) {
      setDraft("");
      setIsSystemResultWrong("informative");
      setBuyerResult(systemResult || "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, remarks]);

  useEffect(() => {
    setLocked(lockedProp);
  }, [lockedProp]);

  useEffect(() => {
    setChecked(initialChecked);
  }, [initialChecked]);

  const handleSubmit = async () => {
    if (!draft.trim() || ownRemark) return;
    setSubmitting(true);
    try {
      const res = await submitPoHeaderRemark({
        po_number: poNumber,
        pointNo,
        remark: draft.trim(),
        isSystemResultWrong: isSystemResultWrong === "wrong",
        buyerResult: buyerResult || systemResult,
      });
      toast.success(res?.tally?.autoClosed ? res.message : "Remark added");
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

  const handleToggleChecked = async () => {
    setCheckBusy(true);
    try {
      const res = await toggleHeaderPointChecked({ po_number: poNumber, pointNo, checked: !checked });
      toast.success(res?.tally?.autoClosed ? res.message : (res?.message || "Updated"));
      const stillChecked = (res?.checkedPoints || []).includes(Number(pointNo));
      const nextLocked = res?.tally?.autoClosed ? true : locked;
      setChecked(stillChecked);
      if (res?.tally?.autoClosed) setLocked(true);
      notifyParent(remarks, nextLocked, stillChecked);
    } catch (error) {
      toast.error(error?.response?.data?.message || error?.message || "Failed to update");
    } finally {
      setCheckBusy(false);
    }
  };

  return (
    <>
      <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap">
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
          sx={{ textTransform: "none", fontWeight: 700, borderRadius: "20px", minWidth: "120px" }}
        >
          {remarks.length > 0
            ? "View Remarks"
            : canSubmit
            ? locked
              ? "Locked"
              : "Add Remark"
            : "No Remarks"}
        </Button>

        {canSubmit && remarks.length === 0 && !locked && (
          <Tooltip title={checked ? "Marked as Checked — click to undo" : "Mark this point as reviewed (no remark needed)"}>
            <span>
              <IconButton size="small" onClick={handleToggleChecked} disabled={checkBusy} sx={{ color: checked ? "#16a34a" : "text.disabled" }}>
                {checkBusy ? <CircularProgress size={16} /> : checked ? <CheckCircleRoundedIcon fontSize="small" /> : <CheckCircleOutlineRoundedIcon fontSize="small" />}
              </IconButton>
            </span>
          </Tooltip>
        )}
        {checked && remarks.length === 0 && (
          <Chip size="small" label="Checked" color="success" sx={{ fontWeight: 700, height: 22 }} />
        )}
      </Stack>

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
              Could not identify the current user — try logging out and back in.
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

              {!locked && systemResult && (
                <Alert severity="info" sx={{ py: 0.5 }}>
                  System's current result for this point: <strong>{systemResult}</strong>
                </Alert>
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
                      <Typography variant="body2" sx={{ wordBreak: "break-word", pr: 2, fontWeight: 700, color: "text.primary" }}>
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
                      {r.buyerResult && (
                        <Chip
                          size="small"
                          label={`Buyer's Result: ${r.buyerResult}`}
                          sx={{ height: 24, fontSize: "0.7rem", bgcolor: "#eef2ff", color: "#3730a3", fontWeight: 600 }}
                        />
                      )}
                      <Chip
                        size="small"
                        label={r.isSystemResultWrong ? "System result flagged wrong" : "Informative only"}
                        color={r.isSystemResultWrong ? "error" : "default"}
                        variant={r.isSystemResultWrong ? "filled" : "outlined"}
                        sx={{ height: 24, fontSize: "0.7rem", fontWeight: 600 }}
                      />
                    </Box>
                  </Box>
                );
              })}
            </Stack>
          )}

          {canSubmit && !locked && !ownRemark && (
            <Stack spacing={2}>
              <TextField
                size="medium"
                fullWidth
                multiline
                maxRows={3}
                placeholder="Type your remark here..."
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
              />

              <Divider />

              <FormControl>
                <FormLabel sx={{ fontWeight: 700, fontSize: "0.85rem", mb: 0.5 }}>
                  Is the system's result wrong, or is this just informative?
                </FormLabel>
                <RadioGroup row value={isSystemResultWrong} onChange={(e) => setIsSystemResultWrong(e.target.value)}>
                  <FormControlLabel value="wrong" control={<Radio size="small" />} label="System's result is wrong" />
                  <FormControlLabel value="informative" control={<Radio size="small" />} label="Just informative" />
                </RadioGroup>
              </FormControl>

              <TextField
                select
                size="small"
                fullWidth
                label="Buyer's Result (what should it be?)"
                value={buyerResult || systemResult || ""}
                onChange={(e) => setBuyerResult(e.target.value)}
                disabled={isSystemResultWrong === "informative"}
                helperText={
                  isSystemResultWrong === "informative"
                    ? "Buyer's result is not needed for informative remarks. It will use the system's result."
                    : "Defaults to the system's result — change it if you disagree."
                }
              >
                {SYSTEM_RESULT_OPTIONS.map((opt) => (
                  <MenuItem key={opt} value={opt}>
                    {opt}
                  </MenuItem>
                ))}
              </TextField>

              <Button
                variant="contained"
                color="success"
                disabled={submitting || !draft.trim()}
                onClick={handleSubmit}
                sx={{ height: "40px", px: 3, boxShadow: "none", alignSelf: "flex-start" }}
                startIcon={submitting ? <CircularProgress size={16} color="inherit" /> : <SendRoundedIcon />}
              >
                Add Remark
              </Button>
            </Stack>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default PoHeaderRemarkPanel;