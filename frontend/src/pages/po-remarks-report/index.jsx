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
  Divider,
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

// Same shape minus plant, since PoHeaderResult has no plant field.
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

function findOption(options, code) {
  if (!code) return null;
  return options.find((o) => o.code === code) || { code, label: code };
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
            <TableCell>Result Altered?</TableCell>
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
                    label={r.isSystemResultWrong || r.resultAltered?.startsWith("Yes") ? "Yes" : "No"}
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

export default function PoRemarksReportPage() {
  const { isAdmin, isProcurementManager } = getRbac() || {};
  const isAdminOrPM = isAdmin || isProcurementManager;

  const [downloading, setDownloading] = useState(false);
  const [downloadingIssueTracker, setDownloadingIssueTracker] = useState(false);

  const [options, setOptions] = useState({
    points: [],
    headerPoints: [],
    vendors: [],
    purchaseGroups: [],
    poTypes: [],
    plants: [],
    systemResults: [],
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
  // HEADER-LEVEL section — fully self-contained: own filters, fetch,
  // pagination. Reads data.header from the combined report response.
  // ==========================================================================
  const [headerFilters, setHeaderFilters] = useState(EMPTY_HEADER_FILTERS);
  const [headerRows, setHeaderRows] = useState([]);
  const [headerTotal, setHeaderTotal] = useState(0);
  const [headerPage, setHeaderPage] = useState(0);
  const [headerPageSize, setHeaderPageSize] = useState(25);
  const [headerLoading, setHeaderLoading] = useState(false);

  const fetchHeaderRows = useCallback(
    async (filtersOverride, pageOverride) => {
      setHeaderLoading(true);
      try {
        const { data } = await getPoRemarksReport({
          ...(filtersOverride ?? headerFilters),
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
    [headerFilters, headerPage, headerPageSize],
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
  // LINE-LEVEL section — fully self-contained, mirrors header section.
  // ==========================================================================
  const [lineFilters, setLineFilters] = useState(EMPTY_LINE_FILTERS);
  const [lineRows, setLineRows] = useState([]);
  const [lineTotal, setLineTotal] = useState(0);
  const [linePage, setLinePage] = useState(0);
  const [linePageSize, setLinePageSize] = useState(25);
  const [lineLoading, setLineLoading] = useState(false);

  const fetchLineRows = useCallback(
    async (filtersOverride, pageOverride) => {
      setLineLoading(true);
      try {
        const { data } = await getPoRemarksReport({
          ...(filtersOverride ?? lineFilters),
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
    [lineFilters, linePage, linePageSize],
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
  // Downloads — export both sections in one workbook. Line filters are sent
  // as-is; header filters are prefixed so the backend can apply each
  // section's own filters to its own sheet.
  // ==========================================================================
  const buildDownloadPayload = () => ({
    ...lineFilters,
    ...Object.fromEntries(
      Object.entries(headerFilters).map(([k, v]) => [`header_${k}`, v]),
    ),
    sort: "po",
  });

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const res = await downloadPoRemarksReport(buildDownloadPayload());
      const blob = new Blob([res.data], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
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
      const blob = new Blob([res.data], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
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

      {/* ============================= HEADER-LEVEL SECTION ============================= */}
      <Box sx={{ bgcolor: "action.hover", borderRadius: 1, p: 2, mb: 4 }}>
        <Typography variant="h6">
          Header-Level Remarks
          <Typography variant="caption" display="block" color="text.secondary">
            PO-wide checks — not tied to a specific line item
          </Typography>
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
              onChange={(_, val) => setHeaderField("systemResult")(val?.code || "")}
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

      <Divider sx={{ mb: 4 }} />

      {/* ============================== LINE-LEVEL SECTION =============================== */}
      <Box sx={{ bgcolor: "action.hover", borderRadius: 1, p: 2 }}>
        <Typography variant="h6">
          Line-Level Remarks
          <Typography variant="caption" display="block" color="text.secondary">
            Checks against a specific PO line item
          </Typography>
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
              onChange={(_, val) => setLineField("systemResult")(val?.code || "")}
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
    </Card>
  );
}