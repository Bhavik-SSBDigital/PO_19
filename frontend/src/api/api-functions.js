import apiClient, { post } from "./api-client";

export const getPurchaseGroupsList = () => post("/reports/purchase-groups", {});
export const submitPoRemark = (payload) => post("/po-remarks", payload);
export const getPoRemarks = (payload) => post("/po-remarks/search", payload);
export const deletePoRemark = (id) => apiClient.delete(`/po-remarks/${id}`);
export const logout = async () => {
  try {
    const token = localStorage.getItem("token");
    const userLogs = await JSON.parse(
      localStorage.getItem("logsDetails") || "{}",
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

// Buyer Remarks Report — Admin/PM see every buyer's remarks; a Buyer sees
// only remarks they personally submitted. Uses apiClient directly (not the
// `post` helper) because the download call needs `responseType: "blob"`
// passed through, same pattern as `logout` above needing custom headers.
export const getPoRemarksReport = (payload) =>
  apiClient.post("/reports/po-remarks-report", payload);

export const downloadPoRemarksReport = (payload) =>
  apiClient.post("/reports/po-remarks-report/download", payload, {
    responseType: "blob",
  });

export const getPoRemarksReportFilterOptions = () =>
  apiClient.post("/reports/po-remarks-report/filters", {});
