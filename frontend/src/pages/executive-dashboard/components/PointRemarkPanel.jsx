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
import AddCommentRoundedIcon from "@mui/icons-material/AddCommentRounded";
import ChatBubbleRoundedIcon from "@mui/icons-material/ChatBubbleRounded";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import CheckCircleOutlineRoundedIcon from "@mui/icons-material/CheckCircleOutlineRounded";
import CloseIcon from "@mui/icons-material/Close";
import { toast } from "react-toastify";
import {
  getPoRemarks,
  submitPoRemark,
  deletePoRemark,
  togglePointChecked,
} from "../../../api/api-functions";

const SYSTEM_RESULT_OPTIONS = [
  "Verified",
  "Not Verified",
  "Not Applicable",
];

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
  const [buyerResult, setBuyerResult] = useState("");

  // Keep buyerResult in sync with the "Is PO corrected?" toggle:
  //  - "informative" (No) -> pre-fill with the system's own result, since
  //    that's genuinely the intended default for a non-disputing remark.
  //  - "wrong" (Yes, PO corrected) -> force back to BLANK. Previously this
  //    silently carried over the system's result, so the dropdown looked
  //    pre-answered even though the buyer hadn't chosen anything yet -
  //    confusing, since the whole point of this mode is to let the buyer
  //    pick something DIFFERENT from the system. Never pre-select a value
  //    here; make the buyer choose explicitly every time.
  useEffect(() => {
    if (isSystemResultWrong === "informative") {
      setBuyerResult(systemResult || "");
    } else {
      setBuyerResult("");
    }
  }, [isSystemResultWrong, systemResult]);

  useEffect(() => {
    setRemarks(initialRemarks);
  }, [initialRemarks]);

  useEffect(() => {
    setLocked(lockedProp);
  }, [lockedProp]);

  useEffect(() => {
    setChecked(initialChecked);
  }, [initialChecked]);

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
      const payload = auditResultId
        ? { auditResultId, pointNo }
        : { poNumber, poLineItem, pointNo };
      const res = await getPoRemarks(payload);
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
  }, [open, auditResultId, poNumber, poLineItem, pointNo]);

  useEffect(() => {
    if (!open) return;
    if (!ownRemark) {
      setDraft("");
      setIsSystemResultWrong("informative");
      setBuyerResult(systemResult || "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, remarks]);

  const handleSubmit = async () => {
    if (!draft.trim() || ownRemark) return;
    setSubmitting(true);
    try {
      const base = auditResultId
        ? { auditResultId, pointNo }
        : { poNumber, poLineItem, pointNo };
      const res = await submitPoRemark({
        ...base,
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
      await deletePoRemark(id);
      toast.success("Remark deleted");
      await load();
    } catch (error) {
      toast.error(error?.response?.data?.message || error?.message || "Failed to delete remark");
    }
  };

  const handleToggleChecked = async () => {
    setCheckBusy(true);
    try {
      const base = auditResultId
        ? { auditResultId, pointNo }
        : { poNumber, poLineItem, pointNo };
      const res = await togglePointChecked({ ...base, checked: !checked });
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

  const count = remarks.length;
  const latest = remarks[0];

  let chipLabel;
  let chipColor = "default";
  let chipIcon = <ChatBubbleRoundedIcon fontSize="small" />;
  let chipVariant = "outlined";

  if (count > 0) {
    // A point WITH a remark is "View Remarks" regardless of section lock
    // state — viewing is always allowed. Locking only ever blocks adding
    // a NEW remark, never viewing existing ones.
    chipLabel = "View Remarks";
    chipColor = ownRemark ? "primary" : "info";
    chipVariant = "filled";
  } else if (canSubmit && locked) {
    // IMPORTANT: `locked` here is the SECTION's (whole line item's /
    // whole PO header's) closure state, not this point's own state — a
    // point can have zero remarks and still be perfectly fine, because it
    // was never mandatory (system already said Verified/N-A/Manual
    // Review). Do NOT label this "Locked" - that reads as if THIS POINT
    // was closed, which is never true; only a section closes. Show a
    // quiet, non-alarming "No Remark" instead, with no lock icon.
    chipLabel = "No Remark";
    chipColor = "default";
    chipVariant = "outlined";
    chipIcon = <ChatBubbleRoundedIcon fontSize="small" />;
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
        <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap">
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

          {canSubmit && count === 0 && !locked && (
            <Tooltip title={checked ? "Marked as Checked — click to undo" : "Mark this point as reviewed (no remark needed)"}>
              <span>
                <IconButton
                  size="small"
                  onClick={handleToggleChecked}
                  disabled={checkBusy}
                  sx={{ color: checked ? "#16a34a" : "text.disabled" }}
                >
                  {checkBusy ? (
                    <CircularProgress size={16} />
                  ) : checked ? (
                    <CheckCircleRoundedIcon fontSize="small" />
                  ) : (
                    <CheckCircleOutlineRoundedIcon fontSize="small" />
                  )}
                </IconButton>
              </span>
            </Tooltip>
          )}
          {checked && count === 0 && (
            <Chip size="small" label="Checked" color="success" sx={{ fontWeight: 700, height: 22 }} />
          )}
        </Stack>

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
              {latest.buyerResult && (
                <Box component="span" sx={{ display: "block", color: "text.secondary" }}>
                  Buyer's Result: {latest.buyerResult}
                  {latest.isSystemResultWrong ? " (PO Corrected)" : " (System Altercation)"}
                </Box>
              )}
            </Typography>
          </Tooltip>
        )}
      </Stack>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
        <DialogTitle sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", bgcolor: "grey.50", borderBottom: "1px solid", borderColor: "divider" }}>
          <Box>
            <Typography variant="h6" fontWeight={700}>
              Point {pointNo}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {count > 0
                ? `${count} remark${count === 1 ? "" : "s"} on this point`
                : "No remarks on this point yet"}
            </Typography>
          </Box>
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
                <Alert
                  icon={<LockRoundedIcon fontSize="small" />}
                  severity="info"
                  sx={{ fontWeight: 600 }}
                >
                  The section this point belongs to has been closed.
                  {count === 0
                    ? " No remark was recorded for this specific point — that's expected if it never needed one."
                    : " You can still view the remark(s) below, but no new ones can be added."}
                </Alert>
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
                        label={r.isSystemResultWrong ? "PO Corrected" : "System Altercation"}
                        color={r.isSystemResultWrong ? "error" : "default"}
                        variant={r.isSystemResultWrong ? "filled" : "outlined"}
                        sx={{ height: 24, fontSize: "0.7rem", fontWeight: 600 }}
                      />
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
                  Is PO corrected?
                </FormLabel>
                <RadioGroup
                  row
                  value={isSystemResultWrong}
                  onChange={(e) => setIsSystemResultWrong(e.target.value)}
                >
                  <FormControlLabel value="wrong" control={<Radio size="small" />} label="Yes — PO corrected" />
                  <FormControlLabel value="informative" control={<Radio size="small" />} label="No — informative only" />
                </RadioGroup>
              </FormControl>

              <TextField
                select
                size="small"
                fullWidth
                label="Buyer's Result (what should it be?)"
                value={buyerResult}
                onChange={(e) => setBuyerResult(e.target.value)}
                disabled={isSystemResultWrong === "informative"}
                helperText={
                  isSystemResultWrong === "informative"
                    ? "Buyer's result is not needed for informative remarks. It will use the system's result."
                    : "Select what the result should actually be — nothing is pre-selected."
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

export default PointRemarkPanel;