import { useEffect, useState } from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputLabel,
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
import { useNavigate } from "react-router-dom";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";

import { get, post } from "utils/axiosApi";
import { TableSkeleton } from "../../../components/Skeletons";
import SearchResultLink from "../../../components/SearchResultLink";

const POTable = ({ tableData = [], getPageData, loading, value }) => {
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
  });

  // SAFETY CHECK: If the parent passes the raw response object { results: [] }, extract the array
  // UNIVERSAL FALLBACK EXTRACTOR: handles arrays, nested results, and Axios wrappers
  const actualData = Array.isArray(tableData) 
    ? tableData 
    : Array.isArray(tableData?.results) 
    ? tableData.results 
    : Array.isArray(tableData?.data?.results) 
    ? tableData.data.results 
    : Array.isArray(tableData?.data) 
    ? tableData.data 
    : [];

  useEffect(() => {
    const fetchUserList = async () => {
      try {
        const response = await get("/getAuditors");
        console.log("response", response)
        setUserList(response?.auditors || response || []);
      } catch (error) {
        console.error("Error fetching user list:", error);
      }
    };
    fetchUserList();
  }, []);

  useEffect(() => {
    if (value != 3 && role !== "isAuditHead") {
      setStartAssigned(false);
      setSelectedRows([]);
    }
  }, [value]);

  const handleSelectRow = (rowId) => {
    if (selectedRows.includes(rowId)) {
      setSelectedRows(selectedRows.filter((id) => id !== rowId));
    } else {
      setSelectedRows([...selectedRows, rowId]);
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

  if (loading) return <TableSkeleton />;

  return (
    <>
      {value == 3 &&
      role === "isAuditHead" &&
      actualData.length !== 0 &&
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
      actualData.length !== 0 &&
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
              actualData.length !== 0 &&
              startAssigned ? (
                <TableCell>
                  <Checkbox
                    checked={selectedRows?.length === actualData.length}
                    onClick={() => {
                      if (selectedRows?.length === actualData.length) {
                        setSelectedRows([]);
                      } else {
                        // FIXED: Use .id instead of ._id
                        setSelectedRows(actualData.map((row) => row?.id));
                      }
                    }}
                  />
                </TableCell>
              ) : null}
              <TableCell>Sr No.</TableCell>
              <TableCell>PO Number</TableCell>
              <TableCell>Purchase Request</TableCell>
              <TableCell>Purchase Request Date</TableCell>
              <TableCell>PO Created Date</TableCell>
              <TableCell>PO Delivery Date</TableCell>
              <TableCell>System Audited on</TableCell>
              {value == "1" && (
                <>
                  <TableCell>Audited on</TableCell>
                  <TableCell>Audited by</TableCell>
                </>
              )}
              <TableCell>Name</TableCell>
              <TableCell>GST In</TableCell>
              <TableCell>Assigned to</TableCell>
              {value == "1" && <TableCell>Submitted by</TableCell>}
            </TableRow>
          </TableHead>
          <TableBody>
            {actualData.length ? (
              actualData.map((result, index) => {
                return (
                  // FIXED: Use .id instead of ._id as row key
                  <TableRow key={result.id || index}>
                    {value == 3 &&
                    role === "isAuditHead" &&
                    actualData.length !== 0 &&
                    startAssigned ? (
                      <TableCell>
                        <Checkbox
                          // FIXED: Use .id instead of ._id
                          checked={selectedRows.includes(result?.id)}
                          onClick={() => handleSelectRow(result?.id)}
                        />
                      </TableCell>
                    ) : null}
                    <TableCell>{1 + index}</TableCell>
                    <TableCell>
                      {result.po_number ? (
                        <SearchResultLink
                          number={result.documentNumber}
                          year={result.fiscalYear}
                          poMaterialNo={result.po_number}
                        >
                          {result.po_number}
                        </SearchResultLink>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                    <TableCell>
                      {result.purchase_req ? result.purchase_req : "-"}
                    </TableCell>
                    <TableCell>
                      {result.pr_create_date
                        ? moment(result.pr_create_date).format(
                            "DD-MM-YYYY HH:mm"
                          )
                        : "-"}
                    </TableCell>
                    <TableCell>
                      {result.po_created_date
                        ? moment(result.po_created_date).format(
                            "DD-MM-YYYY HH:mm"
                          )
                        : "-"}
                    </TableCell>
                    <TableCell>
                      {result.po_delivery_date
                        ? moment(result.po_delivery_date).format(
                            "DD-MM-YYYY HH:mm"
                          )
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
                    <TableCell>{result.name ? result.name : "-"}</TableCell>
                    <TableCell>{result.gstin ? result.gstin : "-"}</TableCell>
                    <TableCell>
                      {result.assignedTo ? result.assignedTo : "-"}
                    </TableCell>
                    {value == "1" && (
                      <TableCell>
                        {result.auditor_who_closed
                          ? result.auditor_who_closed
                          : "-"}
                      </TableCell>
                    )}
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell colSpan={14} sx={{ width: "100%" }} align="center">
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
            style={{ border: "1px solid #ddd", borderRadius: "10px" }}
          ></iframe>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default POTable;