import PropTypes from "prop-types";

// material-ui
import { useTheme } from "@mui/material/styles";

// project import
import DrawerHeaderStyled from "./DrawerHeaderStyled";
import Logo from "components/Logo";
import { Box, Typography } from "@mui/material";

// ==============================|| DRAWER HEADER ||============================== //

const DrawerHeader = ({ open }) => {
  const theme = useTheme();

  return (
    // only available in paid version
    <Box sx={{ display: "flex", px: 1, mt: 2, alignItems: "center", gap: "5px" }}>
      <Logo />
      <Typography
        style={{
          textAlign: "center",
          fontSize: "18px",
          color: "white",
          margin: 0,
          fontWeight: 700,
          // marginBottom: 10,
        }}
      >
        AI Enabled Digital Audit
      </Typography>
    </Box>
    // <DrawerHeaderStyled theme={theme} open={open}>
    // </DrawerHeaderStyled>
  );
};

DrawerHeader.propTypes = {
  open: PropTypes.bool,
};

export default DrawerHeader;
