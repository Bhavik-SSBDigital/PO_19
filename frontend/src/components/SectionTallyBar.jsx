import { Box, LinearProgress, Typography, Chip, Stack } from "@mui/material";
import TaskAltRoundedIcon from "@mui/icons-material/TaskAltRounded";
import LockRoundedIcon from "@mui/icons-material/LockRounded";
import CheckCircleOutlineRoundedIcon from "@mui/icons-material/CheckCircleOutlineRounded";

/**
 * Live tally strip shown above every points table (header-level AND
 * line-item-level). Reads `checked` (boolean — buyer marked OK, no
 * remark needed) and `remarksCount` (number — buyer remarks added) off
 * each point object, so whoever owns the array just has to patch those
 * two fields in place for this bar to update instantly, with no refetch.
 *
 * MANDATORY-POINTS SCOPING: only points the system originally flagged
 * "Not Verified" are mandatory for closure (see backend/utility/
 * not-verified-scope.js and frontend/src/utils/tally.js — this component
 * used to have its own separate, unfiltered copy of this math that
 * counted every point regardless of system result, which is why it could
 * show something like "Line points reviewed: 1/10" even when only 1
 * point was ever mandatory - i.e. it was really "1 of 1", already fully
 * reviewed, but displayed as if 9 more were still outstanding. Fixed to
 * filter to the same mandatory subset everywhere else in the app uses.
 *
 * `points`: array of { pointNo, checked, remarksCount, verified,
 *   not_applicable, manual_verification, ... }
 * `locked`: whether the section is already closed
 * `label`: e.g. "Header points reviewed" / "Line points reviewed"
 */
const isMandatoryPoint = (p) => !p.verified && !p.not_applicable && !p.manual_verification;

const SectionTallyBar = ({ points = [], locked = false, label = "Points reviewed" }) => {
  const mandatoryPoints = points.filter(isMandatoryPoint);
  const total = mandatoryPoints.length;
  const remarkedCount = mandatoryPoints.filter((p) => (p.remarksCount ?? 0) > 0).length;
  const checkedOnlyCount = mandatoryPoints.filter(
    (p) => p.checked && !(p.remarksCount > 0),
  ).length;
  const reviewedCount = remarkedCount + checkedOnlyCount;
  const pct = total > 0 ? Math.round((reviewedCount / total) * 100) : 100;
  const willAutoClose = !locked && total > 0 && reviewedCount === total;

  // Nothing was ever mandatory here — say so plainly instead of showing
  // a "0/0" or empty-looking bar that looks broken.
  if (total === 0 && points.length > 0) {
    return (
      <Box
        sx={{
          mb: 2,
          p: 1.5,
          borderRadius: 2,
          bgcolor: "#f0fdf4",
          border: "1px solid",
          borderColor: "#bbf7d0",
          display: "flex",
          alignItems: "center",
          gap: 1,
        }}
      >
        <CheckCircleOutlineRoundedIcon fontSize="small" sx={{ color: "#15803d" }} />
        <Typography variant="body2" sx={{ fontWeight: 700, color: "#15803d" }}>
          No "Not Verified" {label.toLowerCase().includes("header") ? "header " : label.toLowerCase().includes("line") ? "line " : ""}
          points here — every point is already Verified / Not Applicable / Manual Review. Nothing pending for the buyer.
        </Typography>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        mb: 2,
        p: 1.5,
        borderRadius: 2,
        bgcolor: locked ? "#f0fdf4" : "#fafafa",
        border: "1px solid",
        borderColor: locked ? "#bbf7d0" : "#e5e7eb",
      }}
    >
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        flexWrap="wrap"
        gap={1}
        sx={{ mb: 0.75 }}
      >
        <Typography variant="body2" sx={{ fontWeight: 700 }}>
          {label} (Not Verified only): {reviewedCount}/{total}
        </Typography>
        <Stack direction="row" spacing={1} flexWrap="wrap">
          <Chip
            size="small"
            label={`${checkedOnlyCount} checked`}
            sx={{ height: 22, fontWeight: 700, bgcolor: "#e0f2fe", color: "#0369a1" }}
          />
          <Chip
            size="small"
            label={`${remarkedCount} with remarks`}
            sx={{ height: 22, fontWeight: 700, bgcolor: "#fef9c3", color: "#a16207" }}
          />
          {locked ? (
            <Chip
              size="small"
              icon={<LockRoundedIcon fontSize="small" />}
              label="Section closed"
              sx={{ height: 22, fontWeight: 700, bgcolor: "#dcfce7", color: "#15803d" }}
            />
          ) : willAutoClose ? (
            <Chip
              size="small"
              icon={<TaskAltRoundedIcon fontSize="small" />}
              label="Closing…"
              sx={{ height: 22, fontWeight: 700, bgcolor: "#dcfce7", color: "#15803d" }}
            />
          ) : null}
        </Stack>
      </Stack>
      <LinearProgress
        variant="determinate"
        value={pct}
        sx={{
          height: 8,
          borderRadius: 4,
          bgcolor: "#e5e7eb",
          "& .MuiLinearProgress-bar": {
            borderRadius: 4,
            bgcolor: locked ? "#16a34a" : pct === 100 ? "#16a34a" : "#4f46e5",
          },
        }}
      />
    </Box>
  );
};

export default SectionTallyBar;