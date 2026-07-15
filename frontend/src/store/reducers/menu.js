// types
import { createSlice } from "@reduxjs/toolkit";

const role = localStorage.getItem("role") === "isAuditor";
const allowedModules = localStorage.getItem("allowedModules");

// initial state
const initialState = {
  openItem: ["dashboard"],
  defaultId: "dashboard",
  openComponent: "buttons",
  drawerOpen: false,
  componentDrawerOpen: true,
  dataViewType:
    localStorage.getItem("dataViewType") ||
    (role ? allowedModules[0] || "" : "PJV"),
};

// ==============================|| SLICE - MENU ||============================== //

const menu = createSlice({
  name: "menu",
  initialState,
  reducers: {
    activeItem(state, action) {
      state.openItem = action.payload.openItem;
    },

    activeComponent(state, action) {
      state.openComponent = action.payload.openComponent;
    },

    openDrawer(state, action) {
      state.drawerOpen = action.payload.drawerOpen;
    },

    openComponentDrawer(state, action) {
      state.componentDrawerOpen = action.payload.componentDrawerOpen;
    },

    dataViewType(state, action) {
      localStorage.setItem("dataViewType", action.payload.dataViewType);
      state.dataViewType = action.payload.dataViewType;
    },
  },
});

export default menu.reducer;

export const {
  activeItem,
  activeComponent,
  openDrawer,
  openComponentDrawer,
  dataViewType,
} = menu.actions;
