import { useEffect, useState } from "react";
import {
  Box,
  Button,
  Chip,
  Grid,
  MenuItem,
  Pagination,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import moment from "moment";
import { toast } from "react-toastify";
import { useSearchParams } from "react-router-dom";

import { post } from "utils/axiosApi";
import { TableSkeleton } from "components/Skeletons";
import PoAuditResultDialog from "./components/po-audit-result-dialog";

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "unassigned", label: "Unassigned" },
  { value: "assigned", label: "Assigned" },
  { value: "under_review", label: "Under review" },
  { value: "head_review", label: "Head review" },
  { value: "completed", label: "Completed" },
];

const STATUS_COLOR = {
  unassigned: "default",
  assigned: "info",
  under_review: "warning",
  head_review: "warning",
  completed: "success",
};

const PAGE_SIZE = 25;

const DEEP_LINK_KEYS = [
  "poType",
  "purchaseGroup",
  "plant",
  "vendorCode",
  "month",
  "notVerifiedPointNo",
  "severity",
  "status",
];

function readDeepLinkFilters(searchParams) {
  const result = { holdOnly: searchParams.get("holdOnly") === "true", holdBucket: searchParams.get("holdBucket") || "" };
  for (const key of DEEP_LINK_KEYS) {
    result[key] = searchParams.get(key) || "";
  }
  return result;
}

const PoAuditResultsPage = () => {
  const [searchParams] = useSearchParams();
  const [filters, setFilters] = useState({
    poNumber: "",
    vendorCode: "",
    fiscalYear: "",
    status: "",
    poType: "",
    ...readDeepLinkFilters(searchParams),
  });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [selectedId, setSelectedId] = useState(null);

 const fetchResults = async (targetPage, targetFilters) => {
    setLoading(true);
    try {
      const f = targetFilters || filters;
      console.log("fff", f)
      const body = {
        page: targetPage,
        pageSize: PAGE_SIZE,
        ...(f.poNumber && { poNumber: f.poNumber }),
        ...(f.vendorCode && { vendorCode: f.vendorCode }),
        ...(f.fiscalYear && { fiscalYear: f.fiscalYear }),
        ...(f.status && { status: f.status }),
        ...(f.poType && { poType: f.poType }),
        ...(f.purchaseGroup && { purchaseGroup: f.purchaseGroup }),
        ...(f.plant && { plant: f.plant }),
        ...(f.month && { month: f.month }),
        ...(f.notVerifiedPointNo && { notVerifiedPointNo: f.notVerifiedPointNo }),
        ...(f.severity && { severity: f.severity }),
        ...(f.holdOnly && { holdOnly: true }),
        ...(f.holdOnly && f.holdBucket && { holdBucket: f.holdBucket }),
      };
      
      const response = await post("/getPOAuditResults", body);

      console.log("response", response)
      
      // Safely extract data whether Axios returns the full response object or just the data
      const responseData = response?.data || response;
      
      setRows(responseData?.results || []);
      setTotal(responseData?.total || 0);
    } catch (error) {
      console.error("Error fetching PO audit results:", error);
      toast.error("Failed to load PO audit results");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const next = {
      poNumber: "",
      vendorCode: "",
      fiscalYear: "",
      status: "",
      poType: "",
      ...readDeepLinkFilters(searchParams),
    };
    setFilters(next);
    setPage(1);
    fetchResults(1, next);
  }, [searchParams]);

  useEffect(() => {
    fetchResults(page);
  }, [page]);

  const handleSearch = () => {
    setPage(1);
    fetchResults(1);
  };

  const clearFilter = (key) => {
    const next = { ...filters, [key]: key === "holdOnly" ? false : "" };
    setFilters(next);
    setPage(1);
    fetchResults(1, next);
  };

  const pageCount = Math.max(Math.ceil(total / PAGE_SIZE), 1);

  const activeDeepLinkChips = [
    filters.poType && { key: "poType", label: `PO Type: ${filters.poType}` },
    filters.plant && { key: "plant", label: `Plant: ${filters.plant}` },
    filters.month && { key: "month", label: `Month: ${filters.month}` },
    filters.notVerifiedPointNo && { key: "notVerifiedPointNo", label: `Rule #${filters.notVerifiedPointNo} exceptions` },
    filters.severity && { key: "severity", label: `Severity: ${filters.severity}` },
    filters.holdOnly && { key: "holdOnly", label: filters.holdBucket === "overdue" ? "Hold POs: overdue" : filters.holdBucket === "not_due" ? "Hold POs: not yet due" : "Hold POs only" },
  ].filter(Boolean);

  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 1 }}>
        PO Audit Results
      </Typography>

      {activeDeepLinkChips.length > 0 && (
        <Box sx={{ mb: 2, display: "flex", gap: 1, flexWrap: "wrap" }}>
          {activeDeepLinkChips.map((chip) => (
            <Chip key={chip.key} size="small" label={chip.label} onDelete={() => clearFilter(chip.key)} />
          ))}
        </Box>
      )}

      <Paper sx={{ p: 2, mb: 2 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} sm={2.4}>
            <TextField
              fullWidth
              size="small"
              label="PO Number"
              value={filters.poNumber}
              onChange={(e) => setFilters({ ...filters, poNumber: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            />
          </Grid>
          <Grid item xs={12} sm={2.4}>
            <TextField
              fullWidth
              size="small"
              label="Vendor Code"
              value={filters.vendorCode}
              onChange={(e) => setFilters({ ...filters, vendorCode: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            />
          </Grid>
          <Grid item xs={12} sm={2}>
            <TextField
              fullWidth
              size="small"
              label="Fiscal Year"
              value={filters.fiscalYear}
              onChange={(e) => setFilters({ ...filters, fiscalYear: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            />
          </Grid>
          <Grid item xs={12} sm={2}>
            <TextField
              fullWidth
              size="small"
              label="PO Type"
              value={filters.poType}
              onChange={(e) => setFilters({ ...filters, poType: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            />
          </Grid>
          <Grid item xs={12} sm={2}>
            <TextField
              fullWidth
              select
              size="small"
              label="Status"
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
            >
              {STATUS_OPTIONS.map((opt) => (
                <MenuItem key={opt.value} value={opt.value}>
                  {opt.label}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid item xs={12} sm={1.2}>
            <Button fullWidth variant="contained" onClick={handleSearch}>
              Search
            </Button>
          </Grid>
        </Grid>
      </Paper>

      {loading ? (
        <TableSkeleton />
      ) : (
        <TableContainer component={Paper} sx={{ border: "1px solid lightgray", borderRadius: "12px" }}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ backgroundColor: "lightgray" }}>
                <TableCell>#</TableCell>
                <TableCell>PO Number</TableCell>
                <TableCell>Vendor</TableCell>
                <TableCell>Material</TableCell>
                <TableCell>PO Type</TableCell>
                <TableCell>PO Created</TableCell>
                <TableCell>Fiscal Year</TableCell>
                <TableCell>Workflow Status</TableCell>
                <TableCell>Assigned To</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} align="center">
                    No PO audit results found
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row, idx) => {
                  const status = row.verificationWorkflow?.currentStatus;
                  const assignee = row.verificationWorkflow?.assignee;
                  const serialNo = (page - 1) * PAGE_SIZE + idx + 1;
                  return (
                    <TableRow key={row.id} hover sx={{ cursor: "pointer" }} onClick={() => setSelectedId(row.id)}>
                      <TableCell>{serialNo}</TableCell>
                      <TableCell>{row.po_number || "-"}</TableCell>
                      <TableCell>{row.nameOfVendor || row.vendor_code || "-"}</TableCell>
                      <TableCell>{row.material_code || "-"}</TableCell>
                      <TableCell>{row.po_type || "-"}</TableCell>
                      <TableCell>{row.po_created_date ? moment(row.po_created_date).format("DD-MMM-YYYY") : "-"}</TableCell>
                      <TableCell>{row.fiscalYear || "-"}</TableCell>
                      <TableCell>
                        {status ? (
                          <Chip size="small" label={status.replace("_", " ")} color={STATUS_COLOR[status] || "default"} />
                        ) : (
                          <Chip size="small" label="unassigned" variant="outlined" />
                        )}
                      </TableCell>
                      <TableCell>{assignee ? `${assignee.firstName} ${assignee.lastName}` : "-"}</TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Box display="flex" justifyContent="center" alignItems="center" sx={{ mt: 2, gap: 2 }}>
        <Typography variant="caption" color="text.secondary">
          {total > 0 ? `Showing ${(page - 1) * PAGE_SIZE + 1}-${Math.min(page * PAGE_SIZE, total)} of ${total}` : "No records"}
        </Typography>
        <Pagination count={pageCount} page={page} onChange={(_, value) => setPage(value)} color="primary" />
      </Box>

      <PoAuditResultDialog id={selectedId} onClose={() => setSelectedId(null)} />
    </Box>
  );
};

export default PoAuditResultsPage;