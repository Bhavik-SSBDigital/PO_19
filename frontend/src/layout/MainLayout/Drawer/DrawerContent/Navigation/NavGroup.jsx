import PropTypes from "prop-types";
import { useSelector } from "react-redux";

// material-ui
import { Box, List, Typography } from "@mui/material";

// project import
import NavItem from "./NavItem";

// ==============================|| NAVIGATION - LIST GROUP ||============================== //

const NavGroup = ({ item }) => {
  return (
    <>
      {item.children?.map((menuItem) => {
        return <NavItem key={menuItem.id} item={menuItem} />;
      })}
    </>
  );
};

NavGroup.propTypes = {
  item: PropTypes.object,
};

export default NavGroup;
