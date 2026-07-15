import { forwardRef, useEffect, useMemo } from "react";
import { Link, useLocation } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import {
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
} from "@mui/material";

// project import
import { activeItem } from "store/reducers/menu";

// ==============================|| NAVIGATION - LIST ITEM ||============================== //

const NavItem = ({ item }) => {
  const dispatch = useDispatch();
  const { pathname } = useLocation();
  const { openItem, dataViewType } = useSelector((state) => state.menu);

  // Determine if this item is selected
  const isSelected = useMemo(
    () => openItem.includes(item.id),
    [openItem, item.id]
  );

  // Set active menu item on page load or when pathname changes
  useEffect(() => {
    if (pathname.includes(item.url)) {
      dispatch(activeItem({ openItem: [item.id] }));
    }
  }, [pathname, item.url, item.id, dispatch]);

  // Handle click
  const handleClick = () => {
    dispatch(activeItem({ openItem: [item.id] }));
  };

  let listItemProps = {
    component: forwardRef((props, ref) => (
      <Link ref={ref} {...props} to={item.url} />
    )),
  };

  // Render icon if provided
  const itemIcon = useMemo(() => {
    if (!item.icon) return null;
    const Icon = item.icon;
    return <Icon sx={{ fontSize: "1.3rem" }} />;
  }, [item.icon]);

  // Determine display title
  const displayTitle = useMemo(() => {
    if (item.title === "Check Invoice item") {
      return (
        {
          PJV: "Check Invoice item",
          PO: "Check PO item",
          NONPO: "Check Non-PO item",
          BPV: "Check BPV item",
        }[dataViewType] || item.title
      );
    }
    return item.title;
  }, [item.title, dataViewType]);

  return (
    <ListItemButton
      {...listItemProps}
      onClick={handleClick}
      selected={isSelected}
      sx={{
        transition: "all 0.2s ease",
        zIndex: 1201,
        p: "4px",
        pl: "12px",
        m: "5px 10px",
        borderRadius: "14px",
        "&:hover": { bgcolor: "#7e8bd5c1" },
        "&:active": {
          transform: "translate(2px, 0)",
          transition: "transform 0.3s",
        },
        "&.Mui-selected": {
          bgcolor: "#abb8fec1",
          color: "#2e3780",
          boxShadow: "0 1px 3px rgba(0, 0, 0, 0.3)",
          border: "2px solid #dee1f7ff",
          p: "2px",
          pl: "10px",
          "&:hover": { bgcolor: "#8d9ae9c1" },
        },
      }}
      aria-current={isSelected ? "page" : undefined}
    >
      {itemIcon && (
        <ListItemIcon sx={{ minWidth: 28, color: "white" }}>
          {itemIcon}
        </ListItemIcon>
      )}
      <ListItemText
        primary={
          <Typography
            variant="h6"
            sx={{
              color: "white",
              fontWeight: isSelected ? 500 : 400,
              fontSize: "0.9rem",
            }}
          >
            {displayTitle}
          </Typography>
        }
      />
    </ListItemButton>
  );
};

export default NavItem;
