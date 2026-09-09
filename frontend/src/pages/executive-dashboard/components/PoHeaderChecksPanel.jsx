import { useEffect, useState } from "react";
import {
  Box,
  Button,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Typography,
  Tooltip as MuiTooltip,
} from "@mui/material";
import SectionTallyBar from "../../../components/SectionTallyBar";
import LayersRoundedIcon from "@mui/icons-material/LayersRounded";
import LockRoundedIcon from "@mui/icons-material/LockRounded";
import LockOpenRoundedIcon from "@mui/icons-material/LockOpenRounded";
import TaskAltRoundedIcon from "@mui/icons-material/TaskAltRounded";
import PanToolAltRoundedIcon from "@mui/icons-material/PanToolAltRounded";
import { toast } from "react-toastify";
import moment from "moment";
import { setPoHeaderCheckedStatus } from "../../../api/api-functions";
import PoHeaderRemarkPanel from "./PoHeaderRemarkPanel";

const SEVERITY_COLORS = { Critical: "#c0392b", High: "#e67e22", Medium: "#f1c40f", Low: "#95a5a6" };

const HeaderVerificationChip = ({ point }) => {
  if (point.manual_verification) {
    return (
      <Chip
        icon={<PanToolAltRoundedIcon style={{ fontSize: "13px", color: "#b45309" }} />}
        size="small"
        label="Manual Verify"
        sx={{ borderRadius: "20px", fontSize: "12px", fontWeight: 700, bgcolor: "#fef9c3", color: "#854d0e", border: "1px solid #fde047" }}
      />
    );
  }
  if (point.not_applicable) {
    return <Chip icon={<TaskAltRoundedIcon style={{ fontSize: "13px" }} />} size="small" label="Not Applicable" sx={{ borderRadius: "20px", fontSize: "12px", fontWeight: 700 }} />;
  }
  if (point.verified) {
    return <Chip icon={<TaskAltRoundedIcon style={{ fontSize: "13px" }} />} size="small" label="Verified" color="success" sx={{ borderRadius: "20px", fontSize: "12px", fontWeight: 700 }} />;
  }
  return <Chip icon={<TaskAltRoundedIcon style={{ fontSize: "13px" }} />} size="small" label="Not Verified" color="error" sx={{ borderRadius: "20px", fontSize: "12px", fontWeight: 700 }} />;
};

/**
 * Live tally fix: this component now owns a LOCAL `localPoints` state
 * (seeded from header.points, remarksCount derived from
 * headerRemarksByPoint) and a LOCAL `localLocked` state (seeded from
 * header.locked). PoHeaderRemarkPanel reports back through
 * `onRemarksChanged` after every successful check/remark action, and
 * `handlePointUpdate` patches just that one point AND, if the backend
 * says the section auto-closed, flips `localLocked` too — all without
 * waiting for the parent to refetch.
 *
 * `variant`:
 *   "full"    - full points table + remarks + close/reopen button.
 *   "compact" - a one-line status banner with an expand toggle into the
 *               full table. Used inline under a line-item's own results.
 */
const PoHeaderChecksPanel = ({
  poNumber,
  header,
  currentUserId,
  isBuyer,
  isAdmin,
  isProcurementManager,
  variant = "full",
  onChanged,
}) => {
  const [expanded, setExpanded] = useState(variant === "full");
  const [busy, setBusy] = useState(false);

  const {
    points = [],
    totalPoints = 0,
    verifiedCount = 0,
    notVerifiedCount = 0,
    locked,
    lockedBy,
    lockedAt,
    headerRemarksByPoint = {},
  } = header || {};

  // NEW — local, live-patchable copies.
  const [localPoints, setLocalPoints] = useState([]);
  const [localLocked, setLocalLocked] = useState(Boolean(locked));

  useEffect(() => {
    setLocalPoints(
      points.map((p) => ({
        ...p,
        checked: Boolean(p.checked),
        remarksCount: (headerRemarksByPoint[String(p.pointNo)] || []).length,
      })),
    );
    setLocalLocked(Boolean(locked));
    // Re-seed whenever the parent gives us a fresh header object (new PO,
    // or after an explicit lock/reopen refetch via onChanged). Between
    // fetches, handlePointUpdate patches take over.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [header, poNumber]);

  // NEW
  const handlePointUpdate = (patch) => {
    setLocalPoints((prev) =>
      prev.map((p) =>
        String(p.pointNo) === String(patch.pointNo)
          ? { ...p, checked: patch.checked, remarksCount: patch.remarksCount }
          : p,
      ),
    );
    if (patch.remarksLocked !== undefined) {
      setLocalLocked(Boolean(patch.remarksLocked));
    }
  };

  if (!header) return null;

  const canToggleLock = isBuyer;

  const toggleLock = async () => {
    setBusy(true);
    try {
      const res = await setPoHeaderCheckedStatus({ po_number: poNumber, checked: !localLocked });
      toast.success(
        res?.remarksLocked
          ? "PO header marked as checked — this applies to the whole PO"
          : "PO header reopened",
      );
      // Optimistic local flip so the UI reflects it instantly even before
      // the parent's refetch (triggered below) resolves.
      setLocalLocked(Boolean(res?.remarksLocked));
      onChanged?.();
    } catch (error) {
      toast.error(error?.response?.data?.message || error?.message || "Failed to update header status");
    } finally {
      setBusy(false);
    }
  };

  const statusChip = localLocked ? (
    <Chip
      icon={<LockRoundedIcon fontSize="small" />}
      label={`Header Checks: Closed${lockedAt ? ` — ${moment(lockedAt).format("DD-MMM-YYYY")}` : ""}`}
      size="small"
      sx={{ fontWeight: 700, bgcolor: "#dcfce7", color: "#15803d" }}
    />
  ) : (
    <Chip
      icon={<LockOpenRoundedIcon fontSize="small" />}
      label="Header Checks: Not Yet Closed"
      size="small"
      sx={{ fontWeight: 700, bgcolor: "#fef3c7", color: "#92400e" }}
    />
  );

  if (variant === "compact" && !expanded) {
    return (
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 1.5,
          px: 2,
          py: 1.5,
          mb: 2,
          borderRadius: 2,
          bgcolor: "#eef2ff",
          border: "1px solid #c7d2fe",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
          <LayersRoundedIcon fontSize="small" sx={{ color: "#4f46e5" }} />
          <Typography variant="body2" sx={{ fontWeight: 700, color: "#3730a3" }}>
            PO Header Checks (applies to whole PO)
          </Typography>
          {statusChip}
          <Typography variant="caption" color="text.secondary">
            {verifiedCount} verified / {notVerifiedCount} not verified of {totalPoints}
          </Typography>
        </Box>
        <Button size="small" onClick={() => setExpanded(true)} sx={{ textTransform: "none", fontWeight: 700 }}>
          View Header Checks
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ mb: 3 }}>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 1.5,
          mb: 1.5,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <LayersRoundedIcon sx={{ color: "#4f46e5" }} />
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            PO Header Checks
          </Typography>
          <Chip size="small" label={`${totalPoints} point${totalPoints === 1 ? "" : "s"}`} sx={{ height: 22, fontWeight: 700, bgcolor: "#eef2ff", color: "#4338ca" }} />
          {statusChip}
          {variant === "compact" && (
            <Button size="small" onClick={() => setExpanded(false)} sx={{ textTransform: "none", fontWeight: 600 }}>
              Collapse
            </Button>
          )}
        </Box>
        {canToggleLock && (
          <Button
            size="small"
            variant={localLocked ? "outlined" : "contained"}
            disabled={busy}
            onClick={toggleLock}
            sx={{ textTransform: "none", fontWeight: 700 }}
          >
            {busy ? "…" : localLocked ? "Reopen Header" : "Mark Header as Checked"}
          </Button>
        )}
      </Box>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        These checks apply to <strong>PO {poNumber}</strong> as a whole, not any one line item.
        {localLocked
          ? " This PO's header has been closed — every line item of this PO shows it as checked, and no further header remarks can be added."
          : " Closing this applies to every line item of this PO at once."}
      </Typography>

      {/* Reads `localPoints`, not `points` — this is what makes it live */}
      <SectionTallyBar points={localPoints} locked={localLocked} label="Header points reviewed" />

      <TableContainer component={Paper} variant="outlined" sx={{ borderColor: "#c7d2fe" }}>
        <Table size="small">
          <TableHead sx={{ bgcolor: "#eef2ff" }}>
            <TableRow>
              <TableCell sx={{ fontWeight: 700, width: "5%" }}>Pt #</TableCell>
              <TableCell sx={{ fontWeight: 700, width: "22%" }}>Title & Summary</TableCell>
              <TableCell sx={{ fontWeight: 700, width: "23%" }}>Logic</TableCell>
              <TableCell sx={{ fontWeight: 700, width: "7%" }}>Severity</TableCell>
              <TableCell sx={{ fontWeight: 700, width: "11%" }}>Status</TableCell>
              <TableCell sx={{ fontWeight: 700, width: "13%" }}>System Remarks</TableCell>
              <TableCell sx={{ fontWeight: 700, width: "19%" }}>Buyer Remarks</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {localPoints.map((row, index) => (
              <TableRow key={row.pointNo ?? index} hover>
                <TableCell sx={{ verticalAlign: "top", fontWeight: 700 }}>{row.pointNo}</TableCell>
                <TableCell sx={{ verticalAlign: "top" }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                    {row.title || `Point ${row.pointNo}`}
                  </Typography>
                  {row.summary && (
                    <Typography variant="body2" color="textSecondary" sx={{ mt: 0.5 }}>
                      {row.summary}
                    </Typography>
                  )}
                </TableCell>
                <TableCell sx={{ verticalAlign: "top" }}>
                  <MuiTooltip title={row.logic || ""}>
                    <Typography variant="body2" sx={{ display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                      {row.logic || "N/A"}
                    </Typography>
                  </MuiTooltip>
                </TableCell>
                <TableCell sx={{ verticalAlign: "top" }}>
                  {row.severity && (
                    <Chip label={row.severity} size="small" sx={{ bgcolor: SEVERITY_COLORS[row.severity] || "#999", color: "#fff" }} />
                  )}
                </TableCell>
                <TableCell sx={{ verticalAlign: "top" }}>
                  <HeaderVerificationChip point={row} />
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
                    <Typography variant="body2" color="textSecondary">None</Typography>
                  )}
                </TableCell>
                <TableCell sx={{ verticalAlign: "top" }}>
                  <PoHeaderRemarkPanel
                    poNumber={poNumber}
                    pointNo={row.pointNo}
                    currentUserId={currentUserId}
                    isBuyer={isBuyer}
                    isAdmin={isAdmin}
                    isProcurementManager={isProcurementManager}
                    locked={localLocked}
                    initialRemarks={headerRemarksByPoint[String(row.pointNo)] || []}
                    initialChecked={row.checked}
                    systemResult={row.systemResultLabel}
                    onRemarksChanged={handlePointUpdate}
                    compact
                  />
                </TableCell>
              </TableRow>
            ))}
            {localPoints.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ color: "text.secondary", py: 3 }}>
                  No header-level results found for this PO yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
};

export default PoHeaderChecksPanel;