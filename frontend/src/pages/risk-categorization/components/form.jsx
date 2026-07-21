import { useEffect, useState } from "react";
import {
  Paper, Table, TableHead, TableRow, TableCell, TableBody, TableContainer,
  Select, MenuItem, Chip, Skeleton, Typography, Box,
} from "@mui/material";
import { toast } from "react-toastify";
import { get, post } from "utils/axiosApi";

const SEVERITY_COLORS = { Critical: "#c0392b", High: "#e67e22", Medium: "#f1c40f", Low: "#95a5a6" };
const DEFAULT_SEVERITY_LEVELS = ["Critical", "High", "Medium", "Low"];

const RiskCategorizationForm = () => {
  const [points, setPoints] = useState([]);
  const [severityLevels, setSeverityLevels] = useState(DEFAULT_SEVERITY_LEVELS);
  const [loading, setLoading] = useState(true);
  const [savingPointNo, setSavingPointNo] = useState(null);

  // Adjust this to however your app actually determines the logged-in
  // user's role (redux store, decoded JWT, etc.) - localStorage.role is
  // what SearchAuditData.jsx in this codebase already reads elsewhere.
  const role = localStorage.getItem("role");
  const isAdmin = role === "admin" || role === "isAdmin";

  const load = async () => {
    setLoading(true);
    try {
      const res = await get("/reports/audit-point-config");
      setPoints(res?.points || []);
      if (res?.severityLevels?.length) setSeverityLevels(res.severityLevels);
    } catch (err) {
      console.error(err);
      toast.error("Failed to load audit point configuration");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleSeverityChange = async (pointNo, severity) => {
    const prev = points;
    setPoints((cur) => cur.map((p) => (p.pointNo === pointNo ? { ...p, severity } : p)));
    setSavingPointNo(pointNo);
    try {
      await post("/risk-categorization/update-severity", { pointNo, severity });
      toast.success(`Point #${pointNo} criticality updated to ${severity}`);
    } catch (err) {
      setPoints(prev);
      toast.error(err?.response?.data?.message || "Failed to update criticality");
    } finally {
      setSavingPointNo(null);
    }
  };

  if (loading) return <Skeleton variant="rectangular" height={400} />;

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      {!isAdmin && (
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
          View only — only an admin can change criticality.
        </Typography>
      )}
      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ width: 50 }}>#</TableCell>
              <TableCell sx={{ width: 260 }}>Audit Point</TableCell>
              <TableCell>What It Checks</TableCell>
              <TableCell sx={{ width: 160 }}>Criticality</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {points.map((p) => (
              <TableRow key={p.pointNo} hover>
                <TableCell sx={{ fontWeight: 600 }}>{p.pointNo}</TableCell>
                <TableCell>{p.title}</TableCell>
                <TableCell>
                  <Typography variant="body2" color="text.secondary">{p.summary}</Typography>
                </TableCell>
                <TableCell>
                  {isAdmin ? (
                    <Select
                      size="small"
                      fullWidth
                      value={p.severity}
                      disabled={savingPointNo === p.pointNo}
                      onChange={(e) => handleSeverityChange(p.pointNo, e.target.value)}
                    >
                      {severityLevels.map((lvl) => (
                        <MenuItem key={lvl} value={lvl}>{lvl}</MenuItem>
                      ))}
                    </Select>
                  ) : (
                    <Chip size="small" label={p.severity} sx={{ bgcolor: SEVERITY_COLORS[p.severity] || "#999", color: "#fff" }} />
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
};

export default RiskCategorizationForm;