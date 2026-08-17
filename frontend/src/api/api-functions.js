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

// ---------------------------------------------------------------------------
// HEADER-LEVEL (PO-wide) system — NEW
// Completely separate from the LINE-LEVEL functions above (submitPoRemark,
// getPoRemarks, updatePoRemark, deletePoRemark, setAuditResultCheckedStatus,
// all of which act on a single AuditResult line item). Everything below
// acts on a whole PO number instead — its own remarks table, its own
// close/reopen lock, unaffected by and unaffecting any line item's own
// lock/remarks.
// ---------------------------------------------------------------------------

// Fetches a PO's header-level checks (points 7, 8, 9, 11-15, 19) + lock
// status + line-item picker list. This is what the search page calls when
// a PO number is searched without a line item.
export const getPOHeaderSummary = (payload) =>
  post("/getPOHeaderSummary", payload);

// Header-level remarks — keyed by (po_number, pointNo), not tied to any
// line item.
export const getPoHeaderRemarks = (payload) =>
  post("/po-header-remarks/search", payload);
export const submitPoHeaderRemark = (payload) =>
  post("/po-header-remarks", payload);
export const updatePoHeaderRemark = (payload) =>
  post("/updatePoHeaderRemark", payload);
export const deletePoHeaderRemark = (id) =>
  apiClient.delete(`/po-header-remarks/${id}`);

// THE PO-LEVEL close/reopen toggle — separate system from
// setAuditResultCheckedStatus above, which is line-level only. Closing a
// PO's header here never touches any AuditResult row, and vice versa.
export const setPoHeaderCheckedStatus = (payload) =>
  post("/setPoHeaderCheckedStatus", payload);

// Header-level (PO-wide) drilldown for the dashboard's "PO Header-Level
// Compliance" chart — results are PO numbers, not PO line items.
export const getExecutiveHeaderDrilldown = (payload) =>
  post("/reports/executive-header-drilldown", payload);
