import { useState, useEffect, useCallback } from "react";
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  Grid,
  IconButton,
  InputLabel,
  MenuItem,
  Pagination,
  Paper,
  Select,
  Tab,
  TextField,
  Typography,
} from "@mui/material";
import { TabContext, TabList } from "@mui/lab";

import moment from "moment";
import { toast } from "react-toastify";
import { useSelector } from "react-redux";
import SortRoundedIcon from "@mui/icons-material/SortRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";

import { post } from "utils/axiosApi";
import IssueListTable from "./components/issue-table";
import DownloadExcel from "./components/download-excel";

const DEFAULT_PAGE_SIZE = 20;

const isTenDigitNumber = (val) => /^\d{10}$/.test(val.trim());

const DEFAULT_INPUTS = {
  fiscalYear: "",
  pointNo: "",
  status: "",
  imported: "",
  vendor: "",
  amountMin: "",
  amountMax: "",
  minUnverified: "",
  sortBy: "",
  includeResults: "",
  documentNumber: "",
  po_material_number: "",
  page: 1,
  limit: DEFAULT_PAGE_SIZE,
  totalPages: 0,
  auditedOnFrom: "",
  auditedOnTo: "",
  manuallyVerifiedFrom: moment().subtract(7, "days").format("YYYY-MM-DD"),
  manuallyVerifiedTo: moment().endOf("day").format("YYYY-MM-DD"),
  manual: "non-manual",
};

function IsuueTracker() {
  const { dataViewType } = useSelector((state) => state.menu);

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tableData, setTableData] = useState({
    manual: [],
    "non-manual": [],
  });

  const [inputValue, setInputValue] = useState("");
  const [inputValuePO, setInputValuePO] = useState("");
  const [PONumbers, setPONumbers] = useState([]);
  const [documentNumbers, setDocumentNumbers] = useState([]);

  const [inputs, setInputs] = useState(DEFAULT_INPUTS);

  const getPageData = useCallback(
    async (params) => {
      const {
        documentNumbers = [],
        PONumbers = [],
        page = 1,
        limit = DEFAULT_PAGE_SIZE,
        ...queryParams
      } = params;

      const filteredQuery = Object.fromEntries(
        Object.entries(queryParams).filter(([_, value]) => {
          return value !== "" && value !== undefined && value !== null;
        })
      );

      const query = new URLSearchParams({
        ...filteredQuery,
        limit,
        page,
        manual:
          dataViewType === "PJV" || dataViewType === "NONPO"
            ? filteredQuery.manual
            : "non-manual",
      }).toString();

      const timeOut = setTimeout(() => setLoading(true), 100);
      let isSuccess = true;
      try {
        const payload =
          dataViewType === "PO"
            ? PONumbers?.length
              ? { poNumbers: PONumbers, type: dataViewType }
              : { type: dataViewType }
            : documentNumbers?.length
            ? { documentNumbers, type: dataViewType }
            : { type: dataViewType };
        const response = await post(`/getIssueTracker?${query}`, payload);

        const result = response?.data?.reduce(
          (acc, curr) => {
            if (curr?.manual) {
              acc["manual"].push(curr);
            } else {
              acc["non-manual"].push(curr);
            }
            return acc;
          },
          { manual: [], "non-manual": [] }
        );

        setTableData(result);
        setInputs((prev) => {
          sessionStorage.setItem(
            "filters-IT" + dataViewType,
            JSON.stringify({
              ...prev,
              documentNumbers,
              PONumbers,
              manual:
                dataViewType === "PJV" || dataViewType === "NONPO"
                  ? prev.manual
                  : "non-manual",
              totalPages: response?.pagination?.totalPages || 1,
            })
          );
          return {
            ...prev,
            manual:
              dataViewType === "PJV" || dataViewType === "NONPO"
                ? prev.manual
                : "non-manual",
            totalPages: response?.pagination?.totalPages || 1,
          };
        });
      } catch (error) {
        isSuccess = false;
        toast.error("Something went wrong. Please try again");
        return false;
      } finally {
        clearTimeout(timeOut);
        setTimeout(() => setLoading(false), 500);
      }
      return isSuccess;
    },
    [dataViewType]
  );

  useEffect(() => {
    const filters = JSON.parse(
      sessionStorage.getItem("filters-IT" + dataViewType)
    );
    if (filters) {
      getPageData(filters);
      const { documentNumbers, PONumbers, ...restFilters } = filters;
      setInputs({ ...restFilters });
      setPONumbers(PONumbers || []);
      setDocumentNumbers(documentNumbers || []);
    } else {
      getPageData({
        limit: DEFAULT_PAGE_SIZE,
        page: 1,
        manuallyVerifiedFrom: moment().subtract(7, "days").format("YYYY-MM-DD"),
        manuallyVerifiedTo: moment().endOf("day").format("YYYY-MM-DD"),
      });
    }
  }, [dataViewType]);

  const handleInputChange = (event) => {
    const { name, value } = event.target;
    setInputs((prevInputs) => ({ ...prevInputs, [name]: value }));
  };

  const handleSearch = () => {
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

  const handlePageValue = (_, newPage) => {
    setInputs((prev) => ({ ...prev, page: newPage }));
    getPageData({ ...inputs, page: newPage, documentNumbers, PONumbers });
  };

  const handleTabValue = (_, manual) => {
    // sessionStorage.setItem(
    //   "filters-IT" + dataViewType,
    //   JSON.stringify({ ...inputs, documentNumbers, page: 1, PONumbers, manual })
    // );
    setInputs((prev) => ({ ...prev, page: 1, manual }));
    getPageData({ ...inputs, page: 1, documentNumbers, PONumbers, manual });
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
            Issue Tracker
          </Typography>
          {/* <Typography variant="body1" color="textSecondary">
            This page lists all the issues raised in the system, along with the
            status of the issue.
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
        fullWidth
        maxWidth="xs"
        sx={{ "& .MuiDialog-paper": { borderRadius: "12px" } }}
      >
        <DialogTitle sx={{ display: "flex", justifyContent: "center" }}>
          <Typography variant="h4" align="center" sx={{ fontWeight: 700 }}>
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
            {/* <Grid item xs={12}>
              <TextField
                label="Fiscal Year"
                name="fiscalYear"
                fullWidth
                value={inputs.fiscalYear}
                onChange={handleInputChange}
              />
            </Grid> */}
            {(dataViewType === "PJV" || dataViewType === "NONPO") && (
              <>
                <Grid item xs={12}>
                  <InputLabel>Point No :</InputLabel>
                  <TextField
                    name="pointNo"
                    placeholder="Enter Point No"
                    fullWidth
                    value={inputs.pointNo}
                    onChange={handleInputChange}
                  />
                </Grid>
                <Grid item xs={12}>
                  <InputLabel>Document Nos :</InputLabel>
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
                    name="vendor"
                    placeholder="Enter Vendor"
                    fullWidth
                    value={inputs.vendor}
                    onChange={handleInputChange}
                  />
                </Grid>
              </>
            )}
            {dataViewType === "PO" && (
              <>
                <Grid item xs={12}>
                  <InputLabel>PO Nos :</InputLabel>
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
            <Grid item xs={12}>
              <InputLabel>Status</InputLabel>
              <Select
                name="status"
                fullWidth
                value={inputs.status}
                onChange={handleInputChange}
                displayEmpty
              >
                <MenuItem value="">Select Status</MenuItem>
                <MenuItem value="resolved">Resolved</MenuItem>
                <MenuItem value="work_under_progress">
                  Work under progress
                </MenuItem>
                <MenuItem value="closed">Closed</MenuItem>
                <MenuItem value="pending">Pending</MenuItem>
              </Select>
            </Grid>
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
                    ...DEFAULT_INPUTS,
                    manuallyVerifiedFrom: "",
                    manuallyVerifiedTo: "",
                    manual: inputs.manual,
                  });
                  sessionStorage.removeItem("filters-ITPO");
                  sessionStorage.removeItem("filters-ITBPV");
                  sessionStorage.removeItem("filters-ITPJV");
                  getPageData({
                    page: 1,
                    limit: DEFAULT_PAGE_SIZE,
                    manuallyVerifiedFrom: "",
                    manuallyVerifiedTo: "",
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
      <Box sx={{ display: "flex", alignItems: "center", margin: "20px 0" }}>
        {!loading && dataViewType === "PJV" && (
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
                onChange={handleTabValue}
                aria-label="Manual tabs"
                sx={{ minHeight: 40 }}
              >
                <Tab
                  label="Manual"
                  value="manual"
                  sx={{
                    minHeight: 40,
                    paddingTop: 1,
                    paddingBottom: 1,
                  }}
                />
                <Tab
                  label="Digital"
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
        {!loading && dataViewType === "NONPO" && (
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
                onChange={handleTabValue}
                aria-label="Manual tabs"
                sx={{ minHeight: 40 }}
              >
                <Tab
                  label="Manual"
                  value="manual"
                  sx={{
                    minHeight: 40,
                    paddingTop: 1,
                    paddingBottom: 1,
                  }}
                />
                <Tab
                  label="Digital"
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
        <Box sx={{ flexGrow: 1 }} />
        <DownloadExcel loading={loading} />
      </Box>
      <Paper
        sx={{ borderRadius: "12px", border: "1px solid #e5e5e5" }}
        elevation={0}
      >
        <IssueListTable
          tableData={tableData[inputs.manual]}
          getPageData={handleSearch}
          onUpdate={(data) => {
            setTableData((pre) => ({
              ...pre,
              [inputs.manual]: pre?.[inputs.manual]?.map((d) =>
                d.auditResultId === data.auditResultId &&
                d.pointNo === data.pointNo
                  ? { ...d, ...data }
                  : d
              ),
            }));
          }}
          loading={loading}
        />
        {!loading && inputs.totalPages > 1 ? (
          <Box
            sx={{
              width: "100%",
              backgroundColor: "#ffffff",
              p: 2,
              borderRadius: 1,
            }}
            display="flex"
            gap={8}
            justifyContent="center"
            alignItems="center"
          >
            <Pagination
              count={inputs.totalPages}
              page={inputs.page}
              onChange={handlePageValue}
              shape="rounded"
              variant="outlined"
              color="primary"
              showFirstButton
              showLastButton
            />
          </Box>
        ) : null}
      </Paper>
    </>
  );
}

export default IsuueTracker;
