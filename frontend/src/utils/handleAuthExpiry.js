// When the backend says the session is gone, clear the stale login and
// reload so the route guard sends the user to /login (instead of leaving
// them on a page full of "Failed to load" toasts).
const SESSION_ERRORS = ["Missing access token", "Invalid or expired session"];
const LOGIN_KEYS = ["token", "role", "canViewDashboard", "username"];

export const attachAuthExpiryHandler = (instance) => {
  instance.interceptors.response.use(
    (response) => response,
    (error) => {
      const status = error?.response?.status;
      const message = error?.response?.data?.message;
      if (
        status === 401 &&
        SESSION_ERRORS.includes(message) &&
        localStorage.getItem("token")
      ) {
        LOGIN_KEYS.forEach((k) => localStorage.removeItem(k));
        window.location.reload();
      }
      return Promise.reject(error);
    },
  );
};
