// assets
import SpeedRoundedIcon from "@mui/icons-material/SpeedRounded";
import LightModeRoundedIcon from "@mui/icons-material/LightModeRounded";
import LowPriorityRoundedIcon from "@mui/icons-material/LowPriorityRounded";
import ErrorOutlineRoundedIcon from "@mui/icons-material/ErrorOutlineRounded";
import ManageSearchRoundedIcon from "@mui/icons-material/ManageSearchRounded";
import AssignmentTurnedInRoundedIcon from "@mui/icons-material/AssignmentTurnedInRounded";
import ManageAccountsOutlinedIcon from "@mui/icons-material/ManageAccountsOutlined";
import PlaylistAddCheckRoundedIcon from "@mui/icons-material/PlaylistAddCheckRounded";
import AdminPanelSettingsOutlinedIcon from "@mui/icons-material/AdminPanelSettingsOutlined";
// icons
const icons = {
  SpeedRoundedIcon,
  LightModeRoundedIcon,
  LowPriorityRoundedIcon,
  ErrorOutlineRoundedIcon,
  ManageSearchRoundedIcon,
  AssignmentTurnedInRoundedIcon,
  ManageAccountsOutlinedIcon,
  PlaylistAddCheckRoundedIcon,
  AdminPanelSettingsOutlinedIcon,
};

// ==============================|| MENU ITEMS BY ROLE ||============================== //

const adminNavItems = [
  {
    id: "custom-dashboard",
    title: "Dashboard",
    type: "item",
    url: "/",
    icon: icons.SpeedRoundedIcon,
    breadcrumbs: false,
  },
  {
    id: "createUser",
    title: "User Management",
    type: "item",
    url: "/manage-users",
    icon: icons.ManageAccountsOutlinedIcon,
    breadcrumbs: false,
  },
  {
    id: "search-executor",
    title: "Search-Data",
    type: "item",
    url: "/search-data",
    icon: icons.ManageSearchRoundedIcon,
    breadcrumbs: false,
  },
  {
    id: "check-invoice-item-executor",
    title: "Check Invoice item",
    type: "item",
    url: "/invoice-list",
    icon: icons.PlaylistAddCheckRoundedIcon,
    breadcrumbs: false,
  },
  {
    id: "issue-tracker",
    title: "Issue-Tracker",
    type: "item",
    url: "/issue-tracker",
    icon: icons.ErrorOutlineRoundedIcon,
    breadcrumbs: false,
  },
  {
    id: "risk-categorization",
    title: "Risk-Categorization",
    type: "item",
    url: "/risk-categorization",
    icon: icons.LowPriorityRoundedIcon,
    breadcrumbs: false,
  },
  {
    id: "visibility-settings",
    title: "Visibility-Settings",
    type: "item",
    url: "/visibility-settings",
    icon: icons.LightModeRoundedIcon,
    breadcrumbs: false,
  },
];
const headNavItems = [
  {
    id: "custom-dashboard",
    title: "Dashboard",
    type: "item",
    url: "/",
    icon: icons.SpeedRoundedIcon,
    breadcrumbs: false,
  },
  {
    id: "search",
    title: "Search-Data",
    type: "item",
    url: "/search-data",
    icon: icons.ManageSearchRoundedIcon,
    breadcrumbs: false,
  },

  {
    id: "check-invoice-item",
    title: "Check Invoice item",
    type: "item",
    url: "/invoice-list",
    icon: icons.PlaylistAddCheckRoundedIcon,
    breadcrumbs: false,
  },
  {
    id: "issue-tracker",
    title: "Issue-Tracker",
    type: "item",
    url: "/issue-tracker",
    icon: icons.ErrorOutlineRoundedIcon,
    breadcrumbs: false,
  },
  {
    id: "risk-categorization",
    title: "Risk-Categorization",
    type: "item",
    url: "/risk-categorization",
    icon: icons.LowPriorityRoundedIcon,
    breadcrumbs: false,
  },
  {
    id: "visibility-settings",
    title: "Visibility-Settings",
    type: "item",
    url: "/visibility-settings",
    icon: icons.LightModeRoundedIcon,
    breadcrumbs: false,
  },
];
const executorNavItems = [
  {
    id: "custom-dashboard",
    title: "Dashboard",
    type: "item",
    url: "/",
    icon: icons.SpeedRoundedIcon,
    breadcrumbs: false,
  },
  {
    id: "search-executor",
    title: "Search-Data",
    type: "item",
    url: "/search-data",
    icon: icons.ManageSearchRoundedIcon,
    breadcrumbs: false,
  },

  {
    id: "risk-categorization",
    title: "Risk-Categorization",
    type: "item",
    url: "/risk-categorization",
    icon: icons.LowPriorityRoundedIcon,
    breadcrumbs: false,
  },
  {
    id: "check-invoice-item-executor",
    title: "Check Invoice item",
    type: "item",
    url: "/invoice-list",
    icon: icons.PlaylistAddCheckRoundedIcon,
    breadcrumbs: false,
  },
  {
    id: "issue-tracker",
    title: "Issue-Tracker",
    type: "item",
    url: "/issue-tracker",
    icon: icons.ErrorOutlineRoundedIcon,
    breadcrumbs: false,
  },
  {
    id: "visibility-settings",
    title: "Visibility-Settings",
    type: "item",
    url: "/visibility-settings",
    icon: icons.LightModeRoundedIcon,
    breadcrumbs: false,
  },
];
const ssbdNavItems = [
  {
    id: "custom-dashboard",
    title: "Dashboard",
    type: "item",
    url: "/",
    icon: icons.SpeedRoundedIcon,
    breadcrumbs: false,
  },
  {
    id: "issue-tracker",
    title: "Issue-Tracker",
    type: "item",
    url: "/issue-tracker",
    icon: icons.ErrorOutlineRoundedIcon,
    breadcrumbs: false,
  },
  {
    id: "search",
    title: "Search-Data",
    type: "item",
    url: "/search-data",
    icon: icons.ManageSearchRoundedIcon,
    breadcrumbs: false,
  },
  {
    id: "invoice-list",
    title: "Check Invoice item",
    type: "item",
    url: "/invoice-list",
    icon: icons.PlaylistAddCheckRoundedIcon,
    breadcrumbs: false,
  },
  {
    id: "risk-categorization",
    title: "Risk-Categorization",
    type: "item",
    url: "/risk-categorization",
    icon: icons.LowPriorityRoundedIcon,
    breadcrumbs: false,
  },
];
const auditorNavItems = [
  // ADD THIS OBJECT
  {
    id: "custom-dashboard",
    title: "Dashboard",
    type: "item",
    url: "/",
    icon: icons.SpeedRoundedIcon,
    breadcrumbs: false,
  },
  {
    id: "check-invoice-item",
    title: "Check Invoice item",
    type: "item",
    url: "/check-invoice-item",
    icon: icons.PlaylistAddCheckRoundedIcon,
    breadcrumbs: false,
  },
  {
    id: "issue-tracker",
    title: "Issue-Tracker",
    type: "item",
    url: "/issue-tracker",
    icon: icons.ErrorOutlineRoundedIcon,
    breadcrumbs: false,
  },
];

// ==============================|| MENU ITEMS ||============================== //

const menuItems = {
  admin: adminNavItems,
  head: headNavItems,
  auditor: auditorNavItems,
  executor: executorNavItems,
  ssbdUser: ssbdNavItems,
};

export default menuItems;
