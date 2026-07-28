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
} from "@mui/material";
import DownloadIcon from "@mui/icons-material/Download";
import RestartAltIcon from "@mui/icons-material/RestartAlt";

import {
  getPoRemarksReport,
  downloadPoRemarksReport,
  getPoRemarksReportFilterOptions,
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

export default function PoRemarksReportPage() {
  const { isAdmin, isProcurementManager } = getRbac() || {};
  const isAdminOrPM = isAdmin || isProcurementManager;

  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);

  // Dropdown option lists, sourced from /reports/po-remarks-report/filters
  const [options, setOptions] = useState({
    points: [],
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
      page: page + 1,
      pageSize,
      ...extra,
    }),
    [filters, page, pageSize],
  );

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await getPoRemarksReport(buildPayload());
      setRows(data.rows || []);
      setTotal(data.total || 0);
    } catch (err) {
      console.error("Failed to load remarks report:", err);
    } finally {
      setLoading(false);
    }
  }, [buildPayload]);

  useEffect(() => {
    fetchRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize]);

  const handleSearch = () => {
    setPage(0);
    fetchRows();
  };

  const handleReset = () => {
    setFilters(EMPTY_FILTERS);
    setPage(0);
    // fetch with cleared filters directly, since setFilters is async
    (async () => {
      setLoading(true);
      try {
        const { data } = await getPoRemarksReport({
          ...EMPTY_FILTERS,
          page: 1,
          pageSize,
        });
        setRows(data.rows || []);
        setTotal(data.total || 0);
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
        <Button
          variant="contained"
          startIcon={<DownloadIcon />}
          onClick={handleDownload}
          disabled={downloading}
        >
          {downloading ? "Preparing..." : "Download Report"}
        </Button>
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

        {/* --- Point No dropdown, options derived from actual remarks --- */}
        <Grid item xs={12} sm={3} md={2}>
          <Autocomplete
            size="small"
            options={options.points}
            loading={optionsLoading}
            getOptionLabel={(o) => o.label || ""}
            isOptionEqualToValue={(o, v) => o.code === v.code}
            value={findOption(options.points, filters.pointNo)}
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

        {/* --- Plant dropdown --- */}
        <Grid item xs={12} sm={3} md={2}>
          <Autocomplete
            size="small"
            options={options.plants}
            loading={optionsLoading}
            getOptionLabel={(o) => o.label || ""}
            isOptionEqualToValue={(o, v) => o.code === v.code}
            value={findOption(options.plants, filters.plant)}
            onChange={(_, val) => setField("plant")(val?.code || "")}
            renderInput={(params) => <TextField {...params} label="Plant" />}
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

      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>PO / Line</TableCell>
              <TableCell>Point</TableCell>
              <TableCell>Buyer's Remark</TableCell>
              <TableCell>Submitted By</TableCell>
              <TableCell>System Result</TableCell>
              <TableCell>System Remarks</TableCell>
              <TableCell>Vendor</TableCell>
              <TableCell>Plant</TableCell>
              <TableCell>Purchase Group</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={9} align="center">
                  <CircularProgress size={24} />
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} align="center">
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
                  <TableCell>{r.plantName || r.plant}</TableCell>
                  <TableCell>{r.purchaseGroupName || r.purchaseGroup}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <TablePagination
        component={Box}
        count={total}
        page={page}
        onPageChange={(_, newPage) => setPage(newPage)}
        rowsPerPage={pageSize}
        onRowsPerPageChange={(e) => {
          setPageSize(Number(e.target.value));
          setPage(0);
        }}
        rowsPerPageOptions={[10, 25, 50, 100]}
      />
    </Card>
  );
}