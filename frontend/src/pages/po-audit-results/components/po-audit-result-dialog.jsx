import { useEffect, useState } from "react";
import {
  Box,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  Grid,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Skeleton,
  Typography,
} from "@mui/material";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import moment from "moment";
import { toast } from "react-toastify";

import { post } from "utils/axiosApi";
import AuditPointsBreakdown from "./audit-points-breakdown";

const Field = ({ label, value }) => (
  <Grid item xs={12} sm={6} md={4}>
    <Typography variant="caption" color="text.secondary">
      {label}
    </Typography>
    <Typography variant="body2">{value || "-"}</Typography>
  </Grid>
);

/**
 * Detail dialog for a single PO audit result.
 * Fetches from POST /api/getPOAuditResult (controllers/po-controller.js).
 *
 * po-controller.js's withExceptionPoints() enriches the response with
 * vendorName / plantName / poTypeName / purchaseGroupName /
 * paymentTermDescription (joined from the SAP master files) and attaches
 * title/summary/severity to every entry in `results`, so this dialog no
 * longer needs to show bare SAP codes or a raw po_status "Status" field
 * anywhere.
 */
const PoAuditResultDialog = ({ id, onClose }) => {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!id) {
      setResult(null);
      return;
    }
    const fetchResult = async () => {
      setLoading(true);
      try {
        const response = await post("/getPOAuditResult", { id });
        setResult(response);
      } catch (error) {
        console.error("Error fetching PO audit result:", error);
        toast.error("Failed to load PO audit result");
        onClose();
      } finally {
        setLoading(false);
      }
    };
    fetchResult();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  return (
    <Dialog open={!!id} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        PO Audit Result {result?.po_number ? `— ${result.po_number}` : ""}
        <IconButton onClick={onClose}>
          <CloseRoundedIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        {loading || !result ? (
          <Skeleton variant="rectangular" height={300} />
        ) : (
          <Box>
            <Grid container spacing={2}>
              <Field label="PO Number" value={result.po_number} />
              <Field label="Line Item" value={result.lineItem || result.po_line_item} />
              <Field label="Vendor" value={result.vendorName || result.nameOfVendor || result.vendor_code} />
              <Field label="Material" value={`${result.material_code || ""} ${result.material_disc || ""}`.trim()} />
              <Field label="Plant" value={result.plantName || result.plant} />
              <Field label="PO Type" value={result.poTypeName || result.po_type} />
              <Field label="Purchasing Group" value={result.purchaseGroupName || result.purchase_group} />
              <Field label="Fiscal Year" value={result.fiscalYear} />
              <Field
                label="PO Created Date"
                value={result.po_created_date ? moment(result.po_created_date).format("DD-MMM-YYYY") : null}
              />
              <Field label="Payment Term" value={result.paymentTermDescription || result.payment_term} />
              <Field label="Inco Term" value={result.inco_term} />
              <Field label="PO Qty" value={result.po_qty} />
              <Field label="Net Value" value={result.net_value ? Number(result.net_value).toLocaleString() : null} />
            </Grid>

            <Divider sx={{ my: 2 }} />

            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              Workflow
            </Typography>
            {result.verificationWorkflow ? (
              <Box sx={{ mb: 2 }}>
                <Chip
                  size="small"
                  label={(result.verificationWorkflow.currentStatus || "").replace("_", " ")}
                  sx={{ mr: 1 }}
                />
                {result.verificationWorkflow.assignee && (
                  <Typography variant="body2" component="span">
                    Assigned to {result.verificationWorkflow.assignee.firstName}{" "}
                    {result.verificationWorkflow.assignee.lastName}
                  </Typography>
                )}
                <List dense>
                  {(result.verificationWorkflow.workflowSteps || []).map((step) => (
                    <ListItem key={step.id} disableGutters>
                      <ListItemText
                        primary={`${step.action} — ${step.user?.firstName || ""} ${step.user?.lastName || ""}`}
                        secondary={moment(step.timestamp).format("DD-MMM-YYYY HH:mm")}
                      />
                    </ListItem>
                  ))}
                </List>
              </Box>
            ) : (
              <Typography variant="body2" color="text.secondary">
                No workflow started yet.
              </Typography>
            )}

            <Divider sx={{ my: 2 }} />

            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              Audit Points ({(result.results || []).length})
            </Typography>
            <AuditPointsBreakdown results={result.results || []} />
          </Box>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default PoAuditResultDialog;