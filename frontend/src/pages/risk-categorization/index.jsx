import { Typography } from "@mui/material";
import RiskCategorizationForm from "./components/form";

const RiskCategorization = () => {
  return (
    <>
      <Typography variant="h4" sx={{ fontWeight: 700 }} mb={2}>
        Risk Categorization Master
      </Typography>
      {/* <Typography variant="body1" color="textSecondary" mb={2}>
        This is the Risk Categorization Master. It defines set points for
        categorizing risk levels as High, Medium, or Low
      </Typography> */}
      <RiskCategorizationForm />
    </>
  );
};
export default RiskCategorization;
