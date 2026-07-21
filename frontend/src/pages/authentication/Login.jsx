
// material-ui
import { Typography } from "@mui/material";

// project import
import AuthLogin from "./auth-forms/AuthLogin";
import AuthWrapper from "./AuthWrapper";

// ================================|| LOGIN ||================================ //

const Login = () => (
  <AuthWrapper>
    {/* <Typography
      variant="h3"
      align="center"
      sx={{
        fontWeight: 800,
        textTransform: "uppercase",
        color: "primary.dark",
        width: "100%",
        mt: 1,
        mb: 3,
      }}
    >
      AI Based P2P Compliance
    </Typography> */}
    <Typography
      variant="h4"
      sx={{ fontWeight: 700, textTransform: "uppercase" }}
    >
      Login
    </Typography>
    <Typography color="textSecondary" gutterBottom>
      Please enter your username and password to login.
    </Typography>
    <AuthLogin />
  </AuthWrapper>
);

export default Login;
