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

// Buyer bucket: Dashboard, Search-Data, PO-Data, RC Overlap, Buyer Remarks
// Report. No Risk-Categorization for buyers.
const buyerNavItems = [
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

// Procurement Manager bucket: everything a buyer sees, plus
// Risk-Categorization. The page is VIEW-ONLY for PMs - only admin can
// change criticality (enforced in the form component and must also be
// enforced in the backend endpoint).
const procurementManagerNavItems = [
  ...buyerNavItems,
  {
    id: "risk-categorization",
    title: "Risk-Categorization",
    type: "item",
    url: "/risk-categorization",
    icon: icons.LowPriorityRoundedIcon,
    breadcrumbs: false,
  },
];

// SSBDigital - full-visibility, read-only role (see backend Role.isSsbDigital).
const ssbDigitalNavItems = [
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
  {
    id: "processing-history",
    title: "Processing History",
    type: "item",
    url: "/processing-history",
    icon: icons.ManageSearchRoundedIcon,
    breadcrumbs: false,
  },
  {
    id: "accumulated-exports",
    title: "Accumulated Exports",
    type: "item",
    url: "/accumulated-exports",
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

  // Buyer and Procurement Manager now have separate buckets
  isBuyer: buyerNavItems,
  isProcurementManager: procurementManagerNavItems,

  ssbDigital: ssbDigitalNavItems,

  // optional old bucket name - kept pointing at the PM bucket
  buyerOrPM: procurementManagerNavItems,
};

export default menuItems;
