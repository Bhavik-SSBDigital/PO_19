import { Typography } from "@mui/material";
import VisibilitySettingsForm from "./components/form";

const VisibilitySettings = () => {
  return (
    <>
      <Typography variant="h4" sx={{ fontWeight: 700 }} mb={2}>
        Visibility Settings
      </Typography>
      {/* <Typography variant="body1" color="textSecondary" mb={2}>
        Use the Visibility Settings page to choose which table columns should be
        visible by selecting the corresponding checkboxes.
      </Typography> */}
      <VisibilitySettingsForm />
    </>
  );
};
export default VisibilitySettings;
