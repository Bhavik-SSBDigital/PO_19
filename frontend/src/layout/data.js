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
    id: "po-data",
    title: "PO-Data",
    type: "item",
    url: "/po-data",
    icon: icons.PlaylistAddCheckRoundedIcon,
    breadcrumbs: false,
  },
  // NEW — standalone RC Overlap (rule 19) section
  {
    id: "rc-overlap",
    title: "RC Overlap",
    type: "item",
    url: "/rc-overlap",
    icon: icons.AssignmentTurnedInRoundedIcon,
    breadcrumbs: false,
  },
  // NEW — Buyer Remarks Report. Admin sees every buyer's remarks (per the
  // controller's isAdmin/isProcurementManager branch), same page Buyers/PM
  // already had access to below.
  {
    id: "po-remarks-report",
    title: "Buyer Remarks Report",
    type: "item",
    url: "/po-remarks-report",
    icon: icons.AssignmentTurnedInRoundedIcon,
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
    id: "po-data",
    title: "PO-Data",
    type: "item",
    url: "/po-data",
    icon: icons.PlaylistAddCheckRoundedIcon,
    breadcrumbs: false,
  },
  // NEW — standalone RC Overlap (rule 19) section
  {
    id: "rc-overlap",
    title: "RC Overlap",
    type: "item",
    url: "/rc-overlap",
    icon: icons.AssignmentTurnedInRoundedIcon,
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
    id: "po-data",
    title: "PO-Data",
    type: "item",
    url: "/po-data",
    icon: icons.PlaylistAddCheckRoundedIcon,
    breadcrumbs: false,
  },
  // NEW — standalone RC Overlap (rule 19) section
  {
    id: "rc-overlap",
    title: "RC Overlap",
    type: "item",
    url: "/rc-overlap",
    icon: icons.AssignmentTurnedInRoundedIcon,
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
    id: "search",
    title: "Search-Data",
    type: "item",
    url: "/search-data",
    icon: icons.ManageSearchRoundedIcon,
    breadcrumbs: false,
  },
  {
    id: "po-data",
    title: "PO-Data",
    type: "item",
    url: "/po-data",
    icon: icons.PlaylistAddCheckRoundedIcon,
    breadcrumbs: false,
  },
  // NEW — standalone RC Overlap (rule 19) section
  {
    id: "rc-overlap",
    title: "RC Overlap",
    type: "item",
    url: "/rc-overlap",
    icon: icons.AssignmentTurnedInRoundedIcon,
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
  {
    id: "custom-dashboard",
    title: "Dashboard",
    type: "item",
    url: "/",
    icon: icons.SpeedRoundedIcon,
    breadcrumbs: false,
  },
];

// Buyer / Procurement Manager bucket.
// Per requirements: Dashboard, Search-Data, PO-Data only - no User
// Management, and (unlike admin/head/executor/ssbd) no Risk-Categorization
// either, since that wasn't in the list of pages these two roles should see.
// RC Overlap is added here too, right alongside PO-Data, since Buyers/PMs
// are exactly the users who need to see RC compliance status.
const buyerOrProcurementManagerNavItems = [
  {
    id: "custom-dashboard",
    title: "Dashboard",
    type: "item",
    url: "/",
    icon: icons.SpeedRoundedIcon,
    breadcrumbs: false,
  },
  {
    id: "search-buyer-pm",
    title: "Search-Data",
    type: "item",
    url: "/search-data",
    icon: icons.ManageSearchRoundedIcon,
    breadcrumbs: false,
  },
  {
    id: "po-data",
    title: "PO-Data",
    type: "item",
    url: "/po-data",
    icon: icons.PlaylistAddCheckRoundedIcon,
    breadcrumbs: false,
  },
  // NEW — standalone RC Overlap (rule 19) section
  {
    id: "rc-overlap",
    title: "RC Overlap",
    type: "item",
    url: "/rc-overlap",
    icon: icons.AssignmentTurnedInRoundedIcon,
    breadcrumbs: false,
  },
  {
    id: "po-remarks-report",
    title: "Buyer Remarks Report",
    type: "item",
    url: "/po-remarks-report",
    icon: icons.AssignmentTurnedInRoundedIcon,
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

  // Buyer + Procurement Manager
  isBuyer: buyerOrProcurementManagerNavItems,
  isProcurementManager: buyerOrProcurementManagerNavItems,

  // optional old bucket name
  buyerOrPM: buyerOrProcurementManagerNavItems,
};

export default menuItems;
