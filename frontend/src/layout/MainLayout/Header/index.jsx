import PropTypes from "prop-types";

// material-ui
import { useTheme } from "@mui/material/styles";
import {
  AppBar,
  Box,
  IconButton,
  Toolbar,
  Typography,
  useMediaQuery,
} from "@mui/material";

import MenuOpenRoundedIcon from "@mui/icons-material/MenuOpenRounded";

// project import
import AppBarStyled from "./AppBarStyled";
import HeaderContent from "./HeaderContent";

// ==============================|| MAIN LAYOUT - HEADER ||============================== //

const Header = ({ 
  open, 
  handleDrawerToggle, 
  // 1. Add title prop with a default fallback
  title = "AI Based P2P Compliance & Procurement Intelligence Platform" 
}) => {
  const theme = useTheme();
  const matchDownMD = useMediaQuery(theme.breakpoints.down("lg"));

  const iconBackColor = "grey.100";
  const iconBackColorOpen = "grey.200";

  // common header
  const mainHeader = (
    <Toolbar>
      <IconButton
        disableRipple
        aria-label="open drawer"
        onClick={handleDrawerToggle}
        edge="start"
        color="secondary"
        sx={{
          color: "text.primary",
          bgcolor: open ? iconBackColorOpen : iconBackColor,
          ml: { xs: 0, lg: -2 },
        }}
      >
        {!open ? (
          <MenuOpenRoundedIcon
            sx={{ transform: "rotate(180deg)", fontSize: "1.3rem" }}
          />
        ) : (
          <MenuOpenRoundedIcon sx={{ fontSize: "1.3rem" }} />
        )}
      </IconButton>
      
      {/* 2. Container takes up available space */}
      <Box sx={{ flexGrow: 1, px: 2 }}>
        <Typography
          variant="h4"
          sx={{
            fontWeight: 700,
            color: "#2e3780",
            // Responsive font sizing
            fontSize: { xs: "1.1rem", sm: "1.2rem", md: "1.4rem" }, 
            // Tighter line height keeps wrapped text looking neat in a header
            lineHeight: 1.2, 
          }}
        >
          {title}
        </Typography>
      </Box>
      <HeaderContent />
    </Toolbar>
  );

  // app-bar params
  const appBar = {
    position: "fixed",
    color: "inherit",
    elevation: 0,
    sx: {
      borderBottom: `1px solid ${theme.palette.divider}`,
      boxShadow: "rgba(0, 0, 0, 0.15) 1.95px 1.95px 2.6px",
    },
  };

  return (
    <>
      {!matchDownMD ? (
        <AppBarStyled open={open} {...appBar}>
          {mainHeader}
        </AppBarStyled>
      ) : (
        <AppBar {...appBar}>{mainHeader}</AppBar>
      )}
    </>
  );
};

Header.propTypes = {
  open: PropTypes.bool,
  handleDrawerToggle: PropTypes.func,
  title: PropTypes.string, // Document the new prop
};

export default Header;