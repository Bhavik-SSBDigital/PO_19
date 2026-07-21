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

const Header = ({ open, handleDrawerToggle }) => {
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
      <Box sx={{ flexGrow: 1 }}>
        <Typography
          variant="h4"
          sx={{ width: "260px", pl: 2, fontWeight: 700, color: "#2e3780" }}
        >
          AI Based P2P Compliance
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
      // boxShadow: theme.customShadows.z1
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
};

export default Header;
