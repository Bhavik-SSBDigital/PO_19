import * as React from "react";

import { Menu, MenuItem, Button } from "@mui/material";
import { useDispatch, useSelector } from "react-redux";
import UnfoldMoreRoundedIcon from "@mui/icons-material/UnfoldMoreRounded";
import { dataViewType } from "store/reducers/menu";
export default function ModuleMenu() {
  const dispatch = useDispatch();
  const [anchorEl, setAnchorEl] = React.useState(null);
  const open = Boolean(anchorEl);
  const { dataViewType: module } = useSelector((state) => state.menu);

  const allowedModules = JSON.parse(localStorage.getItem("allowedModules"));
  const moduleTypes =
    localStorage.getItem("role") === "isAuditor"
      ? allowedModules
      : ["PJV", "PO", "BPV", "NONPO"];

  const handleClick = (event) => {
    setAnchorEl(event.currentTarget);
  };
  const handleClose = () => {
    setAnchorEl(null);
  };

  return (
    <div>
      <Button
        id="basic-button"
        aria-controls={open ? "basic-menu" : undefined}
        aria-haspopup="true"
        // fullWidth
        aria-expanded={open ? "true" : undefined}
        onClick={handleClick}
        sx={{
          fontWeight: 700,
          bgcolor: "#abb7fe",
          color: "black",
          width: "92%",
          px: 2,
          mx: "10px",
          "&:hover": { bgcolor: "#abb7fe" },
          borderRadius: "14px",
          justifyContent: "space-between",
          border: "2px solid #dee1f7ff",
        }}
        endIcon={<UnfoldMoreRoundedIcon />}
      >
        {module === "NONPO" ? "Non-PO" : module}
      </Button>
      <Menu
        id="basic-menu"
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        slotProps={{ list: { "aria-labelledby": "basic-button" } }}
      >
        {moduleTypes.map((mod) => (
          <MenuItem
            key={mod}
            sx={{ minWidth: "220px" }}
            onClick={() => {
              dispatch(dataViewType({ dataViewType: mod }));
              handleClose();
            }}
          >
            {mod === "NONPO" ? "Non-PO" : mod}
          </MenuItem>
        ))}
      </Menu>
    </div>
  );
}
