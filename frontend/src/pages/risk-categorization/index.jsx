import { Typography } from "@mui/material";
import RiskCategorizationForm from "./components/form";

const EDITOR_ROLES = ["admin", "isAdmin", "isProcurementManager"];

const RiskCategorization = () => {
  const role = localStorage.getItem("role");
  const canEdit = EDITOR_ROLES.includes(role);
  console.log("role:", role, "canEdit:", canEdit);

  return (
    <>
      <Typography variant="h4" sx={{ fontWeight: 700 }} mb={2}>
        Risk Categorization Master
      </Typography>
      <Typography variant="body1" color="textSecondary" mb={2}>
        Every audit checkpoint's number and description are fixed.{" "}
        {canEdit
          ? "As an admin or procurement manager you can change how critical each one is — that's the only editable field — "
          : "Criticality can only be changed by an admin or procurement manager. You can view it here, "}
        and it drives the "Exceptions by Severity" chart and "High-Risk Exceptions" KPI.
      </Typography>
      <RiskCategorizationForm />
    </>
  );
};
export default RiskCategorization;