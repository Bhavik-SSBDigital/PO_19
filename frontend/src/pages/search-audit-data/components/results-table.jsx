import { useEffect, useState } from "react";
// material-ui
import {
  Autocomplete,
  Dialog,
  DialogActions,
  DialogContent,
  Typography,
  Box,
  Button,
  Table,
  TableBody,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  TableCell,
  Chip,
  Paper,
  DialogTitle,
  IconButton,
  MenuItem,
  Select,
} from "@mui/material";

import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import TaskAltRoundedIcon from "@mui/icons-material/TaskAltRounded";
import PanToolAltRoundedIcon from "@mui/icons-material/PanToolAltRounded";

import moment from "moment";
import { toast } from "react-toastify";
import { useSelector } from "react-redux";

import { get, post } from "utils/axiosApi";
import { useViewDocument } from "../contexts";
import DocumentView from "./document-view";
import { AutoSplit, SplitBox } from "../../../components/SplitLayout";

// ── Shared chip exported so AuditResultReview can reuse it ──────────────────
export const VerificationChip = ({ result }) => {
  if (result.manual_verification) {
    return (
      <Chip
        icon={<PanToolAltRoundedIcon style={{ fontSize: "13px", color: "#b45309" }} />}
        size="small"
        label="Manual Verify"
        sx={{
          borderRadius: "20px",
          width: "130px",
          fontSize: "12px",
          fontWeight: "700",
          bgcolor: "#fef9c3",
          color: "#854d0e",
          border: "1px solid #fde047",
          "& .MuiChip-icon": { color: "#b45309" },
        }}
      />
    );
  }
  if (result.not_applicable) {
    return (
      <Chip
        icon={<TaskAltRoundedIcon style={{ fontSize: "13px" }} />}
        size="small"
        label="Not Applicable"
        color="default"
        sx={{
          borderRadius: "20px",
          width: "130px",
          fontSize: "12px",
          fontWeight: "700",
        }}
      />
    );
  }
  if (result.missing_data) {
    return (
      <Chip
        icon={<TaskAltRoundedIcon style={{ fontSize: "13px" }} />}
        size="small"
        label="Data Missing"
        color="warning"
        sx={{
          borderRadius: "20px",
          width: "120px",
          fontSize: "12px",
          fontWeight: "700",
        }}
      />
    );
  }
  if (result.verified) {
    return (
      <Chip
        icon={<TaskAltRoundedIcon style={{ fontSize: "13px" }} />}
        size="small"
        label="Verified"
        color="success"
        sx={{
          borderRadius: "20px",
          width: "110px",
          fontSize: "12px",
          fontWeight: "700",
        }}
      />
    );
  }
  return (
    <Chip
      icon={<TaskAltRoundedIcon style={{ fontSize: "13px" }} />}
      size="small"
      label="Not Verified"
      color="error"
      sx={{
        borderRadius: "20px",
        width: "110px",
        fontSize: "12px",
        fontWeight: "700",
      }}
    />
  );
};

// ==============================|| SEARCH AUDIT DATA ||============================== //

const AuditResults = ({ searchData, setSearchData }) => {
  const role = localStorage.getItem("role");
  const { dataViewType } = useSelector((state) => state.menu);
  const { viewDocument } = useViewDocument();

  const [fileURL, setFileURL] = useState("");
  const [open, setOpen] = useState(false);
  const [userList, setUserList] = useState([]);

  const [remarksData, setRemarksData] = useState({
    modalOpen: false,
    id: "",
    pointNo: 1,
    remarks: "",
  });
  const [reassignData, setReassignData] = useState({
    modalOpen: false,
    assignedTo: "",
    remarks: "",
  });
  const [assignData, setAssignData] = useState({
    modalOpen: false,
    assignedTo: "",
    remarks: "",
  });

  const [remarks, setRemarks] = useState([]);

  useEffect(() => {
    setFileURL(viewDocument?.document || viewDocument?.documents[0] || "");
  }, [viewDocument]);

  useEffect(() => {
    (async () => {
      try {
        const response = await get("/getAuditors");
        setUserList(response?.auditors || response || []);
      } catch (error) {
        console.error("Error fetching user list:", error);
      }
    })();
  }, []);

  const addRemarks = async () => {
    try {
      const isAvilable = remarks.find((r) => r.pointNo === remarksData.pointNo);
      if (isAvilable) {
        setRemarks(
          remarks.map((r) =>
            r.pointNo === remarksData.pointNo
              ? { ...r, remarks: remarksData.remarks }
              : r
          )
        );
      } else {
        setRemarks([
          ...remarks,
          { pointNo: remarksData.pointNo, remarks: remarksData.remarks },
        ]);
      }

      setRemarksData({ modalOpen: false, id: "", pointNo: "", remarks: "" });
    } catch (error) {
      console.error(error);
    }
  };

  const reassignHandeler = async () => {
    try {
      const res = await post(`/headReviewAuditResult/${searchData._id}`, {
        action: "reassign",
        reassignTo: reassignData.assignedTo,
        reassignRemarks: reassignData.remarks,
      });
      toast.success(res.message);
      setReassignData({ modalOpen: false, remarks: "", reassignTo: "" });
      setSearchData();
    } catch (error) {
      console.error(error);
    }
  };

  const assignHandeler = async () => {
    try {
      const res = await post(`/assignAuditResult/${searchData._id}`, {
        forceReassign: false,
        assignedTo: assignData.assignedTo,
      });
      toast.success(res.message);
      setReassignData({ modalOpen: false, remarks: "", reassignTo: "" });
      setSearchData();
    } catch (error) {
      console.error(error);
    }
  };

  const pointHistoryAvilable = (pointNo) => {
    const pointHistoryLength =
      searchData?.workflowDetails?.pointHistory?.[pointNo]?.history?.length;

    if (pointHistoryLength > 0) {
      return searchData?.workflowDetails?.pointHistory?.[pointNo];
    } else {
      return false;
    }
  };

  if (role === "isAuditor") return null;

  return (
    <>
      <Box sx={{ mt: 2, display: "flex", justifyContent: "space-between" }}>
        {dataViewType === "BPV" && (
          <>
            <Box />
            {viewDocument?.isOpen && viewDocument?.documents?.length > 0 && (
              <Box>
                <Typography variant="h6" sx={{ fontWeight: "bold", mt: 2 }}>
                  Select Document name
                </Typography>
                <Select
                  value={fileURL}
                  onChange={(e) => setFileURL(e.target.value)}
                >
                  {viewDocument?.documents?.map((doc, idx) => (
                    <MenuItem value={doc} key={doc + idx}>
                      {doc}
                    </MenuItem>
                  ))}
                </Select>
              </Box>
            )}
          </>
        )}
      </Box>
      <Box sx={{ display: "flex", flexDirection: "row", gap: "10px" }}>
        <AutoSplit
          direction="horizontal"
          initialSizes={viewDocument?.isOpen ? [50, 50] : [100]}
          minSizes={viewDocument?.isOpen ? [10, 20] : [100]}
        >
          <SplitBox style={viewDocument?.isOpen ? {} : { flexBasis: "100%" }}>
            <TableContainer
              component={Paper}
              elevation={0}
              sx={{
                mt: "5px",
                flex: 1,
                overflow: "auto",
                border: "1px solid #e5e5e5",
                borderRadius: "10px",
                maxHeight: "600px",
              }}
            >
              <Table stickyHeader size="small">
                <TableHead sx={{ bgcolor: "#f9f9f9" }}>
                  <TableRow>
                    <TableCell sx={{ minWidth: { sm: "80px" } }}>
                      Point No
                    </TableCell>
                    <TableCell sx={{ minWidth: { sm: "150px" } }}>
                      Description
                    </TableCell>
                    <TableCell>System Remarks</TableCell>
                    <TableCell>System Verification</TableCell>
                    <TableCell>Auditor Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {searchData?.results
                    ?.sort((a, b) => +a.pointNo - +b.pointNo)
                    ?.map((result) => {
                      return (
                        <TableRow key={+result.pointNo}>
                          <TableCell align="center">{result.pointNo}</TableCell>
                          <TableCell>
                            {result.description ? result.description : "-"}
                          </TableCell>
                          <TableCell>
                            <ul>
                              {result?.remarks?.length
                                ? result.remarks?.map((list, idx) => (
                                    <li key={idx + list}>{list}</li>
                                  ))
                                : "-"}
                            </ul>
                          </TableCell>
                          <TableCell>
                            {/* ── ONLY THIS CHIP BLOCK CHANGED ── */}
                            <VerificationChip result={result} />
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="outlined"
                              onClick={() => {
                                setOpen({
                                  modalOpen: true,
                                  data: pointHistoryAvilable(result.pointNo),
                                  pointNo: result.pointNo,
                                  latestSubmission:
                                    searchData?.workflowDetails?.latestSubmission?.results?.find(
                                      (item) => item.pointNo === result.pointNo
                                    ),
                                });
                              }}
                              disabled={!pointHistoryAvilable(result.pointNo)}
                              size="small"
                              sx={{ position: "inherit", width: "100px" }}
                            >
                              View Details
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  {!searchData?.results?.length && (
                    <TableRow>
                      <TableCell colSpan={5} align="center">
                        No Data
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </SplitBox>

          <SplitBox style={viewDocument?.isOpen ? {} : { flexBasis: "0%" }}>
            <DocumentView fileURL={fileURL} />
          </SplitBox>
        </AutoSplit>
      </Box>
      {searchData?.workflowDetails?.currentStatus ===
      "completed" ? null : searchData?.workflowDetails?.latestSubmission &&
        searchData?.workflowDetails?.pointHistory &&
        Object.keys(searchData?.workflowDetails?.pointHistory).length ? (
        <></>
      ) : (
        role === "isAuditHead" && (
          <Button
            sx={{ width: "150px", m: 1, marginRight: "5px" }}
            variant="contained"
            onClick={() => setAssignData({ modalOpen: true })}
          >
            Assign
          </Button>
        )
      )}
      <Dialog
        open={remarksData.modalOpen}
        onClose={() => setRemarksData({})}
        fullWidth
        maxWidth="xs"
        sx={{ "& .MuiDialog-paper": { borderRadius: "12px" } }}
      >
        <DialogTitle sx={{ display: "flex", justifyContent: "center" }}>
          <Typography variant="h4" align="center" sx={{ fontWeight: 700 }}>
            Remarks (Point No: {remarksData.pointNo})
          </Typography>
          <IconButton
            onClick={() => setRemarksData({})}
            sx={{ position: "absolute", top: "5px", right: "10px" }}
          >
            <CloseRoundedIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          <form style={{ width: "100%" }}>
            <Typography variant="h6">Remarks :</Typography>
            <TextField
              id="outlined-basic"
              value={remarksData.remarks}
              onChange={(event) =>
                setRemarksData({ ...remarksData, remarks: event.target.value })
              }
              fullWidth
              placeholder="Remarks"
              variant="outlined"
            />
          </form>
        </DialogContent>
        <DialogActions>
          <Button
            color="error"
            variant="outlined"
            sx={{ width: "120px", margin: "-5px 0 5px 0" }}
            onClick={() => setRemarksData({})}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            sx={{ width: "120px", margin: "-5px 10px 5px 0" }}
            onClick={addRemarks}
          >
            Add
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={reassignData.modalOpen}
        onClose={() => setReassignData({})}
        fullWidth
        maxWidth="xs"
        sx={{ "& .MuiDialog-paper": { borderRadius: "12px" } }}
      >
        <DialogTitle sx={{ display: "flex", justifyContent: "center" }}>
          <Typography variant="h3" align="center" sx={{ fontWeight: 700 }}>
            Re-assign
          </Typography>
          <IconButton
            onClick={() => setRemarksData({})}
            sx={{ position: "absolute", top: "5px", right: "10px" }}
          >
            <CloseRoundedIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          <form style={{ width: "100%" }}>
            <Typography variant="h6">Reassign to :</Typography>
            <Autocomplete
              disablePortal
              options={userList}
              onChange={(_, value) =>
                setReassignData({ ...reassignData, assignedTo: value })
              }
              fullWidth
              value={reassignData.assignedTo}
              renderInput={(params) => (
                <TextField {...params} placeholder="Select username" />
              )}
            />
            <Typography variant="h6">Remarks :</Typography>
            <TextField
              id="outlined-basic-remarks"
              fullWidth
              value={reassignData.remarks}
              onChange={(event) =>
                setReassignData({
                  ...reassignData,
                  remarks: event.target.value,
                })
              }
              placeholder="enter remarks"
              variant="outlined"
            />
          </form>
        </DialogContent>
        <DialogActions>
          <Button
            color="error"
            variant="outlined"
            onClick={() => setReassignData({})}
            sx={{ width: "100px", margin: "-5px 0 5px 0" }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={reassignHandeler}
            sx={{ width: "100px", margin: "-5px 10px 5px 0" }}
          >
            Reassign
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={assignData.modalOpen}
        onClose={() => setAssignData({})}
        sx={{ "& .MuiDialog-paper": { borderRadius: "12px" } }}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle sx={{ display: "flex", justifyContent: "center" }}>
          <Typography variant="h3" align="center" sx={{ fontWeight: 700 }}>
            Assign
          </Typography>
          <IconButton
            onClick={() => setRemarksData({})}
            sx={{ position: "absolute", top: "5px", right: "10px" }}
          >
            <CloseRoundedIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          <form style={{ width: "100%" }}>
            <Typography variant="h6">Assign to :</Typography>
            <Autocomplete
              disablePortal
              options={userList}
              onChange={(_, value) =>
                setAssignData({ ...assignData, assignedTo: value })
              }
              fullWidth
              value={assignData.assignedTo}
              renderInput={(params) => (
                <TextField {...params} placeholder="Select username" />
              )}
            />
          </form>
          {searchData?.workflowDetails?.currentStatus === "assigned" ? (
            <Typography sx={{ mt: "10px" }}>
              This audit is assigned to{" "}
              <strong>
                {searchData?.verificationWorkflow?.assignedTo?.username || ""}
              </strong>
              , but if you want to assign to someone else proceed{" "}
            </Typography>
          ) : null}
        </DialogContent>
        <DialogActions>
          <Button
            color="error"
            variant="outlined"
            onClick={() => setAssignData({})}
            sx={{ width: "100px", margin: "-5px 0 5px 0" }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={assignHandeler}
            sx={{ width: "100px", margin: "-5px 10px 5px 0" }}
          >
            Assign
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={open.modalOpen}
        onClose={() => setOpen({})}
        maxWidth="xl"
        sx={{ "& .MuiDialog-paper": { borderRadius: "12px" } }}
      >
        <DialogTitle sx={{ display: "flex", justifyContent: "center" }}>
          <Typography variant="h4" align="center" sx={{ fontWeight: 700 }}>
            Point History (Point No: {open.pointNo})
          </Typography>
          <IconButton
            onClick={() => setOpen({})}
            sx={{ position: "absolute", top: "10px", right: "10px" }}
          >
            <CloseRoundedIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          <TableContainer
            sx={{
              maxHeight: "600px",
              border: "1px solid #cccccc",
              borderRadius: "10px",
            }}
          >
            <Table stickyHeader sx={{ minWidth: "700px" }} size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Username</TableCell>
                  <TableCell>System Verification</TableCell>
                  <TableCell>Manual Verification</TableCell>
                  <TableCell>System Remarks</TableCell>
                  <TableCell>Manual Remarks</TableCell>
                  <TableCell>Time</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {open?.data?.history?.map((item, index) => (
                  <TableRow key={index}>
                    <TableCell>{item.user}</TableCell>
                    <TableCell>
                      <Chip
                        sx={{
                          borderRadius: "20px",
                          width: "110px",
                          fontSize: "12px",
                          fontWeight: "700",
                        }}
                        icon={
                          <TaskAltRoundedIcon style={{ fontSize: "13px" }} />
                        }
                        size="small"
                        label={
                          open?.data?.systemResult?.systemVerification
                            ? "Verified"
                            : "Not Verified"
                        }
                        color={
                          open?.data?.systemResult?.systemVerification
                            ? "success"
                            : "error"
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Chip
                        sx={{
                          borderRadius: "20px",
                          width: "110px",
                          fontSize: "12px",
                          fontWeight: "700",
                        }}
                        icon={
                          <TaskAltRoundedIcon style={{ fontSize: "13px" }} />
                        }
                        size="small"
                        label={
                          item.manualVerified ? "Verified" : "Not Verified"
                        }
                        color={item.manualVerified ? "success" : "error"}
                      />
                    </TableCell>
                    <TableCell>
                      {open?.data?.systemResult?.systemRemarks?.length
                        ? open?.data?.systemResult?.systemRemarks?.map(
                            (list, idx) => <li key={idx + list}>{list}</li>
                          )
                        : "-"}
                    </TableCell>
                    <TableCell>
                      {item.manualRemarks?.length
                        ? item.manualRemarks?.map((list, idx) => (
                            <li key={idx + list}>{list}</li>
                          ))
                        : "-"}
                    </TableCell>
                    <TableCell>
                      {moment(item.timestamp).format("DD-MM-YYYY HH:MM A")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default AuditResults;