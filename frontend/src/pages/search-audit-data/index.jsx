import { useEffect, useState } from "react";
import {
  IconButton,
  InputAdornment,
  Typography,
  Box,
  Button,
  Stack,
  TextField,
  Divider,
  CircularProgress,
  Card,
  InputLabel,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  List,
  ListItem,
  ListItemText,
  Dialog,
  DialogTitle,
  DialogContent,
  Chip,
  Grid,
  alpha,
} from "@mui/material";
import { toast } from "react-toastify";
import { useSelector } from "react-redux";
import { useNavigate, useSearchParams } from "react-router-dom";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import CloseIcon from "@mui/icons-material/Close";
import VisibilityIcon from "@mui/icons-material/Visibility";
import LockRoundedIcon from "@mui/icons-material/LockRounded";
import LockOpenRoundedIcon from "@mui/icons-material/LockOpenRounded";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import LayersRoundedIcon from "@mui/icons-material/LayersRounded";
import { get, post } from "utils/axiosApi";
import { ViewDocumentProvider } from "./contexts";
import AuditDetails from "./components/audit-details";
import AuditResults from "./components/results-table";
import AuditResultReview from "./components/audit-result-review";
import PoHeaderChecksPanel from "../executive-dashboard/components/PoHeaderChecksPanel";

// Shared "PO summary" strip — shown on the LINE-ITEM view only (the PO
// header view has its own summary block built into the header response).
const PO_SUMMARY_FIELDS = [
  ["PO Number", (d) => d.po_number],
  ["Line Item", (d) => d.lineItem || d.po_line_item],
  ["Vendor Code", (d) => d.vendorCode || d.vendor_code],
  ["Vendor", (d) => d.vendorName],
  ["GSTIN", (d) => d.vendorGstin || d.GSTInOfVendor],
  ["Plant", (d) => d.plantName || d.plant],
  ["PO Type", (d) => d.poTypeName || d.po_type],
  ["Purchasing Group", (d) => d.purchaseGroupName || d.purchase_group],
  ["Payment Term", (d) => d.paymentTermDescription || d.payment_term],
  ["Tax Code", (d) => d.taxCode || d.tax_code],
  ["PR Number", (d) => d.purchase_req],
  ["Net Value", (d) => d.net_value],
];

const PoSummaryHeader = ({ data }) => {
  if (!data) return null;
  return (
    <Box sx={{ px: 2, pt: 2, pb: 1 }}>
      <Typography
        variant="subtitle2"
        sx={{ fontWeight: 700, mb: 1.5, color: "text.secondary" }}
      >
        Line Item Summary
      </Typography>
      <Grid container spacing={2}>
        {PO_SUMMARY_FIELDS.map(([label, getValue]) => {
          const value = getValue(data);
          return (
            <Grid item xs={6} sm={4} md={3} key={label}>
              <Typography
                variant="caption"
                sx={{
                  color: "text.secondary",
                  fontWeight: 700,
                  display: "block",
                }}
              >
                {label}
              </Typography>
              <Typography
                variant="body2"
                sx={{ fontWeight: 600, wordBreak: "break-word" }}
              >
                {value === null || value === undefined || value === ""
                  ? "—"
                  : String(value)}
              </Typography>
            </Grid>
          );
        })}
      </Grid>
      <Divider sx={{ mt: 2 }} />
    </Box>
  );
};

// Row in the PO-header view's line-item picker list.
const LineItemPickerRow = ({ item, onOpen }) => (
  <TableRow
    hover
    sx={{ cursor: "pointer" }}
    onClick={() => onOpen(item.lineItem)}
  >
    <TableCell sx={{ fontWeight: 700 }}>{item.lineItem}</TableCell>
    <TableCell>{item.materialCode || "—"}</TableCell>
    <TableCell>
      <Typography
        variant="body2"
        color="text.secondary"
        noWrap
        sx={{ maxWidth: 260 }}
      >
        {item.materialDesc || "—"}
      </Typography>
    </TableCell>
    <TableCell align="right">
      {item.netValue ? Number(item.netValue).toLocaleString() : "—"}
    </TableCell>
    <TableCell>
      {item.hasException ? (
        <Chip
          size="small"
          label="Has Exception"
          sx={{
            fontWeight: 700,
            bgcolor: alpha("#dc2626", 0.1),
            color: "#dc2626",
          }}
        />
      ) : (
        <Chip
          size="small"
          label="Clean"
          sx={{
            fontWeight: 700,
            bgcolor: alpha("#059669", 0.1),
            color: "#059669",
          }}
        />
      )}
    </TableCell>
    <TableCell>
      {item.closed ? (
        <Chip
          size="small"
          icon={<LockRoundedIcon fontSize="small" />}
          label="Closed"
          sx={{
            fontWeight: 700,
            bgcolor: alpha("#059669", 0.1),
            color: "#059669",
          }}
        />
      ) : (
        <Chip
          size="small"
          icon={<LockOpenRoundedIcon fontSize="small" />}
          label="Open"
          sx={{
            fontWeight: 700,
            bgcolor: alpha("#d97706", 0.1),
            color: "#d97706",
          }}
        />
      )}
    </TableCell>
    <TableCell align="right">
      <Button
        size="small"
        startIcon={<VisibilityIcon fontSize="small" />}
        onClick={(e) => {
          e.stopPropagation();
          onOpen(item.lineItem);
        }}
      >
        View
      </Button>
    </TableCell>
  </TableRow>
);

/**
 * PO HEADER VIEW - rendered when a PO number is searched WITHOUT a line
 * item. Shows the PO's header-level checks (points 1-9, evaluated once
 * for the whole PO) via PoHeaderChecksPanel, plus a picker list of the
 * PO's line items - clicking one drills into the Line-Item view below.
 */
const PoHeaderView = ({
  data,
  roleFlags,
  currentUserId,
  onOpenLineItem,
  onRefresh,
}) => {
  if (!data) return null;
  return (
    <Card
      sx={{
        mt: 1,
        p: 2,
        boxShadow: 0,
        borderRadius: "10px",
        border: "1px solid #e5e5e5",
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 1,
          mb: 1,
        }}
      >
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 800 }}>
            PO {data.po_number}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {data.vendorName || data.vendorCode || "—"} ·{" "}
            {data.plantName || "—"} ·{" "}
            {data.purchaseGroupName || data.purchaseGroup || "—"}
          </Typography>
        </Box>
        <Chip
          icon={<LayersRoundedIcon fontSize="small" />}
          label={`${data.lineItemCount} line item${data.lineItemCount === 1 ? "" : "s"}`}
          sx={{ fontWeight: 700, bgcolor: "#eef2ff", color: "#4338ca" }}
        />
      </Box>

      <Divider sx={{ my: 2 }} />

      <PoHeaderChecksPanel
        poNumber={data.po_number}
        header={data.header}
        currentUserId={currentUserId}
        isBuyer={roleFlags.isBuyer}
        isAdmin={roleFlags.isAdmin}
        isProcurementManager={roleFlags.isProcurementManager}
        variant="full"
        onChanged={onRefresh}
      />

      <Typography variant="h6" sx={{ fontWeight: 700, mb: 1.5 }}>
        Line Items
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        Click a line item to view its own line-level checks. The header checks
        above already apply to every line item shown here — you won't be asked
        to review them again.
      </Typography>
      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead sx={{ bgcolor: "#f5f5f5" }}>
            <TableRow>
              <TableCell sx={{ fontWeight: 700 }}>Line Item</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Material</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Description</TableCell>
              <TableCell sx={{ fontWeight: 700 }} align="right">
                Net Value
              </TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Line-Level Result</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Line Status</TableCell>
              <TableCell sx={{ fontWeight: 700 }} align="right">
                Action
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {(data.lineItems || []).map((item) => (
              <LineItemPickerRow
                key={item.id || item.lineItem}
                item={item}
                onOpen={onOpenLineItem}
              />
            ))}
            {(!data.lineItems || data.lineItems.length === 0) && (
              <TableRow>
                <TableCell
                  colSpan={7}
                  align="center"
                  sx={{ color: "text.secondary", py: 3 }}
                >
                  No line items found for this PO.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Card>
  );
};

const useRoleFlags = () => {
  const role = localStorage.getItem("role") || "";
  return {
    isAdmin: role === "isAdmin",
    isBuyer: role === "isBuyer",
    isProcurementManager: role === "isProcurementManager",
    isAuditor: role === "isAuditor",
  };
};

const SearchAuditData = () => {
  const navigate = useNavigate();
  const roleFlags = useRoleFlags();
  const currentUserId = localStorage.getItem("userId");
  const [searchParams] = useSearchParams();
  const { dataViewType } = useSelector((state) => state.menu);

  const [searchLoading, setSearchLoading] = useState(false);
  const [viewDocUrl, setViewDocUrl] = useState(null);
  const [searchData, setSearchData] = useState();

  const [searchInputs, setSearchInputs] = useState({
    documentNumber: "",
    paymentDocumentNumber: "",
    grrNumber: "",
    PONumber: "",
    poLineItem: "",
    poMaterialNumber: "",
  });

  const [pomaterialNoOptions, setPOMaterialNoOptions] = useState([]);

  const handleSearch = async (inputs) => {
    const {
      documentNumber,
      paymentDocumentNumber,
      grrNumber,
      PONumber,
      poLineItem,
      poMaterialNumber,
    } = inputs;

    if (
      !documentNumber?.trim() &&
      !grrNumber?.trim() &&
      !poMaterialNumber?.trim() &&
      !PONumber?.trim() &&
      !paymentDocumentNumber?.trim()
    ) {
      toast.info("Provide details to search");
      return;
    }

    setSearchLoading(true);
    const endpoint = {
      PJV: "get_audit_result",
      PO: "getPOAuditResult",
      NONPO: "getNonPOAuditResult",
      BPV: "getBPVAuditResult",
    }[dataViewType];

    let payload = {};
    if (dataViewType === "PO") {
      payload = {
        po_number: PONumber?.trim(),
        po_line_item: poLineItem?.trim() || undefined,
        poMaterialNumber: poMaterialNumber?.trim() || undefined,
      };
    } else if (dataViewType === "BPV") {
      payload = {
        documentNumber: paymentDocumentNumber?.trim() || documentNumber?.trim(),
        paymentDocumentNumber:
          paymentDocumentNumber?.trim() || documentNumber?.trim(),
      };
    } else {
      payload = {
        search_key: grrNumber ? "GRR_NO" : "Document_No",
        search_value: grrNumber?.trim() || documentNumber?.trim(),
      };
    }

    try {
      const res = await post(`/${endpoint}`, payload);
      setSearchData(res);
      sessionStorage.setItem("searchInput-audit", JSON.stringify(inputs));
      window.scrollTo({ top: 520, left: 0, behavior: "smooth" });
    } catch (error) {
      setSearchData();
      toast.error(
        error?.response?.data?.message ||
          error?.message ||
          "Error occured while fetching data",
      );
    } finally {
      setSearchLoading(false);
    }
  };

  // Drill from the PO-header view into a specific line item — re-runs the
  // same search with poLineItem set, which flips the backend response
  // (and this page's render) into the Line-Item view.
  const openLineItem = (lineItem) => {
    const next = { ...searchInputs, poLineItem: String(lineItem) };
    setSearchInputs(next);
    handleSearch(next);
  };

  // From the Line-Item view, jump back to the PO-header view (clears the
  // line item, re-searches by PO number only).
  const backToHeaderView = () => {
    const next = { ...searchInputs, poLineItem: "" };
    setSearchInputs(next);
    handleSearch(next);
  };

  useEffect(() => {
    const documentNo = searchParams.get("documentNo")?.trim();
    const PONoParams = searchParams.get("PONo")?.trim();
    const poLineItemParams = searchParams.get("poLineItem")?.trim();
    const poMaterialNo = searchParams.get("poMaterialNo")?.trim();
    const paymentDocumentNumber = searchParams.get("paymentDocumentNumber");
    const storedInput = sessionStorage.getItem("searchInput-audit");
    const searchInput = storedInput ? JSON.parse(storedInput) : null;

    if (
      documentNo ||
      poMaterialNo ||
      PONoParams ||
      poLineItemParams ||
      paymentDocumentNumber
    ) {
      const inputs = {
        documentNumber: documentNo || "",
        PONumber: PONoParams || "",
        poLineItem: poLineItemParams || "",
        poMaterialNumber: poMaterialNo || "",
        paymentDocumentNumber: paymentDocumentNumber || "",
      };
      handleSearch(inputs);
      setSearchInputs(inputs);
      sessionStorage.setItem("searchInput-audit", JSON.stringify(inputs));
    } else if (searchInput && !roleFlags.isAuditor) {
      const {
        documentNumber = "",
        grrNumber = "",
        poMaterialNumber = "",
        PONumber = "",
        poLineItem = "",
        paymentDocumentNumber = "",
      } = searchInput;
      if (
        documentNumber.trim() ||
        grrNumber.trim() ||
        poMaterialNumber.trim() ||
        PONumber.trim() ||
        paymentDocumentNumber.trim()
      ) {
        handleSearch(searchInput);
      }
      setSearchInputs(searchInput);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setSearchData();
  }, [dataViewType]);

  const getPOMaterialNosList = async () => {
    try {
      const res = await get(`/getPOMaterialNumbers/${searchInputs.PONumber}`);
      setPOMaterialNoOptions(res.po_material_numbers || []);
    } catch (error) {
      toast.error(
        error?.response?.data?.message ||
          error?.message ||
          "Error occured while fetching data",
      );
    }
  };

  const isPoHeaderView =
    dataViewType === "PO" && searchData?.scope === "po-header";
  const isPoLineView =
    dataViewType === "PO" && searchData && searchData.scope !== "po-header";

  return (
    <ViewDocumentProvider>
      <Box sx={{ maxWidth: "xl", mx: "auto", p: 2 }}>
        <Typography variant="h4" sx={{ fontWeight: 800, mb: 3 }}>
          PO Data, Report, and Results
        </Typography>

        {!roleFlags.isAuditor && (
          <Card
            elevation={0}
            sx={{
              p: 3,
              borderRadius: 3,
              border: "1px solid",
              borderColor: "divider",
              mb: 3,
            }}
          >
            <Typography
              variant="h5"
              sx={{
                textAlign: "center",
                pb: 2,
                mb: 2,
                borderBottom: "1px solid #e5e5e5",
                fontWeight: 700,
              }}
            >
              Search PO
            </Typography>
            <Stack alignItems="center" gap={1} sx={{ mt: "15px" }}>
              {dataViewType === "PJV" && (
                <Box sx={{ maxWidth: "400px", width: "100%" }}>
                  <InputLabel sx={{ width: "100%" }}>
                    Document Number :
                  </InputLabel>
                  <TextField
                    disabled={searchLoading}
                    value={searchInputs.documentNumber}
                    name="documentNumber"
                    placeholder="Enter Document Number"
                    fullWidth
                    onChange={(e) => {
                      setSearchInputs({
                        ...searchInputs,
                        documentNumber: e.target.value,
                        grrNumber: "",
                      });
                    }}
                  />
                  <Divider sx={{ width: "100%", my: "15px" }}>OR</Divider>
                  <InputLabel name="GRR_NO" fullWidth>
                    GRR Number :
                  </InputLabel>
                  <TextField
                    name="grrNumber"
                    disabled={searchLoading}
                    value={searchInputs.grrNumber}
                    placeholder="Enter GRR Number"
                    fullWidth
                    onChange={(e) => {
                      setSearchInputs({
                        ...searchInputs,
                        grrNumber: e.target.value,
                        documentNumber: "",
                      });
                    }}
                  />
                </Box>
              )}
              {dataViewType === "NONPO" && (
                <Box sx={{ maxWidth: "400px", width: "100%" }}>
                  <InputLabel sx={{ width: "100%" }}>
                    Document Number :
                  </InputLabel>
                  <TextField
                    disabled={searchLoading}
                    value={searchInputs.documentNumber}
                    name="documentNumber"
                    placeholder="Enter Document Number"
                    fullWidth
                    onChange={(e) => {
                      setSearchInputs({
                        ...searchInputs,
                        documentNumber: e.target.value,
                        grrNumber: "",
                      });
                    }}
                  />
                </Box>
              )}
              {dataViewType === "PO" && (
                <Box sx={{ maxWidth: "400px", width: "100%" }}>
                  <InputLabel sx={{ width: "100%" }}>PO Number :</InputLabel>
                  <TextField
                    disabled={searchLoading}
                    placeholder="Enter PO Number"
                    name="PONumber"
                    value={searchInputs.PONumber}
                    fullWidth
                    onChange={(e) => {
                      setSearchInputs({
                        ...searchInputs,
                        PONumber: e.target.value,
                        poMaterialNumber: "",
                      });
                    }}
                    InputProps={{
                      endAdornment: (
                        <InputAdornment position="end">
                          <IconButton
                            onClick={getPOMaterialNosList}
                            disabled={searchLoading}
                          >
                            <SearchRoundedIcon />
                          </IconButton>
                        </InputAdornment>
                      ),
                    }}
                  />
                  <InputLabel sx={{ width: "100%", mt: "10px" }}>
                    Line Item (optional — leave blank to see PO Header Checks +
                    every line item first):
                  </InputLabel>
                  <TextField
                    disabled={searchLoading}
                    placeholder="e.g., 10 (optional)"
                    name="poLineItem"
                    value={searchInputs.poLineItem}
                    fullWidth
                    onChange={(e) => {
                      setSearchInputs({
                        ...searchInputs,
                        poLineItem: e.target.value,
                        poMaterialNumber: "",
                      });
                    }}
                  />
                </Box>
              )}
              {dataViewType === "BPV" && (
                <Box sx={{ maxWidth: "400px", width: "100%" }}>
                  <InputLabel sx={{ width: "100%" }}>
                    Payment Document Number :
                  </InputLabel>
                  <TextField
                    disabled={searchLoading}
                    value={searchInputs.paymentDocumentNumber}
                    name="paymentDocumentNumber"
                    placeholder="Enter Payment Document Number"
                    fullWidth
                    onChange={(e) => {
                      setSearchInputs({
                        ...searchInputs,
                        paymentDocumentNumber: e.target.value,
                      });
                    }}
                  />
                </Box>
              )}
              <Button
                variant="contained"
                onClick={() => handleSearch(searchInputs)}
                disabled={searchLoading}
                sx={{ width: "400px", mt: 3, boxShadow: "none" }}
                startIcon={!searchLoading ? <SearchRoundedIcon /> : null}
              >
                {searchLoading ? (
                  <CircularProgress size={20} color="inherit" />
                ) : (
                  "Search"
                )}
              </Button>
            </Stack>
          </Card>
        )}

        {/*
          ══════════════════════════════════════════════════════════════
          PO HEADER VIEW - PO number searched WITHOUT a line item.
          ══════════════════════════════════════════════════════════════
        */}
        {isPoHeaderView && (
          <PoHeaderView
            data={searchData}
            roleFlags={roleFlags}
            currentUserId={currentUserId}
            onOpenLineItem={openLineItem}
            onRefresh={() => handleSearch(searchInputs)}
          />
        )}

        {/*
          ══════════════════════════════════════════════════════════════
          LINE-ITEM VIEW - PO number + line item searched (or resolved by
          id/material number). Shows a compact header-status banner
          (expandable into the full header panel) ABOVE the line-item
          detail, so the two are visually separate but the header status
          is never hidden.
          ══════════════════════════════════════════════════════════════
        */}
        {(isPoLineView || (dataViewType !== "PO" && !!searchData)) && (
          <Card
            sx={{
              mt: 1,
              p: 1,
              boxShadow: 0,
              borderRadius: "10px",
              border: "1px solid #e5e5e5",
            }}
          >
            {dataViewType === "PO" && (
              <Box sx={{ px: 1, pt: 1 }}>
                <Button
                  size="small"
                  startIcon={<ArrowBackRoundedIcon fontSize="small" />}
                  onClick={backToHeaderView}
                  sx={{ textTransform: "none", fontWeight: 700, mb: 1 }}
                >
                  Back to PO Header &amp; All Line Items
                </Button>
                <PoHeaderChecksPanel
                  poNumber={searchData.po_number}
                  header={searchData.header}
                  currentUserId={currentUserId}
                  isBuyer={roleFlags.isBuyer}
                  isAdmin={roleFlags.isAdmin}
                  isProcurementManager={roleFlags.isProcurementManager}
                  variant="compact"
                  onChanged={() => handleSearch(searchInputs)}
                />
              </Box>
            )}

            {dataViewType === "PO" && <PoSummaryHeader data={searchData} />}

            <AuditDetails auditDetails={searchData} />
            {dataViewType === "PO" &&
              searchData?.processDocuments &&
              searchData.processDocuments.length > 0 && (
                <Box sx={{ mt: 3, mb: 2, px: 2 }}>
                  <Typography variant="h5" sx={{ mb: 1.5, fontWeight: 700 }}>
                    PO Process Documents & Signatures
                  </Typography>
                  <TableContainer component={Paper} variant="outlined">
                    <Table size="small">
                      <TableHead sx={{ bgcolor: "#f5f5f5" }}>
                        <TableRow>
                          <TableCell sx={{ fontWeight: 600 }}>
                            Document Name
                          </TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>
                            Signatures & Remarks
                          </TableCell>
                          <TableCell sx={{ fontWeight: 600, width: "120px" }}>
                            Action
                          </TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {searchData.processDocuments.map((doc, idx) => {
                          const isPdf = doc.name
                            ?.toLowerCase()
                            .endsWith(".pdf");
                          return (
                            <TableRow key={idx}>
                              <TableCell>{doc.name || "N/A"}</TableCell>
                              <TableCell>
                                {doc.signatures && doc.signatures.length > 0 ? (
                                  <List dense disablePadding>
                                    {doc.signatures.map((sig, sIdx) => (
                                      <ListItem
                                        key={sIdx}
                                        disablePadding
                                        sx={{
                                          display: "list-item",
                                          ml: 2,
                                          listStyleType: "disc",
                                        }}
                                      >
                                        <ListItemText
                                          primary={
                                            <Typography
                                              variant="body2"
                                              fontWeight={500}
                                            >
                                              {sig.signedBy ||
                                                sig.user?.username ||
                                                "Unknown"}{" "}
                                              —{" "}
                                              {sig.signedAt
                                                ? new Date(
                                                    sig.signedAt,
                                                  ).toLocaleString()
                                                : "No date"}
                                            </Typography>
                                          }
                                          secondary={
                                            sig.remarks ||
                                            sig.reason ||
                                            "No remarks"
                                          }
                                        />
                                      </ListItem>
                                    ))}
                                  </List>
                                ) : (
                                  <Typography
                                    variant="body2"
                                    color="textSecondary"
                                  >
                                    No signatures
                                  </Typography>
                                )}
                              </TableCell>
                              <TableCell>
                                {doc.name ? (
                                  <Button
                                    size="small"
                                    variant="outlined"
                                    onClick={() => {
                                      const baseUrl =
                                        import.meta.env.VITE_APP_BACKEND_URL ||
                                        "http://localhost:5000";
                                      const fileUrl = `${baseUrl}/getDocument/${encodeURIComponent(
                                        doc.name,
                                      )}?path=${encodeURIComponent(
                                        doc.path || "",
                                      )}`;
                                      if (isPdf) {
                                        setViewDocUrl(fileUrl);
                                      } else {
                                        const link =
                                          document.createElement("a");
                                        link.href = fileUrl;
                                        link.setAttribute("download", doc.name);
                                        document.body.appendChild(link);
                                        link.click();
                                        document.body.removeChild(link);
                                      }
                                    }}
                                  >
                                    {isPdf ? "View Doc" : "Download"}
                                  </Button>
                                ) : (
                                  <Typography variant="caption" color="error">
                                    No file available
                                  </Typography>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Box>
              )}
            {!roleFlags.isAuditor ? (
              <AuditResults
                searchData={searchData}
                setSearchData={() => setSearchData(null)}
              />
            ) : (
              <AuditResultReview
                searchData={searchData}
                setSearchData={() => setSearchData(null)}
              />
            )}
          </Card>
        )}

        <Dialog
          open={!!viewDocUrl}
          onClose={() => setViewDocUrl(null)}
          maxWidth="xl"
          fullWidth
        >
          <DialogTitle
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            Document Viewer
            <IconButton onClick={() => setViewDocUrl(null)}>
              <CloseIcon />
            </IconButton>
          </DialogTitle>
          <DialogContent sx={{ height: "80vh", p: 0, overflow: "hidden" }}>
            {viewDocUrl && (
              <iframe
                src={viewDocUrl}
                width="100%"
                height="100%"
                style={{ border: "none" }}
                title="Document Viewer"
              />
            )}
          </DialogContent>
        </Dialog>
      </Box>
    </ViewDocumentProvider>
  );
};

export default SearchAuditData;