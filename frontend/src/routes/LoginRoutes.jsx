import { lazy } from "react";

// project import
import Loadable from "components/Loadable";
import MinimalLayout from "layout/MinimalLayout";
import { Navigate } from "react-router-dom";

// render - login
const AuthLogin = Loadable(lazy(() => import("pages/authentication/Login")));
const ForgotPassword = Loadable(
  lazy(() => import("pages/authentication/ForgotPassword"))
);

// ==============================|| AUTH ROUTING ||============================== //

const LoginRoutes = {
  path: "/",
  element: <MinimalLayout />,
  children: [
    {
      path: "/",
      element: <Navigate to="/login" />,
    },
    {
      path: "/login",
      element: <AuthLogin />,
    },
    {
      path: "/forgot-password",
      element: <ForgotPassword />,
    },
  ],
};

export default LoginRoutes;
