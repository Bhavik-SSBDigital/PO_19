import { useEffect, useState } from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputLabel,
  Menu,
  MenuItem,
  Paper,
  Select,
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
import { useNavigate } from "react-router-dom";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";

import { get, post } from "utils/axiosApi";
import { TableSkeleton } from "../../../components/Skeletons";
import { ViewPJVInvoiceRefDocs } from "./table-auditor-view";
import SearchResultLink from "../../../components/SearchResultLink";

const BPVTable = ({ tableData = [], getPageData, loading, value }) => {
  const navigate = useNavigate();
  const role = localStorage.getItem("role");

  const [userList, setUserList] = useState([]);
  const [startAssigned, setStartAssigned] = useState(false);
  const [selectedRows, setSelectedRows] = useState([]);
  const [assignData, setAssignData] = useState({
    modalOpen: false,
    assignedTo: "",
    remarks: "",
  });
  const [viewDocument, setViewDocument] = useState({
    isOpen: false,
    document: null,
    documents: [],
  });

  useEffect(() => {
    const fetchUserList = async () => {
      try {
        const response = await get("/getAuditors");
        setUserList(response?.auditors || response || []);
      } catch (error) {
        console.error("Error fetching user list:", error);
      }
    };
    fetchUserList();
  }, []);

  useEffect(() => {
    if (value != 3 || role !== "isAuditHead") {
      setStartAssigned(false);
      setSelectedRows([]);
    }
  }, [value]);
  const handleSelectRow = (row) => {
    if (selectedRows.includes(row)) {
      setSelectedRows(selectedRows.filter((r) => r !== row));
    } else {
      setSelectedRows([...selectedRows, row]);
    }
  };

  const assignHandeler = async () => {
    if (!selectedRows.length) {
      toast.error("Please select at least one row");
      return;
    }
    try {
      for (const id of selectedRows) {
        await post(`/assignAuditResult/${id}`, {
          forceReassign: false,
          assignedTo: assignData.assignedTo,
        });
      }

      toast.success("Assigned successfully");
      setAssignData({ modalOpen: false, remarks: "", reassignTo: "" });
      setSelectedRows([]);
      getPageData?.();
    } catch (error) {
      console.error(error);
    }
  };

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

  if (loading) return <TableSkeleton />;

  return (
    <>
      {value == 3 &&
      role === "isAuditHead" &&
      tableData?.length !== 0 &&
      !startAssigned ? (
        <Box display="flex" justifyContent="flex-end">
          <Button
            variant="contained"
            onClick={() => setStartAssigned(true)}
            sx={{ mt: "-20px" }}
          >
            Start Assigning Audits
          </Button>
        </Box>
      ) : null}
      {value == 3 &&
      role === "isAuditHead" &&
      tableData?.length !== 0 &&
      startAssigned ? (
        <Alert
          severity="info"
          action={
            <>
              <Button
                disabled={selectedRows.length === 0}
                variant="contained"
                sx={{ width: "110px", mr: 2 }}
                onClick={() => setAssignData({ modalOpen: true })}
              >
                Assign
              </Button>
              <Button
                sx={{ width: "70px" }}
                onClick={() => {
                  setStartAssigned(false);
                  setSelectedRows([]);
                }}
              >
                Cancel
              </Button>
            </>
          }
          sx={{
            borderRadius: "12px",
            border: "1px solid lightblue",
            alignItems: "center",
            mt: "-10px",
          }}
        >
          {selectedRows.length === 0 ? (
            <Typography color="inherit">
              Click checkbox and assign audits to the auditors
            </Typography>
          ) : (
            <Typography color="inherit">
              Selected Audits : {selectedRows.length}
            </Typography>
          )}
        </Alert>
      ) : null}
      <Dialog
        open={assignData.modalOpen}
        onClose={() => setAssignData({})}
        maxWidth="xs"
        fullWidth
        sx={{ "& .MuiDialog-paper": { borderRadius: "12px" } }}
      >
        <DialogTitle sx={{ display: "flex", justifyContent: "center" }}>
          <Typography variant="h3" align="center" sx={{ fontWeight: 700 }}>
            Assign
          </Typography>
          <IconButton
            onClick={() => setAssignData({})}
            sx={{ position: "absolute", top: "5px", right: "10px" }}
          >
            <CloseRoundedIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          <form style={{ width: "100%" }}>
            <InputLabel>Assign to :</InputLabel>
            <Autocomplete
              disablePortal
              options={userList}
              onChange={(event, value) =>
                setAssignData({ ...assignData, assignedTo: value })
              }
              fullWidth
              value={assignData.assignedTo}
              renderInput={(params) => (
                <TextField {...params} placeholder="Select username" />
              )}
            />
          </form>
        </DialogContent>
        <DialogActions>
          <Button
            variant="contained"
            sx={{ width: "120px", mr: 2, mb: 1 }}
            onClick={assignHandeler}
          >
            Assign
          </Button>
        </DialogActions>
      </Dialog>

      <TableContainer
        id="invoice-table"
        component={Paper}
        elevation={0}
        sx={{
          mt: "5px",
          maxHeight: "70vh",
          overflow: "auto",
          borderRadius: "12px",
          border: "1px solid lightgray",
        }}
      >
        <Table stickyHeader size="small">
          <TableHead sx={{ backgroundColor: "#f9f9f9" }}>
            <TableRow>
              {value == 3 &&
              role === "isAuditHead" &&
              tableData?.length !== 0 &&
              startAssigned ? (
                <TableCell>
                  <Checkbox
                    checked={selectedRows?.length === tableData?.length}
                    onClick={() => {
                      if (selectedRows?.length === tableData?.length) {
                        setSelectedRows([]);
                      } else {
                        setSelectedRows(tableData?.map((row) => row?._id));
                      }
                    }}
                  />
                </TableCell>
              ) : null}
              <TableCell>Sr No.</TableCell>
              <TableCell>Document No/Ref No</TableCell>
              <TableCell>Document Date</TableCell>
              <TableCell>Amount</TableCell>
              <TableCell>System Audited on</TableCell>
              {value == "1" && (
                <>
                  <TableCell>Audited on</TableCell>
                  <TableCell>Audited by</TableCell>
                </>
              )}
              <TableCell>GST In Of Vendor</TableCell>
              <TableCell>Name Of Vendor</TableCell>
              <TableCell>Text code</TableCell>
              <TableCell>PJV Invoice Ref Doc</TableCell>
              <TableCell>With Holding Tax Rate</TableCell>
              <TableCell>Special Gl Indicator</TableCell>
              <TableCell>PO</TableCell>
              <TableCell>Assigned to</TableCell>
              <TableCell>Completed</TableCell>
              {value == "1" && <TableCell>Submitted by</TableCell>}
              <TableCell>View</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {tableData?.length ? (
              tableData.map((result, index) => {
                return (
                  <TableRow key={index}>
                    {value == 3 &&
                    role === "isAuditHead" &&
                    tableData?.length !== 0 &&
                    startAssigned ? (
                      <TableCell>
                        <Checkbox
                          checked={selectedRows.includes(result?._id)}
                          onClick={() => handleSelectRow(result?._id)}
                        />
                      </TableCell>
                    ) : null}
                    <TableCell>{1 + index}</TableCell>
                    <TableCell>
                      {result.documentNumber ? (
                        <SearchResultLink
                          number={result.documentNumber}
                          year={result.fiscalYear}
                          poMaterialNo={result.po_number}
                        >
                          {result.documentNumber}
                        </SearchResultLink>
                      ) : (
                        "-"
                      )}
                      {/* {result.documentNumber ? (
                        <p
                          style={{ color: "blue", cursor: "pointer" }}
                          onClick={() => {
                            navigate(
                              `/search-data?paymentDocumentNumber=${result.documentNumber}&year=${result.fiscalYear}`
                            );
                          }}
                        >
                          {result.documentNumber}
                        </p>
                      ) : (
                        "-"
                      )} */}
                    </TableCell>
                    <TableCell>
                      {result.documentDate
                        ? moment(result.documentDate).format("DD-MM-YYYY")
                        : "-"}
                    </TableCell>
                    <TableCell>
                      {result.amount_currency
                        ? `${result.amount_currency} ${Number(
                            result.amount
                          ).toFixed(2)}`
                        : "-"}
                    </TableCell>
                    <TableCell>
                      {result.auditedOn
                        ? moment(result.auditedOn).format("DD-MM-YYYY HH:mm")
                        : "-"}
                    </TableCell>
                    {value == "1" && (
                      <>
                        <TableCell>
                          {result.manuallyVerifiedOn
                            ? moment(result.manuallyVerifiedOn).format(
                                "DD-MM-YYYY HH:mm"
                              )
                            : "-"}
                        </TableCell>
                        <TableCell>{result.verifiedBy || "-"}</TableCell>
                      </>
                    )}
                    <TableCell>
                      {result.tax_code ? result.tax_code : "-"}
                    </TableCell>
                    <TableCell>
                      {result.GSTInOfVendor ? result.GSTInOfVendor : "-"}
                    </TableCell>
                    <TableCell>
                      {result.nameOfVendor ? result.nameOfVendor : "-"}
                    </TableCell>
                    {[].slice(0, 2)}
                    <TableCell>
                      {/* {result.pjvInvoiceRefDocs
                        ? result.pjvInvoiceRefDocs?.slice(0, 2)?.join(", ")
                        : "-"}
                      {result.pjvInvoiceRefDocs &&
                        result.pjvInvoiceRefDocs.length > 2 && (
                          <Button
                            id=""
                            aria-controls={open ? "basic-menu" : undefined}
                            aria-haspopup="true"
                            aria-expanded={open ? "true" : undefined}
                            onClick={(e) =>
                              handleClick(e, result.pjvInvoiceRefDocs)
                            }
                            sx={{ display: "inline-block" }}
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
                      </Menu> */}
                      <ViewPJVInvoiceRefDocs
                        docs={result?.pjvInvoiceRefDocs || []}
                      />
                    </TableCell>
                    <TableCell>
                      {result.withHoldingTaxRate
                        ? result.withHoldingTaxRate
                        : "-"}
                    </TableCell>
                    <TableCell>
                      {result.specialGlIndicator
                        ? result.specialGlIndicator
                        : "-"}
                    </TableCell>
                    <TableCell>{result.bpvPo ? result.bpvPo : "-"}</TableCell>
                    <TableCell>
                      {result.assignedTo ? result.assignedTo : "-"}
                    </TableCell>
                    <TableCell>
                      {result.completed ? (
                        <Chip
                          label="Yes"
                          sx={{ borderRadius: "20px" }}
                          color="success"
                        />
                      ) : (
                        <Chip
                          label="No"
                          sx={{ borderRadius: "20px" }}
                          color="error"
                        />
                      )}
                    </TableCell>
                    {value == "1" && (
                      <TableCell>
                        {result.auditor_who_closed
                          ? result.auditor_who_closed
                          : "-"}
                      </TableCell>
                    )}
                    <TableCell>
                      <Button
                        onClick={() =>
                          setViewDocument({
                            isOpen: true,
                            document: result.documentNames[0],
                            documents: result.documentNames,
                          })
                        }
                      >
                        View Document
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell colSpan={11} align="center">
                  No data found
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
            View Document
          </Typography>
          <IconButton
            onClick={() => setViewDocument({ isOpen: false })}
            sx={{ position: "absolute", top: "5px", right: "10px" }}
          >
            <CloseRoundedIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: "bold", mt: 2 }}>
              Select Document name
            </Typography>
            <Select
              value={viewDocument.document}
              onChange={(e) =>
                setViewDocument({ ...viewDocument, document: e.target.value })
              }
            >
              {viewDocument?.documents?.map((doc) => (
                <MenuItem value={doc}>{doc}</MenuItem>
              ))}
            </Select>
          </Box>
          <Typography variant="h5" align="center" sx={{ fontWeight: 700 }}>
            Document : {viewDocument.document}
          </Typography>
          <iframe
            src={`${import.meta.env.VITE_APP_BACKEND_URL}getDocument/${
              viewDocument.document
            }`}
            width="100%"
            height="600px"
            style={{ border: "1px solid #ddd", borderRadius: "10px" }}
          ></iframe>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default BPVTable;
