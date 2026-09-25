import { useEffect, useState } from "react";
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

import SectionTallyBar from "../../../components/SectionTallyBar";
import PointRemarkPanel from "../../executive-dashboard/components/PointRemarkPanel";
import {
  getPoRemarks,
  setAuditResultCheckedStatus,
} from "../../../api/api-functions";

// FIX: manual_verification was checked BEFORE missing_data here. Data
// Missing rows (engine.py's MANUAL status) set BOTH missing_data=true AND
// manual_verification=true (see STATUS_TO_RESULT_FLAGS[MANUAL] in
// engine.py) - a genuine Manual Check row (MANUAL_CHECK status, e.g.
// ZIRM/ZICP import POs) sets ONLY manual_verification=true. Checking
// manual_verification first meant every Data Missing row was swallowed
// into "Manual Verify" and never reached the missing_data branch below.
// missing_data is now checked first.
export const VerificationChip = ({ result }) => {
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
// Live tally fix: this component now owns a LOCAL `rows` state, seeded
// from searchData.results (with each row's remarksCount computed from
// its own buyerRemarks array). PointRemarkPanel reports back through
// `onRemarksChanged` after every successful check/remark action, and
// `handlePointUpdate` patches just that one row — so SectionTallyBar
// (which reads `rows`, not searchData.results) re-renders immediately,
// with no network round trip and no page refresh.
const AuditResults = ({ searchData }) => {
  const role = localStorage.getItem("role");
  const currentUserId = localStorage.getItem("userId");
  const isBuyer = role === "isBuyer";
  const isAdmin = role === "isAdmin";
  const isProcurementManager = role === "isProcurementManager";
  const canToggleLock = isBuyer;

  const poNumber = searchData?.po_number;
  const poLineItem = searchData?.lineItem || searchData?.po_line_item;

  const [locked, setLocked] = useState(false);
  const [lockBusy, setLockBusy] = useState(false);
  // Default view = only the system's "Not Verified" points - see the
  // identical filter in PoHeaderChecksPanel.jsx. Display-only; never
  // changes what's fetched or how the tally/auto-close is computed.
  const [showAllPoints, setShowAllPoints] = useState(false);

  // NEW — local, live-patchable copy of the results array.
  const [rows, setRows] = useState([]);

  useEffect(() => {
    const results = searchData?.results || [];
    setRows(
      results.map((r) => ({
        ...r,
        checked: Boolean(r.checked),
        remarksCount: r.buyerRemarks?.length || 0,
      })),
    );
    // Re-seed every time the underlying search result changes (new PO,
    // new line item, or an explicit refetch) — after that, patches from
    // onRemarksChanged take over until the next real fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchData]);

  // NEW — called by PointRemarkPanel right after check/remark/delete
  // succeeds on the backend.
  const handlePointUpdate = (patch) => {
    setRows((prev) =>
      prev.map((r) =>
        String(r.pointNo) === String(patch.pointNo)
          ? { ...r, checked: patch.checked, remarksCount: patch.remarksCount }
          : r,
      ),
    );
    if (patch.remarksLocked !== undefined) {
      setLocked(Boolean(patch.remarksLocked));
    }
  };

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

  // FIX: previously `!p.manual_verification` alone hid every Data Missing
  // row from the default "Not Verified" view, since Data Missing rows also
  // carry manual_verification=true (see STATUS_TO_RESULT_FLAGS[MANUAL] in
  // engine.py). Data Missing now counts as "needs attention" (visible by
  // default), same as Not Verified — only a GENUINE Manual Check row
  // (manual_verification=true, missing_data=false) stays hidden by default.
  const isNotVerified = (p) =>
    !p.verified &&
    !p.not_applicable &&
    !(p.manual_verification && !p.missing_data);
  const visibleRows = showAllPoints ? rows : rows.filter(isNotVerified);
  const hiddenCount = rows.length - visibleRows.length;

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

      {/* Reads `rows`, not searchData.results — this is what makes it live */}
      <SectionTallyBar
        points={rows}
        locked={locked}
        label="Line points reviewed"
      />

      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          mb: 1,
          flexWrap: "wrap",
          gap: 1,
        }}
      >
        <Typography
          variant="caption"
          sx={{ fontWeight: 700, color: "text.secondary" }}
        >
          Showing {showAllPoints ? "all" : "Not Verified"} points (
          {visibleRows.length} of {rows.length})
        </Typography>
        {hiddenCount > 0 || showAllPoints ? (
          <Button
            size="small"
            onClick={() => setShowAllPoints((v) => !v)}
            sx={{ textTransform: "none", fontWeight: 700 }}
          >
            {showAllPoints
              ? "Show Not Verified only"
              : `Show all ${rows.length} points (${hiddenCount} already Verified/N-A/Manual Review)`}
          </Button>
        ) : null}
      </Box>

      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead sx={{ bgcolor: "#f5f5f5" }}>
            <TableRow>
              <TableCell sx={{ fontWeight: 600, width: "5%" }}>Pt #</TableCell>
              <TableCell sx={{ fontWeight: 600, width: "20%" }}>
                Title & Summary
              </TableCell>
              <TableCell sx={{ fontWeight: 600, width: "20%" }}>
                Logic
              </TableCell>
              <TableCell sx={{ fontWeight: 600, width: "7%" }}>
                Severity
              </TableCell>
              <TableCell sx={{ fontWeight: 600, width: "10%" }}>
                Status
              </TableCell>
              <TableCell sx={{ fontWeight: 600, width: "12%" }}>
                System Remarks
              </TableCell>
              <TableCell sx={{ fontWeight: 600, width: "26%" }}>
                Buyer Remarks
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {visibleRows.map((row, index) => (
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
                      initialRemarks={row.buyerRemarks}
                      initialChecked={row.checked}
                      systemResult={row.systemResultLabel}
                      onRemarksChanged={handlePointUpdate}
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
            {visibleRows.length === 0 && rows.length > 0 && (
              <TableRow>
                <TableCell
                  colSpan={7}
                  align="center"
                  sx={{ color: "text.secondary", py: 3 }}
                >
                  Nothing "Not Verified" here — every line point is already
                  Verified / Not Applicable / Manual Review.{" "}
                  <Button
                    size="small"
                    onClick={() => setShowAllPoints(true)}
                    sx={{ textTransform: "none", fontWeight: 700 }}
                  >
                    Show all {rows.length} points
                  </Button>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
};

export default AuditResults;
