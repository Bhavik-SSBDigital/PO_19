import apiClient, { post } from "./api-client";

export const logout = async () => {
  try {
    const token = localStorage.getItem("token");
    const userLogs = await JSON.parse(
      localStorage.getItem("logsDetails") || "{}"
    );

    await apiClient.post("/logout", userLogs || {}, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (error) {
    console.error("Logout failed:", error);
  } finally {
    localStorage.clear();
    sessionStorage.clear();
  }
};
