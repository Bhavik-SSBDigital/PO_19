import { useState } from "react";
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
 * THE single source of truth for showing a PO's header-level (points 7,
 * 8, 9, 11, 12, 13, 14, 15, 19) checks, ANYWHERE in the app:
 *   - the search page (full mode, when a PO number is searched)
 *   - the search page (compact banner, when a PO+line item is searched -
 *     "Header Checks: Closed", expandable into this same panel)
 *   - the dashboard's PO preview dialog / drilldown
 *
 * Closing is PO-LEVEL and entirely separate from any line item's own
 * lock. `locked`/`lockedBy`/`lockedAt` here always come from
 * PoHeaderResult, never from an AuditResult row.
 *
 * `variant`:
 *   "full"    - full points table + remarks + close/reopen button.
 *   "compact" - a one-line status banner with an expand toggle into the
 *               full table. Used inline under a line-item's own results.
 */
const PoHeaderChecksPanel = ({
  poNumber,
  header, // { points, totalPoints, verifiedCount, notVerifiedCount, locked, lockedBy, lockedAt }
  currentUserId,
  isBuyer,
  isAdmin,
  isProcurementManager,
  variant = "full",
  onChanged, // called after a successful lock/reopen, so the parent can refetch
}) => {
  const [expanded, setExpanded] = useState(variant === "full");
  const [busy, setBusy] = useState(false);

  if (!header) return null;
  const { points = [], totalPoints = 0, verifiedCount = 0, notVerifiedCount = 0, locked, lockedBy, lockedAt } = header;

  const canToggleLock = isBuyer;

  const toggleLock = async () => {
    setBusy(true);
    try {
      const res = await setPoHeaderCheckedStatus({ po_number: poNumber, checked: !locked });
      toast.success(
        res?.remarksLocked
          ? "PO header marked as checked — this applies to the whole PO"
          : "PO header reopened",
      );
      onChanged?.();
    } catch (error) {
      toast.error(error?.response?.data?.message || error?.message || "Failed to update header status");
    } finally {
      setBusy(false);
    }
  };

  const statusChip = locked ? (
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
            variant={locked ? "outlined" : "contained"}
            disabled={busy}
            onClick={toggleLock}
            sx={{ textTransform: "none", fontWeight: 700 }}
          >
            {busy ? "…" : locked ? "Reopen Header" : "Mark Header as Checked"}
          </Button>
        )}
      </Box>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        These checks apply to <strong>PO {poNumber}</strong> as a whole, not any one line item.
        {locked
          ? " This PO's header has been closed — every line item of this PO shows it as checked, and no further header remarks can be added."
          : " Closing this applies to every line item of this PO at once."}
      </Typography>

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
            {points.map((row, index) => (
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
                    locked={locked}
                    compact
                  />
                </TableCell>
              </TableRow>
            ))}
            {points.length === 0 && (
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