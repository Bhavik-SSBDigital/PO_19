import { useState, useEffect } from "react";
// material-ui
import {
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  InputLabel,
  Switch,
  TextField,
  Typography,
  Box,
  Button,
  Table,
  TableBody,
  TableContainer,
  TableHead,
  TableRow,
  TableCell,
  Chip,
  IconButton,
  Paper,
  Select,
  MenuItem,
} from "@mui/material";

import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import TaskAltRoundedIcon from "@mui/icons-material/TaskAltRounded";

import moment from "moment";
import { toast } from "react-toastify";
import { useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";

import { post } from "utils/axiosApi";
import { useViewDocument } from "../contexts";
import DocumentView from "./document-view";
import { AutoSplit, SplitBox } from "../../../components/SplitLayout";
import { VerificationChip } from "./results-table"; // ← only new import

// ==============================|| Audit Result Review ||============================== //

const AuditResultReview = ({ searchData }) => {
  const navigate = useNavigate();
  const role = localStorage.getItem("role");
  const { dataViewType } = useSelector((state) => state.menu);

  const { viewDocument } = useViewDocument();

  const [fileURL, setFileURL] = useState("");
  const [isVerified, setVerified] = useState([]);

  const [remarksData, setRemarksData] = useState({
    modalOpen: false,
    pointNo: 1,
    remarks: "",
  });

  const [open, setOpen] = useState({
    modalOpen: false,
    data: "",
    pointNo: "",
  });

  const [remarks, setRemarks] = useState([]);

  useEffect(() => {
    setFileURL(viewDocument?.document || viewDocument?.documents[0] || "");
  }, [viewDocument]);

  useEffect(() => {
    setVerified(
      searchData.results?.map((item) => ({
        pointNo: item.pointNo,
        verified: item.verified,
      }))
    );
  }, [searchData]);

  const approveResult = async (id) => {
    try {
      const res = await post(`/submitManualVerification/${id}`, {
        results: remarks,
        isDraft: false,
        auditorName: localStorage.getItem("auditorFullName"),
      });
      toast.success(res.message);
      navigate("/check-invoice-item");
    } catch (error) {
      console.error(error);
    }
  };

  const closeAudit = async (id) => {
    try {
      const res = await post(`/closeAuditResult/${id}`, {
        auditorName: localStorage.getItem("auditorFullName"),
      });
      toast.success(res.message);
      navigate("/check-invoice-item");
    } catch (error) {
      console.error(error);
    }
  };

  const addRemarks = async () => {
    try {
      setRemarks(
        remarks.map((item) => {
          if (item.pointNo === remarksData.pointNo) {
            item.remarks = remarksData.remarks;
          }
          return item;
        })
      );

      setRemarksData({ modalOpen: false, id: "", pointNo: "", remarks: "" });
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

  if (role !== "isAuditor") return null;

  return (
    <>
      {dataViewType === "BPV" && (
        <>
          {viewDocument?.isOpen && viewDocument?.documents?.length > 0 && (
            <Box sx={{ ml: "auto", width: "fit-content" }}>
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
      <Box sx={{ display: "flex", flexDirection: "row", gap: "10px" }}>
        <AutoSplit
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
                            {searchData?.workflowDetails?.currentStatus ===
                            "completed" ? (
                              <Button
                                variant="outlined"
                                onClick={() => {
                                  setOpen({
                                    modalOpen: true,
                                    data: pointHistoryAvilable(result.pointNo),
                                    pointNo: result.pointNo,
                                    latestSubmission:
                                      searchData?.workflowDetails?.latestSubmission?.results?.find(
                                        (item) =>
                                          item.pointNo === result.pointNo
                                      ),
                                  });
                                }}
                                disabled={!pointHistoryAvilable(result.pointNo)}
                                size="small"
                                sx={{ position: "inherit", width: "100px" }}
                              >
                                View Details
                              </Button>
                            ) : (
                              <>
                                <InputLabel>
                                  {isVerified.find(
                                    (item) => item.pointNo === result.pointNo
                                  )?.verified
                                    ? "Verified"
                                    : "Not Verified"}
                                </InputLabel>
                                <FormControlLabel
                                  control={
                                    <Switch
                                      onChange={(e) => {
                                        const isAvilable = remarks.find(
                                          (item) =>
                                            item.pointNo === result.pointNo
                                        );
                                        if (isAvilable) {
                                          setRemarks(
                                            remarks.map((item) => {
                                              if (
                                                item.pointNo === result.pointNo
                                              ) {
                                                item.manualVerified =
                                                  e.target.checked;
                                              }
                                              if (
                                                result.verified ===
                                                e.target.checked
                                              ) {
                                                item.remarks = "";
                                              }
                                              return item;
                                            })
                                          );
                                        } else {
                                          setRemarks([
                                            ...remarks,
                                            {
                                              pointNo: result.pointNo,
                                              manualVerified: e.target.checked,
                                            },
                                          ]);
                                        }
                                        setVerified(
                                          isVerified.map((item) => {
                                            if (
                                              item.pointNo === result.pointNo
                                            ) {
                                              item.verified = e.target.checked;
                                            }
                                            return item;
                                          })
                                        );
                                        if (
                                          isVerified.find(
                                            (item) =>
                                              item.pointNo === result.pointNo
                                          )?.verified !== result.verified
                                        ) {
                                          setRemarksData({
                                            modalOpen: true,
                                            pointNo: result.pointNo,
                                            remarks: "",
                                          });
                                        } else {
                                          setRemarks(
                                            remarks.filter((item) => {
                                              return (
                                                item.pointNo !== result.pointNo
                                              );
                                            })
                                          );
                                        }
                                      }}
                                      checked={
                                        isVerified.find(
                                          (item) =>
                                            item.pointNo === result.pointNo
                                        )?.verified
                                          ? true
                                          : false
                                      }
                                    />
                                  }
                                />
                                {isVerified.find(
                                  (item) => item.pointNo === result.pointNo
                                )?.verified !== result.verified &&
                                remarks.find(
                                  (item) => item.pointNo === result.pointNo
                                )?.remarks ? (
                                  <Button
                                    onClick={() => {
                                      setRemarksData({
                                        modalOpen: true,
                                        pointNo: result.pointNo,
                                        remarks: remarks.find(
                                          (item) =>
                                            item.pointNo === result.pointNo
                                        )?.remarks,
                                      });
                                    }}
                                  >
                                    Edit Remarks
                                  </Button>
                                ) : null}
                              </>
                            )}
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
      {searchData?.workflowDetails?.currentStatus === "completed" ? null : (
        <Box
          sx={{ display: "flex", justifyContent: "flex-end", my: 2, gap: 2 }}
        >
          <Button
            variant="contained"
            disabled={!remarks?.length}
            onClick={() => approveResult(searchData._id)}
          >
            Submit Manual Observations
          </Button>

          <Button
            sx={{ width: "150px" }}
            variant="contained"
            disabled={!!remarks?.length}
            onClick={() => closeAudit(searchData._id)}
          >
            Close Audit
          </Button>
        </Box>
      )}

      <Dialog
        open={remarksData.modalOpen}
        fullWidth
        maxWidth="xs"
        sx={{ "& .MuiDialog-paper": { borderRadius: "12px" } }}
      >
        <DialogTitle sx={{ display: "flex", justifyContent: "center" }}>
          <Typography variant="h4" align="center" sx={{ fontWeight: 700 }}>
            Remarks (Point No: {open.pointNo})
          </Typography>
          <IconButton
            onClick={() => {
              setRemarks(
                remarks.filter((item) => {
                  return item.pointNo !== remarksData.pointNo;
                })
              );
              setVerified(
                isVerified.map((item) => {
                  if (item.pointNo === remarksData.pointNo) {
                    item.verified = !item.verified;
                  }
                  return item;
                })
              );
              setRemarksData({});
            }}
            sx={{ position: "absolute", top: "10px", right: "10px" }}
          >
            <CloseRoundedIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          <form style={{ width: "100%" }}>
            <InputLabel>Remarks :</InputLabel>
            <TextField
              value={remarksData.remarks}
              onChange={(event) =>
                setRemarksData({ ...remarksData, remarks: event.target.value })
              }
              fullWidth
              multiline
              minRows={2}
              placeholder="Enter your remarks here...."
            />

            <Typography>
              {remarksData?.remarks?.length < 15 && (
                <span style={{ color: "red" }}>
                  Remarks must be at least 15 characters long.
                </span>
              )}
            </Typography>
          </form>
        </DialogContent>
        <DialogActions sx={{ mb: 1, mr: 2 }}>
          <Button
            color="inherit"
            variant="outlined"
            sx={{ width: "130px" }}
            onClick={() => {
              setRemarks(
                remarks.filter((item) => {
                  return item.pointNo !== remarksData.pointNo;
                })
              );
              setVerified(
                isVerified.map((item) => {
                  if (item.pointNo === remarksData.pointNo) {
                    item.verified = !item.verified;
                  }
                  return item;
                })
              );
              setRemarksData({});
            }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            sx={{ width: "130px" }}
            onClick={addRemarks}
            disabled={remarksData?.remarks?.length < 15}
          >
            Add
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
                      {/* {open?.systemResult?.systemRemarks} */}
                    </TableCell>
                    <TableCell>
                      {item.manualRemarks?.length
                        ? item.manualRemarks?.map((list, idx) => (
                            <li key={idx + list}>{list}</li>
                          ))
                        : "-"}
                      {/* {item.manualRemarks} */}
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

export default AuditResultReview;