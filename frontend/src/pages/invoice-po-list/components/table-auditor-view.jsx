import { useEffect, useState } from "react";
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Menu,
  MenuItem,
  Pagination,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";

import moment from "moment";
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import OpenInNewRoundedIcon from "@mui/icons-material/OpenInNewRounded";
import VisibilityRoundedIcon from "@mui/icons-material/VisibilityRounded";

import { get, post } from "utils/axiosApi";
import { toast } from "react-toastify";
import { TableSkeleton } from "../../../components/Skeletons";
import SearchResultLink from "../../../components/SearchResultLink";

export const ViewPJVInvoiceRefDocs = ({ docs }) => {
  const [anchorEl, setAnchorEl] = useState(null);
  const [menuItems, setMenuItems] = useState([]);
  const open = Boolean(anchorEl);
  const handleClick = (event, docs) => {
    setAnchorEl(event.currentTarget);
    setMenuItems(docs);
  };
  const handleClose = () => {
    setAnchorEl(null);
  };
  return (
    <>
      {docs ? docs?.slice(0, 2)?.join(", ") : "-"}
      {docs && docs.length > 2 && (
        <Button
          id=""
          aria-controls={open ? "basic-menu" : undefined}
          aria-haspopup="true"
          aria-expanded={open ? "true" : undefined}
          onClick={(e) => handleClick(e, docs)}
          sx={{ display: "inline-block", py: 0 }}
        >
          ...more
        </Button>
      )}
      <Menu
        id="basic-menu"
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        sx={{
          "& .MuiPaper-root": {
            minWidth: "200px",
            boxShadow:
              "0px 1px 1px rgba(160, 159, 159, 0.25), 0px 1px 2px rgba(157, 157, 157, 0.22)",
            borderRadius: "6px",
          },
        }}
        slotProps={{
          list: { "aria-labelledby": "basic-button" },
        }}
      >
        <Typography
          variant="h6"
          sx={{
            px: 2,
            pb: 1,
            fontWeight: 500,
            borderBottom: "2px solid gray",
          }}
        >
          PJV Invoice Ref Doc
        </Typography>
        {menuItems.map((item, index) => (
          <MenuItem key={index + item}>{item}</MenuItem>
        ))}
      </Menu>
    </>
  );
};

// Column mappings for PJV and PO types
const columnMappings = {
  PJV: [
    { key: "documentNumber", label: "Document No/Ref No" },
    { key: "nameOfVendor", label: "Supplier Name" },
    {
      key: "amount",
      label: "Amount",
      render: (row) =>
        `${row.amount_currency} ${Number(row.amount).toFixed(2)}`,
    },
    {
      key: "auditedOn",
      label: "System Audited on",
      render: (row) =>
        row.auditedOn ? moment(row.auditedOn).format("DD-MM-YYYY HH:mm") : "-",
    },
    {
      key: "manuallyVerifiedOn",
      label: "Audited on",
      render: (row) =>
        row.manuallyVerifiedOn
          ? moment(row.manuallyVerifiedOn).format("DD-MM-YYYY HH:mm")
          : "-",
    },
    {
      key: "manuallyVerifiedBy",
      label: "Audited by",
      render: (row) => row.verifiedBy || "-",
    },
    { key: "GSTInOfVendor", label: "GSTIN of Vendor" },
    { key: "documentName", label: "Document Name" },
    {
      key: "documentDate",
      label: "Document Date",
      render: (row) =>
        row.documentDate ? moment(row.documentDate).format("DD-MM-YYYY") : "-",
    },
    { key: "fiscalYear", label: "Fiscal Year" },
    {
      key: "invoiceNo",
      label: "Invoice No/Reference",
      render: (row) => row.reference || row.invoiceNo || "-",
    },
    { key: "vendor", label: "Vendor" },
    { key: "vendorTitle", label: "Vendor Title" },
    {
      key: "imported",
      label: "Imported",
      render: (row) => (row.imported ? "Yes" : "No"), // Simplified; could use Chip if needed
    },
    { key: "objectKey", label: "Object Key" },
    { key: "taxCode", label: "Tax Code" },
    { key: "auditor_who_closed", label: "Submitted by", view: 1 },
  ],
  NONPO: [
    { key: "documentNumber", label: "Document No/Ref No" },
    { key: "nameOfVendor", label: "Supplier Name" },
    {
      key: "amount",
      label: "Amount",
      render: (row) =>
        `${row.amount_currency} ${Number(row.amount).toFixed(2)}`,
    },
    {
      key: "auditedOn",
      label: "System Audited on",
      render: (row) =>
        row.auditedOn ? moment(row.auditedOn).format("DD-MM-YYYY HH:mm") : "-",
    },
    {
      key: "manuallyVerifiedOn",
      label: "Audited on",
      render: (row) =>
        row.manuallyVerifiedOn
          ? moment(row.manuallyVerifiedOn).format("DD-MM-YYYY HH:mm")
          : "-",
    },
    {
      key: "manuallyVerifiedBy",
      label: "Audited by",
      render: (row) => row.verifiedBy || "-",
    },
    { key: "GSTInOfVendor", label: "GSTIN of Vendor" },
    { key: "documentName", label: "Document Name" },
    {
      key: "documentDate",
      label: "Document Date",
      render: (row) =>
        row.documentDate ? moment(row.documentDate).format("DD-MM-YYYY") : "-",
    },
    { key: "fiscalYear", label: "Fiscal Year" },
    {
      key: "invoiceNo",
      label: "Invoice No/Reference",
      render: (row) => row.reference || row.invoiceNo || "-",
    },
    { key: "vendor", label: "Vendor" },
    { key: "vendorTitle", label: "Vendor Title" },
    {
      key: "imported",
      label: "Imported",
      render: (row) => (row.imported ? "Yes" : "No"), // Simplified; could use Chip if needed
    },
    { key: "objectKey", label: "Object Key" },
    { key: "taxCode", label: "Tax Code" },
    { key: "auditor_who_closed", label: "Submitted by", view: 1 },
  ],
  PO: [
    { key: "po_number", label: "PO Number" },
    { key: "po_material_number", label: "PO Material Number" },
    { key: "purchase_req", label: "Purchase Req" },
    {
      key: "pr_create_date",
      label: "PR Create Date",
      render: (row) =>
        row.pr_create_date
          ? moment(row.pr_create_date).format("DD-MM-YYYY")
          : "-",
    },
    {
      key: "po_created_date",
      label: "PO Created Date",
      render: (row) =>
        row.po_created_date
          ? moment(row.po_created_date).format("DD-MM-YYYY")
          : "-",
    },
    {
      key: "po_delivery_date",
      label: "PO Delivery Date",
      render: (row) =>
        row.po_delivery_date
          ? moment(row.po_delivery_date).format("DD-MM-YYYY")
          : "-",
    },
    {
      key: "auditedOn",
      label: "System Audited on",
      render: (row) =>
        row.auditedOn ? moment(row.auditedOn).format("DD-MM-YYYY HH:mm") : "-",
    },
    {
      key: "manuallyVerifiedOn",
      label: "Audited on",
      render: (row) =>
        row.manuallyVerifiedOn
          ? moment(row.manuallyVerifiedOn).format("DD-MM-YYYY HH:mm")
          : "-",
    },
    {
      key: "manuallyVerifiedBy",
      label: "Audited by",
      render: (row) => row.verifiedBy || "-",
    },
    { key: "vendor_code", label: "Vendor Code" },
    { key: "name", label: "Name" },
    { key: "gstin", label: "GSTIN" },
    { key: "tax_code", label: "Tax Code" },
    { key: "tax_code_description", label: "Tax Code Description" },
    { key: "payment_term", label: "Payment Term" },
    { key: "payt_terms_description", label: "Payment Terms Description" },
    { key: "special_payment_terms", label: "Special Payment Terms" },
    { key: "train_station", label: "Train Station" },
    { key: "pr_quantity", label: "PR Quantity" },
    { key: "po_qty", label: "PO Quantity" },
    {
      key: "under_delivery_tolerance_other_than_ea",
      label: "Under Delivery Tolerance",
    },
    { key: "unit_of_measure", label: "Unit of Measure" },
    { key: "material_code", label: "Material Code" },
    { key: "material_disc", label: "Material Description" },
    { key: "plant", label: "Plant" },
    { key: "net_value", label: "Net Value" },
    { key: "hsn_code", label: "HSN Code" },
    { key: "inco_term", label: "Inco Term" },
    { key: "doc_cond_no", label: "Document Condition No" },
    { key: "condition_type", label: "Condition Type" },
    { key: "condition_value", label: "Condition Value" },
    { key: "auditor_who_closed", label: "Submitted by", view: 1 },
  ],
  BPV: [
    { key: "documentNumber", label: "Document No/Ref No" },
    {
      key: "documentDate",
      label: "Document Date",
      render: (row) =>
        row.documentDate ? moment(row.documentDate).format("DD-MM-YYYY") : "-",
    },
    {
      key: "amount",
      label: "Amount",
      render: (row) =>
        `${row.amount_currency} ${Number(row.amount).toFixed(2)}`,
    },
    {
      key: "auditedOn",
      label: "System Audited on",
      render: (row) =>
        row.auditedOn ? moment(row.auditedOn).format("DD-MM-YYYY HH:mm") : "-",
    },
    {
      key: "manuallyVerifiedOn",
      label: "Audited on",
      render: (row) =>
        row.manuallyVerifiedOn
          ? moment(row.manuallyVerifiedOn).format("DD-MM-YYYY HH:mm")
          : "-",
    },
    {
      key: "manuallyVerifiedBy",
      label: "Audited by",
      render: (row) => row.verifiedBy || "-",
    },
    { key: "GSTInOfVendor", label: "GST IN of Vendor" },
    { key: "nameOfVendor", label: "Name of Vendor" },
    { key: "tax_code", label: "Withholding Tax Code" },
    {
      key: "pjvInvoiceRefDocs",
      label: "PJV Invoice Ref Docs",
      render: (row) => <ViewPJVInvoiceRefDocs docs={row.pjvInvoiceRefDocs} />,
    },

    { key: "withHoldingTaxRate", label: "Withholding Tax Rate" },
    {
      key: "specialGlIndicator",
      label: "PJV Invoice Ref Doc",
      render: (row) => row.reference || row.specialGlIndicator || "-",
    },
    { key: "bpvPo", label: "BPV PO" },
    {
      key: "imported",
      label: "Imported",
      render: (row) => (row.imported ? "Yes" : "No"), // Simplified; could use Chip if needed
    },
    { key: "auditor_who_closed", label: "Submitted by", view: 1 },
  ],
};

// Fields hidden from the generic PO preview modal (noise / already shown in the title).
const PREVIEW_EXCLUDE_KEYS = new Set(["_id", "__v", "processDocuments", "multipleMatches"]);

const humanizeKey = (k) =>
  k
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/^./, (c) => c.toUpperCase());

const buildPoSearchUrl = (poNumber, lineItem, fiscalYear) => {
  const params = new URLSearchParams();
  if (poNumber) params.set("PONo", poNumber);
  if (lineItem) params.set("poLineItem", lineItem);
  if (fiscalYear) params.set("year", fiscalYear);
  return `/search-data?${params.toString()}`;
};

// Fields whose values should render as a colored status chip (audit-result
// style: Verified / Not Verified / N/A / Manual Review) instead of plain text.
const isTaggableKey = (key) => /status|verified|complian|result|remark/i.test(key);

const TAG_STYLES = [
  { test: /^(true|yes|verified|compliant|passed?|ok)$/i, bg: "#dcfce7", color: "#15803d" },
  { test: /^(false|no|not[\s_-]?verified|exception|failed?|non[\s_-]?compliant)$/i, bg: "#fee2e2", color: "#b91c1c" },
  { test: /^(n\/?a|not[\s_-]?applicable)$/i, bg: "#f1f5f9", color: "#475569" },
  { test: /^(manual([\s_-]?review)?|pending)$/i, bg: "#fef9c3", color: "#a16207" },
];

const renderTagOrValue = (key, value) => {
  if (typeof value === "boolean") {
    return (
      <Chip
        size="small"
        label={value ? "Verified" : "Not Verified"}
        sx={{ bgcolor: value ? "#dcfce7" : "#fee2e2", color: value ? "#15803d" : "#b91c1c", fontWeight: 700 }}
      />
    );
  }
  if (isTaggableKey(key) && typeof value === "string") {
    const match = TAG_STYLES.find((m) => m.test.test(value.trim()));
    if (match) {
      return <Chip size="small" label={value} sx={{ bgcolor: match.bg, color: match.color, fontWeight: 700 }} />;
    }
  }
  return (
    <Typography variant="body2" sx={{ fontWeight: 600, wordBreak: "break-word" }}>
      {String(value)}
    </Typography>
  );
};

/**
 * Quick, generic preview of a PO's audit details/results fetched straight
 * from the same endpoint the full Search Audit Data page uses. Lets the
 * user peek at a row without leaving this table.
 */
const PoRowPreviewDialog = ({ preview, onClose, onOpenFullPage }) => {
  const [loading, setLoading] = useState(false);
  const [details, setDetails] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!preview) {
      setDetails(null);
      setError("");
      return;
    }
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError("");
      setDetails(null);
      try {
        const res = await post("/getPOAuditResult", {
          po_number: preview.poNumber,
          po_line_item: preview.lineItem || undefined,
          fiscalYear: preview.fiscalYear || undefined,
        });
        if (cancelled) return;
        if (res?.multipleMatches) {
          setError("This PO has multiple line items. Open the full search page to choose one.");
        } else {
          setDetails(res);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err?.response?.data?.message || err?.message || "Failed to load PO details");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [preview]);

  const scalarEntries = useMemo(() => {
    if (!details) return [];
    return Object.entries(details).filter(
      ([k, v]) => !PREVIEW_EXCLUDE_KEYS.has(k) && v !== null && v !== undefined && typeof v !== "object"
    );
  }, [details]);

  const tableFields = useMemo(() => {
    if (!details) return [];
    return Object.entries(details).filter(
      ([k, v]) => !PREVIEW_EXCLUDE_KEYS.has(k) && Array.isArray(v) && v.length && typeof v[0] === "object"
    );
  }, [details]);

  return (
    <Dialog open={!!preview} onClose={onClose} maxWidth="md" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
      <DialogTitle sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 800 }}>
            PO {preview?.poNumber}
            {preview?.lineItem ? ` — Line ${preview.lineItem}` : ""}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Quick preview of audit data &amp; results
          </Typography>
        </Box>
        <IconButton onClick={onClose} size="small">
          <CloseRoundedIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        {loading && (
          <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
            <CircularProgress size={28} />
          </Box>
        )}
        {!loading && error && (
          <Typography color="error" sx={{ py: 2 }}>
            {error}
          </Typography>
        )}
        {!loading && !error && details && (
          <Box>
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr 1fr", sm: "repeat(3, 1fr)" },
                gap: 2,
                mb: 3,
              }}
            >
              {scalarEntries.map(([k, v]) => (
                <Box key={k}>
                  <Typography variant="caption" sx={{ color: "text.secondary", fontWeight: 700, display: "block", mb: 0.5 }}>
                    {humanizeKey(k)}
                  </Typography>
                  {renderTagOrValue(k, v)}
                </Box>
              ))}
              {scalarEntries.length === 0 && (
                <Typography color="text.secondary">No summary fields returned.</Typography>
              )}
            </Box>

            {tableFields.map(([k, rows]) => (
              <Box key={k} sx={{ mb: 3 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                  {humanizeKey(k)}
                </Typography>
                <TableContainer component={Paper} variant="outlined">
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        {Object.keys(rows[0]).map((col) => (
                          <TableCell key={col} sx={{ fontWeight: 700 }}>
                            {humanizeKey(col)}
                          </TableCell>
                        ))}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {rows.map((row, idx) => (
                        <TableRow key={idx}>
                          {Object.keys(rows[0]).map((col) => (
                            <TableCell key={col}>
                              {row[col] !== null && typeof row[col] === "object"
                                ? JSON.stringify(row[col])
                                : renderTagOrValue(col, row[col] ?? "—")}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>
            ))}
          </Box>
        )}
        {!loading && !error && !details && (
          <Typography color="text.secondary" sx={{ py: 4, textAlign: "center" }}>
            No details found for this PO.
          </Typography>
        )}
      </DialogContent>
      <DialogActions sx={{ p: 2 }}>
        <Button onClick={onClose}>Close</Button>
        <Button variant="outlined" startIcon={<OpenInNewRoundedIcon />} onClick={() => onOpenFullPage(preview, true)}>
          Open in New Tab
        </Button>
        <Button variant="contained" onClick={() => onOpenFullPage(preview, false)}>
          Go to Full Search Page
        </Button>
      </DialogActions>
    </Dialog>
  );
};

const TableAuditorView = ({ type, tableData = [], loading, comp }) => {
  const navigate = useNavigate();
  const username = localStorage.getItem("username");

  const [viewDocument, setViewDocument] = useState({
    isOpen: false,
    document: null,
  });

  const [loading1, setLoading1] = useState("");

  const [columns, setColumns] = useState([]);
  const [visibilitySettings, setVisibilitySettings] = useState({});

  // Row-click "open in new tab vs view here" menu — only meaningful for PO
  // rows, since that's the type with a PO number + line item to prefill.
  const [rowMenuAnchor, setRowMenuAnchor] = useState(null);
  const [rowMenuRow, setRowMenuRow] = useState(null);
  const [poPreview, setPoPreview] = useState(null);

  // Fetch visibility settings based on type
  useEffect(() => {
    const fetchVisibilitySettings = async () => {
      try {
        const response = await get(`/getVisibilitySettings?type=${type}`);
        setVisibilitySettings(response?.settings || {});
      } catch (error) {
        console.error("Error fetching visibility settings:", error);
      }
    };
    fetchVisibilitySettings();
  }, [type]);

  // Filter columns based on visibility settings
  useEffect(() => {
    const visibleColumns = columnMappings[type].filter((col) =>
      visibilitySettings[col.key]
        ? col.key === "manuallyVerifiedOn" || col.key === "manuallyVerifiedBy"
          ? !!comp
          : true
        : false
    );
    setColumns(visibleColumns);
  }, [visibilitySettings, type, comp]);

  const handleNavigate = (row) => {
    const url = (() => {
      switch (type) {
        case "BPV":
          return `/search-data?year=${row.fiscalYear}&paymentDocumentNumber=${row.documentNumber}`;
        case "PJV":
          return `/search-data?year=${row.fiscalYear}&documentNo=${row.documentNumber}`;
        case "NONPO":
          return `/search-data?year=${row.fiscalYear}&documentNo=${row.documentNumber}`;
        case "PO":
          return buildPoSearchUrl(
            row.po_number || row.documentNumber,
            row.po_material_number,
            row.fiscalYear
          );
        default:
          return "#";
      }
    })();
    navigate(url);
  };

  const openRowMenu = (event, row) => {
    if (type !== "PO") return; // only PO rows have a line item to prefill
    event.stopPropagation();
    setRowMenuAnchor(event.currentTarget);
    setRowMenuRow(row);
  };

  const closeRowMenu = () => {
    setRowMenuAnchor(null);
    setRowMenuRow(null);
  };

  const handleRowAction = (row, mode) => {
    if (!row) return;
    const poNumber = row.po_number || row.documentNumber;
    const lineItem = row.po_material_number;
    if (mode === "newtab") {
      window.open(buildPoSearchUrl(poNumber, lineItem, row.fiscalYear), "_blank", "noopener,noreferrer");
    } else {
      setPoPreview({ poNumber, lineItem, fiscalYear: row.fiscalYear });
    }
  };

  const openFullSearchPage = (preview, newTab) => {
    if (!preview) return;
    const url = buildPoSearchUrl(preview.poNumber, preview.lineItem, preview.fiscalYear);
    if (newTab) {
      window.open(url, "_blank", "noopener,noreferrer");
    } else {
      navigate(url);
    }
    setPoPreview(null);
  };

  if (loading) return <TableSkeleton />;

  return (
    <>
      <TableContainer
        component={Paper}
        elevation={0}
        sx={{
          mt: "5px",
          maxHeight: "70vh",
          // maxWidth: "95%",
          overflow: "auto",
          borderRadius: "12px",
          border: "1px solid lightgray",
        }}
      >
        <Table stickyHeader size="small">
          <TableHead sx={{ backgroundColor: "#f9f9f9" }}>
            <TableRow>
              <TableCell>Sr No</TableCell>
              {columns.map((col) => (
                <TableCell key={col.key}>{col.label}</TableCell>
              ))}
              {type === "PJV" && <TableCell>View</TableCell>}
              {type === "NONPO" && <TableCell>View</TableCell>}
              <TableCell>Action</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {tableData?.length ? (
              tableData.map((row, index) => (
                <TableRow
                  key={index}
                  hover={type === "PO"}
                  sx={type === "PO" ? { cursor: "pointer" } : undefined}
                  onClick={(e) => openRowMenu(e, row)}
                >
                  <TableCell>{1 + index}</TableCell>
                  {columns.map((col) => (
                    <TableCell key={col.key}>
                      {col.render ? col.render(row) : row[col.key] || "-"}
                    </TableCell>
                  ))}
                  {type === "PJV" && (
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Button
                        onClick={() =>
                          setViewDocument({
                            isOpen: true,
                            document: row.documentName,
                          })
                        }
                        sx={{ position: "inherit" }}
                      >
                        View Document
                      </Button>
                    </TableCell>
                  )}
                  {type === "NONPO" && (
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Button
                        onClick={() =>
                          setViewDocument({
                            isOpen: true,
                            document: row.documentName,
                          })
                        }
                        sx={{ position: "inherit" }}
                      >
                        View Document
                      </Button>
                    </TableCell>
                  )}
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    {username === row.assignedTo ? (
                      <SearchResultLink
                        number={row.documentNumber}
                        year={row.fiscalYear}
                        poMaterialNo={row.po_number}
                      >
                        <Button
                          disabled={!!loading1}
                          sx={{ position: "inherit" }}
                        >
                          {!comp ? "Start Review" : "View Details"}
                        </Button>
                      </SearchResultLink>
                    ) : (
                      <Button
                        disabled={!!loading1}
                        onClick={async () => {
                          try {
                            setLoading1(row._id);
                            await post(`assignAuditResult/${row._id}`, {});

                            handleNavigate(row);
                          } catch (error) {
                            toast.error("Assignment failed");
                          } finally {
                            setLoading1("");
                          }
                        }}
                        sx={{ position: "initial" }}
                      >
                        {loading1 === row._id ? (
                          <CircularProgress size={20} />
                        ) : !comp ? (
                          "Pick for review"
                        ) : (
                          "View Details"
                        )}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length + 3}
                  sx={{ width: "100%" }}
                  align="center"
                >
                  No Data
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* New-tab vs inline-preview choice for PO rows */}
      <Menu anchorEl={rowMenuAnchor} open={Boolean(rowMenuAnchor)} onClose={closeRowMenu}>
        <MenuItem
          onClick={() => {
            handleRowAction(rowMenuRow, "newtab");
            closeRowMenu();
          }}
        >
          <OpenInNewRoundedIcon fontSize="small" sx={{ mr: 1.25, color: "text.secondary" }} />
          Open in New Tab
        </MenuItem>
        <MenuItem
          onClick={() => {
            handleRowAction(rowMenuRow, "modal");
            closeRowMenu();
          }}
        >
          <VisibilityRoundedIcon fontSize="small" sx={{ mr: 1.25, color: "text.secondary" }} />
          View Details Here
        </MenuItem>
      </Menu>

      <PoRowPreviewDialog preview={poPreview} onClose={() => setPoPreview(null)} onOpenFullPage={openFullSearchPage} />

      <Dialog
        open={!!viewDocument.isOpen}
        fullWidth
        maxWidth="xl"
        sx={{ "& .MuiDialog-paper": { borderRadius: "12px" } }}
        onClose={() => setViewDocument({ isOpen: false })}
      >
        <DialogTitle sx={{ display: "flex", justifyContent: "center" }}>
          <Typography variant="h3" align="center" sx={{ fontWeight: 700 }}>
            Document : {viewDocument.document}
          </Typography>
          <IconButton
            onClick={() => setViewDocument({ isOpen: false })}
            sx={{ position: "absolute", top: "5px", right: "10px" }}
          >
            <CloseRoundedIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          <iframe
            src={`${import.meta.env.VITE_APP_BACKEND_URL}getDocument/${
              viewDocument.document
            }`}
            width="100%"
            height="600px"
          ></iframe>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default TableAuditorView;