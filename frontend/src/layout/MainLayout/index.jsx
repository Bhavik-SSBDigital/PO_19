import { useEffect, useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";

// material-ui
import { useTheme } from "@mui/material/styles";
import { Box, Toolbar, useMediaQuery } from "@mui/material";

// project import
import Drawer from "./Drawer";
import Header from "./Header";
import { openDrawer } from "store/reducers/menu";
import { logout } from "../../api/api-functions";

const IDLE_LIMIT = 30 * 60 * 1000; // 30 minutes
const LS_KEY = "lastActivity";

const MainLayout = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const matchDownLG = useMediaQuery(theme.breakpoints.down("lg"));
  const { drawerOpen } = useSelector((state) => state.menu);

  const [open, setOpen] = useState(drawerOpen);

  // ----------------------------- //
  // MULTI-TAB IDLE LOGOUT LOGIC  //
  // ----------------------------- //

  useEffect(() => {
    // 1. On any user activity → update lastActivity timestamp
    const updateActivity = () => {
      localStorage.setItem(LS_KEY, Date.now().toString());
    };

    ["click", "mousemove", "keydown", "scroll", "touchstart"].forEach((evt) => {
      window.addEventListener(evt, updateActivity);
    });

    // 2. Sync activity across tabs
    const syncActivity = (e) => {
      if (e.key === LS_KEY) {
        lastActivity = Number(e.newValue);
      }

      // If forceLogout triggered from another tab
      if (e.key === "forceLogout") {
        navigate("/login");
      }
    };

    window.addEventListener("storage", syncActivity);

    // 3. Local variable to track activity
    let lastActivity = Number(localStorage.getItem(LS_KEY)) || Date.now();

    // 4. Idle check every 30 sec
    const interval = setInterval(async () => {
      const now = Date.now();

      if (
        now - (Number(localStorage.getItem(LS_KEY)) || Date.now()) >
        IDLE_LIMIT
      ) {
        localStorage.setItem("forceLogout", Date.now());
        try {
          await logout();
        } catch (e) {
          console.error("Error during logout:", e);
        } finally {
          navigate("/login");
        }
      }
    }, 30000);

    // cleanup
    return () => {
      ["click", "mousemove", "keydown", "scroll", "touchstart"].forEach(
        (evt) => {
          window.removeEventListener(evt, updateActivity);
        }
      );
      window.removeEventListener("storage", syncActivity);
      clearInterval(interval);
    };
  }, []);
  // ----------------------------- //
  // END MULTI-TAB IDLE LOGIC     //
  // ----------------------------- //

  // drawer toggler
  const handleDrawerToggle = () => {
    setOpen(!open);
    dispatch(openDrawer({ drawerOpen: !open }));
  };

  // responsive drawer
  useEffect(() => {
    setOpen(!matchDownLG);
    dispatch(openDrawer({ drawerOpen: !matchDownLG }));
  }, [matchDownLG]);

  useEffect(() => {
    if (open !== drawerOpen) setOpen(drawerOpen);
  }, [drawerOpen]);

  return (
    <Box
      sx={{
        display: "flex",
        width: "100%",
        backgroundColor: "#f6f8fc",
        minHeight: "100vh",
      }}
    >
      <Header open={open} handleDrawerToggle={handleDrawerToggle} />
      <Drawer open={open} handleDrawerToggle={handleDrawerToggle} />

      <Box
        component="main"
        sx={{
          width: "100%",
          flexGrow: 1,
          p: { xs: 2, sm: 3 },
          overflow: "auto",
        }}
      >
        <Toolbar />
        <Outlet />
      </Box>
    </Box>
  );
};

export default MainLayout;
