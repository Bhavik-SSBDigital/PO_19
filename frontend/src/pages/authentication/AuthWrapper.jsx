import PropTypes from "prop-types";

// material-ui
import { Box } from "@mui/material";

// project import
import AuthCard from "./AuthCard";
// import Logo from "components/Logo";
// import AuthFooter from "components/cards/AuthFooter";

// // assets
// import AuthBackground from "assets/images/auth/AuthBackground";

// ==============================|| AUTHENTICATION - WRAPPER ||============================== //

const AuthWrapper = ({ children }) => (
  <Box
    sx={{
      minHeight: "100vh",
      width: "100%",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    }}
  >
    {/* <AuthBackground /> */}
    <AuthCard>{children}</AuthCard>
  </Box>
);

AuthWrapper.propTypes = {
  children: PropTypes.node,
};

export default AuthWrapper;
