import { useEffect, useRef, useState } from "react";
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
import PoCorrectedField from "./PoCorrectedField";

const SYSTEM_RESULT_OPTIONS = ["Verified", "Not Verified", "Not Applicable"];

// Stable empty array (see PointRemarkPanel for why).
const NO_REMARKS = [];
const idsKey = (arr) => (arr || []).map((r) => r.id).join(",");

const safeStorageGet = (key) => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

const safeStorageSet = (key, value) => {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore storage failures; the fetched remarks remain the source of truth.
  }
};

const safeStorageRemove = (key) => {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore storage failures; the fetched remarks remain the source of truth.
  }
};

const PoHeaderRemarkPanel = ({
  poNumber,
  sourceFileTs,
  pointNo,
  currentUserId,
  isBuyer,
  isAdmin,
  isProcurementManager,
  locked: lockedProp = false,
  initialRemarks = NO_REMARKS,
  // NEW: parent already knows a remark exists -> button says "View Remarks"
  // immediately, without waiting for the dialog to be opened.
  initialHasRemark = false,
  initialChecked = false,
  systemResult = "",
  onRemarksChanged,
  compact = false,
}) => {
  const canSubmit = isBuyer;
  const remarkPresenceKey = `po-header-remark:${poNumber}:${sourceFileTs || "latest"}:${pointNo}`;

  const [remarks, setRemarks] = useState(initialRemarks);
  const [hasKnownRemark, setHasKnownRemark] = useState(
    initialRemarks.length > 0 ||
      initialHasRemark ||
      safeStorageGet(remarkPresenceKey) === "1",
  );
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);
  const [locked, setLocked] = useState(lockedProp);
  const [checked, setChecked] = useState(initialChecked);
  const [checkBusy, setCheckBusy] = useState(false);
  const [poCorrectedAnswer, setPoCorrectedAnswer] = useState("");
  const [buyerResult, setBuyerResult] = useState("");
  const [showPoCorrectedErrors, setShowPoCorrectedErrors] = useState(false);

  const lastNotifiedRef = useRef(null);

  // Sync from props only when remark ids actually change; never wipe local
  // state with an empty/new-identity array.
  const initialKey = idsKey(initialRemarks);
  useEffect(() => {
    if (initialRemarks.length > 0) {
      setRemarks(initialRemarks);
      setHasKnownRemark(true);
      safeStorageSet(remarkPresenceKey, "1");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialKey, remarkPresenceKey]);

  useEffect(() => {
    if (initialHasRemark) {
      setHasKnownRemark(true);
      safeStorageSet(remarkPresenceKey, "1");
    }
  }, [initialHasRemark, remarkPresenceKey]);

  useEffect(() => {
    setLocked(lockedProp);
  }, [lockedProp]);

  useEffect(() => {
    setChecked(initialChecked);
  }, [initialChecked]);

  const ownRemark = remarks.find(
    (r) =>
      currentUserId != null && String(r.submittedBy) === String(currentUserId),
  );

  const notifyParent = (nextRemarks, nextLocked, nextChecked) => {
    const sig = `${nextRemarks.length}|${nextChecked}|${nextLocked}`;
    if (lastNotifiedRef.current === sig) return;
    lastNotifiedRef.current = sig;
    onRemarksChanged?.({
      pointNo,
      remarksCount: nextRemarks.length,
      checked: nextChecked,
      remarksLocked: nextLocked,
      latestRemark: nextRemarks[0]?.remark || "",
    });
  };

  const persistPresence = (list) => {
    if (list.length > 0) safeStorageSet(remarkPresenceKey, "1");
    else safeStorageRemove(remarkPresenceKey);
  };

  const applyRemarks = (next, nextLocked, nextChecked) => {
    setRemarks(next);
    setHasKnownRemark(next.length > 0);
    persistPresence(next);
    if (nextLocked !== undefined) setLocked(nextLocked);
    if (nextChecked !== undefined) setChecked(nextChecked);
    notifyParent(
      next,
      nextLocked !== undefined ? nextLocked : locked,
      nextChecked !== undefined ? nextChecked : checked,
    );
  };

  const load = async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const res = await getPoHeaderRemarks({ po_number: poNumber, source_file_ts: sourceFileTs, pointNo });
      const stillChecked = (res?.checkedPoints || []).includes(Number(pointNo));
      applyRemarks(
        res?.remarks || [],
        Boolean(res?.remarksLocked),
        stillChecked,
      );
    } catch (error) {
      if (!silent) {
        toast.error(
          error?.response?.data?.message ||
            error?.message ||
            "Failed to load remarks",
        );
      }
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      load({ silent: remarks.length > 0 });
    } else {
      setDraft("");
      setPoCorrectedAnswer("");
      setBuyerResult("");
      setShowPoCorrectedErrors(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, poNumber, pointNo]);

  useEffect(() => {
    if (!open) return;
    if (!ownRemark) {
      setDraft("");
      setPoCorrectedAnswer("");
      setBuyerResult("");
      setShowPoCorrectedErrors(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, remarks]);

  const handleSubmit = async () => {
    if (!draft.trim() || ownRemark) return;
    if (!poCorrectedAnswer || (poCorrectedAnswer === "no" && !buyerResult)) {
      setShowPoCorrectedErrors(true);
      toast.info('Answer "Is PO corrected?" before submitting.');
      return;
    }

    const text = draft.trim();
    const payload = {
      po_number: poNumber,
      source_file_ts: sourceFileTs,
      pointNo,
      remark: text,
      isSystemResultWrong: poCorrectedAnswer === "yes",
    };
    if (poCorrectedAnswer === "no") payload.buyerResult = buyerResult;

    // OPTIMISTIC: button flips to "View Remarks" immediately.
    const prevRemarks = remarks;
    const optimistic = {
      id: `tmp-${Date.now()}`,
      remark: text,
      submittedBy: currentUserId,
      isMine: true,
      submittedByName: "You",
      isSystemResultWrong: poCorrectedAnswer === "yes",
      buyerResult: poCorrectedAnswer === "no" ? buyerResult : undefined,
      submittedAt: new Date().toISOString(),
    };
    setRemarks([optimistic, ...prevRemarks]);
    setHasKnownRemark(true);
    safeStorageSet(remarkPresenceKey, "1");
    setSubmitting(true);

    try {
      const res = await submitPoHeaderRemark(payload);
      const next = res?.remark
        ? [res.remark, ...prevRemarks.filter((i) => i.id !== res.remark.id)]
        : [optimistic, ...prevRemarks];
      applyRemarks(
        next,
        res?.remarksLocked !== undefined ? Boolean(res.remarksLocked) : locked,
        checked,
      );
      toast.success(res?.tally?.autoClosed ? res.message : "Remark added");
      load({ silent: true });
    } catch (error) {
      // ROLLBACK
      setRemarks(prevRemarks);
      setHasKnownRemark(prevRemarks.length > 0);
      persistPresence(prevRemarks);
      toast.error(
        error?.response?.data?.message ||
          error?.message ||
          "Failed to save remark",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    const prevRemarks = remarks;
    const next = prevRemarks.filter((r) => r.id !== id);
    setRemarks(next);
    setHasKnownRemark(next.length > 0);
    persistPresence(next);
    try {
      await deletePoHeaderRemark(id, sourceFileTs);
      toast.success("Remark deleted");
      applyRemarks(next);
      load({ silent: true });
    } catch (error) {
      setRemarks(prevRemarks);
      setHasKnownRemark(prevRemarks.length > 0);
      persistPresence(prevRemarks);
      toast.error(
        error?.response?.data?.message ||
          error?.message ||
          "Failed to delete remark",
      );
    }
  };

  const handleToggleChecked = async () => {
    const wasChecked = checked;
    setChecked(!wasChecked); // OPTIMISTIC
    setCheckBusy(true);
    try {
      const res = await toggleHeaderPointChecked({
        po_number: poNumber,
        source_file_ts: sourceFileTs,
        pointNo,
        checked: !wasChecked,
      });
      toast.success(
        res?.tally?.autoClosed ? res.message : res?.message || "Updated",
      );
      const stillChecked = (res?.checkedPoints || []).includes(Number(pointNo));
      const nextLocked = res?.tally?.autoClosed ? true : locked;
      setChecked(stillChecked);
      if (res?.tally?.autoClosed) setLocked(true);
      notifyParent(remarks, nextLocked, stillChecked);
    } catch (error) {
      setChecked(wasChecked);
      toast.error(
        error?.response?.data?.message || error?.message || "Failed to update",
      );
    } finally {
      setCheckBusy(false);
    }
  };

  return (
    <>
      <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap">
        <Button
          size="small"
          variant={hasKnownRemark ? "contained" : "outlined"}
          color={
            hasKnownRemark
              ? ownRemark
                ? "primary"
                : "info"
              : canSubmit && locked
                ? "inherit"
                : canSubmit
                  ? "success"
                  : "inherit"
          }
          onClick={() => setOpen(true)}
          sx={{
            textTransform: "none",
            fontWeight: 700,
            borderRadius: "20px",
            minWidth: "120px",
          }}
        >
          {hasKnownRemark
            ? "View Remarks"
            : canSubmit
              ? locked
                ? "No Remark"
                : "Add Remark"
              : "No Remarks"}
        </Button>

        {canSubmit && !hasKnownRemark && !locked && (
          <Tooltip
            title={
              checked
                ? "Marked as Checked — click to undo"
                : "Mark this point as reviewed (no remark needed)"
            }
          >
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
        {checked && !hasKnownRemark && (
          <Chip
            size="small"
            label="Checked"
            color="success"
            sx={{ fontWeight: 700, height: 22 }}
          />
        )}
      </Stack>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
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
            <Typography variant="h6" fontWeight={700}>
              Header Point {pointNo} — PO {poNumber}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {remarks.length > 0
                ? `${remarks.length} remark${remarks.length === 1 ? "" : "s"} on this point`
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
            <Stack
              spacing={2}
              sx={{ mb: canSubmit && !locked && !ownRemark ? 3 : 0 }}
            >
              {locked && (
                <Alert
                  icon={<LockRoundedIcon fontSize="small" />}
                  severity="info"
                  sx={{ fontWeight: 600 }}
                >
                  This PO's header checks are closed.
                  {remarks.length === 0
                    ? " No remark was recorded for this specific point — that's expected if it never needed one."
                    : " You can still view the remark(s) below, but no new ones can be added."}
                </Alert>
              )}

              {!locked && systemResult && (
                <Alert severity="info" sx={{ py: 0.5 }}>
                  System's current result for this point:{" "}
                  <strong>{systemResult}</strong>
                </Alert>
              )}

              {remarks.length === 0 && (
                <Typography
                  variant="body2"
                  color="text.secondary"
                  textAlign="center"
                  py={2}
                >
                  No remarks have been added yet.
                </Typography>
              )}
              {remarks.map((r) => {
                const isMine =
                  r.isMine ??
                  (currentUserId != null &&
                    String(r.submittedBy) === String(currentUserId));
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
                    <Box
                      sx={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                      }}
                    >
                      <Typography
                        variant="body2"
                        sx={{
                          wordBreak: "break-word",
                          pr: 2,
                          fontWeight: 700,
                          color: "text.primary",
                        }}
                      >
                        {r.remark}
                      </Typography>
                      {isMine && canSubmit && !locked && (
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => handleDelete(r.id)}
                          disabled={String(r.id).startsWith("tmp-")}
                          sx={{ mt: -0.5, mr: -0.5 }}
                        >
                          <DeleteOutlineRoundedIcon fontSize="small" />
                        </IconButton>
                      )}
                    </Box>
                    <Box
                      sx={{
                        mt: 1.5,
                        display: "flex",
                        gap: 1,
                        flexWrap: "wrap",
                      }}
                    >
                      <Chip
                        size="small"
                        color={isMine ? "primary" : "default"}
                        variant="outlined"
                        label={
                          r.submittedByName ||
                          `${r.submitter?.firstName || ""} ${r.submitter?.lastName || r.submitter?.username || ""}`.trim()
                        }
                        sx={{
                          height: 24,
                          fontSize: "0.75rem",
                          fontWeight: 600,
                          bgcolor: "white",
                        }}
                      />
                      {isMine && (
                        <Chip
                          size="small"
                          label="Your remark"
                          sx={{ height: 24, fontSize: "0.7rem" }}
                        />
                      )}
                      {r.buyerResult && r.buyerResult !== systemResult && (
                        <Chip
                          size="small"
                          label={`Buyer's Result: ${r.buyerResult}`}
                          sx={{
                            height: 24,
                            fontSize: "0.7rem",
                            bgcolor: "#eef2ff",
                            color: "#3730a3",
                            fontWeight: 600,
                          }}
                        />
                      )}
                      <Chip
                        size="small"
                        label={
                          r.isSystemResultWrong
                            ? "PO Corrected"
                            : "System Altercation"
                        }
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

              <PoCorrectedField
                value={poCorrectedAnswer}
                onChange={setPoCorrectedAnswer}
                systemResult={systemResult}
                buyerResult={buyerResult}
                onBuyerResultChange={setBuyerResult}
                disabled={submitting}
                allowedResults={SYSTEM_RESULT_OPTIONS}
                showErrors={showPoCorrectedErrors}
              />

              <Button
                variant="contained"
                color="success"
                disabled={
                  submitting ||
                  !draft.trim() ||
                  !poCorrectedAnswer ||
                  (poCorrectedAnswer === "no" && !buyerResult)
                }
                onClick={handleSubmit}
                sx={{
                  height: "40px",
                  px: 3,
                  boxShadow: "none",
                  alignSelf: "flex-start",
                }}
                startIcon={
                  submitting ? (
                    <CircularProgress size={16} color="inherit" />
                  ) : (
                    <SendRoundedIcon />
                  )
                }
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
