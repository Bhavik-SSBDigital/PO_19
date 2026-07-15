import PropTypes from "prop-types";
import { useEffect, useMemo } from "react";

// material-ui
import { useTheme } from "@mui/material/styles";
import { Box, Divider, Drawer, useMediaQuery } from "@mui/material";

// project import
import DrawerHeader from "./DrawerHeader";
import DrawerContent from "./DrawerContent";
import MiniDrawerStyled from "./MiniDrawerStyled";
import { drawerWidth } from "config";
import { useDispatch, useSelector } from "react-redux";
import { dataViewType } from "../../../store/reducers/menu";

// ==============================|| MAIN LAYOUT - DRAWER ||============================== //

const MainDrawer = ({ open, handleDrawerToggle, window }) => {
  const theme = useTheme();
  const matchDownMD = useMediaQuery(theme.breakpoints.down("lg"));

  const container =
    window !== undefined ? () => window().document.body : undefined;
  const role = localStorage.getItem("role") === "isAuditor";
  const allowedModules = JSON.parse(localStorage.getItem("allowedModules"));

  const dispatch = useDispatch();

  useEffect(() => {
    dispatch(
      dataViewType({
        dataViewType:
          localStorage.getItem("dataViewType") ||
          (role ? allowedModules[0] || "" : "PJV"),
      })
    );
  }, []);

  // header content
  const drawerContent = useMemo(() => <DrawerContent />, []);
  const drawerHeader = useMemo(() => <DrawerHeader open={open} />, [open]);

  return (
    <Box
      component="nav"
      sx={{ flexShrink: { md: 0 }, zIndex: 1300 }}
      aria-label="mailbox folders"
    >
      {!matchDownMD ? (
        <MiniDrawerStyled
          sx={{
            "& .MuiDrawer-paper": {
              backgroundColor: "#2e3780",
            },
          }}
          variant="permanent"
          open={open}
        >
          {drawerHeader}
          <Divider
            sx={{ my: "13px", borderWidth: 1.5, borderColor: "#fff5f5a8" }}
          />
          {drawerContent}
        </MiniDrawerStyled>
      ) : (
        <Drawer
          container={container}
          variant="temporary"
          open={open}
          onClose={handleDrawerToggle}
          ModalProps={{ keepMounted: true }}
          sx={{
            display: { xs: "block", lg: "none" },
            "& .MuiDrawer-paper": {
              width: drawerWidth,
              boxShadow: "none",
              backgroundColor: "#2e3780",
            },
          }}
        >
          {open && drawerHeader}

          <Divider
            sx={{ borderColor: theme.palette.divider, my: 2, borderWidth: 1.5 }}
          />

          {open && drawerContent}
        </Drawer>
      )}
    </Box>
  );
};

MainDrawer.propTypes = {
  open: PropTypes.bool,
  handleDrawerToggle: PropTypes.func,
  window: PropTypes.object,
};

export default MainDrawer;
