import apiClient, { post } from "./api-client";

export const getPurchaseGroupsList = () => post("/reports/purchase-groups", {});
export const submitPoRemark = (payload) => post("/po-remarks", payload);
export const getPoRemarks = (payload) => post("/po-remarks/search", payload);
export const deletePoRemark = (id) => apiClient.delete(`/po-remarks/${id}`);

export const logout = async (navigate) => {
  try {
    const token = localStorage.getItem("token");
    const userLogs = JSON.parse(localStorage.getItem("logsDetails") || "{}");

    await apiClient.post("/logout", userLogs, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
  } catch (error) {
    console.error("Logout failed:", error);
  } finally {
    localStorage.clear();
    sessionStorage.clear();

    if (navigate) {
      navigate("/login", { replace: true });
    }
  }
};

export const getPoData = (payload) => post("/reports/po-data", payload);
// export const getPurchaseGroupsForFilter = () =>
//   post("/reports/po-purchase-groups", {});
export const updatePoRemark = (payload) => post("/updatePoRemark", payload);

export const setAuditResultCheckedStatus = (payload) =>
  post("/setAuditResultCheckedStatus", payload);

export const getPurchaseGroupsForFilter = () =>
  post("/reports/purchase-groups", {});

export const getPoTypesForFilter = () => post("/reports/po-types", {});
export const getPlantsForFilter = () => post("/reports/plants", {});
export const getVendorsForFilter = () => post("/reports/vendors", {});
export const getBuyersForFilter = () => post("/reports/buyers", {});

export const getPoRemarksReport = (payload) =>
  apiClient.post("/reports/po-remarks-report", payload);

export const downloadPoRemarksReport = (payload) =>
  apiClient.post("/reports/po-remarks-report/download", payload, {
    responseType: "blob",
  });

export const getPoRemarksReportFilterOptions = () =>
  apiClient.post("/reports/po-remarks-report/filters", {});
