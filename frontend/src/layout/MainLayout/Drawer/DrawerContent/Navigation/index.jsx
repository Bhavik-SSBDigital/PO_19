// material-ui
import { Box } from "@mui/material";

// project import
import menuItem from "layout/data";
import NavItem from "./NavItem";

const Navigation = () => {
  const roles = {
    isAdmin: "admin",
    isAuditHead: "head",
    isAuditor: "auditor",
    isExecutor: "executor",
    SSBD: "ssbdUser",
    fromSSBD: "ssbdUser",
  };
  
  const role = localStorage.getItem("role");
  const rolename = roles[role] || role;
  
  // 1. Get the base items for the role
  const baseItems = menuItem?.[rolename] || [];

  // 2. Grab the dashboard permission from storage. 
  // (localStorage stores things as strings, so we check if it strictly equals "false")
  const storedDashboardAccess = localStorage.getItem("canViewDashboard");
  const canViewDashboard = storedDashboardAccess === "false" ? false : true; 

  // 3. FILTER the array before rendering!
  const items = baseItems.filter((item) => {
    if (item.id === "custom-dashboard") {
      return canViewDashboard; // Keep it if true, remove it if false
    }
    return true; // Keep all other menu items
  });

  return (
    <Box>
      {items?.map((menuItem) => {
        return <NavItem key={menuItem.id} item={menuItem} />;
      })}
    </Box>
  );
};

export default Navigation;