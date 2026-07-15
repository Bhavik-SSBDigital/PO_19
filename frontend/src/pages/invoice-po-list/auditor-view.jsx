import { useState, useEffect, useCallback } from "react";
import {
  Box,
  Button,
  Dialog,
  Grid,
  TextField,
  Typography,
  Chip,
  Tab,
  DialogContent,
  DialogTitle,
  IconButton,
  InputLabel,
  Pagination,
  Stack,
} from "@mui/material";
import { TabContext, TabList } from "@mui/lab";

import moment from "moment";
import { toast } from "react-toastify";
import { useSelector } from "react-redux";
import SortRoundedIcon from "@mui/icons-material/SortRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";

import { post } from "utils/axiosApi";
import DownloadTableToExcel from "./components/download-excel";
import TableAuditorView from "./components/table-auditor-view";

const DEFAULT_PAGE_SIZE = 30;

const defaultInputs = {
  fiscalYear: "",
  imported: "",
  vendor: "",
  amountMin: "",
  amountMax: "",
  minUnverified: "",
  sortBy: "",
  includeResults: "",
  paymentDocumentNumber: "",
  pjvInvoiceRefDoc: "",
  bpvPo: "",
  paymentDocumentDateFrom: "",
  paymentDocumentDateTo: "",
  auditedOnFrom: moment().subtract(1, "months").format("YYYY-MM-DD"),
  auditedOnTo: moment().endOf("day").format("YYYY-MM-DD"),
  manuallyVerifiedFrom: "",
  manuallyVerifiedTo: "",
  page: 1,
  limit: DEFAULT_PAGE_SIZE,
  totalPages: 1,
  documentNumber: "",
  po_material_number: "",
  manual: "non-manual",
  auditType: "open",
};

const isTenDigitNumber = (val) => /^\d{10}$/.test(val.trim());
function InvoiceList() {
  const { dataViewType } = useSelector((state) => state.menu);

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const [listData, setListData] = useState([]);

  const [excelData, setExcelData] = useState({
    loading: false,
    data: [],
    totalPages: 0,
    limit: DEFAULT_PAGE_SIZE,
  });

  const [inputValue, setInputValue] = useState("");
  const [inputValuePO, setInputValuePO] = useState("");
  const [PONumbers, setPONumbers] = useState([]);
  const [documentNumbers, setDocumentNumbers] = useState([]);

  const [inputs, setInputs] = useState(defaultInputs);

  const getPageData = useCallback(
    async (params) => {
      let {
        page = 1,
        limit = DEFAULT_PAGE_SIZE,
        documentNumbers = [],
        PONumbers = [],
        manual,
        auditType,
        ...restParams
      } = params;

      const queryParams = {
        ...restParams,
        manual: ["PJV", "BPV", "NONPO"].includes(dataViewType)
          ? manual === "manual"
          : undefined,
        advance: dataViewType === "BPV" ? manual === "advance" : undefined,
        completed: auditType === "closed" ? "true" : "false",
        forAuditor: auditType === "open" ? "true" : undefined,
        totalPages: undefined,
        page,
        limit,
      };

      Object.keys(queryParams).forEach(
        (key) =>
          (queryParams[key] === "" || queryParams[key] === undefined) &&
          delete queryParams[key]
      );

      let query = new URLSearchParams(queryParams).toString();
      const endpoint = {
        PO: "getPOAuditResults",
        NONPO: "getNonPOAuditResults",
        PJV: "getAuditResults",
        BPV: "getBPVAuditResults",
      }[dataViewType];
      const body =
        dataViewType === "PO"
          ? PONumbers?.length
            ? { poNumbers: PONumbers }
            : {}
          : documentNumbers?.length
          ? { documentNumbers }
          : {};

      const timeOut = setTimeout(() => setLoading(true), 500);
      let isSuccess = true;

      let totalPages = 0;
      try {
        const response = await post(`/${endpoint}?${query}`, body);
        console.log("response", response)

        setListData(response?.data || []);

        totalPages = response?.pagination?.totalPages;
        let manualInp = manual;
        if (dataViewType === "PO") {
          manualInp = "non-manual";
        } else if (dataViewType === "PJV") {
          manualInp = manual === "advance" ? "non-manual" : manual;
        } else if (dataViewType === "NONPO") {
          manualInp = manual === "advance" ? "non-manual" : manual;
        }
        setInputs((prevInputs) => {
          sessionStorage.setItem(
            "filters" + dataViewType,
            JSON.stringify({
              ...prevInputs,
              manual: manualInp,
              totalPages,
              documentNumbers,
              PONumbers,
            })
          );
          return { ...prevInputs, manual: manualInp, totalPages };
        });
      } catch (error) {
        isSuccess = false;
        toast.error("Something went wrong. Please try again");
        return false;
      } finally {
        clearTimeout(timeOut);
        setTimeout(() => setLoading(false), 500);
      }

      //get excel data
      try {
        setExcelData({ loading: true, data: [], totalPages: 0, limit });

        query = new URLSearchParams({
          ...queryParams,
          limit: limit * totalPages,
        }).toString();

        const response = await post(`/${endpoint}?${query}`, body);

        setExcelData({
          loading: false,
          data: response?.data || [],
          totalPages,
          limit,
        });
      } catch (error) {
        console.log(error);
        setExcelData({ loading: false, data: [], totalPages: 0, limit });
      }
      return isSuccess;
    },
    [dataViewType]
  );

  useEffect(() => {
    const filters = JSON.parse(
      sessionStorage.getItem("filters" + dataViewType)
    );
    if (filters) {
      getPageData(filters);
      const { documentNumbers, PONumbers, ...rest } = filters;
      setInputs(rest);
      setPONumbers(PONumbers || []);
      setDocumentNumbers(documentNumbers || []);
    } else {
      getPageData({ ...inputs, documentNumbers, PONumbers });
    }
  }, [dataViewType]);

  const handleInputChange = (event) => {
    const { name, value } = event.target;
    setInputs((prevInputs) => ({ ...prevInputs, [name]: value }));
  };

  const handleSearch = () => {
    // sessionStorage.setItem(
    //   "filters",
    //   JSON.stringify({ ...inputs, documentNumbers, PONumbers })
    // );
    getPageData({ ...inputs, documentNumbers, PONumbers });
    setOpen(false);
  };

  const handleChangeMulti = (e) => {
    if (e.target.value?.length < 10) {
      setInputValue(e.target.value);
      return;
    }
    const value = e.target.value;
    const parts = value
      .split(/[\s\n]+/)
      .map((val) => val.trim())
      .filter((val) => val !== "");

    const valid = [];
    const invalid = [];

    parts.forEach((num) => {
      if (isTenDigitNumber(num) && !documentNumbers.includes(num))
        valid.push(num);
    });

    setDocumentNumbers([...documentNumbers, ...valid]);
    setInputValue(invalid.join(" "));
  };

  const handleDelete = (chipToDelete) => {
    setDocumentNumbers(documentNumbers.filter((chip) => chip !== chipToDelete));
  };

  const handleChangeMultiPO = (e) => {
    if (e.target.value?.length < 10) {
      setInputValuePO(e.target.value);
      return;
    }
    const value = e.target.value;
    const parts = value
      .split(/[\s\n]+/)
      .map((val) => val.trim())
      .filter((val) => val !== "");

    const valid = [];
    const invalid = [];

    parts.forEach((num) => {
      if (isTenDigitNumber(num) && !PONumbers.includes(num)) valid.push(num);
    });

    setPONumbers([...PONumbers, ...valid]);
    setInputValuePO(invalid.join(" "));
  };
  const handleDeletePO = (chipToDelete) => {
    setPONumbers(PONumbers.filter((chip) => chip !== chipToDelete));
  };

  const handleChange = (_, auditType) => {
    getPageData({
      ...inputs,
      page: 1,
      auditType,
      documentNumbers,
      PONumbers,
    });
    setInputs((prevInputs) => ({ ...prevInputs, page: 1, auditType }));
  };
  const handleChange2 = (_, manual) => {
    getPageData({
      ...inputs,
      page: 1,
      manual,
      documentNumbers,
      PONumbers,
    });
    setInputs((prevInputs) => ({ ...prevInputs, page: 1, manual }));
  };

  const handleChangePage = (_, value) => {
    setInputs((prevInputs) => ({ ...prevInputs, page: value }));
    getPageData({
      ...inputs,
      page: value,
      documentNumbers,
      PONumbers,
    });
  };

  console.log(
    !loading && ["PJV", "BPV", "NONPO"].includes(dataViewType),
    loading,
    ["PJV", "BPV", "NONPO"].includes(dataViewType)
  );

  return (
    <>
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: 1,
        }}
      >
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700 }}>
            {dataViewType === "PO" && "PO List"}
            {dataViewType === "NONPO" && "Non-PO List"}
            {dataViewType === "PJV" && "Invoice List"}
            {dataViewType === "BPV" && "BPV List"}
          </Typography>
          {/* <Typography variant="body1" color="textSecondary">
            This page lists all the {dataViewType === "PO" ? "POs" : "Invoices"}{" "}
            .
          </Typography> */}
          {/* <Typography variant="body1" color="textSecondary">
            This page lists all the {dataViewType === "PO" ? "POs" : "Invoices"} in the system 
          </Typography> */}
        </Box>
        <Button
          disabled={loading}
          variant="contained"
          startIcon={<SortRoundedIcon />}
          onClick={() => setOpen(true)}
          sx={{ width: "120px" }}
        >
          Filter
        </Button>
      </Box>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        aria-labelledby="invoice-filter-title"
        aria-describedby="invoice-filter-description"
        fullWidth
        maxWidth="xs"
        sx={{ "& .MuiDialog-paper": { borderRadius: "12px" } }}
      >
        <DialogTitle sx={{ display: "flex", justifyContent: "center" }}>
          <Typography variant="h3" align="center" sx={{ fontWeight: 700 }}>
            Filter
          </Typography>
          <IconButton
            onClick={() => setOpen(false)}
            sx={{ position: "absolute", top: "5px", right: "10px" }}
          >
            <CloseRoundedIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={2}>
            {dataViewType === "PJV" && (
              <>
                <Grid item xs={12}>
                  <InputLabel>Fiscal Year :</InputLabel>
                  <TextField
                    placeholder="Fiscal Year"
                    name="fiscalYear"
                    fullWidth
                    value={inputs.fiscalYear}
                    onChange={handleInputChange}
                  />
                </Grid>
                <Grid item xs={12}>
                  <InputLabel>Document No :</InputLabel>
                  <TextField
                    name="documentNumber"
                    fullWidth
                    value={inputValue}
                    onChange={handleChangeMulti}
                    placeholder="Paste or type 10-digit numbers"
                  />
                </Grid>

                {documentNumbers.length > 0 && (
                  <Grid item xs={12}>
                    <Box
                      sx={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 0.5,
                        maxHeight: "80px",
                        overflowY: "scroll",
                      }}
                    >
                      {documentNumbers.map((num) => (
                        <Chip
                          key={num}
                          label={num}
                          sx={{ borderRadius: "60px" }}
                          onDelete={() => handleDelete(num)}
                          size="small"
                        />
                      ))}
                    </Box>
                  </Grid>
                )}
                <Grid item xs={12}>
                  <InputLabel>Vendor :</InputLabel>
                  <TextField
                    placeholder="Vendor"
                    name="vendor"
                    fullWidth
                    value={inputs.vendor}
                    onChange={handleInputChange}
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <InputLabel>Amount Min :</InputLabel>
                  <TextField
                    placeholder="Amount Min"
                    name="amountMin"
                    fullWidth
                    value={inputs.amountMin}
                    onChange={handleInputChange}
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <InputLabel>Amount Max :</InputLabel>
                  <TextField
                    placeholder="Amount Max"
                    name="amountMax"
                    fullWidth
                    value={inputs.amountMax}
                    onChange={handleInputChange}
                  />
                </Grid>
                <Grid item xs={12}>
                  <InputLabel>Min Unverified :</InputLabel>
                  <TextField
                    placeholder="Min Unverified"
                    name="minUnverified"
                    fullWidth
                    type="number"
                    value={inputs.minUnverified}
                    onChange={handleInputChange}
                  />
                </Grid>
              </>
            )}
            {dataViewType === "NONPO" && (
              <>
                <Grid item xs={12}>
                  <InputLabel>Fiscal Year :</InputLabel>
                  <TextField
                    placeholder="Fiscal Year"
                    name="fiscalYear"
                    fullWidth
                    value={inputs.fiscalYear}
                    onChange={handleInputChange}
                  />
                </Grid>
                <Grid item xs={12}>
                  <InputLabel>Document No :</InputLabel>
                  <TextField
                    name="documentNumber"
                    fullWidth
                    value={inputValue}
                    onChange={handleChangeMulti}
                    placeholder="Paste or type 10-digit numbers"
                  />
                </Grid>

                {documentNumbers.length > 0 && (
                  <Grid item xs={12}>
                    <Box
                      sx={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 0.5,
                        maxHeight: "80px",
                        overflowY: "scroll",
                      }}
                    >
                      {documentNumbers.map((num) => (
                        <Chip
                          key={num}
                          label={num}
                          sx={{ borderRadius: "60px" }}
                          onDelete={() => handleDelete(num)}
                          size="small"
                        />
                      ))}
                    </Box>
                  </Grid>
                )}
                <Grid item xs={12}>
                  <InputLabel>Vendor :</InputLabel>
                  <TextField
                    placeholder="Vendor"
                    name="vendor"
                    fullWidth
                    value={inputs.vendor}
                    onChange={handleInputChange}
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <InputLabel>Amount Min :</InputLabel>
                  <TextField
                    placeholder="Amount Min"
                    name="amountMin"
                    fullWidth
                    value={inputs.amountMin}
                    onChange={handleInputChange}
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <InputLabel>Amount Max :</InputLabel>
                  <TextField
                    placeholder="Amount Max"
                    name="amountMax"
                    fullWidth
                    value={inputs.amountMax}
                    onChange={handleInputChange}
                  />
                </Grid>
                <Grid item xs={12}>
                  <InputLabel>Min Unverified :</InputLabel>
                  <TextField
                    placeholder="Min Unverified"
                    name="minUnverified"
                    fullWidth
                    type="number"
                    value={inputs.minUnverified}
                    onChange={handleInputChange}
                  />
                </Grid>
              </>
            )}

            {dataViewType === "PO" && (
              <>
                <Grid item xs={12}>
                  <InputLabel>PO Number :</InputLabel>
                  <TextField
                    name="PONumber"
                    fullWidth
                    value={inputValuePO}
                    onChange={handleChangeMultiPO}
                    placeholder="Paste or type 10-digit numbers"
                  />
                </Grid>
                {PONumbers.length > 0 && (
                  <Grid item xs={12}>
                    <Box
                      sx={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 0.5,
                        maxHeight: "80px",
                        overflowY: "scroll",
                      }}
                    >
                      {PONumbers.map((num) => (
                        <Chip
                          key={num}
                          label={num}
                          sx={{ borderRadius: "60px" }}
                          onDelete={() => handleDeletePO(num)}
                          size="small"
                        />
                      ))}
                    </Box>
                  </Grid>
                )}
              </>
            )}
            {dataViewType === "BPV" && (
              <>
                <Grid item xs={12}>
                  <InputLabel>Document No :</InputLabel>
                  <TextField
                    name="documentNumber"
                    fullWidth
                    value={inputValue}
                    onChange={handleChangeMulti}
                    placeholder="Paste or type 10-digit numbers"
                  />
                </Grid>

                {documentNumbers.length > 0 && (
                  <Grid item xs={12}>
                    <Box
                      sx={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 0.5,
                        maxHeight: "80px",
                        overflowY: "scroll",
                      }}
                    >
                      {documentNumbers.map((num) => (
                        <Chip
                          key={num}
                          label={num}
                          sx={{ borderRadius: "60px" }}
                          onDelete={() => handleDelete(num)}
                          size="small"
                        />
                      ))}
                    </Box>
                  </Grid>
                )}
                <Grid item xs={12}>
                  <InputLabel>PJV Invoice Ref Doc :</InputLabel>
                  <TextField
                    placeholder="PJV Invoice Ref Doc"
                    name="pjvInvoiceRefDoc"
                    fullWidth
                    value={inputs.pjvInvoiceRefDoc}
                    onChange={handleInputChange}
                  />
                </Grid>
                <Grid item xs={12}>
                  <InputLabel>BPV PO :</InputLabel>
                  <TextField
                    placeholder="BPV PO"
                    name="bpvPo"
                    fullWidth
                    value={inputs.bpvPo}
                    onChange={handleInputChange}
                  />
                </Grid>
                <Grid item xs={6}>
                  <InputLabel>Payment Document Date From</InputLabel>
                  <TextField
                    name="documentDateFrom"
                    type="date"
                    fullWidth
                    value={inputs.documentDateFrom}
                    onChange={handleInputChange}
                  />
                </Grid>
                <Grid item xs={6}>
                  <InputLabel>Payment Document Date To</InputLabel>
                  <TextField
                    name="documentDateTo"
                    type="date"
                    fullWidth
                    value={inputs.documentDateTo}
                    onChange={handleInputChange}
                  />
                </Grid>
              </>
            )}
            <Grid item xs={6}>
              <InputLabel>Sys. AuditedOn From</InputLabel>
              <TextField
                name="auditedOnFrom"
                type="date"
                fullWidth
                value={inputs.auditedOnFrom}
                onChange={handleInputChange}
              />
            </Grid>
            <Grid item xs={6}>
              <InputLabel>Sys. AuditedOn To</InputLabel>
              <TextField
                name="auditedOnTo"
                type="date"
                fullWidth
                value={inputs.auditedOnTo}
                onChange={handleInputChange}
              />
            </Grid>

            {/* Vendor Verified */}
            <Grid item xs={6}>
              <InputLabel>Man. VerifiedOn From</InputLabel>
              <TextField
                name="manuallyVerifiedFrom"
                type="date"
                fullWidth
                value={inputs.manuallyVerifiedFrom}
                onChange={handleInputChange}
              />
            </Grid>
            <Grid item xs={6}>
              <InputLabel>Man. VerifiedOn To</InputLabel>
              <TextField
                name="manuallyVerifiedTo"
                type="date"
                fullWidth
                value={inputs.manuallyVerifiedTo}
                onChange={handleInputChange}
              />
            </Grid>
            <Grid item xs={12}>
              <Button
                variant="outlined"
                color="inherit"
                sx={{ width: "48%", mr: 1 }}
                onClick={() => {
                  setOpen(false);
                  setDocumentNumbers([]);
                  setPONumbers([]);
                  setInputs({
                    ...defaultInputs,
                    auditedOnFrom: "",
                    auditedOnTo: "",
                    manual: inputs.manual,
                    auditType: inputs.auditType,
                  });
                  sessionStorage.removeItem("filtersPO");
                  sessionStorage.removeItem("filtersPJV");
                  sessionStorage.removeItem("filtersBPV");
                  getPageData({
                    ...defaultInputs,
                    auditedOnFrom: "",
                    auditedOnTo: "",
                    documentNumbers: [],
                    PONumbers: [],
                    manual: inputs.manual,
                    auditType: inputs.auditType,
                  });
                }}
              >
                Clear
              </Button>
              <Button
                variant="contained"
                sx={{ width: "48%" }}
                onClick={handleSearch}
              >
                Search
              </Button>
            </Grid>
          </Grid>
        </DialogContent>
      </Dialog>
      <Box sx={{ display: "flex", alignItems: "center", margin: "15px 0" }}>
        <Box>
          {!loading && ["PJV", "BPV", "NONPO"].includes(dataViewType) && (
            <Box
              sx={{
                bgcolor: "#e5e5e5",
                width: "fit-content",
                borderRadius: 2,
                px: 1,
              }}
            >
              <TabContext value={inputs.manual}>
                <TabList
                  onChange={handleChange2}
                  aria-label="Manual tabs"
                  sx={{ minHeight: 40 }}
                >
                  {dataViewType === "BPV" && (
                    <Tab
                      label={"Advance"}
                      // label={dataViewType === "PJV" ? "Manual" : "Advance"}
                      value="advance"
                      sx={{
                        minHeight: 40,
                        paddingTop: 1,
                        paddingBottom: 1,
                      }}
                    />
                  )}
                  <Tab
                    label="Manual"
                    // label={dataViewType === "PJV" ? "Digital" : "Non Advance"}
                    value="manual"
                    sx={{
                      minHeight: 40,
                      paddingTop: 1,
                      paddingBottom: 1,
                    }}
                  />
                  <Tab
                    label="Digital"
                    // label={dataViewType === "PJV" ? "Digital" : "Non Advance"}
                    value="non-manual"
                    sx={{
                      minHeight: 40,
                      paddingTop: 1,
                      paddingBottom: 1,
                    }}
                  />
                </TabList>
              </TabContext>
            </Box>
          )}
          {!loading && (
            <TabContext value={inputs.auditType}>
              <TabList
                onChange={handleChange}
                aria-label="lab API tabs example"
              >
                <Tab label="Open Audits" value={"open"} />
                <Tab label="Closed Audits" value={"closed"} />
              </TabList>
            </TabContext>
          )}
        </Box>
        <Box sx={{ flexGrow: 1 }} />
        {/* <DownloadTableToExcel tableData={listData} loading={loading} /> */}
        <DownloadTableToExcel
          recordPerPage={excelData?.limit || DEFAULT_PAGE_SIZE}
          tableData={excelData?.data || []}
          totalPages={excelData?.totalPages || 0}
          loading={loading || excelData?.loading}
        />
      </Box>

      <TableAuditorView
        tableData={listData}
        loading={loading}
        comp={inputs.auditType === "closed"}
        type={dataViewType}
      />
      {inputs.totalPages > 1 ? (
        <Stack sx={{ my: 2 }} alignItems="center">
          <Pagination
            count={inputs.totalPages}
            page={inputs.page}
            onChange={handleChangePage}
            shape="rounded"
            showFirstButton
            showLastButton
          />
        </Stack>
      ) : null}
    </>
  );
}

export default InvoiceList;
