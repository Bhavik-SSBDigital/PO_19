import { useCallback, useEffect, useState } from "react";
import {
  Box,
  Typography,
  Chip,
  Divider,
  CircularProgress,
  Button,
  alpha,
  TextField,
  Stack,
  IconButton,
} from "@mui/material";

import LockRoundedIcon from "@mui/icons-material/LockRounded";
import LockOpenRoundedIcon from "@mui/icons-material/LockOpenRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import DeleteRoundedIcon from "@mui/icons-material/DeleteRounded";

import { toast } from "react-toastify";
import { post } from "utils/axiosApi";
import PoCorrectedField from "../../executive-dashboard/components/PoCorrectedField";

// Changed `bg` to standard MUI `bgcolor` to ensure it applies consistently
const CORRECTION_STYLES = {
  altercation: { bgcolor: "grey.200", color: "#334155" },
  corrected: { bgcolor: alpha("#dc2626", 0.15), color: "#dc2626" },
};

const RESULT_STYLES = {
  Verified: { bgcolor: alpha("#059669", 0.15), color: "#059669" },
  "Not Verified": { bgcolor: alpha("#dc2626", 0.15), color: "#dc2626" },
};

const RC_RESULT_OPTIONS = ["Verified", "Not Verified"];

const submitterName = (submitter) => {
  if (!submitter) return "Unknown";

  return (
    [submitter.firstName, submitter.lastName]
      .filter(Boolean)
      .join(" ") ||
    submitter.username ||
    "Unknown"
  );
};

const formatDateTime = (value) => {
  if (!value) return "—";

  const d = new Date(value);

  if (isNaN(d.getTime())) return "—";

  return d.toLocaleString("en-GB");
};

const RcRemarkPanel = ({
  rcId,
  systemResult = "",
  roleFlags,
  currentUserId,
  onChanged,
  compact = false,
}) => {
  const {
    isBuyer,
    isAdmin,
    isProcurementManager,
  } = roleFlags || {};

  const canManageLock =
    isBuyer ||
    isAdmin ||
    isProcurementManager;

  const [loading, setLoading] = useState(true);
  const [remarks, setRemarks] = useState([]);
  const [remarksLocked, setRemarksLocked] =
    useState(false);
  const [canWrite, setCanWrite] = useState(false);
  const [lockBusy, setLockBusy] = useState(false);

  const [formOpen, setFormOpen] =
    useState(compact);

  const [editingId, setEditingId] =
    useState(null);

  const [remarkText, setRemarkText] =
    useState("");

  const [poCorrectedAnswer, setPoCorrectedAnswer] =
    useState("");

  const [buyerResult, setBuyerResult] =
    useState("");

  const [showPoCorrectedErrors, setShowPoCorrectedErrors] =
    useState(false);

  const [submitting, setSubmitting] =
    useState(false);

  const load = useCallback(async () => {
    if (!rcId) return;

    setLoading(true);

    try {
      const res = await post("/rc-remarks", {
        rcOverlapResultId: rcId,
      });

      setRemarks(res?.remarks || []);
      setRemarksLocked(
        !!res?.remarksLocked
      );
      setCanWrite(!!res?.canWrite);
    } catch (err) {
      toast.error(
        err?.response?.data?.message ||
          err?.message ||
          "Failed to load RC remarks"
      );
    } finally {
      setLoading(false);
    }
  }, [rcId]);

  useEffect(() => {
    load();

    setFormOpen(compact);
    setEditingId(null);
    setRemarkText("");
    setPoCorrectedAnswer("");
    setBuyerResult("");
    setShowPoCorrectedErrors(false);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rcId, load]);

  const ownRemark = remarks.find(
    (remark) =>
      remark.submittedBy === currentUserId
  );

  const startAdd = () => {
    setEditingId(null);
    setRemarkText("");
    setPoCorrectedAnswer("");
    setBuyerResult("");
    setShowPoCorrectedErrors(false);
    setFormOpen(true);
  };

  const startEdit = (remark) => {
    setEditingId(remark.id);
    setRemarkText(remark.remark);
    setPoCorrectedAnswer(
      remark.isSystemResultWrong
        ? "yes"
        : "no"
    );
    setBuyerResult(
      !remark.isSystemResultWrong &&
        remark.buyerResult &&
        remark.buyerResult !== systemResult
        ? remark.buyerResult
        : ""
    );
    setShowPoCorrectedErrors(false);
    setFormOpen(true);
  };

  const cancelForm = () => {
    setFormOpen(compact);
    setEditingId(null);
    setRemarkText("");
    setPoCorrectedAnswer("");
    setBuyerResult("");
    setShowPoCorrectedErrors(false);
  };

  const submit = async () => {
    if (!remarkText.trim()) {
      toast.info(
        "Remark text is required"
      );
      return;
    }

    if (
      !poCorrectedAnswer ||
      (poCorrectedAnswer === "no" && !buyerResult)
    ) {
      setShowPoCorrectedErrors(true);
      toast.info(
        "Answer \"Is PO corrected?\" before submitting."
      );
      return;
    }

    setSubmitting(true);

    try {
      const correctionPayload = {
        isSystemResultWrong:
          poCorrectedAnswer === "yes",
        ...(poCorrectedAnswer === "no"
          ? { buyerResult }
          : {}),
      };

      if (editingId) {
        const res = await post("/rc-remarks/update", {
          id: editingId,
          remark: remarkText.trim(),
          ...correctionPayload,
        });

        if (res?.remark) {
          setRemarks((current) =>
            current.map((item) =>
              item.id === res.remark.id
                ? res.remark
                : item
            )
          );
        }

        toast.success(
          "Remark updated"
        );
      } else {
        const res = await post(
          "/rc-remarks/submit",
          {
            rcOverlapResultId: rcId,
            remark: remarkText.trim(),
            ...correctionPayload,
          }
        );

        if (res?.remark) {
          setRemarks((current) => [
            res.remark,
            ...current.filter(
              (item) => item.id !== res.remark.id
            ),
          ]);
          setRemarksLocked(
            res?.remarksLocked !== undefined
              ? !!res.remarksLocked
              : remarksLocked
          );
        }

        toast.success(
          res?.autoClosed
            ? "Remark submitted — RC closed automatically"
            : "Remark submitted"
        );
      }

      setEditingId(null);
      setRemarkText("");
      setPoCorrectedAnswer("");
      setBuyerResult("");
      setShowPoCorrectedErrors(false);
      setFormOpen(compact);

      await load();

      onChanged?.();
    } catch (err) {
      toast.error(
        err?.response?.data?.message ||
          err?.message ||
          "Failed to save remark"
      );
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (id) => {
    try {
      await post("/rc-remarks/delete", {
        id,
      });

      toast.success(
        "Remark deleted"
      );

      await load();

      onChanged?.();
    } catch (err) {
      toast.error(
        err?.response?.data?.message ||
          err?.message ||
          "Failed to delete remark"
      );
    }
  };

  const toggleLock = async () => {
    setLockBusy(true);

    try {
      await post(
        "/rc-remarks/toggle-checked",
        {
          rcOverlapResultId: rcId,
          checked: !remarksLocked,
        }
      );

      toast.success(
        remarksLocked
          ? "RC reopened"
          : "RC marked as checked"
      );

      await load();

      onChanged?.();
    } catch (err) {
      toast.error(
        err?.response?.data?.message ||
          err?.message ||
          "Failed to update checked status"
      );
    } finally {
      setLockBusy(false);
    }
  };

  if (loading) {
    return (
      <Box
        sx={{
          width: "100%",
          minWidth: 0,
          display: "flex",
          justifyContent: "center",
          py: compact ? 2 : 3,
        }}
      >
        <CircularProgress size={20} />
      </Box>
    );
  }

  return (
    <Box
      sx={{
        mt: compact ? 0 : 3,
        width: "100%",
        maxWidth: "100%",
        minWidth: 0,
        boxSizing: "border-box",
        overflow: "hidden",
        "& *": {
          boxSizing: "border-box",
          maxWidth: "100%",
        },
      }}
    >
      {!compact && (
        <Divider sx={{ mb: 2 }} />
      )}

      {/* HEADER */}
      <Box
        sx={{
          display: "flex",
          justifyContent:
            "space-between",
          alignItems: "center",
          mb: 1.5,
          flexWrap: "wrap",
          gap: 1,
          width: "100%",
          minWidth: 0,
        }}
      >
        {!compact && (
          <Typography
            variant="subtitle2"
            sx={{
              fontWeight: 700,
            }}
          >
            Buyer Remarks
          </Typography>
        )}

        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            minWidth: 0,
          }}
        >
          <Chip
            size="small"
            icon={
              remarksLocked ? (
                <LockRoundedIcon fontSize="small" />
              ) : (
                <LockOpenRoundedIcon fontSize="small" />
              )
            }
            label={
              remarksLocked
                ? "Closed"
                : "Open"
            }
            sx={{
              fontWeight: 700,
              bgcolor: remarksLocked
                ? alpha(
                    "#059669",
                    0.1
                  )
                : alpha(
                    "#d97706",
                    0.1
                  ),
              color: remarksLocked
                ? "#059669"
                : "#d97706",
            }}
          />

          {canManageLock &&
            !compact && (
              <Button
                size="small"
                variant="outlined"
                disabled={lockBusy}
                onClick={toggleLock}
                startIcon={
                  lockBusy ? (
                    <CircularProgress
                      size={14}
                    />
                  ) : remarksLocked ? (
                    <LockOpenRoundedIcon fontSize="small" />
                  ) : (
                    <LockRoundedIcon fontSize="small" />
                  )
                }
              >
                {remarksLocked
                  ? "Reopen"
                  : "Mark as Checked"}
              </Button>
            )}
        </Box>
      </Box>

      {/* EXISTING REMARKS */}
      {remarks.length === 0 &&
        !formOpen && (
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ mb: 1.5 }}
          >
            No remarks yet on this RC.
          </Typography>
        )}

      {remarks.length > 0 && (
        <Stack
          spacing={1.25}
          sx={{
            mb: 1.5,
            width: "100%",
            minWidth: 0,
          }}
        >
          {remarks.map((remark) => (
            <Box
              key={remark.id}
              sx={{
                p: 1.5,
                borderRadius: 2,
                border: "1px solid",
                borderColor:
                  "grey.100",
                bgcolor: "#f8fafc",
                width: "100%",
                minWidth: 0,
              }}
            >
              <Box
                sx={{
                  display: "flex",
                  justifyContent:
                    "space-between",
                  alignItems:
                    "flex-start",
                  gap: 1,
                  width: "100%",
                  minWidth: 0,
                }}
              >
                <Box
                  sx={{
                    minWidth: 0,
                    flex: 1,
                  }}
                >
                  <Typography
                    variant="body2"
                    sx={{
                      fontWeight: 700,
                      wordBreak:
                        "break-word",
                    }}
                  >
                    {submitterName(
                      remark.submitter
                    )}

                    <Typography
                      component="span"
                      variant="caption"
                      color="text.secondary"
                      sx={{ ml: 1 }}
                    >
                      {formatDateTime(
                        remark.submittedAt
                      )}
                    </Typography>
                  </Typography>

                  <Typography
                    variant="body2"
                    sx={{
                      mt: 0.5,
                      wordBreak:
                        "break-word",
                      overflowWrap:
                        "anywhere",
                    }}
                  >
                    {remark.remark}
                  </Typography>

                  <Box
                    sx={{
                      display: "flex",
                      gap: 0.75,
                      mt: 0.75,
                      flexWrap: "wrap",
                    }}
                  >
                    <Chip
                      size="small"
                      label={
                        remark.isSystemResultWrong
                          ? "PO Corrected"
                          : "System Altercation"
                      }
                      sx={{
                        height: 20,
                        fontSize:
                          "0.7rem",
                        fontWeight: 700,
                        ...(remark.isSystemResultWrong
                          ? CORRECTION_STYLES.corrected
                          : CORRECTION_STYLES.altercation),
                      }}
                    />

                    {remark.buyerResult && remark.buyerResult !== systemResult && (
                      <Chip
                        size="small"
                        label={`Buyer result: ${remark.buyerResult}`}
                        sx={{
                          height: 20,
                          fontSize:
                            "0.7rem",
                          fontWeight: 700,
                          maxWidth:
                            "100%",
                          ...(RESULT_STYLES[
                            remark
                              .buyerResult
                          ] || {
                            bgcolor:
                              "grey.200",
                            color:
                              "#334155",
                          }),
                        }}
                      />
                    )}
                  </Box>
                </Box>

                {!compact &&
                  isBuyer &&
                  remark.submittedBy ===
                    currentUserId &&
                  !remarksLocked && (
                    <Box
                      sx={{
                        display: "flex",
                        gap: 0.5,
                        flexShrink: 0,
                      }}
                    >
                      <IconButton
                        size="small"
                        onClick={() =>
                          startEdit(
                            remark
                          )
                        }
                      >
                        <EditRoundedIcon fontSize="small" />
                      </IconButton>

                      <IconButton
                        size="small"
                        onClick={() =>
                          remove(
                            remark.id
                          )
                        }
                      >
                        <DeleteRoundedIcon fontSize="small" />
                      </IconButton>
                    </Box>
                  )}
              </Box>
            </Box>
          ))}
        </Stack>
      )}

      {canWrite &&
        !remarksLocked &&
        !ownRemark &&
        !formOpen && (
          <Button
            size="small"
            variant="contained"
            onClick={startAdd}
            sx={{
              boxShadow: "none",
              textTransform: "none",
              fontWeight: 700,
            }}
          >
            Add Remark
          </Button>
        )}

      {/* CLOSED MESSAGE */}
      {remarksLocked && remarks.length === 0 && (
        <Typography
          variant="caption"
          color="text.secondary"
        >
          This RC has been checked/closed.
          Remarks are locked.
        </Typography>
      )}

      {formOpen &&
        canWrite &&
        !remarksLocked &&
        (!ownRemark || editingId) && (
          <Box
            sx={{
              mt: compact ? 0 : 1.5,
              p: compact ? 0 : 1.5,
              borderRadius: compact
                ? 0
                : 2,
              border: compact
                ? "none"
                : "1px solid",
              borderColor:
                "grey.200",
              width: "100%",
              maxWidth: "100%",
              minWidth: 0,
              overflow: "hidden",
            }}
          >
            {/* REMARK TEXT */}
            <TextField
              fullWidth
              multiline
              minRows={compact ? 3 : 2}
              placeholder="Enter your remark..."
              value={remarkText}
              onChange={(event) =>
                setRemarkText(
                  event.target.value
                )
              }
              autoFocus={compact}
              sx={{
                width: "100%",
                maxWidth: "100%",
                mb: 1.5,
                "& .MuiInputBase-root": {
                  width: "100%",
                  maxWidth: "100%",
                },
                "& textarea": {
                  width: "100%",
                  maxWidth: "100%",
                  overflowWrap: "anywhere",
                  wordBreak: "break-word",
                },
              }}
            />

            <Box sx={{ mb: 1.5 }}>
              <PoCorrectedField
                value={poCorrectedAnswer}
                onChange={setPoCorrectedAnswer}
                systemResult={systemResult}
                buyerResult={buyerResult}
                onBuyerResultChange={setBuyerResult}
                disabled={submitting}
                allowedResults={RC_RESULT_OPTIONS}
                showErrors={showPoCorrectedErrors}
              />
            </Box>

            {/* ACTIONS */}
            <Stack
              direction="row"
              spacing={1}
              sx={{
                width: "100%",
                minWidth: 0,
                position: "sticky",
                bottom: 0,
                bgcolor: "background.paper",
                pt: 1,
                pb: compact ? 0 : 0.5,
              }}
            >
              <Button
                size="small"
                variant="contained"
                disabled={
                  submitting ||
                  !remarkText.trim() ||
                  !poCorrectedAnswer ||
                  (poCorrectedAnswer === "no" && !buyerResult)
                }
                onClick={submit}
                sx={{
                  boxShadow: "none",
                  textTransform: "none",
                  fontWeight: 700,
                }}
              >
                {submitting ? (
                  <CircularProgress
                    size={16}
                    color="inherit"
                  />
                ) : editingId ? (
                  "Save"
                ) : (
                  "Submit"
                )}
              </Button>

              {(!compact ||
                editingId) && (
                <Button
                  size="small"
                  onClick={cancelForm}
                  disabled={
                    submitting
                  }
                  sx={{
                    textTransform:
                      "none",
                  }}
                >
                  Cancel
                </Button>
              )}
            </Stack>
          </Box>
        )}
    </Box>
  );
};

export default RcRemarkPanel;
