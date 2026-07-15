import { useMemo, useState } from "react";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputLabel,
  TextField,
  Typography,
} from "@mui/material";

import moment from "moment";
import { toast } from "react-toastify";
import { useSelector } from "react-redux";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import FileDownloadOutlinedIcon from "@mui/icons-material/FileDownloadOutlined";

const DownloadTableToExcel = ({
  tableData = [],
  loading = false,
  recordPerPage = 20,
  totalPages = 0,
}) => {
  const { dataViewType } = useSelector((state) => state.menu);

  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportPages, setExportPages] = useState({ from: "", to: "" });

  const exportToCSV = () => {
    if (tableData.length === 0) {
      toast.info("No data to export");
      return;
    }
    const from = totalPages > 1 ? Number(exportPages.from) : 1;
    const to = totalPages > 1 ? Number(exportPages.to) : 1;

    if (isNaN(from) || isNaN(to) || from < 1 || to > totalPages || from > to) {
      toast.warn("Invalid page range");
      return;
    }

    const start = (from - 1) * recordPerPage;
    const end = to * recordPerPage;
    const slice = tableData.slice(start, end);

    const headers = [
      "Sr No.",
      "Document No/Ref No",
      "Supplier Name",
      "Amount",
      "Audited On",
      "Man. Verified On/ Closed On",
      "Man. Verified By/ Closed By",
      "Fiscal Year",
      "Invoice No",
      "Assigned to",
      "Completed",
      "Vendor Title",
    ];
    const headersNonPO = [
      "Sr No.",
      "Document No/Ref No",
      "Supplier Name",
      "Amount",
      "Audited On",
      "Man. Verified On/ Closed On",
      "Man. Verified By/ Closed By",
      "Fiscal Year",
      "Invoice No",
      "Assigned to",
      "Completed",
      "Vendor Title",
    ];
    const headers2 = [
      "Sr No.",
      "PO Number",
      "Po Material Number",
      "Purchase Request",
      "Purchase Request Date",
      "PO Created Date",
      "PO Delivery Date",
      "System Audited on",
      "Audited on",
      "Audited by",
      "Name",
      "GST IN",
      "Assigned to",
      "Submitted by",
    ];

    const headersBPV = [
      "Sr No.",
      "Document No/Ref No",
      "Document Date",
      "Amount",
      "Audited On",
      "Man. Verified On/ Closed On",
      "Man. Verified By/ Closed By",
      "GST In Of Vendor",
      "Name Of Vendor",
      "Text code",
      "PJV Invoice Ref Doc",
      "With holding tax rate",
      "Special GL Indicator",
      "BPV PO",
      "Assigned to",
      "Completed",
    ];

    const rows = slice.map((row, idx) => [
      start + idx + 1,
      row.documentNumber || "-",
      row.nameOfVendor || "-",
      row.amount_currency ? `${row.amount_currency} ${row.amount}` : "-",
      row.auditedOn ? moment(row.auditedOn).format("DD-MM-YYYY HH:mm") : "-",
      row.manuallyVerifiedOn
        ? moment(row.manuallyVerifiedOn).format("DD-MM-YYYY HH:mm")
        : "-",
      row.verifiedBy || "-",
      row.fiscalYear || "-",
      row.reference || row.invoiceNo || "-",
      row.assignedTo || "-",
      row.completed ? "Yes" : "No",
      row.vendorTitle || "-",
    ]);
    const rows2 = slice.map((row, idx) => [
      start + idx + 1,
      row.po_number || "-",
      row.po_material_number || "-",
      row.purchase_req || "-",
      row.pr_create_date
        ? moment(row.pr_create_date).format("DD-MM-YYYY")
        : "-",
      row.po_created_date
        ? moment(row.po_created_date).format("DD-MM-YYYY")
        : "-",
      row.po_delivery_date
        ? moment(row.po_delivery_date).format("DD-MM-YYYY")
        : "-",
      row.auditedOn ? moment(row.auditedOn).format("DD-MM-YYYY HH:mm") : "-",
      row.manuallyVerifiedOn
        ? moment(row.manuallyVerifiedOn).format("DD-MM-YYYY HH:mm")
        : "-",
      row.verifiedBy || "-",
      row.name || "-",
      row.gstin || "-",
      row.assignedTo || "-",
      row.auditor_who_closed || "-",
    ]);

    const rowBPV = slice.map((row, idx) => [
      start + idx + 1,
      row.documentNumber || "-",
      row.documentDate ? moment(row.documentDate).format("DD-MM-YYYY") : "-",
      row.amount_currency ? `${row.amount_currency} ${row.amount}` : "-",
      row.auditedOn ? moment(row.auditedOn).format("DD-MM-YYYY HH:mm") : "-",
      row.manuallyVerifiedOn
        ? moment(row.manuallyVerifiedOn).format("DD-MM-YYYY HH:mm")
        : "-",
      row.verifiedBy || "-",
      row.GSTInOfVendor || "-",
      row.nameOfVendor || "-",
      row.tax_code || "-",
      row?.pjvInvoiceRefDocs?.join(",") || "-",
      row.withHoldingTaxRate || "-",
      row.specialGlIndicator || "-",
      row.bpvPo || "-",
      row.assignedTo || "-",
      row.completed ? "Yes" : "No",
    ]);

    const csv = (
      dataViewType === "PJV"
        ? [headers, ...rows]
        : dataViewType === "NONPO"
        ? [headers, ...rows]
        : dataViewType === "BPV"
        ? [headersBPV, ...rowBPV]
        : [headers2, ...rows2]
    )
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `table_data_pages_${from}_to_${to}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setExportDialogOpen(false);
    setExportPages({ from: "", to: "" });
  };

  return (
    <>
      <Button
        variant="contained"
        onClick={() =>
          totalPages > 1 ? setExportDialogOpen(true) : exportToCSV()
        }
        style={{ width: "120px", marginBottom: "15px" }}
        disabled={loading}
        startIcon={<FileDownloadOutlinedIcon />}
      >
        Excel
      </Button>
      <Dialog
        open={exportDialogOpen}
        onClose={() => setExportDialogOpen(false)}
        maxWidth="xs"
        fullWidth
        sx={{ "& .MuiDialog-paper": { borderRadius: "12px" } }}
      >
        <DialogTitle sx={{ display: "flex", justifyContent: "center" }}>
          <Typography variant="h3" align="center" sx={{ fontWeight: 700 }}>
            Download Excel
          </Typography>
          <IconButton
            onClick={() => setExportDialogOpen(false)}
            sx={{ position: "absolute", top: "5px", right: "10px" }}
          >
            <CloseRoundedIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ display: "flex", flexDirection: "row", gap: 2 }}>
          <Box>
            <InputLabel>From page :</InputLabel>
            <TextField
              type="number"
              fullWidth
              placeholder="Enter page no to start"
              value={exportPages.from}
              onChange={(e) =>
                setExportPages((s) => ({ ...s, from: e.target.value }))
              }
            />
          </Box>
          <Box>
            <InputLabel>To page :</InputLabel>
            <TextField
              type="number"
              fullWidth
              placeholder="Enter page no to end"
              value={exportPages.to}
              onChange={(e) =>
                setExportPages((s) => ({ ...s, to: e.target.value }))
              }
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button
            variant="outlined"
            color="inherit"
            sx={{ mr: 1, mb: 1, width: "100px" }}
            onClick={() => setExportDialogOpen(false)}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            sx={{ mr: 2, mb: 1, width: "100px" }}
            onClick={exportToCSV}
          >
            Download
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default DownloadTableToExcel;
