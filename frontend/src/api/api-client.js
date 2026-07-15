import axios from "axios";

// Base URL for the API
const BASE_URL =
  import.meta.env.VITE_APP_BACKEND_URL || "http://localhost:5000";

// Create an Axios instance
const apiClient = axios.create({
  baseURL: BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

// Request interceptor to add the token to headers
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("token");

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

export const get = async (url, params = {}) => {
  try {
    const response = await apiClient.get(url, { params });
    return response.data;
  } catch (error) {
    console.error("GET request error:", error);
    throw error;
  }
};

// POST request utility
export const post = async (url, data) => {
  try {
    const response = await apiClient.post(url, data);
    return response.data;
  } catch (error) {
    console.error("POST request error:", error);
    throw error;
  }
};
export const postMedia = async (url, data, config) => {
  try {
    const response = await apiClient.post(url, data, config);
    return response.data;
  } catch (error) {
    console.error("POST request error:", error);
    throw error;
  }
};

// PUT request utility
export const put = async (url, data) => {
  try {
    const response = await apiClient.put(url, data);
    return response.data;
  } catch (error) {
    console.error("PUT request error:", error);
    throw error;
  }
};

// DELETE request utility
export const del = async (url) => {
  try {
    const response = await apiClient.delete(url);
    return response.data;
  } catch (error) {
    console.error("DELETE request error:", error);
    throw error;
  }
};

export default apiClient;
