import { Box, LinearProgress, Typography, Chip, Stack } from "@mui/material";
import TaskAltRoundedIcon from "@mui/icons-material/TaskAltRounded";
import LockRoundedIcon from "@mui/icons-material/LockRounded";

/**
 * Live tally strip shown above every points table (header-level AND
 * line-item-level). Reads ONLY `checked` (boolean — buyer marked OK, no
 * remark needed) and `remarksCount` (number — buyer remarks added) off
 * each point object, so whoever owns the array just has to patch those
 * two fields in place for this bar to update instantly, with no refetch.
 *
 * `points`: array of { pointNo, checked, remarksCount, ... }
 * `locked`: whether the section is already closed
 * `label`: e.g. "Header points reviewed" / "Line points reviewed"
 */
const SectionTallyBar = ({ points = [], locked = false, label = "Points reviewed" }) => {
  const total = points.length;
  const remarkedCount = points.filter((p) => (p.remarksCount ?? 0) > 0).length;
  const checkedOnlyCount = points.filter(
    (p) => p.checked && !(p.remarksCount > 0),
  ).length;
  const reviewedCount = remarkedCount + checkedOnlyCount;
  const pct = total > 0 ? Math.round((reviewedCount / total) * 100) : 0;
  const willAutoClose = !locked && total > 0 && reviewedCount === total;

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
          {label}: {reviewedCount}/{total}
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