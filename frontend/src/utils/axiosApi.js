import axios from "axios";

// Base URL for the API
const BASE_URL =
  import.meta.env.VITE_APP_BACKEND_URL || "http://localhost:5000";

// Create an Axios instance
const axiosInstance = axios.create({
  baseURL: BASE_URL,
  headers: { "Content-Type": "application/json" },
});

// Request interceptor to add the token to headers
axiosInstance.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor to handle errors and refresh tokens
// axiosInstance.interceptors.response.use(
//   (response) => response,
//   async (error) => {
//     const originalRequest = error.config;

//     // If token is expired, try to refresh it
//     if (error.response?.status === 401 && !originalRequest._retry) {
//       originalRequest._retry = true;
//       try {
//         const refreshToken = localStorage.getItem("refreshToken");
//         if (refreshToken) {
//           const { data } = await axios.post(`${BASE_URL}/auth/refresh`, {
//             refreshToken,
//           });

//           // Save new token
//           localStorage.setItem("accessToken", data.accessToken);

//           // Update header and retry the request
//           originalRequest.headers.Authorization = `Bearer ${data.accessToken}`;
//           return axiosInstance(originalRequest);
//         }
//       } catch (refreshError) {
//         console.error("Token refresh failed:", refreshError);
//         // Optionally, handle logout or token removal here
//         localStorage.removeItem("accessToken");
//         localStorage.removeItem("refreshToken");
//         window.location.href = "/login"; // Redirect to login page
//         return Promise.reject(refreshError);
//       }
//     }

//     // Return any other errors
//     return Promise.reject(error);
//   }
// );

// GET request utility
export const get = async (url, params = {}) => {
  try {
    const response = await axiosInstance.get(url, { params });
    return response.data;
  } catch (error) {
    console.error("GET request error:", error);
    throw error;
  }
};

export const post = async (url, data = {}, config = {}, params = {}) => {
  try {
    const response = await axiosInstance.post(url, data, { ...config, params });
    return response.data;
  } catch (error) {
    console.error("POST request error:", error);
    throw error;
  }
};
export const postMedia = async (url, data, config) => {
  try {
    const response = await axiosInstance.post(url, data, config);
    return response.data;
  } catch (error) {
    console.error("POST request error:", error);
    throw error;
  }
};

// PUT request utility
export const put = async (url, data) => {
  try {
    const response = await axiosInstance.put(url, data);
    return response.data;
  } catch (error) {
    console.error("PUT request error:", error);
    throw error;
  }
};

// DELETE request utility
export const del = async (url) => {
  try {
    const response = await axiosInstance.delete(url);
    return response.data;
  } catch (error) {
    console.error("DELETE request error:", error);
    throw error;
  }
};

export default axiosInstance;
