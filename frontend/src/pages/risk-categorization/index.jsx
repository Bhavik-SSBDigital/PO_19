import { Typography } from "@mui/material";
import RiskCategorizationForm from "./components/form";

const RiskCategorization = () => {
  return (
    <>
      <Typography variant="h4" sx={{ fontWeight: 700 }} mb={2}>
        Risk Categorization Master
      </Typography>
      <Typography variant="body1" color="textSecondary" mb={2}>
        Every audit checkpoint's number and description are fixed. As an admin you can change how critical each one is —
        that's the only editable field — and it drives the "Exceptions by Severity" chart and "High-Risk Exceptions" KPI.
      </Typography>
      <RiskCategorizationForm />
    </>
  );
};
export default RiskCategorization;