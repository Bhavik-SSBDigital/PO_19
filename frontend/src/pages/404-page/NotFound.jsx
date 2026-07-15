import {
  Box,
  Typography,
  Button,
  Stack,
  Grid,
  useTheme,
  useMediaQuery,
} from "@mui/material";
import { useNavigate } from "react-router-dom";
import NotFoundImage from "assets/404.png";

const NotFoundPage = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  const role = localStorage.getItem("role");

  const roles = {
    isAdmin: "/",
    isAuditHead: "/",
    isAuditor: "/check-invoice-item",
    isExecutor: "/",
    fromSSBD: "/",
  };

  const homeRoute = roles[role] || "/";

  return (
    <Box
      minHeight="100vh"
      display="flex"
      alignItems="center"
      justifyContent="center"
      bgcolor="#f9fafb"
      px={2}
      position="fixed"
      flexDirection="column"
      height="100vh"
      width="100vw"
      top="0px"
      left="0px"
      zIndex="9999"
    >
      <Grid
        container
        spacing={4}
        alignItems="center"
        justifyContent="center"
        flexWrap={"wrap-reverse"}
        maxWidth="md"
      >
        {/* Text Section */}
        <Grid item xs={12} sm={6} textAlign={isMobile ? "center" : "left"}>
          <Typography
            variant="h1"
            fontWeight="bold"
            // color="text.primary"
            sx={{ color: "#3B1A6B", fontWeight: 700 }}
            gutterBottom
          >
            So Sorry!
          </Typography>

          <Typography
            variant="h2"
            sx={{ color: "#B789F0", fontWeight: 700 }}
            gutterBottom
          >
            The page you are looking for cannot be found
          </Typography>

          <Stack
            direction="row"
            spacing={2}
            justifyContent={isMobile ? "center" : "flex-start"}
          >
            <Button
              variant="contained"
              sx={{
                backgroundColor: "#3B1A6B",
                color: "white",
                width: "110px",
              }}
              onClick={() => navigate(homeRoute)}
            >
              AIA Home
            </Button>
            <Button
              variant="outlined"
              onClick={() => navigate(-1)}
              sx={{ color: "#3B1A6B", borderColor: "#3B1A6B", width: "110px" }}
            >
              Go Back
            </Button>
          </Stack>
        </Grid>

        {/* Image Section */}
        <Grid item xs={12} sm={6} textAlign="center">
          <Box
            component="img"
            src={NotFoundImage}
            alt="404 Illustration"
            width="100%"
            maxWidth={isMobile ? 300 : 400}
            mx="auto"
          />
        </Grid>
      </Grid>
    </Box>
  );
};

export default NotFoundPage;
