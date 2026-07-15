import PropTypes from "prop-types";

// material-ui
import { Box } from "@mui/material";

// project import
import MainCard from "components/MainCard";

// ==============================|| AUTHENTICATION - CARD WRAPPER ||============================== //

const AuthCard = ({ children, ...other }) => (
  <MainCard
    sx={{
      maxWidth: 430,
      borderRadius: 2,
      margin: 2,
      "& > *": {
        flexGrow: 1,
        flexBasis: "50%",
      },
    }}
    content={false}
    {...other}
    border={false}
    boxShadow
  >
    <Box sx={{ p: 3 }}>{children}</Box>
  </MainCard>
);

AuthCard.propTypes = {
  children: PropTypes.node,
};

export default AuthCard;
