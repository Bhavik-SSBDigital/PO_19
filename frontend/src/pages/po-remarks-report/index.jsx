import { useEffect, useState, useCallback } from "react";
import {
  Box,
  Button,
  Card,
  Divider,
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

const EMPTY_FILTERS = {
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

// Turns a { code, label } option list into whatever the Autocomplete
// currently has selected (by code), so controlled value stays in sync
// even before the options list has loaded.
function findOption(options, code) {
  if (!code) return null;
  return options.find((o) => o.code === code) || { code, label: code };
}

// Shared table body for both sections — same columns, just a flag for
// which optional columns (Plant / GSTIN / Material) make sense to show,
// since header-level rows never populate those.
function RemarksTable({ rows, loading, showLineOnlyColumns }) {
  const colSpan = showLineOnlyColumns ? 11 : 9;

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
            <TableCell>System Remarks</TableCell>
            <TableCell>Vendor</TableCell>
            {showLineOnlyColumns && <TableCell>Plant</TableCell>}
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
                <TableCell sx={{ maxWidth: 260 }}>{r.buyerRemark}</TableCell>
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
                <TableCell sx={{ maxWidth: 260 }}>{r.systemRemarks}</TableCell>
                <TableCell>
                  {r.vendorName}
                  <Typography variant="caption" display="block" color="text.secondary">
                    {r.vendorCode}
                  </Typography>
                </TableCell>
                {showLineOnlyColumns && <TableCell>{r.plantName || r.plant}</TableCell>}
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

  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadingIssueTracker, setDownloadingIssueTracker] = useState(false);

  // --- Line-level section state ---
  const [lineRows, setLineRows] = useState([]);
  const [lineTotal, setLineTotal] = useState(0);
  const [linePage, setLinePage] = useState(0);
  const [linePageSize, setLinePageSize] = useState(25);

  // --- Header-level section state ---
  const [headerRows, setHeaderRows] = useState([]);
  const [headerTotal, setHeaderTotal] = useState(0);
  const [headerPage, setHeaderPage] = useState(0);
  const [headerPageSize, setHeaderPageSize] = useState(25);

  // Dropdown option lists, sourced from /reports/po-remarks-report/filters
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

  const buildPayload = useCallback(
    (extra = {}) => ({
      ...filters,
      page: linePage + 1,
      pageSize: linePageSize,
      headerPage: headerPage + 1,
      headerPageSize,
      ...extra,
    }),
    [filters, linePage, linePageSize, headerPage, headerPageSize],
  );

  const applyResponse = (data) => {
    setLineRows(data.line?.rows || []);
    setLineTotal(data.line?.total || 0);
    setHeaderRows(data.header?.rows || []);
    setHeaderTotal(data.header?.total || 0);
  };

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await getPoRemarksReport(buildPayload());
      applyResponse(data);
    } catch (err) {
      console.error("Failed to load remarks report:", err);
    } finally {
      setLoading(false);
    }
  }, [buildPayload]);

  useEffect(() => {
    fetchRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linePage, linePageSize, headerPage, headerPageSize]);

  const handleSearch = () => {
    setLinePage(0);
    setHeaderPage(0);
    // page state changes above will trigger the effect, but if we're
    // already on page 0 for both the effect won't re-fire — so fetch
    // directly too, mirroring the original component's behavior.
    (async () => {
      setLoading(true);
      try {
        const { data } = await getPoRemarksReport({
          ...filters,
          page: 1,
          pageSize: linePageSize,
          headerPage: 1,
          headerPageSize,
        });
        applyResponse(data);
      } catch (err) {
        console.error("Failed to search remarks report:", err);
      } finally {
        setLoading(false);
      }
    })();
  };

  const handleReset = () => {
    setFilters(EMPTY_FILTERS);
    setLinePage(0);
    setHeaderPage(0);
    (async () => {
      setLoading(true);
      try {
        const { data } = await getPoRemarksReport({
          ...EMPTY_FILTERS,
          page: 1,
          pageSize: linePageSize,
          headerPage: 1,
          headerPageSize,
        });
        applyResponse(data);
      } catch (err) {
        console.error("Failed to reset remarks report:", err);
      } finally {
        setLoading(false);
      }
    })();
  };

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const res = await downloadPoRemarksReport(buildPayload({ sort: "po" }));
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
      const res = await downloadIssueTrackerReport(buildPayload({ sort: "po" }));
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

  const setField = (key) => (value) =>
    setFilters((f) => ({ ...f, [key]: value }));

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

      <Grid container spacing={2} mb={2}>
        {/* --- Free-text filters --- */}
        <Grid item xs={12} sm={3} md={2}>
          <TextField
            label="PO Number"
            size="small"
            fullWidth
            value={filters.poNumber}
            onChange={(e) => setField("poNumber")(e.target.value)}
          />
        </Grid>
        <Grid item xs={12} sm={3} md={2}>
          <TextField
            label="Search (PO / remark text)"
            size="small"
            fullWidth
            value={filters.search}
            onChange={(e) => setField("search")(e.target.value)}
          />
        </Grid>

        {/* --- Point No dropdown: combined header + line points --- */}
        <Grid item xs={12} sm={3} md={2}>
          <Autocomplete
            size="small"
            options={[...options.headerPoints, ...options.points]}
            loading={optionsLoading}
            getOptionLabel={(o) => o.label || ""}
            isOptionEqualToValue={(o, v) => o.code === v.code}
            value={findOption([...options.headerPoints, ...options.points], filters.pointNo)}
            onChange={(_, val) => setField("pointNo")(val?.code || "")}
            renderInput={(params) => <TextField {...params} label="Point" />}
          />
        </Grid>

        {/* --- System Result dropdown (static 4 options) --- */}
        <Grid item xs={12} sm={3} md={2}>
          <Autocomplete
            size="small"
            options={options.systemResults}
            getOptionLabel={(o) => o.label || ""}
            isOptionEqualToValue={(o, v) => o.code === v.code}
            value={findOption(options.systemResults, filters.systemResult)}
            onChange={(_, val) => setField("systemResult")(val?.code || "")}
            renderInput={(params) => <TextField {...params} label="System Result" />}
          />
        </Grid>

        {/* --- Vendor dropdown --- */}
        <Grid item xs={12} sm={3} md={2}>
          <Autocomplete
            size="small"
            options={options.vendors}
            loading={optionsLoading}
            getOptionLabel={(o) => o.label || ""}
            isOptionEqualToValue={(o, v) => o.code === v.code}
            value={findOption(options.vendors, filters.vendorCode)}
            onChange={(_, val) => setField("vendorCode")(val?.code || "")}
            renderInput={(params) => <TextField {...params} label="Vendor" />}
          />
        </Grid>

        {/* --- Plant dropdown: only affects the line-level section --- */}
        <Grid item xs={12} sm={3} md={2}>
          <Autocomplete
            size="small"
            options={options.plants}
            loading={optionsLoading}
            getOptionLabel={(o) => o.label || ""}
            isOptionEqualToValue={(o, v) => o.code === v.code}
            value={findOption(options.plants, filters.plant)}
            onChange={(_, val) => setField("plant")(val?.code || "")}
            renderInput={(params) => <TextField {...params} label="Plant (line-level only)" />}
          />
        </Grid>

        {/* --- PO Type dropdown --- */}
        <Grid item xs={12} sm={3} md={2}>
          <Autocomplete
            size="small"
            options={options.poTypes}
            loading={optionsLoading}
            getOptionLabel={(o) => o.label || ""}
            isOptionEqualToValue={(o, v) => o.code === v.code}
            value={findOption(options.poTypes, filters.poType)}
            onChange={(_, val) => setField("poType")(val?.code || "")}
            renderInput={(params) => <TextField {...params} label="PO Type" />}
          />
        </Grid>

        {/* --- Purchase Group dropdown: Admin/PM only --- */}
        {isAdminOrPM && (
          <Grid item xs={12} sm={3} md={2}>
            <Autocomplete
              size="small"
              options={options.purchaseGroups}
              loading={optionsLoading}
              getOptionLabel={(o) => o.label || ""}
              isOptionEqualToValue={(o, v) => o.code === v.code}
              value={findOption(options.purchaseGroups, filters.purchaseGroup)}
              onChange={(_, val) => setField("purchaseGroup")(val?.code || "")}
              renderInput={(params) => <TextField {...params} label="Purchase Group" />}
            />
          </Grid>
        )}

        {/* --- Buyer dropdown: Admin/PM only --- */}
        {isAdminOrPM && (
          <Grid item xs={12} sm={3} md={2}>
            <Autocomplete
              size="small"
              options={options.submitters}
              loading={optionsLoading}
              getOptionLabel={(o) => o.label || ""}
              isOptionEqualToValue={(o, v) => o.code === v.code}
              value={findOption(options.submitters, filters.submittedBy)}
              onChange={(_, val) => setField("submittedBy")(val?.code || "")}
              renderInput={(params) => <TextField {...params} label="Buyer" />}
            />
          </Grid>
        )}

        {/* --- Date range --- */}
        <Grid item xs={12} sm={3} md={2}>
          <TextField
            label="From"
            type="date"
            size="small"
            fullWidth
            InputLabelProps={{ shrink: true }}
            value={filters.dateFrom}
            onChange={(e) => setField("dateFrom")(e.target.value)}
          />
        </Grid>
        <Grid item xs={12} sm={3} md={2}>
          <TextField
            label="To"
            type="date"
            size="small"
            fullWidth
            InputLabelProps={{ shrink: true }}
            value={filters.dateTo}
            onChange={(e) => setField("dateTo")(e.target.value)}
          />
        </Grid>

        <Grid item xs={12} sm={6} md={4}>
          <Stack direction="row" spacing={1}>
            <Button variant="contained" fullWidth onClick={handleSearch}>
              Search
            </Button>
            <Button
              variant="outlined"
              startIcon={<RestartAltIcon />}
              onClick={handleReset}
            >
              Reset
            </Button>
          </Stack>
        </Grid>
      </Grid>

      {/* ============================= HEADER-LEVEL ============================= */}
      <Typography variant="h6" sx={{ mt: 3, mb: 1 }}>
        Header-Level Remarks
        <Typography variant="caption" display="block" color="text.secondary">
          PO-wide checks — not tied to a specific line item
        </Typography>
      </Typography>
      <RemarksTable rows={headerRows} loading={loading} showLineOnlyColumns={false} />
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

      <Divider sx={{ my: 3 }} />

      {/* ============================== LINE-LEVEL =============================== */}
      <Typography variant="h6" sx={{ mb: 1 }}>
        Line-Level Remarks
        <Typography variant="caption" display="block" color="text.secondary">
          Checks against a specific PO line item
        </Typography>
      </Typography>
      <RemarksTable rows={lineRows} loading={loading} showLineOnlyColumns={true} />
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
    </Card>
  );
}