import { useEffect, useState } from "react";
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
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
    // const url = {
    //   PJV: `/search-data?documentNo=${row.documentNumber}&year=${row.fiscalYear}`,
    //   PO: `/search-data?PONo=${row.po_material_number}`,
    //   BPV: `/search-data?paymentDocumentNumber=${row.documentNumber}&year=${row.fiscalYear}`,
    // }[type];
    const url = (() => {
      switch (type) {
        case "BPV":
          return `/search-data?year=${row.fiscalYear}&paymentDocumentNumber=${row.documentNumber}`;
        case "PJV":
          return `/search-data?year=${row.fiscalYear}&documentNo=${row.documentNumber}`;
        case "NONPO":
          return `/search-data?year=${row.fiscalYear}&documentNo=${row.documentNumber}`;
        case "PO":
          return `/search-data?year=${row.fiscalYear}&PONo=${
            row.po_number || row.documentNumber
          }`;
        default:
          return "#";
      }
    })();
    navigate(url);
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
                <TableRow key={index}>
                  <TableCell>{1 + index}</TableCell>
                  {columns.map((col) => (
                    <TableCell key={col.key}>
                      {col.render ? col.render(row) : row[col.key] || "-"}
                    </TableCell>
                  ))}
                  {type === "PJV" && (
                    <TableCell>
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
                    <TableCell>
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
                  <TableCell>
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
