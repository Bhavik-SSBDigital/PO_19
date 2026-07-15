import { useEffect } from "react";
// material-ui
import {
  Alert,
  Typography,
  Box,
  Button,
  Stack,
  Divider,
  Card,
} from "@mui/material";
import NewReleasesRoundedIcon from "@mui/icons-material/NewReleasesRounded";

import moment from "moment";
import { useSelector } from "react-redux";

import { useViewDocument } from "../contexts";
import { ViewPJVInvoiceRefDocs } from "../../invoice-po-list/components/table-auditor-view";
import DumpFilesList from "./dump-files-list";

// ==============================||  Audit Details ||============================== //

const AuditDetails = ({ auditDetails = {} }) => {
  const { dataViewType } = useSelector((state) => state.menu);

  const { viewDocument, setViewDocument } = useViewDocument();
  useEffect(() => {
    setViewDocument({ isOpen: false, document: null, documents: [] });
  }, [auditDetails]);

  return (
    <>
      <Stack alignItems="center">
        <Typography
          variant="h4"
          sx={{
            my: "8px",
            borderRadius: "9px",
            backgroundColor: "#3655b3",
            color: "#e5e5e5",
            width: "400px",
            textAlign: "center",
            padding: "10px",
          }}
        >
          Audit Report
        </Typography>
      </Stack>
      {auditDetails?.workflowDetails?.currentStatus === "completed" && (
        <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
          <Alert
            color="success.dark"
            sx={{
              my: 1,
              py: "2px",
              color: "success.dark",
              borderRadius: "10px",
              border: "1px solid #84bf84ff",
              backgroundColor: "success.lighter",
            }}
          >
            <Typography variant="h5">
              Audit Report had been concluded
            </Typography>
          </Alert>
        </Box>
      )}
      <Card
        sx={{
          padding: { sm: "20px 60px", xs: "20px 20px" },
          boxShadow: "none",
          border: "1px solid #e5e5e5",
          borderRadius: "10px",
          overflow: "auto",
          mb: 2,
        }}
      >
        {dataViewType === "PJV" && (
          <>
            <Box
              sx={{ display: "flex", justifyContent: "space-between", mb: 2 }}
            >
              <Typography
                variant="body1"
                sx={{ minWidth: "350px", color: "#666666", fontWeight: "bold" }}
              >
                Object Key : {auditDetails?.objectKey}
              </Typography>
              <Typography
                variant="body1"
                sx={{
                  width: "200px",
                  minWidth: "150px",
                  color: "#666666",
                  fontWeight: "bold",
                }}
              >
                Reference : {auditDetails?.reference}
              </Typography>
            </Box>
            <Box
              sx={{ display: "flex", justifyContent: "space-between", mb: 2 }}
            >
              <Box sx={{ minWidth: "350px" }}>
                <Typography variant="h4" sx={{ fontWeight: 700 }}>
                  {auditDetails?.nameOfVendor}{" "}
                  <Typography
                    variant="body1"
                    sx={{
                      display: "inline",
                      fontWeight: "bold",
                      color: "#666666",
                    }}
                  >
                    ({auditDetails?.vendor})
                  </Typography>
                </Typography>

                <Typography
                  variant="body1"
                  sx={{ fontWeight: "bold", color: "#666666" }}
                >
                  GSTIN : {auditDetails?.GSTInOfVendor}
                </Typography>
                {/* <Typography
                  variant="body1"
                  sx={{ fontWeight: "bold", color: "#666666" }}
                >
                  Audited on :{" "}
                  {moment(auditDetails?.auditedOn).format("DD-MM-YYYY")}{" "}
                </Typography> */}
              </Box>
              <Box sx={{ width: "200px", minWidth: "150px" }}>
                <Typography variant="subtitle1" sx={{ fontWeight: "bold" }}>
                  Document No. : {auditDetails?.documentNumber}
                </Typography>

                <Typography
                  variant="body1"
                  sx={{ fontWeight: "bold", color: "#666666" }}
                >
                  Tax Code : {auditDetails?.taxCode || "-"}
                </Typography>
                <Typography
                  variant="body1"
                  sx={{ fontWeight: "bold", color: "#666666" }}
                >
                  Document date :{" "}
                  {moment(auditDetails?.documentDate).format("DD-MM-YYYY")}{" "}
                </Typography>
              </Box>
            </Box>

            <Box sx={{ display: "flex", justifyContent: "space-between" }}>
              <Box sx={{ minWidth: "350px" }} />
              <Box sx={{ width: "200px", minWidth: "150px" }}>
                <Divider sx={{ min: "200px", mb: "5px" }} />
                <Typography variant="h5">
                  Amount : {Number(auditDetails?.amount).toFixed(2)}{" "}
                  {auditDetails?.amount_currency}
                </Typography>
              </Box>
            </Box>
            <Box sx={{ display: "flex", justifyContent: "space-between" }}>
              {!viewDocument.isOpen && (
                <Button
                  onClick={() => {
                    setViewDocument({
                      isOpen: true,
                      document: auditDetails.documentName,
                      documents: [],
                    });
                  }}
                  variant="outlined"
                >
                  View Document
                </Button>
              )}
              {/* {auditDetails?.dumpFiles?.length > 0 && (
                <DumpFilesList files={auditDetails?.dumpFiles} />
              )} */}
            </Box>
          </>
        )}
        {dataViewType === "NONPO" && (
          <>
            <Box
              sx={{ display: "flex", justifyContent: "space-between", mb: 2 }}
            >
              {/* <Typography
                variant="body1"
                sx={{ minWidth: "350px", color: "#666666", fontWeight: "bold" }}
              >
                Object Key : {auditDetails?.objectKey}
              </Typography> */}
              {/* <Typography
                variant="body1"
                sx={{
                  width: "200px",
                  minWidth: "150px",
                  color: "#666666",
                  fontWeight: "bold",
                }}
              >
                Reference : {auditDetails?.reference}
              </Typography> */}
            </Box>
            <Box
              sx={{ display: "flex", justifyContent: "space-between", mb: 2 }}
            >
              <Box sx={{ minWidth: "350px" }}>
                <Typography variant="h4" sx={{ fontWeight: 700 }}>
                  {auditDetails?.nameOfVendor}{" "}
                  <Typography
                    variant="body1"
                    sx={{
                      display: "inline",
                      fontWeight: "bold",
                      color: "#666666",
                    }}
                  >
                    ({auditDetails?.vendor})
                  </Typography>
                </Typography>

                <Typography
                  variant="body1"
                  sx={{ fontWeight: "bold", color: "#666666" }}
                >
                  GSTIN : {auditDetails?.GSTInOfVendor}
                </Typography>
                <Typography
                  variant="body1"
                  sx={{ fontWeight: "bold", color: "#666666" }}
                >
                  Audited on :{" "}
                  {moment(auditDetails?.auditedOn).format("DD-MM-YYYY")}{" "}
                </Typography>
                <Typography
                  variant="body1"
                  sx={{ fontWeight: "bold", color: "#666666" }}
                >
                  Fiscal Year : {auditDetails?.fiscalYear}
                </Typography>
              </Box>
              <Box sx={{ width: "200px", minWidth: "150px" }}>
                <Typography
                  variant="body1"
                  sx={{
                    width: "200px",
                    minWidth: "150px",
                    color: "#666666",
                    fontWeight: "bold",
                  }}
                >
                  Reference : {auditDetails?.reference}
                </Typography>
                <Typography variant="subtitle1" sx={{ fontWeight: "bold" }}>
                  Document No. : {auditDetails?.documentNumber}
                </Typography>

                <Typography
                  variant="body1"
                  sx={{ fontWeight: "bold", color: "#666666" }}
                >
                  Tax Code : {auditDetails?.taxCode || "-"}
                </Typography>
                <Typography
                  variant="body1"
                  sx={{ fontWeight: "bold", color: "#666666" }}
                >
                  Document date :{" "}
                  {moment(auditDetails?.documentDate).format("DD-MM-YYYY")}{" "}
                </Typography>
              </Box>
            </Box>

            <Box sx={{ display: "flex", justifyContent: "space-between" }}>
              <Box sx={{ minWidth: "350px" }} />
              <Box sx={{ width: "200px", minWidth: "150px" }}>
                <Divider sx={{ min: "200px", mb: "5px" }} />
                <Typography variant="h5">
                  Amount : {Number(auditDetails?.amount).toFixed(2)}{" "}
                  {auditDetails?.amount_currency}
                </Typography>
              </Box>
            </Box>
            <Box sx={{ display: "flex", justifyContent: "space-between" }}>
              {!viewDocument.isOpen && (
                <Button
                  onClick={() => {
                    setViewDocument({
                      isOpen: true,
                      document: auditDetails.documentName,
                      documents: [],
                    });
                  }}
                  variant="outlined"
                >
                  View Document
                </Button>
              )}
              {/* {auditDetails?.dumpFiles?.length > 0 && (
                <DumpFilesList files={auditDetails?.dumpFiles} />
              )} */}
            </Box>
          </>
        )}
        {dataViewType === "PO" && (
          <>
            <Box
              sx={{ display: "flex", justifyContent: "space-between", mb: 2 }}
            >
              <Typography
                variant="body1"
                sx={{ minWidth: "350px", color: "#666666", fontWeight: "bold" }}
              >
                Purchase Requisition No. : {auditDetails?.purchase_req}
              </Typography>
              <Typography
                variant="body1"
                sx={{
                  width: "200px",
                  minWidth: "280px",
                  color: "#666666",
                  fontWeight: "bold",
                }}
              >
                PR Created Date :{" "}
                {moment(auditDetails?.pr_create_date).format(
                  "DD-MM-YYYY h:mm A"
                )}
              </Typography>
            </Box>
            <Box
              sx={{ display: "flex", justifyContent: "space-between", mb: 2 }}
            >
              <Box sx={{ minWidth: "350px" }}>
                <Typography variant="h4" sx={{ fontWeight: 700 }}>
                  {auditDetails?.name}
                </Typography>

                <Typography
                  variant="body1"
                  sx={{ fontWeight: "bold", color: "#666666" }}
                >
                  GSTIN : {auditDetails?.gstin}
                </Typography>
              </Box>
              <Box sx={{ width: "200px", minWidth: "280px" }}>
                <Typography variant="subtitle1" sx={{ fontWeight: "bold" }}>
                  PO Number : {auditDetails?.po_number}
                </Typography>

                <Typography
                  variant="body1"
                  sx={{ fontWeight: "bold", color: "#666666" }}
                >
                  PO Created Date :{" "}
                  {moment(auditDetails?.po_created_date).format(
                    "DD-MM-YYYY h:mm A"
                  )}
                </Typography>
                <Typography
                  variant="body1"
                  sx={{ fontWeight: "bold", color: "#666666" }}
                >
                  PO Delivery Date :{" "}
                  {moment(auditDetails?.po_delivery_date).format(
                    "DD-MM-YYYY h:mm A"
                  )}
                </Typography>
              </Box>
            </Box>
            <Box
              sx={{
                display: "flex",
                justifyContent: "space-between",
                flexWrap: "wrap",
              }}
            >
              <Divider sx={{ mb: "5px", width: "100%" }} />
              {!!auditDetails?.tax_code_description && (
                <Typography variant="h5">
                  Tax Description :{auditDetails?.tax_code_description}
                </Typography>
              )}
              <Box sx={{ width: "200px", minWidth: "280px" }}>
                <Typography
                  variant="body1"
                  sx={{ fontWeight: "bold", color: "#666666" }}
                >
                  Tax Code : {auditDetails?.tax_code}
                </Typography>
              </Box>
            </Box>
          </>
        )}
        {dataViewType === "BPV" && (
          <>
            <Box
              sx={{ display: "flex", justifyContent: "space-between", mb: 2 }}
            ></Box>
            <Box
              sx={{ display: "flex", justifyContent: "space-between", mb: 2 }}
            >
              <Box sx={{ minWidth: "350px" }}>
                <Typography variant="h6" sx={{ fontWeight: 700 }}>
                  Payment Document Number: {auditDetails?.documentNumber}{" "}
                </Typography>

                <Typography
                  variant="body1"
                  sx={{ fontWeight: "bold" }}
                  // sx={{ fontWeight: "bold", color: "#666666" }}
                >
                  Payment Document Date :{" "}
                  {moment(auditDetails?.documentDate).format(
                    "DD-MM-YYYY h:mm A"
                  )}
                </Typography>
                <Typography variant="h6" sx={{ fontWeight: 700, mt: 1 }}>
                  Name Of Vendor: {auditDetails?.nameOfVendor}{" "}
                </Typography>
                <Typography
                  variant="body1"
                  sx={{ fontWeight: "bold", color: "#666666" }}
                >
                  Audited on :{" "}
                  {moment(auditDetails?.auditedOn).format("DD-MM-YYYY")}{" "}
                </Typography>
              </Box>
              <Box sx={{ width: "fit-content", minWidth: "150px" }}>
                <Box
                  sx={{
                    width: "fit-content",
                    minWidth: "150px",
                    display: "flex",
                  }}
                >
                  <Typography variant="subtitle1" sx={{ fontWeight: "bold" }}>
                    PJV Invoice Ref Doc. :{" "}
                  </Typography>
                  <Box sx={{ display: "flex", flexWrap: "wrap" }}>
                    <ViewPJVInvoiceRefDocs
                      docs={auditDetails?.pjvInvoiceRefDocs || []}
                    />
                  </Box>
                </Box>

                <Typography
                  variant="body1"
                  sx={{ fontWeight: "bold", color: "#666666" }}
                >
                  Tax Code : {auditDetails?.withHoldingTaxCode || "-"}
                </Typography>
                <Typography
                  variant="body1"
                  sx={{ fontWeight: "bold", color: "#666666" }}
                >
                  With Holding Tax Rate : {auditDetails?.tax_code}{" "}
                </Typography>
                <Typography
                  variant="body1"
                  sx={{ fontWeight: "bold", color: "#666666" }}
                >
                  Special GL Indicator : {auditDetails?.specialGlIndicator}{" "}
                </Typography>
                <Box sx={{ width: "100%", minWidth: "150px" }}>
                  <Divider sx={{ width: "100%", my: "5px" }} />
                  <Typography variant="h5">
                    Amount : {Number(auditDetails?.amount).toFixed(2)}{" "}
                    {auditDetails?.amount_currency}
                  </Typography>
                </Box>
              </Box>
            </Box>
            <Box sx={{ display: "flex", justifyContent: "space-between" }}>
              {!viewDocument.isOpen && (
                <Button
                  onClick={() => {
                    setViewDocument({
                      isOpen: true,
                      document: null,
                      documents: auditDetails.documentNames,
                    });
                  }}
                  variant="outlined"
                >
                  View Document
                </Button>
              )}
              {auditDetails?.dumpFiles?.length > 0 && (
                <DumpFilesList files={auditDetails?.dumpFiles} />
              )}
            </Box>
          </>
        )}
      </Card>
      {auditDetails?.["invoice-type"] === "handwritten" && (
        <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
          <Alert
            color="warning.dark"
            sx={{
              my: 1,
              py: "1px",
              color: "warning.dark",
              borderRadius: "10px",
              border: "1px solid #f0ad4e",
              backgroundColor: "warning.lighter",
            }}
            icon={<NewReleasesRoundedIcon />}
          >
            <Typography variant="h5">Handwritten</Typography>
          </Alert>
        </Box>
      )}
    </>
  );
};

export default AuditDetails;
