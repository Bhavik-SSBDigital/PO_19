import { useState } from "react";
import {
  Button,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";

import moment from "moment";
import { useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import { CloseRounded, TaskAltRounded } from "@mui/icons-material";

import SSBDRemarksForm from "./remarks-form";
// import { documentSearch, poMaterialNumberSearch } from "utils/navigation";
import { TableSkeleton } from "../../../components/Skeletons";
import SearchResultLink from "../../../components/SearchResultLink";

const IssueListTable = ({ tableData, onUpdate, loading }) => {
  const navigate = useNavigate();
  const { dataViewType } = useSelector((state) => state.menu);

  const role =
    localStorage.getItem("role") === "fromSSBD" ||
    localStorage.getItem("role") === "isAuditor";

  const [remarksForm, setRemarksForm] = useState({
    isOpen: false,
    data: null,
  });
  const handleNavigate = (row) => {
    const url = {
      PJV: `/search-data?documentNo=${row.documentNumber}&year=${row.fiscalYear}`,
      NONPO: `/search-data?documentNo=${row.documentNumber}&year=${row.fiscalYear}`,
      PO: `/search-data?PONo=${row.po_material_number}`,
      BPV: `/search-data?paymentDocumentNumber=${row.documentNumber}&year=${row.fiscalYear}`,
    }[dataViewType];
    navigate(url);
  };

  if (loading) return <TableSkeleton />;

  return (
    <>
      <TableContainer
        sx={{
          maxHeight: "70vh",
          width: "100%",
          overflow: "auto",
          borderRadius: "12px",
        }}
      >
        <Table stickyHeader aria-label="issue list table" size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ py: "5px" }}>Sr No</TableCell>
              <TableCell sx={{ py: "5px" }}>Document No/Ref No</TableCell>
              {dataViewType === "PO" && (
                <TableCell sx={{ py: "5px" }}>PO Material Number</TableCell>
              )}
              <TableCell sx={{ py: "5px" }}>Supplier Name</TableCell>

              <TableCell sx={{ py: "5px" }}>System Audited On</TableCell>
              <TableCell sx={{ py: "5px" }}>Point No</TableCell>

              <TableCell sx={{ py: "5px" }}>System Verification</TableCell>
              <TableCell sx={{ py: "5px" }}>Manual Verification</TableCell>
              <TableCell sx={{ py: "5px" }}>System Remarks</TableCell>
              <TableCell sx={{ py: "5px" }}>Manual Remarks</TableCell>
              <TableCell sx={{ py: "5px" }}>Manually Verified On</TableCell>
              <TableCell sx={{ py: "5px" }}>Manually Verified By</TableCell>
              <TableCell sx={{ py: "5px" }}>Auditor Name</TableCell>
              {/* <TableCell>SSBD Remarks Added By</TableCell> */}
              <TableCell sx={{ py: "5px" }}>SSBD Work status</TableCell>
              {/* <TableCell>SSBD Remarks</TableCell> */}
              <TableCell sx={{ py: "5px" }}>Action</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {tableData?.length ? (
              tableData.map((result, index) => {
                return (
                  <TableRow key={index}>
                    <TableCell>{1 + index}</TableCell>

                    {/* {["PJV", "BPV"].includes(dataViewType) ? (
                      <TableCell>
                        {result.documentNumber ? (
                          <p
                            style={{ color: "blue", cursor: "pointer" }}
                            onClick={() => {
                              handleNavigate(result);
                            }}
                          >
                            {result.documentNumber}
                          </p>
                        ) : (
                          "-"
                        )}
                      </TableCell>
                    ) : (
                      <TableCell
                        style={{ color: "blue", cursor: "pointer" }}
                        onClick={() => {
                          handleNavigate(result);
                        }}
                      >
                        {result.documentNumber}
                      </TableCell>
                    )} */}
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
                    </TableCell>
                    {dataViewType === "PO" && (
                      <TableCell>{result.po_material_number || "-"}</TableCell>
                      // <TableCell>
                      //   {result.documentNumber ? (
                      //     <p
                      //       style={{ color: "blue", cursor: "pointer" }}
                      //       onClick={() => {
                      //         handleNavigate(result);
                      //       }}
                      //     >
                      //       {result.po_material_number}
                      //     </p>
                      //   ) : (
                      //     "-"
                      //   )}
                      // </TableCell>
                    )}

                    <TableCell>
                      {result.nameOfVendor ? <p>{result.nameOfVendor}</p> : "-"}
                    </TableCell>

                    <TableCell>
                      {result.auditedOn
                        ? moment(result.auditedOn).format("DD-MM-YYYY HH:mm")
                        : "-"}
                    </TableCell>

                    <TableCell>
                      {result.pointNo ? result.pointNo : "-"}
                    </TableCell>

                    <TableCell>
                      <Chip
                        sx={{
                          borderRadius: "20px",
                          width: "110px",
                          fontSize: "12px",
                          fontWeight: "700",
                        }}
                        icon={<TaskAltRounded style={{ fontSize: "13px" }} />}
                        size="small"
                        label={
                          result.systemVerification
                            ? "Verified"
                            : "Not Verified"
                        }
                        color={result.systemVerification ? "success" : "error"}
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
                        icon={<TaskAltRounded style={{ fontSize: "13px" }} />}
                        size="small"
                        label={
                          result.auditorVerification
                            ? "Verified"
                            : "Not Verified"
                        }
                        color={result.auditorVerification ? "success" : "error"}
                      />
                    </TableCell>
                    <TableCell>
                      {result.systemRemarks?.length
                        ? result.systemRemarks?.map((list) => <>{list}</>)
                        : "-"}
                    </TableCell>
                    <TableCell>
                      {result.auditorRemarks?.length
                        ? result.auditorRemarks?.map((list) => <>{list}</>)
                        : "-"}
                    </TableCell>
                    <TableCell>
                      {result.manuallyVerifiedOn
                        ? moment(result.manuallyVerifiedOn).format(
                            "DD-MM-YYYY HH:mm"
                          )
                        : "-"}
                    </TableCell>
                    <TableCell>{result?.manuallyVerifiedBy || "-"}</TableCell>
                    <TableCell>{result?.auditorName || "-"}</TableCell>
                    {/* <TableCell>{result?.ssbdRemarksAddedBy || "-"}</TableCell> */}
                    <TableCell>
                      {result.ssbdWorkStatus ? (
                        <Chip
                          sx={{
                            borderRadius: "20px",
                            width: "fit-content",
                            minWidth: "100px",
                            fontSize: "12px",
                            fontWeight: "700",
                          }}
                          size="small"
                          label={
                            result.ssbdWorkStatus === "closed"
                              ? "Closed"
                              : result.ssbdWorkStatus === "resolved"
                              ? "Resolved"
                              : result.ssbdWorkStatus === "work_under_progress"
                              ? "Work Under Progress"
                              : "Pending"
                          }
                          color={
                            result.ssbdWorkStatus === "resolved"
                              ? "success"
                              : result.ssbdWorkStatus === "closed"
                              ? "error"
                              : "warning"
                          }
                        />
                      ) : (
                        "-"
                      )}
                    </TableCell>
                    {/* <TableCell>{result?.ssbdRemarks || "-"}</TableCell> */}

                    <TableCell>
                      {!role || result.ssbdWorkStatus === "closed" ? (
                        <Button
                          onClick={() => {
                            setRemarksForm({
                              isOpen: true,
                              auditResultId: result?.auditResultId,
                              pointNo: result?.pointNo,
                              data: result?.conversation,
                              status: result?.ssbdWorkStatus,
                            });
                          }}
                          sx={{ position: "inherit" }}
                        >
                          View remarks
                        </Button>
                      ) : (
                        <Button
                          onClick={() => {
                            setRemarksForm({
                              isOpen: true,
                              auditResultId: result?.auditResultId,
                              pointNo: result?.pointNo,
                              data: result?.conversation,
                              status: result?.ssbdWorkStatus,
                            });
                          }}
                          sx={{ position: "initial" }}
                        >
                          Add/View remarks
                        </Button>
                      )}
                    </TableCell>
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
        open={!!remarksForm.isOpen}
        onClose={() => setRemarksForm({ isOpen: false })}
        fullWidth
        maxWidth="sm"
        sx={{ "& .MuiDialog-paper": { borderRadius: "12px" } }}
      >
        <DialogTitle sx={{ display: "flex", justifyContent: "center" }}>
          <Typography variant="h4" align="center" sx={{ fontWeight: 700 }}>
            Add/View Remarks
            {/* (Point No: {remarksData.pointNo}) */}
          </Typography>
          <IconButton
            onClick={() => setRemarksForm({ isOpen: false })}
            sx={{ position: "absolute", top: "5px", right: "10px" }}
          >
            <CloseRounded />
          </IconButton>
        </DialogTitle>

        <DialogContent>
          <SSBDRemarksForm
            data={remarksForm.data}
            auditResultId={remarksForm?.auditResultId}
            pointNo={remarksForm?.pointNo}
            status={remarksForm?.status}
            onSuccess={(data, status) => {
              onUpdate({
                ...remarksForm,
                ...(status && { ssbdWorkStatus: status }),
                conversation: data,
              });
              // setRemarksForm({ isOpen: false });
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
};

export default IssueListTable;
