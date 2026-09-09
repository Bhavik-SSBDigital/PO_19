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
      
      <Box sx={{ flexGrow: 1, px: 2, display: "flex", alignItems: "center" }}>
        <Typography
          variant="h6"
          sx={{
            fontWeight: 700,
            color: "#2e3780",
            fontSize: { xs: "0.95rem", sm: "1.1rem", md: "1.25rem" }, 
            lineHeight: 1.3,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
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
  title: PropTypes.string,
};

export default Header;