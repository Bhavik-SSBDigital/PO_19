import { useEffect, useState } from "react";
// material-ui
import {
  Autocomplete,
  Dialog,
  DialogActions,
  DialogContent,
  Typography,
  Box,
  Button,
  Table,
  TableBody,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  TableCell,
  Chip,
  Paper,
  DialogTitle,
  IconButton,
  MenuItem,
  Select,
} from "@mui/material";

import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import TaskAltRoundedIcon from "@mui/icons-material/TaskAltRounded";
import PanToolAltRoundedIcon from "@mui/icons-material/PanToolAltRounded";

import moment from "moment";
import { toast } from "react-toastify";
import { useSelector } from "react-redux";

import { get, post } from "utils/axiosApi";
import { useViewDocument } from "../contexts";
import DocumentView from "./document-view";
import { AutoSplit, SplitBox } from "../../../components/SplitLayout";

// ── Shared chip exported so AuditResultReview can reuse it ──────────────────
export const VerificationChip = ({ result }) => {
  if (result.manual_verification) {
    return (
      <Chip
        icon={<PanToolAltRoundedIcon style={{ fontSize: "13px", color: "#b45309" }} />}
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

// ==============================|| SEARCH AUDIT DATA ||============================== //

const AuditResults = ({ searchData }) => {
  // If there is no data or no results array, do not render the table
  if (!searchData || !searchData.results || searchData.results.length === 0) {
    return null;
  }

  // Helper function to color-code severity
  const getSeverityColor = (severity) => {
    switch (severity?.toLowerCase()) {
      case "critical": return "error";
      case "high": return "warning";
      case "medium": return "info";
      case "low": return "success";
      default: return "default";
    }
  };

  return (
    <Box sx={{ mt: 3, mb: 2, px: 2 }}>
      <Typography variant="h5" sx={{ mb: 1.5, fontWeight: 700 }}>
        Audit Check Results
      </Typography>
      
      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead sx={{ bgcolor: "#f5f5f5" }}>
            <TableRow>
              <TableCell sx={{ fontWeight: 600, width: '5%' }}>Pt #</TableCell>
              <TableCell sx={{ fontWeight: 600, width: '25%' }}>Title & Summary</TableCell>
              <TableCell sx={{ fontWeight: 600, width: '30%' }}>Logic</TableCell>
              <TableCell sx={{ fontWeight: 600, width: '10%' }}>Severity</TableCell>
              <TableCell sx={{ fontWeight: 600, width: '10%' }}>Status</TableCell>
              <TableCell sx={{ fontWeight: 600, width: '20%' }}>Remarks</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {searchData.results.map((row, index) => {
              // Determine status text and color
              let statusText = "Not Verified";
              let statusColor = "error";

              if (row.not_applicable) {
                statusText = "N/A";
                statusColor = "default";
              } else if (row.verified) {
                statusText = "Verified";
                statusColor = "success";
              }

              return (
                <TableRow key={index} hover>
                  <TableCell>{row.pointNo}</TableCell>
                  
                  <TableCell>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                      {row.title}
                    </Typography>
                    {/* Note: Mapping "summary", not "description" based on your JSON */}
                    <Typography variant="body2" color="textSecondary" sx={{ mt: 0.5 }}>
                      {row.summary}
                    </Typography>
                  </TableCell>
                  
                  <TableCell>
                    <Typography variant="body2">
                      {row.logic || "N/A"}
                    </Typography>
                  </TableCell>
                  
                  <TableCell>
                    {row.severity && (
                      <Chip 
                        label={row.severity} 
                        size="small" 
                        color={getSeverityColor(row.severity)} 
                        variant="outlined"
                      />
                    )}
                  </TableCell>
                  
                  <TableCell>
                    <Chip 
                      label={statusText} 
                      size="small" 
                      color={statusColor} 
                      sx={{ fontWeight: 600 }}
                    />
                  </TableCell>
                  
                  <TableCell>
                    {row.remarks && row.remarks.length > 0 ? (
                      <ul style={{ margin: 0, paddingLeft: '20px' }}>
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
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
};

export default AuditResults;