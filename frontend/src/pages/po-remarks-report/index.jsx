import { useEffect, useState, useCallback } from "react";
import {
  Box,
  Button,
  Card,
  Grid,
  Stack,
  TextField,
  Chip,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Typography,
  Autocomplete,
  Tabs,
  Tab,
} from "@mui/material";
import DownloadIcon from "@mui/icons-material/Download";
import RestartAltIcon from "@mui/icons-material/RestartAlt";

import {
  getPoRemarksReport,
  downloadPoRemarksReport,
  getPoRemarksReportFilterOptions,
  downloadIssueTrackerReport,
} from "../../api/api-functions";
import { getRbac } from "utils/session";

const STATUS_COLOR = {
  Verified: "success",
  "Not Verified": "error",
  "Not Applicable": "default",
  "Manual Review Required": "warning",
};

// Removed isPoCorrected from the specific empty filters since it's global now
const EMPTY_LINE_FILTERS = {
  poNumber: "",
  search: "",
  pointNo: "",
  vendorCode: "",
  plant: "",
  purchaseGroup: "",
  poType: "",
  systemResult: "",
  submittedBy: "",
  dateFrom: "",
  dateTo: "",
};

const EMPTY_HEADER_FILTERS = {
  poNumber: "",
  search: "",
  pointNo: "",
  vendorCode: "",
  purchaseGroup: "",
  poType: "",
  systemResult: "",
  submittedBy: "",
  dateFrom: "",
  dateTo: "",
};

const EMPTY_RC_FILTERS = {
  rcNumber: "",
  search: "",
  vendorCode: "",
  rcMaterialCode: "",
  purchaseGroup: "",
  rcStatus: "",
  submittedBy: "",
  dateFrom: "",
  dateTo: "",
};

const PO_CORRECTED_OPTIONS = [
  { code: "corrected", label: "POs Corrected" },
  { code: "altercation", label: "System Altercations" },
];

function findOption(options, code) {
  if (!code) return null;
  return options.find((o) => o.code === code) || { code, label: code };
}

function formatDate(v) {
  if (!v) return "—";
  const d = new Date(v);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB");
}

function RemarksTable({ rows, loading, showPlantColumn }) {
  const colSpan = showPlantColumn ? 10 : 9;

  return (
    <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>PO / Line</TableCell>
            <TableCell>Point</TableCell>
            <TableCell>Buyer's Remark</TableCell>
            <TableCell>Buyer's Result</TableCell>
            <TableCell>Is PO Corrected?</TableCell>
            <TableCell>Submitted By</TableCell>
            <TableCell>System Result</TableCell>
            <TableCell>Vendor</TableCell>
            {showPlantColumn && <TableCell>Plant</TableCell>}
            <TableCell>Purchase Group</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {loading ? (
            <TableRow>
               <TableCell colSpan={colSpan} align="center">
                <CircularProgress size={24} />
              </TableCell>
            </TableRow>
          ) : rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={colSpan} align="center">
                No remarks found
              </TableCell>
            </TableRow>
          ) : (
            rows.map((r, idx) => (
              <TableRow key={`${r.poNumber}-${r.lineItem}-${r.pointNo}-${idx}`}>
                <TableCell>
                  {r.poNumber} / {r.lineItem}
                </TableCell>
                <TableCell>
                  #{r.pointNo}
                  {r.pointTitle && (
                    <Typography variant="caption" display="block" color="text.secondary">
                      {r.pointTitle}
                    </Typography>
                  )}
                </TableCell>
                <TableCell sx={{ maxWidth: 240 }}>{r.buyerRemark}</TableCell>
                <TableCell>{r.buyerResult || "—"}</TableCell>
                <TableCell>
                  <Chip
                    size="small"
                    label={r.isSystemResultWrong || r.resultAltered?.startsWith("Yes") ? "PO Corrected" : "System Altercation"}
                    color={r.isSystemResultWrong || r.resultAltered?.startsWith("Yes") ? "error" : "default"}
                  />
                </TableCell>
                <TableCell>{r.submittedByName}</TableCell>
                <TableCell>
                  <Chip
                    size="small"
                    label={r.systemResult}
                    color={STATUS_COLOR[r.systemResult] || "default"}
                  />
                </TableCell>
                <TableCell>
                  {r.vendorName}
                  <Typography variant="caption" display="block" color="text.secondary">
                    {r.vendorCode}
                  </Typography>
                </TableCell>
                {showPlantColumn && <TableCell>{r.plantName || r.plant}</TableCell>}
                <TableCell>{r.purchaseGroupName || r.purchaseGroup}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

function RcRemarksTable({ rows, loading }) {
  const colSpan = 10;

  return (
    <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>RC Number</TableCell>
            <TableCell>Vendor</TableCell>
            <TableCell>Material Code</TableCell>
            <TableCell>Valid From / To</TableCell>
            <TableCell>RC Status</TableCell>
            <TableCell>Buyer's Remark</TableCell>
            <TableCell>Buyer's Result</TableCell>
            <TableCell>Is PO Corrected?</TableCell>
            <TableCell>Submitted By</TableCell>
            <TableCell>Purchase Group(s)</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {loading ? (
            <TableRow>
              <TableCell colSpan={colSpan} align="center">
                <CircularProgress size={24} />
              </TableCell>
            </TableRow>
          ) : rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={colSpan} align="center">
                No remarks found
              </TableCell>
            </TableRow>
          ) : (
            rows.map((r, idx) => (
              <TableRow key={`${r.rcNumber}-${r.submittedById}-${idx}`}>
                <TableCell>{r.rcNumber}</TableCell>
                <TableCell>
                  {r.vendorName}
                  <Typography variant="caption" display="block" color="text.secondary">
                    {r.vendorCode}
                  </Typography>
                </TableCell>
                <TableCell>{r.rcMaterialCode || "—"}</TableCell>
                <TableCell>
                  {formatDate(r.validFrom)} – {formatDate(r.validTo)}
                </TableCell>
                <TableCell>
                  <Chip
                    size="small"
                    label={r.systemResult}
                    color={STATUS_COLOR[r.systemResult] || "default"}
                  />
                </TableCell>
                <TableCell sx={{ maxWidth: 240 }}>{r.buyerRemark}</TableCell>
                <TableCell>{r.buyerResult || "—"}</TableCell>
                <TableCell>
                  <Chip
                    size="small"
                    label={r.isSystemResultWrong || r.resultAltered?.startsWith("Yes") ? "PO Corrected" : "System Altercation"}
                    color={r.isSystemResultWrong || r.resultAltered?.startsWith("Yes") ? "error" : "default"}
                  />
                </TableCell>
                <TableCell>{r.submittedByName}</TableCell>
                <TableCell>{r.purchaseGroups || "—"}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

export default function PoRemarksReportPage() {
  const { isAdmin, isProcurementManager } = getRbac() || {};
  const isAdminOrPM = isAdmin || isProcurementManager;

  const [downloading, setDownloading] = useState(false);
  const [downloadingIssueTracker, setDownloadingIssueTracker] = useState(false);

  const [activeTab, setActiveTab] = useState("header");

  // === GLOBAL FILTER STATE ===
  const [isPoCorrected, setIsPoCorrected] = useState("");

  const [options, setOptions] = useState({
    points: [],
    headerPoints: [],
    vendors: [],
    purchaseGroups: [],
    poTypes: [],
    plants: [],
    systemResults: [],
    rcStatuses: [],
    submitters: [],
  });
  const [optionsLoading, setOptionsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setOptionsLoading(true);
      try {
        const { data } = await getPoRemarksReportFilterOptions();
        setOptions({
          points: data.points || [],
          headerPoints: data.headerPoints || [],
          vendors: data.vendors || [],
          purchaseGroups: data.purchaseGroups || [],
          poTypes: data.poTypes || [],
          plants: data.plants || [],
          systemResults: data.systemResults || [],
          rcStatuses: data.rcStatuses || [],
          submitters: data.submitters || [],
        });
      } catch (err) {
        console.error("Failed to load remarks report filter options:", err);
      } finally {
        setOptionsLoading(false);
      }
    })();
  }, []);

  // ==========================================================================
  // HEADER-LEVEL section
  // ==========================================================================
  const [headerFilters, setHeaderFilters] = useState(EMPTY_HEADER_FILTERS);
  const [headerRows, setHeaderRows] = useState([]);
  const [headerTotal, setHeaderTotal] = useState(0);
  const [headerPage, setHeaderPage] = useState(0);
  const [headerPageSize, setHeaderPageSize] = useState(25);
  const [headerLoading, setHeaderLoading] = useState(false);

  const fetchHeaderRows = useCallback(
    async (filtersOverride, pageOverride, globalPoCorrectedOverride) => {
      setHeaderLoading(true);
      try {
        const { data } = await getPoRemarksReport({
          ...(filtersOverride ?? headerFilters),
          isPoCorrected: globalPoCorrectedOverride ?? isPoCorrected,
          headerPage: (pageOverride ?? headerPage) + 1,
          headerPageSize,
        });
        setHeaderRows(data.header?.rows || []);
        setHeaderTotal(data.header?.total || 0);
      } catch (err) {
        console.error("Failed to load header-level remarks:", err);
      } finally {
        setHeaderLoading(false);
      }
    },
    [headerFilters, headerPage, headerPageSize, isPoCorrected],
  );

  useEffect(() => {
    fetchHeaderRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [headerPage, headerPageSize]);

  const setHeaderField = (key) => (value) =>
    setHeaderFilters((f) => ({ ...f, [key]: value }));

  const handleHeaderSearch = () => {
    setHeaderPage(0);
    fetchHeaderRows(headerFilters, 0);
  };

  const handleHeaderReset = () => {
    setHeaderFilters(EMPTY_HEADER_FILTERS);
    setHeaderPage(0);
    fetchHeaderRows(EMPTY_HEADER_FILTERS, 0);
  };

  // ==========================================================================
  // LINE-LEVEL section
  // ==========================================================================
  const [lineFilters, setLineFilters] = useState(EMPTY_LINE_FILTERS);
  const [lineRows, setLineRows] = useState([]);
  const [lineTotal, setLineTotal] = useState(0);
  const [linePage, setLinePage] = useState(0);
  const [linePageSize, setLinePageSize] = useState(25);
  const [lineLoading, setLineLoading] = useState(false);

  const fetchLineRows = useCallback(
    async (filtersOverride, pageOverride, globalPoCorrectedOverride) => {
      setLineLoading(true);
      try {
        const { data } = await getPoRemarksReport({
          ...(filtersOverride ?? lineFilters),
          isPoCorrected: globalPoCorrectedOverride ?? isPoCorrected,
          page: (pageOverride ?? linePage) + 1,
          pageSize: linePageSize,
        });
        setLineRows(data.line?.rows || []);
        setLineTotal(data.line?.total || 0);
      } catch (err) {
        console.error("Failed to load line-level remarks:", err);
      } finally {
        setLineLoading(false);
      }
    },
    [lineFilters, linePage, linePageSize, isPoCorrected],
  );

  useEffect(() => {
    fetchLineRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linePage, linePageSize]);

  const setLineField = (key) => (value) =>
    setLineFilters((f) => ({ ...f, [key]: value }));

  const handleLineSearch = () => {
    setLinePage(0);
    fetchLineRows(lineFilters, 0);
  };

  const handleLineReset = () => {
    setLineFilters(EMPTY_LINE_FILTERS);
    setLinePage(0);
    fetchLineRows(EMPTY_LINE_FILTERS, 0);
  };

  // ==========================================================================
  // RC-LEVEL section
  // ==========================================================================
  const [rcFilters, setRcFilters] = useState(EMPTY_RC_FILTERS);
  const [rcRows, setRcRows] = useState([]);
  const [rcTotal, setRcTotal] = useState(0);
  const [rcPage, setRcPage] = useState(0);
  const [rcPageSize, setRcPageSize] = useState(25);
  const [rcLoading, setRcLoading] = useState(false);

  const fetchRcRows = useCallback(
    async (filtersOverride, pageOverride, globalPoCorrectedOverride) => {
      setRcLoading(true);
      try {
        const { data } = await getPoRemarksReport({
          ...(filtersOverride ?? rcFilters),
          isPoCorrected: globalPoCorrectedOverride ?? isPoCorrected,
          rcPage: (pageOverride ?? rcPage) + 1,
          rcPageSize,
        });
        setRcRows(data.rc?.rows || []);
        setRcTotal(data.rc?.total || 0);
      } catch (err) {
        console.error("Failed to load RC-level remarks:", err);
      } finally {
        setRcLoading(false);
      }
    },
    [rcFilters, rcPage, rcPageSize, isPoCorrected],
  );

  useEffect(() => {
    fetchRcRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rcPage, rcPageSize]);

  const setRcField = (key) => (value) =>
    setRcFilters((f) => ({ ...f, [key]: value }));

  const handleRcSearch = () => {
    setRcPage(0);
    fetchRcRows(rcFilters, 0);
  };

  const handleRcReset = () => {
    setRcFilters(EMPTY_RC_FILTERS);
    setRcPage(0);
    fetchRcRows(EMPTY_RC_FILTERS, 0);
  };

  // ==========================================================================
  // Global Actions
  // ==========================================================================
  
  const handleGlobalPoCorrectedChange = (val) => {
    setIsPoCorrected(val);
    
    // Reset all tabs to page 0
    setHeaderPage(0);
    setLinePage(0);
    setRcPage(0);
    
    // Trigger fresh fetches for all 3 views based on the new global value
    fetchHeaderRows(headerFilters, 0, val);
    fetchLineRows(lineFilters, 0, val);
    fetchRcRows(rcFilters, 0, val);
  };

  const buildDownloadPayload = () => ({
    isPoCorrected, // Line tab backend check
    header_isPoCorrected: isPoCorrected, // Header tab backend check
    rc_isPoCorrected: isPoCorrected, // RC tab backend check
    ...lineFilters,
    ...Object.fromEntries(Object.entries(headerFilters).map(([k, v]) => [`header_${k}`, v])),
    ...Object.fromEntries(Object.entries(rcFilters).map(([k, v]) => [`rc_${k}`, v])),
    sort: "po",
  });

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const res = await downloadPoRemarksReport(buildDownloadPayload());
      const blob = new Blob([res.data], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `buyer-remarks-report-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Failed to download remarks report:", err);
    } finally {
      setDownloading(false);
    }
  };

  const handleDownloadIssueTracker = async () => {
    setDownloadingIssueTracker(true);
    try {
      const res = await downloadIssueTrackerReport(buildDownloadPayload());
      const blob = new Blob([res.data], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `issue-tracker-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Failed to download issue tracker:", err);
    } finally {
      setDownloadingIssueTracker(false);
    }
  };

  return (
    <Card sx={{ p: 2 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
        <Typography variant="h5">
          Buyer Remarks Report
          {!isAdminOrPM && (
            <Typography variant="caption" display="block" color="text.secondary">
              Showing remarks submitted by you only
            </Typography>
          )}
        </Typography>
        <Stack direction="row" spacing={1}>
          <Button
            variant="outlined"
            startIcon={<DownloadIcon />}
            onClick={handleDownloadIssueTracker}
            disabled={downloadingIssueTracker}
          >
            {downloadingIssueTracker ? "Preparing..." : "Issue Tracker (Excel)"}
          </Button>
          <Button
            variant="contained"
            startIcon={<DownloadIcon />}
            onClick={handleDownload}
            disabled={downloading}
          >
            {downloading ? "Preparing..." : "Download Report"}
          </Button>
        </Stack>
      </Stack>

      <Tabs
        value={activeTab}
        onChange={(_, val) => setActiveTab(val)}
        sx={{ mb: 2 }}
      >
        <Tab value="header" label={`Header-Level Remarks${headerTotal ? ` (${headerTotal})` : ""}`} />
        <Tab value="line" label={`Line-Level Remarks${lineTotal ? ` (${lineTotal})` : ""}`} />
        <Tab value="rc" label={`RC-Level Remarks${rcTotal ? ` (${rcTotal})` : ""}`} />
      </Tabs>

      {/* ======================= GLOBAL EXTERNAL FILTER ======================= */}
      <Box sx={{ mb: 3, maxWidth: 300 }}>
        <Autocomplete
          size="small"
          options={PO_CORRECTED_OPTIONS}
          getOptionLabel={(o) => o.label || ""}
          isOptionEqualToValue={(o, v) => o.code === v.code}
          value={findOption(PO_CORRECTED_OPTIONS, isPoCorrected)}
          onChange={(_, val) => handleGlobalPoCorrectedChange(val?.code || "")}
          renderInput={(params) => <TextField {...params} label="PO Corrected / Altercation ?" />}
        />
      </Box>

      {/* ============================= HEADER-LEVEL SECTION ============================= */}
      <Box sx={{ display: activeTab === "header" ? "block" : "none" }}>
        <Typography variant="caption" display="block" color="text.secondary" sx={{ mb: 1 }}>
          PO-wide checks — not tied to a specific line item
        </Typography>

        <Grid container spacing={2} sx={{ mt: 0.5, mb: 2 }}>
          <Grid item xs={12} sm={4} md={2}>
            <TextField
              label="PO Number"
              size="small"
              fullWidth
              value={headerFilters.poNumber}
              onChange={(e) => setHeaderField("poNumber")(e.target.value)}
            />
          </Grid>
          <Grid item xs={12} sm={4} md={2}>
            <TextField
              label="Search (PO / remark)"
              size="small"
              fullWidth
              value={headerFilters.search}
              onChange={(e) => setHeaderField("search")(e.target.value)}
            />
          </Grid>
          <Grid item xs={12} sm={4} md={2}>
            <Autocomplete
              size="small"
              options={options.headerPoints}
              loading={optionsLoading}
              getOptionLabel={(o) => o.label || ""}
              isOptionEqualToValue={(o, v) => o.code === v.code}
              value={findOption(options.headerPoints, headerFilters.pointNo)}
              onChange={(_, val) => setHeaderField("pointNo")(val?.code || "")}
              renderInput={(params) => <TextField {...params} label="Point" />}
            />
          </Grid>
          <Grid item xs={12} sm={4} md={2}>
            <Autocomplete
              size="small"
              options={options.systemResults}
              getOptionLabel={(o) => o.label || ""}
              isOptionEqualToValue={(o, v) => o.code === v.code}
              value={findOption(options.systemResults, headerFilters.systemResult)}
              onChange={(_, val) => {
                const next = val?.code || "";
                setHeaderField("systemResult")(next);
                setHeaderPage(0);
                fetchHeaderRows({ ...headerFilters, systemResult: next }, 0);
              }}
              renderInput={(params) => <TextField {...params} label="System Result" />}
            />
          </Grid>
          <Grid item xs={12} sm={4} md={2}>
            <Autocomplete
              size="small"
              options={options.vendors}
              loading={optionsLoading}
              getOptionLabel={(o) => o.label || ""}
              isOptionEqualToValue={(o, v) => o.code === v.code}
              value={findOption(options.vendors, headerFilters.vendorCode)}
              onChange={(_, val) => setHeaderField("vendorCode")(val?.code || "")}
              renderInput={(params) => <TextField {...params} label="Vendor" />}
            />
          </Grid>
          <Grid item xs={12} sm={4} md={2}>
            <Autocomplete
              size="small"
              options={options.poTypes}
              loading={optionsLoading}
              getOptionLabel={(o) => o.label || ""}
              isOptionEqualToValue={(o, v) => o.code === v.code}
              value={findOption(options.poTypes, headerFilters.poType)}
              onChange={(_, val) => setHeaderField("poType")(val?.code || "")}
              renderInput={(params) => <TextField {...params} label="PO Type" />}
            />
          </Grid>
          {isAdminOrPM && (
            <Grid item xs={12} sm={4} md={2}>
              <Autocomplete
                size="small"
                options={options.purchaseGroups}
                loading={optionsLoading}
                getOptionLabel={(o) => o.label || ""}
                isOptionEqualToValue={(o, v) => o.code === v.code}
                value={findOption(options.purchaseGroups, headerFilters.purchaseGroup)}
                onChange={(_, val) => setHeaderField("purchaseGroup")(val?.code || "")}
                renderInput={(params) => <TextField {...params} label="Purchase Group" />}
              />
            </Grid>
          )}
          {isAdminOrPM && (
            <Grid item xs={12} sm={4} md={2}>
              <Autocomplete
                size="small"
                options={options.submitters}
                loading={optionsLoading}
                getOptionLabel={(o) => o.label || ""}
                isOptionEqualToValue={(o, v) => o.code === v.code}
                value={findOption(options.submitters, headerFilters.submittedBy)}
                onChange={(_, val) => setHeaderField("submittedBy")(val?.code || "")}
                renderInput={(params) => <TextField {...params} label="Buyer" />}
              />
            </Grid>
          )}
          <Grid item xs={12} sm={4} md={2}>
            <TextField
              label="From"
              type="date"
              size="small"
              fullWidth
              InputLabelProps={{ shrink: true }}
              value={headerFilters.dateFrom}
              onChange={(e) => setHeaderField("dateFrom")(e.target.value)}
            />
          </Grid>
          <Grid item xs={12} sm={4} md={2}>
            <TextField
              label="To"
              type="date"
              size="small"
              fullWidth
              InputLabelProps={{ shrink: true }}
              value={headerFilters.dateTo}
              onChange={(e) => setHeaderField("dateTo")(e.target.value)}
            />
          </Grid>
          <Grid item xs={12} sm={8} md={4}>
            <Stack direction="row" spacing={1}>
              <Button variant="contained" fullWidth onClick={handleHeaderSearch}>
                Search
              </Button>
              <Button variant="outlined" startIcon={<RestartAltIcon />} onClick={handleHeaderReset}>
                Reset
              </Button>
            </Stack>
          </Grid>
        </Grid>

        <RemarksTable rows={headerRows} loading={headerLoading} showPlantColumn={false} />
        <TablePagination
          component={Box}
          count={headerTotal}
          page={headerPage}
          onPageChange={(_, newPage) => setHeaderPage(newPage)}
          rowsPerPage={headerPageSize}
          onRowsPerPageChange={(e) => {
            setHeaderPageSize(Number(e.target.value));
            setHeaderPage(0);
          }}
          rowsPerPageOptions={[10, 25, 50, 100]}
        />
      </Box>

      {/* ============================== LINE-LEVEL SECTION =============================== */}
      <Box sx={{ display: activeTab === "line" ? "block" : "none" }}>
        <Typography variant="caption" display="block" color="text.secondary" sx={{ mb: 1 }}>
          Checks against a specific PO line item
        </Typography>

        <Grid container spacing={2} sx={{ mt: 0.5, mb: 2 }}>
          <Grid item xs={12} sm={4} md={2}>
            <TextField
              label="PO Number"
              size="small"
              fullWidth
              value={lineFilters.poNumber}
              onChange={(e) => setLineField("poNumber")(e.target.value)}
            />
          </Grid>
          <Grid item xs={12} sm={4} md={2}>
            <TextField
              label="Search (PO / remark)"
              size="small"
              fullWidth
              value={lineFilters.search}
              onChange={(e) => setLineField("search")(e.target.value)}
            />
          </Grid>
          <Grid item xs={12} sm={4} md={2}>
            <Autocomplete
              size="small"
              options={options.points}
              loading={optionsLoading}
              getOptionLabel={(o) => o.label || ""}
              isOptionEqualToValue={(o, v) => o.code === v.code}
              value={findOption(options.points, lineFilters.pointNo)}
              onChange={(_, val) => setLineField("pointNo")(val?.code || "")}
              renderInput={(params) => <TextField {...params} label="Point" />}
            />
          </Grid>
          <Grid item xs={12} sm={4} md={2}>
            <Autocomplete
              size="small"
              options={options.systemResults}
              getOptionLabel={(o) => o.label || ""}
              isOptionEqualToValue={(o, v) => o.code === v.code}
              value={findOption(options.systemResults, lineFilters.systemResult)}
              onChange={(_, val) => {
                const next = val?.code || "";
                setLineField("systemResult")(next);
                setLinePage(0);
                fetchLineRows({ ...lineFilters, systemResult: next }, 0);
              }}
              renderInput={(params) => <TextField {...params} label="System Result" />}
            />
          </Grid>
          <Grid item xs={12} sm={4} md={2}>
            <Autocomplete
              size="small"
              options={options.vendors}
              loading={optionsLoading}
              getOptionLabel={(o) => o.label || ""}
              isOptionEqualToValue={(o, v) => o.code === v.code}
              value={findOption(options.vendors, lineFilters.vendorCode)}
              onChange={(_, val) => setLineField("vendorCode")(val?.code || "")}
              renderInput={(params) => <TextField {...params} label="Vendor" />}
            />
          </Grid>
          <Grid item xs={12} sm={4} md={2}>
            <Autocomplete
              size="small"
              options={options.plants}
              loading={optionsLoading}
              getOptionLabel={(o) => o.label || ""}
              isOptionEqualToValue={(o, v) => o.code === v.code}
              value={findOption(options.plants, lineFilters.plant)}
              onChange={(_, val) => setLineField("plant")(val?.code || "")}
              renderInput={(params) => <TextField {...params} label="Plant" />}
            />
          </Grid>
          <Grid item xs={12} sm={4} md={2}>
            <Autocomplete
              size="small"
              options={options.poTypes}
              loading={optionsLoading}
              getOptionLabel={(o) => o.label || ""}
              isOptionEqualToValue={(o, v) => o.code === v.code}
              value={findOption(options.poTypes, lineFilters.poType)}
              onChange={(_, val) => setLineField("poType")(val?.code || "")}
              renderInput={(params) => <TextField {...params} label="PO Type" />}
            />
          </Grid>
          {isAdminOrPM && (
            <Grid item xs={12} sm={4} md={2}>
              <Autocomplete
                size="small"
                options={options.purchaseGroups}
                loading={optionsLoading}
                getOptionLabel={(o) => o.label || ""}
                isOptionEqualToValue={(o, v) => o.code === v.code}
                value={findOption(options.purchaseGroups, lineFilters.purchaseGroup)}
                onChange={(_, val) => setLineField("purchaseGroup")(val?.code || "")}
                renderInput={(params) => <TextField {...params} label="Purchase Group" />}
              />
            </Grid>
          )}
          {isAdminOrPM && (
            <Grid item xs={12} sm={4} md={2}>
              <Autocomplete
                size="small"
                options={options.submitters}
                loading={optionsLoading}
                getOptionLabel={(o) => o.label || ""}
                isOptionEqualToValue={(o, v) => o.code === v.code}
                value={findOption(options.submitters, lineFilters.submittedBy)}
                onChange={(_, val) => setLineField("submittedBy")(val?.code || "")}
                renderInput={(params) => <TextField {...params} label="Buyer" />}
              />
            </Grid>
          )}
          <Grid item xs={12} sm={4} md={2}>
            <TextField
              label="From"
              type="date"
              size="small"
              fullWidth
              InputLabelProps={{ shrink: true }}
              value={lineFilters.dateFrom}
              onChange={(e) => setLineField("dateFrom")(e.target.value)}
            />
          </Grid>
          <Grid item xs={12} sm={4} md={2}>
            <TextField
              label="To"
              type="date"
              size="small"
              fullWidth
              InputLabelProps={{ shrink: true }}
              value={lineFilters.dateTo}
              onChange={(e) => setLineField("dateTo")(e.target.value)}
            />
          </Grid>
          <Grid item xs={12} sm={8} md={4}>
            <Stack direction="row" spacing={1}>
              <Button variant="contained" fullWidth onClick={handleLineSearch}>
                Search
              </Button>
              <Button variant="outlined" startIcon={<RestartAltIcon />} onClick={handleLineReset}>
                Reset
              </Button>
            </Stack>
          </Grid>
        </Grid>

        <RemarksTable rows={lineRows} loading={lineLoading} showPlantColumn={true} />
        <TablePagination
          component={Box}
          count={lineTotal}
          page={linePage}
          onPageChange={(_, newPage) => setLinePage(newPage)}
          rowsPerPage={linePageSize}
          onRowsPerPageChange={(e) => {
            setLinePageSize(Number(e.target.value));
            setLinePage(0);
          }}
          rowsPerPageOptions={[10, 25, 50, 100]}
        />
      </Box>

      {/* ================================ RC-LEVEL SECTION ================================ */}
      <Box sx={{ display: activeTab === "rc" ? "block" : "none" }}>
        <Typography variant="caption" display="block" color="text.secondary" sx={{ mb: 1 }}>
          Rate Contract (RC) overlap checks — one row per RC, not per PO line
        </Typography>

        <Grid container spacing={2} sx={{ mt: 0.5, mb: 2 }}>
          <Grid item xs={12} sm={4} md={2}>
            <TextField
              label="RC Number"
              size="small"
              fullWidth
              value={rcFilters.rcNumber}
              onChange={(e) => setRcField("rcNumber")(e.target.value)}
            />
          </Grid>
          <Grid item xs={12} sm={4} md={2}>
            <TextField
              label="Search (RC / vendor / remark)"
              size="small"
              fullWidth
              value={rcFilters.search}
              onChange={(e) => setRcField("search")(e.target.value)}
            />
          </Grid>
          <Grid item xs={12} sm={4} md={2}>
            <TextField
              label="Material Code"
              size="small"
              fullWidth
              value={rcFilters.rcMaterialCode}
              onChange={(e) => setRcField("rcMaterialCode")(e.target.value)}
            />
          </Grid>
          <Grid item xs={12} sm={4} md={2}>
            <Autocomplete
              size="small"
              options={options.rcStatuses}
              getOptionLabel={(o) => o.label || ""}
              isOptionEqualToValue={(o, v) => o.code === v.code}
              value={findOption(options.rcStatuses, rcFilters.rcStatus)}
              onChange={(_, val) => {
                const next = val?.code || "";
                setRcField("rcStatus")(next);
                setRcPage(0);
                fetchRcRows({ ...rcFilters, rcStatus: next }, 0);
              }}
              renderInput={(params) => <TextField {...params} label="RC Status" />}
            />
          </Grid>
          <Grid item xs={12} sm={4} md={2}>
            <Autocomplete
              size="small"
              options={options.vendors}
              loading={optionsLoading}
              getOptionLabel={(o) => o.label || ""}
              isOptionEqualToValue={(o, v) => o.code === v.code}
              value={findOption(options.vendors, rcFilters.vendorCode)}
              onChange={(_, val) => setRcField("vendorCode")(val?.code || "")}
              renderInput={(params) => <TextField {...params} label="Vendor" />}
            />
          </Grid>
          {isAdminOrPM && (
            <Grid item xs={12} sm={4} md={2}>
              <Autocomplete
                size="small"
                options={options.purchaseGroups}
                loading={optionsLoading}
                getOptionLabel={(o) => o.label || ""}
                isOptionEqualToValue={(o, v) => o.code === v.code}
                value={findOption(options.purchaseGroups, rcFilters.purchaseGroup)}
                onChange={(_, val) => setRcField("purchaseGroup")(val?.code || "")}
                renderInput={(params) => <TextField {...params} label="Purchase Group" />}
              />
            </Grid>
          )}
          {isAdminOrPM && (
            <Grid item xs={12} sm={4} md={2}>
              <Autocomplete
                size="small"
                options={options.submitters}
                loading={optionsLoading}
                getOptionLabel={(o) => o.label || ""}
                isOptionEqualToValue={(o, v) => o.code === v.code}
                value={findOption(options.submitters, rcFilters.submittedBy)}
                onChange={(_, val) => setRcField("submittedBy")(val?.code || "")}
                renderInput={(params) => <TextField {...params} label="Buyer" />}
              />
            </Grid>
          )}
          <Grid item xs={12} sm={4} md={2}>
            <TextField
              label="From"
              type="date"
              size="small"
              fullWidth
              InputLabelProps={{ shrink: true }}
              value={rcFilters.dateFrom}
              onChange={(e) => setRcField("dateFrom")(e.target.value)}
            />
          </Grid>
          <Grid item xs={12} sm={4} md={2}>
            <TextField
              label="To"
              type="date"
              size="small"
              fullWidth
              InputLabelProps={{ shrink: true }}
              value={rcFilters.dateTo}
              onChange={(e) => setRcField("dateTo")(e.target.value)}
            />
          </Grid>
          <Grid item xs={12} sm={8} md={4}>
            <Stack direction="row" spacing={1}>
              <Button variant="contained" fullWidth onClick={handleRcSearch}>
                Search
              </Button>
              <Button variant="outlined" startIcon={<RestartAltIcon />} onClick={handleRcReset}>
                Reset
              </Button>
            </Stack>
          </Grid>
        </Grid>

        <RcRemarksTable rows={rcRows} loading={rcLoading} />
        <TablePagination
          component={Box}
          count={rcTotal}
          page={rcPage}
          onPageChange={(_, newPage) => setRcPage(newPage)}
          rowsPerPage={rcPageSize}
          onRowsPerPageChange={(e) => {
            setRcPageSize(Number(e.target.value));
            setRcPage(0);
          }}
          rowsPerPageOptions={[10, 25, 50, 100]}
        />
      </Box>
    </Card>
  );
}