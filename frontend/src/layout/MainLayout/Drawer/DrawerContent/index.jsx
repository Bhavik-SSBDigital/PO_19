import { Box, Divider, MenuItem, TextField } from "@mui/material";
import { useDispatch, useSelector } from "react-redux";
import Navigation from "./Navigation";
import SimpleBar from "components/third-party/SimpleBar";
import { dataViewType } from "store/reducers/menu";
import ModuleMenu from "./ModuleMenu";

// ==============================|| DRAWER CONTENT ||============================== //

const DrawerContent = () => {
  const dispatch = useDispatch();

  const { dataViewType: module } = useSelector((state) => state.menu);

  const allowedModules = JSON.parse(localStorage.getItem("allowedModules"));
  const moduleTypes =
    localStorage.getItem("role") === "isAuditor"
      ? allowedModules
      : ["PJV", "PO", "BPV", "NONPO"];

  return (
    <SimpleBar
      sx={{
        "& .simplebar-content": {
          display: "flex",
          flexDirection: "column",
          height: "100%",
        },
        height: "100%",
      }}
    >
      <ModuleMenu />

      <Divider sx={{ my: "13px", borderColor: "#959595ff" }} />

      <Navigation />

      <Box sx={{ flex: 1 }} />
    </SimpleBar>
  );
};

export default DrawerContent;
