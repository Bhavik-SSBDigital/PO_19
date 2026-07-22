import PropTypes from "prop-types";
import { useEffect, useMemo } from "react";

// material-ui
import { useTheme } from "@mui/material/styles";
import { Box, Drawer, useMediaQuery } from "@mui/material";

// project import
import DrawerHeader from "./DrawerHeader";
import DrawerContent from "./DrawerContent";
import MiniDrawerStyled from "./MiniDrawerStyled";
import { drawerWidth } from "config";
import { useDispatch } from "react-redux";
import { dataViewType } from "../../../store/reducers/menu";

// ==============================|| MAIN LAYOUT - DRAWER ||============================== //

const MainDrawer = ({ open, handleDrawerToggle, window }) => {
  const theme = useTheme();
  const matchDownMD = useMediaQuery(theme.breakpoints.down("lg"));

  const container =
    window !== undefined ? () => window().document.body : undefined;

  const dispatch = useDispatch();

  useEffect(() => {
    // Since there is only one module now, just enforce "PO" directly
    dispatch(
      dataViewType({
        dataViewType: "PO",
      })
    );
  }, [dispatch]);

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
              // FORCE WHITE BACKGROUND - Kills the blue
              backgroundColor: "#ffffff",
              borderRight: "1px solid #f1f5f9",
            },
          }}
          variant="permanent"
          open={open}
        >
          {drawerHeader}
          
          {/* Removed the Divider with margins that was exposing the background gap */}
          
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
              // FORCE WHITE BACKGROUND ON MOBILE TOO
              backgroundColor: "#ffffff",
              borderRight: "1px solid #f1f5f9",
            },
          }}
        >
          {open && drawerHeader}

          {/* Removed the Divider here as well */}

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