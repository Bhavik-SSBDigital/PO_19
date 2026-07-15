import { Navigate, Outlet, useRoutes } from "react-router-dom";

// project import
import AuthenticationRoutes from "./LoginRoutes";
import MainRoutes from "./MainRoutes";
import NotFound from "../pages/404-page/NotFound";

// ==============================|| ROUTING RENDER ||============================== //

export default function ThemeRoutes() {
  const token = localStorage.getItem("token");
  const role = localStorage.getItem("role");

  const LoginErrorRoute = {
    path: "/",
    element: <Outlet />,
    children: [
      { path: "/login", element: <Navigate to="/" /> },
      { path: "/register", element: <Navigate to="/" /> },
    ],
  };

  let route = [];

  if (token && role) {
    route = [MainRoutes, LoginErrorRoute, { path: "*", element: <NotFound /> }];
  } else {
    route = [
      AuthenticationRoutes,
      { path: "*", element: <Navigate to="/login" /> },
    ];
  }
  return useRoutes(route);
}
