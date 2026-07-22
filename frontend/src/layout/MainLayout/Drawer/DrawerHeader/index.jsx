import PropTypes from "prop-types";
import { useTheme } from "@mui/material/styles";
import { Box, Typography } from "@mui/material";
import Logo from "components/Logo";

// ==============================|| DRAWER HEADER ||============================== //

const DrawerHeader = ({ open }) => {
  const theme = useTheme();

  return (
    <Box 
      sx={{ 
        display: "flex", 
        px: 2.5, 
        pt: 3,
        pb: 2,
        alignItems: "center", 
        justifyContent: open ? "flex-start" : "center",
        gap: 1.5,
        // FORCE CLEAN MODERN THEME OVERRIDE
        bgcolor: "#ffffff", // Kills the blue background
        color: "#0f172a", // Dark slate text instead of white
        borderBottom: open ? "1px solid #f1f5f9" : "none",
        transition: 'all 0.2s ease-in-out',
        width: "100%"
      }}
    >
      <Logo />
      
      {open && (
        <Box sx={{ display: 'flex', flexDirection: 'column' }}>
          <Typography
            sx={{
              fontSize: "16px",
              color: "#0f172a", // Dark premium text
              fontWeight: 800,
              lineHeight: 1.2,
              letterSpacing: "-0.5px",
              whiteSpace: "nowrap",
            }}
          >
            AI Based P2P
          </Typography>
          <Typography
            sx={{
              fontSize: "11px",
              color: "#64748b", // Slate gray for subtext
              fontWeight: 700,
              letterSpacing: "0.5px",
              textTransform: "uppercase",
              mt: 0.25
            }}
          >
            Compliance
          </Typography>
        </Box>
      )}
    </Box>
  );
};

DrawerHeader.propTypes = {
  open: PropTypes.bool,
};

export default DrawerHeader;