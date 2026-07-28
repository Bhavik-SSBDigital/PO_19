// material-ui
import { Box } from "@mui/material";

// project import
import menuItem from "layout/data";
import NavItem from "./NavItem";
import { getRbac } from "utils/session";

const Navigation = () => {
  // Maps the single `role` string this app stores in localStorage to a
  // bucket key in layout/data.js's `menuItems`.
  //
  // FIX: the original map had no entry for "isBuyer" / "isProcurementManager",
  // so those two roles previously fell through to `menuItem[role] || []`
  // and got an EMPTY menu (not even Dashboard). Both now map to the new
  // "buyerOrPM" bucket.
  const roles = {
    isAdmin: "admin",
    isBuyer: "buyerOrPM",
    isProcurementManager: "buyerOrPM",
    isAuditHead: "head",
    isAuditor: "auditor",
    isExecutor: "executor",
    SSBD: "ssbdUser",
    fromSSBD: "ssbdUser",
  };

  const { role, isAdmin } = getRbac();
  const rolename = roles[role] || role;

  // 1. Get the base items for this role's bucket.
  const baseItems = menuItem?.[rolename] || [];

  // 2. Extra safety net on top of the bucket itself: even if a bucket's
  // definition ever changes, User Management always requires isAdmin,
  // full stop.
  const items = baseItems.filter((item) => {
    // if (item.id === "custom-dashboard") return canViewDashboard;
    if (item.id === "createUser") return isAdmin;
    return true;
  });

  return (
    <Box>
      {items?.map((mi) => (
        <NavItem key={mi.id} item={mi} />
      ))}
    </Box>
  );
};

export default Navigation;
