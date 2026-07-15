import PropTypes from "prop-types";
import { useRef, useState } from "react";

import {
  Box,
  ButtonBase,
  ClickAwayListener,
  Divider,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Paper,
  Popper,
  Stack,
  Typography,
} from "@mui/material";

import { useNavigate } from "react-router-dom";
import AccountCircleOutlinedIcon from "@mui/icons-material/AccountCircleOutlined";
import HttpsOutlinedIcon from "@mui/icons-material/HttpsOutlined";

import Transitions from "components/@extended/Transitions";
import LogoutIcon from "../../../../../components/Icons/logout";
import { logout } from "../../../../../api/api-functions";

// tab panel wrapper
function TabPanel({ children, value, index, ...other }) {
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`profile-tabpanel-${index}`}
      aria-labelledby={`profile-tab-${index}`}
      {...other}
    >
      {value === index && children}
    </div>
  );
}

TabPanel.propTypes = {
  children: PropTypes.node,
  index: PropTypes.any.isRequired,
  value: PropTypes.any.isRequired,
};

// ==============================|| HEADER CONTENT - PROFILE ||============================== //

const Profile = () => {
  const navigate = useNavigate();

  const username = localStorage.getItem("username");
  const role = localStorage.getItem("role");

  const roles = {
    isAdmin: "Admin",
    isAuditHead: "Audit Head",
    isAuditor: "Auditor",
    isExecutor: "Executor",
    fromSSBD: "SSBD",
  };

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error("Error logging out:", error);
    } finally {
      navigate("/login");
      localStorage.clear();
      sessionStorage.clear();
    }
  };

  const anchorRef = useRef(null);
  const [open, setOpen] = useState(false);
  const handleToggle = () => {
    setOpen((prevOpen) => !prevOpen);
  };

  const handleClose = (event) => {
    if (anchorRef.current && anchorRef.current.contains(event.target)) {
      return;
    }
    setOpen(false);
  };

  const iconBackColorOpen = "grey.300";

  return (
    <Box sx={{ flexShrink: 0, ml: 0.75 }}>
      <ButtonBase
        sx={{
          p: 0.5,
          bgcolor: open ? iconBackColorOpen : "transparent",
          borderRadius: 3,
          "&:hover": { bgcolor: "secondary.lighter" },
        }}
        aria-label="open profile"
        ref={anchorRef}
        aria-controls={open ? "profile-grow" : undefined}
        aria-haspopup="true"
        onClick={handleToggle}
      >
        <Stack direction="row" spacing={1} alignItems="center" sx={{ p: 0.5 }}>
          <AccountCircleOutlinedIcon style={{ fontSize: "1.3rem" }} />
          <Typography sx={{ fontWeight: 700 }}>
            {username?.toUpperCase()}
          </Typography>
        </Stack>
      </ButtonBase>
      <Popper
        placement="bottom-end"
        open={open}
        anchorEl={anchorRef.current}
        role={undefined}
        transition
        disablePortal
      >
        {({ TransitionProps }) => (
          <Transitions type="fade" in={open} {...TransitionProps}>
            {open && (
              <Paper
                elevation={3}
                sx={{
                  // boxShadow: theme.customShadows.z1,
                  width: 250,
                  borderRadius: "10px",
                }}
              >
                <ClickAwayListener onClickAway={handleClose}>
                  <Box>
                    <Stack
                      direction="row"
                      spacing={1.25}
                      alignItems="center"
                      sx={{ px: 2, py: 1 }}
                    >
                      <AccountCircleOutlinedIcon
                        style={{ fontSize: "1.9rem" }}
                      />
                      <Stack>
                        <Typography variant="h4" sx={{ fontWeight: 700 }}>
                          {roles[role]}
                        </Typography>
                        <Typography variant="h6">{username}</Typography>
                      </Stack>
                    </Stack>
                    <Divider />
                    <List component="nav">
                      <ListItemButton
                        sx={{
                          m: "1px 5px",
                          borderRadius: "5px",
                          gap: "8px",
                        }}
                        onClick={() => navigate("/change-password")}
                      >
                        <ListItemIcon>
                          <HttpsOutlinedIcon
                            style={{ color: "#333", fontSize: 20 }}
                          />
                        </ListItemIcon>
                        <ListItemText primary="Change Password" />
                      </ListItemButton>

                      <ListItemButton
                        sx={{
                          m: "1px 5px",
                          borderRadius: "5px",
                          gap: "8px",
                        }}
                        onClick={handleLogout}
                      >
                        <ListItemIcon>
                          <LogoutIcon
                            color="red"
                            size={18}
                            style={{ marginLeft: "2px" }}
                          />
                        </ListItemIcon>
                        <ListItemText primary="Logout" sx={{ color: "red" }} />
                      </ListItemButton>
                    </List>
                  </Box>
                </ClickAwayListener>
              </Paper>
            )}
          </Transitions>
        )}
      </Popper>
    </Box>
  );
};

export default Profile;
