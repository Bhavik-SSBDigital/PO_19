import { Box } from "@mui/material";
import Navigation from "./Navigation";
import SimpleBar from "components/third-party/SimpleBar";

// ==============================|| DRAWER CONTENT ||============================== //

const DrawerContent = () => {
  return (
    <SimpleBar
      sx={{
        "& .simplebar-content": {
          display: "flex",
          flexDirection: "column",
          height: "100%",
        },
        height: "100%",
        bgcolor: "#ffffff",
        borderRight: "1px solid #f1f5f9",
        
        // --- FORCE DARK TEXT & MODERN STYLES ON THE NAVIGATION MENU ---
        "& .MuiList-root": {
          paddingX: "8px", // Adds a little breathing room on the sides
        },
        // Default State (Unselected items)
        "& .MuiListItemButton-root": {
          borderRadius: "8px",
          marginBottom: "4px",
          color: "#475569", // Slate gray text
          "& .MuiListItemIcon-root": {
            color: "#64748b", // Slate gray icons
            minWidth: "40px",
          },
          "& .MuiTypography-root": {
            color: "#475569",
            fontWeight: 500,
          }
        },
        // Hover State
        "& .MuiListItemButton-root:hover": {
          bgcolor: "#f8fafc", // Very light gray/blue on hover
          "& .MuiTypography-root, & .MuiListItemIcon-root": {
            color: "#0f172a", // Darkens text/icon on hover
          }
        },
        // Active/Selected State
        "& .Mui-selected, & .Mui-selected:hover": {
          bgcolor: "#eff6ff !important", // Soft blue background for active item
          "& .MuiTypography-root": {
            color: "#2563eb !important", // Vibrant blue text
            fontWeight: 700,
          },
          "& .MuiListItemIcon-root": {
            color: "#2563eb !important", // Vibrant blue icon
          }
        }
      }}
    >
      <Box sx={{ pt: 2 }} />

      <Navigation />

      <Box sx={{ flex: 1 }} />
    </SimpleBar>
  );
};

export default DrawerContent;