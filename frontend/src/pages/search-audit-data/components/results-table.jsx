import { useEffect, useState } from "react";
// material-ui
import {
  Typography,
  Box,
  Button,
  Table,
  TableBody,
  TableContainer,
  TableHead,
  TableRow,
  TableCell,
  Chip,
  Paper,
} from "@mui/material";

import TaskAltRoundedIcon from "@mui/icons-material/TaskAltRounded";
import PanToolAltRoundedIcon from "@mui/icons-material/PanToolAltRounded";
import LockRoundedIcon from "@mui/icons-material/LockRounded";
import LockOpenRoundedIcon from "@mui/icons-material/LockOpenRounded";

import { toast } from "react-toastify";

import PointRemarkPanel from "../../executive-dashboard/components/PointRemarkPanel";
import {
  getPoRemarks,
  setAuditResultCheckedStatus,
} from "../../../api/api-functions";

// ── Shared chip exported so AuditResultReview can reuse it ──────────────────
export const VerificationChip = ({ result }) => {
  if (result.manual_verification) {
    return (
      <Chip
        icon={
          <PanToolAltRoundedIcon
            style={{ fontSize: "13px", color: "#b45309" }}
          />
        }
        size="small"
        label="Manual Verify"
        sx={{
          borderRadius: "20px",
          width: "130px",
          fontSize: "12px",
          fontWeight: "700",
          bgcolor: "#fef9c3",
          color: "#854d0e",
          border: "1px solid #fde047",
          "& .MuiChip-icon": { color: "#b45309" },
        }}
      />
    );
  }
  if (result.not_applicable) {
    return (
      <Chip
        icon={<TaskAltRoundedIcon style={{ fontSize: "13px" }} />}
        size="small"
        label="Not Applicable"
        color="default"
        sx={{
          borderRadius: "20px",
          width: "130px",
          fontSize: "12px",
          fontWeight: "700",
        }}
      />
    );
  }
  if (result.missing_data) {
    return (
      <Chip
        icon={<TaskAltRoundedIcon style={{ fontSize: "13px" }} />}
        size="small"
        label="Data Missing"
        color="warning"
        sx={{
          borderRadius: "20px",
          width: "120px",
          fontSize: "12px",
          fontWeight: "700",
        }}
      />
    );
  }
  if (result.verified) {
    return (
      <Chip
        icon={<TaskAltRoundedIcon style={{ fontSize: "13px" }} />}
        size="small"
        label="Verified"
        color="success"
        sx={{
          borderRadius: "20px",
          width: "110px",
          fontSize: "12px",
          fontWeight: "700",
        }}
      />
    );
  }
  return (
    <Chip
      icon={<TaskAltRoundedIcon style={{ fontSize: "13px" }} />}
      size="small"
      label="Not Verified"
      color="error"
      sx={{
        borderRadius: "20px",
        width: "110px",
        fontSize: "12px",
        fontWeight: "700",
      }}
    />
  );
};

const getSeverityColor = (severity) => {
  switch (severity?.toLowerCase()) {
    case "critical":
      return "error";
    case "high":
      return "warning";
    case "medium":
      return "info";
    case "low":
      return "success";
    default:
      return "default";
  }
};

// ==============================|| AUDIT RESULTS TABLE (LINE-LEVEL ONLY) ||=
//
// This table shows ONLY line-item-level checks (searchData.results - the
// 10 line-level points). It intentionally shows NOTHING header-level -
// header-level points (7, 8, 9, 11, 12, 13, 14, 15, 19) belong to
// PoHeaderChecksPanel, rendered by the PARENT page (search-audit-data's
// index.jsx), not here. This keeps the two systems visually and
// structurally separate, per design: a line item's results table is pure
// line-item detail, full stop.
const AuditResults = ({ searchData }) => {
  // Who's logged in.
  const role = localStorage.getItem("role");
  const currentUserId = localStorage.getItem("userId");
  const isBuyer = role === "isBuyer";
  const isAdmin = role === "isAdmin";
  const isProcurementManager = role === "isProcurementManager";
  // Only a Buyer may toggle the checked/locked state of a line item.
  const canToggleLock = isBuyer;

  const poNumber = searchData?.po_number;
  const poLineItem = searchData?.lineItem || searchData?.po_line_item;

  // Whether THIS LINE ITEM's remarks are locked ("checked"). This is the
  // line-level lock (AuditResult.remarksLocked) - entirely separate from
  // the PO's header lock, which is shown/controlled by
  // PoHeaderChecksPanel elsewhere on the page.
  const [locked, setLocked] = useState(false);
  const [lockBusy, setLockBusy] = useState(false);

  useEffect(() => {
    if (!poNumber || !poLineItem) {
      setLocked(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await getPoRemarks({ poNumber, poLineItem });
        if (!cancelled) setLocked(Boolean(res?.remarksLocked));
      } catch (error) {
        // non-fatal — bar just won't reflect the true state until reload
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [poNumber, poLineItem]);

  const toggleLock = async () => {
    if (!poNumber || !poLineItem) return;
    setLockBusy(true);
    try {
      const res = await setAuditResultCheckedStatus({
        poNumber,
        poLineItem,
        checked: !locked,
      });
      setLocked(Boolean(res?.remarksLocked));
      toast.success(
        res?.remarksLocked
          ? "Line item marked as checked"
          : "Line item reopened",
      );
    } catch (error) {
      toast.error(
        error?.response?.data?.message ||
          error?.message ||
          "Failed to update checked status",
      );
    } finally {
      setLockBusy(false);
    }
  };

  if (!searchData || !searchData.results || searchData.results.length === 0) {
    return null;
  }

  return (
    <Box sx={{ mt: 3, mb: 2, px: 2 }}>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 1,
          mb: 1.5,
        }}
      >
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          Line-Level Checks
        </Typography>

        {poNumber && poLineItem && (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
            <Chip
              icon={
                locked ? (
                  <LockRoundedIcon fontSize="small" />
                ) : (
                  <LockOpenRoundedIcon fontSize="small" />
                )
              }
              label={locked ? "Line Item Checked — Remarks Locked" : "Open"}
              color={locked ? "warning" : "default"}
              size="small"
              sx={{ fontWeight: 700 }}
            />
            {canToggleLock && (
              <Button
                size="small"
                variant="outlined"
                disabled={lockBusy}
                onClick={toggleLock}
                sx={{ textTransform: "none", fontWeight: 600 }}
              >
                {lockBusy ? "…" : locked ? "Reopen" : "Mark as Checked"}
              </Button>
            )}
          </Box>
        )}
      </Box>

      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead sx={{ bgcolor: "#f5f5f5" }}>
            <TableRow>
              <TableCell sx={{ fontWeight: 600, width: "5%" }}>Pt #</TableCell>
              <TableCell sx={{ fontWeight: 600, width: "22%" }}>
                Title & Summary
              </TableCell>
              <TableCell sx={{ fontWeight: 600, width: "23%" }}>
                Logic
              </TableCell>
              <TableCell sx={{ fontWeight: 600, width: "7%" }}>
                Severity
              </TableCell>
              <TableCell sx={{ fontWeight: 600, width: "11%" }}>
                Status
              </TableCell>
              <TableCell sx={{ fontWeight: 600, width: "13%" }}>
                System Remarks
              </TableCell>
              <TableCell sx={{ fontWeight: 600, width: "19%" }}>
                Buyer Remarks
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {searchData.results.map((row, index) => (
              <TableRow key={row.pointNo ?? index} hover>
                <TableCell sx={{ verticalAlign: "top", fontWeight: 700 }}>
                  {row.pointNo}
                </TableCell>

                <TableCell sx={{ verticalAlign: "top" }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                    {row.title || `Point ${row.pointNo}`}
                  </Typography>
                  {row.summary && (
                    <Typography
                      variant="body2"
                      color="textSecondary"
                      sx={{ mt: 0.5 }}
                    >
                      {row.summary}
                    </Typography>
                  )}
                </TableCell>

                <TableCell sx={{ verticalAlign: "top" }}>
                  <Typography variant="body2">{row.logic || "N/A"}</Typography>
                </TableCell>

                <TableCell sx={{ verticalAlign: "top" }}>
                  {row.severity && (
                    <Chip
                      label={row.severity}
                      size="small"
                      color={getSeverityColor(row.severity)}
                      variant="outlined"
                    />
                  )}
                </TableCell>

                <TableCell sx={{ verticalAlign: "top" }}>
                  <VerificationChip result={row} />
                </TableCell>

                <TableCell sx={{ verticalAlign: "top" }}>
                  {row.remarks && row.remarks.length > 0 ? (
                    <ul style={{ margin: 0, paddingLeft: "20px" }}>
                      {row.remarks.map((remark, rIdx) => (
                        <li key={rIdx}>
                          <Typography variant="body2">{remark}</Typography>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <Typography variant="body2" color="textSecondary">
                      None
                    </Typography>
                  )}
                </TableCell>

                <TableCell sx={{ verticalAlign: "top" }}>
                  {poNumber && poLineItem ? (
                    <PointRemarkPanel
                      poNumber={poNumber}
                      poLineItem={poLineItem}
                      pointNo={row.pointNo}
                      currentUserId={currentUserId}
                      isBuyer={isBuyer}
                      isAdmin={isAdmin}
                      isProcurementManager={isProcurementManager}
                      locked={locked}
                      compact
                    />
                  ) : (
                    <Typography variant="caption" color="text.secondary">
                      —
                    </Typography>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
};

export default AuditResults;
