import * as React from "react";
import { Box, Typography, alpha } from "@mui/material";
import AssignmentRoundedIcon from "@mui/icons-material/AssignmentRounded";

export default function ModuleMenu() {
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1.5,
        mx: 2,
        px: 2,
        py: 1.5,
        bgcolor: alpha("#6366f1", 0.06), // Soft indigo background
        borderRadius: 3,
        border: "1px solid",
        borderColor: alpha("#6366f1", 0.15),
        boxShadow: 'inset 0 2px 4px 0 rgba(255,255,255,0.3)',
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          bgcolor: "#6366f1", // Solid indigo for the icon box
          color: "white",
          borderRadius: 2,
          p: 0.75,
          boxShadow: '0 4px 10px -2px rgba(99, 102, 241, 0.4)',
        }}
      >
        <AssignmentRoundedIcon fontSize="small" />
      </Box>
      <Box>
        <Typography 
          variant="caption" 
          sx={{ 
            color: "#64748b", 
            fontWeight: 700, 
            display: "block", 
            lineHeight: 1,
            letterSpacing: 0.5,
            textTransform: 'uppercase'
          }}
        >
          Active Module
        </Typography>
        <Typography 
          variant="body2" 
          sx={{ 
            color: "#1e293b", 
            fontWeight: 800, 
            mt: 0.5, 
            lineHeight: 1,
            letterSpacing: -0.2
          }}
        >
          PO Workspace
        </Typography>
      </Box>
    </Box>
  );
}