import { useEffect, useState } from "react";
import {
  Autocomplete,
  IconButton,
  InputAdornment,
  Typography,
  Box,
  Button,
  Stack,
  TextField,
  Divider,
  CircularProgress,
  MenuItem,
  Select,
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
} from "@mui/material";

import { toast } from "react-toastify";
import { useSelector } from "react-redux";
import { useNavigate, useSearchParams } from "react-router-dom";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import KeyboardBackspaceRoundedIcon from "@mui/icons-material/KeyboardBackspaceRounded";
import CloseIcon from "@mui/icons-material/Close";

import { get, post } from "utils/axiosApi";
import { ViewDocumentProvider } from "./contexts";
import AuditDetails from "./components/audit-details";
import AuditResults from "./components/results-table";
import AuditResultReview from "./components/audit-result-review";

const getLastFiveYears = () => {
  const currentYear = new Date().getFullYear();
  return Array.from({ length: 5 }, (_, index) => currentYear - index);
};

const SearchAuditData = () => {
  const navigate = useNavigate();
  const role = localStorage.getItem("role");

  const [searchParams] = useSearchParams();
  const { dataViewType } = useSelector((state) => state.menu);

  const [searchLoading, setSearchLoading] = useState(false);
  const [viewDocUrl, setViewDocUrl] = useState(null);

  const [searchData, setSearchData] = useState();
  const [searchInputs, setSearchInputs] = useState({
    documentNumber: "",
    paymentDocumentNumber: "",
    fiscalYear: "",
    grrNumber: "",
    PONumber: "",
    poMaterialNumber: "",
  });
  const [pomaterialNoOptions, setPOMaterialNoOptions] = useState([]);

  const handleSearch = async ({
    documentNumber = "",
    paymentDocumentNumber = "",
    fiscalYear = "",
    grrNumber = "",
    PONumber = "",
    poMaterialNumber = "",
  }) => {
    if (
      !documentNumber.trim() &&
      !grrNumber.trim() &&
      !poMaterialNumber.trim() &&
      !PONumber.trim() &&
      !paymentDocumentNumber.trim()
    ) {
      toast.info("Provide details to search");
      return;
    }
    if (documentNumber.trim() && !fiscalYear) {
      toast.info("Please select year");
      return;
    }

    setSearchLoading(true);
    const endpoint = {
      PJV: "get_audit_result",
      PO: "getPOAuditResult",
      NONPO: "getNonPOAuditResult",
      BPV: "getBPVAuditResult",
    }[dataViewType];

    let payload =
      dataViewType === "PJV"
        ? {
            search_key: grrNumber ? "GRR_NO" : "Document_No",
            search_value: grrNumber ? grrNumber.trim() : documentNumber.trim(),
            fiscalYear,
          }
        : {};
    payload =
      dataViewType === "PO"
        ? { po_number: PONumber.trim(), fiscalYear }
        : payload;
    payload =
      dataViewType === "BPV"
        ? {
            documentNumber:
              paymentDocumentNumber.trim() || documentNumber.trim(),
            paymentDocumentNumber:
              paymentDocumentNumber.trim() || documentNumber.trim(),
            fiscalYear,
          }
        : payload;
    payload =
      dataViewType === "NONPO"
        ? {
            search_key: grrNumber ? "GRR_NO" : "Document_No",
            search_value: grrNumber ? grrNumber.trim() : documentNumber.trim(),
            fiscalYear,
          }
        : payload;

    try {
      const res = await post(`/${endpoint}`, payload);
      console.log("FULL RESPONSE:", res);
console.log("AUDIT RESULT:", res);
      setSearchData(res);
      sessionStorage.setItem("searchInput-audit", JSON.stringify(searchInputs));
      window.scrollTo({ top: 520, left: 0, behavior: "smooth" });
    } catch (error) {
      setSearchData();
      toast.error(
        error?.response?.data?.message ||
          error?.message ||
          "Error occured while fetching data"
      );
    } finally {
      setSearchLoading(false);
    }
  };

  useEffect(() => {
    const documentNo = searchParams.get("documentNo")?.trim();
    const year = searchParams.get("year")?.trim();
    const PONoParams = searchParams.get("PONo")?.trim();
    const poMaterialNo = searchParams.get("poMaterialNo")?.trim();
    const paymentDocumentNumber = searchParams.get("paymentDocumentNumber");

    const storedInput = sessionStorage.getItem("searchInput-audit");
    const searchInput = storedInput ? JSON.parse(storedInput) : null;

    if (documentNo || poMaterialNo || PONoParams || paymentDocumentNumber) {
      const inputs = {
        documentNumber: documentNo || "",
        fiscalYear: year || "",
        PONumber: PONoParams || "",
        paymentDocumentNumber: paymentDocumentNumber || "",
      };
      handleSearch(inputs);
      setSearchInputs(inputs);
      sessionStorage.setItem("searchInput-audit", JSON.stringify(inputs));
    } else if (searchInput && role !== "isAuditor") {
      const {
        documentNumber = "",
        grrNumber = "",
        poMaterialNumber = "",
        PONumber = "",
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
          "Error occured while fetching data"
      );
    }
  };

  return (
    <ViewDocumentProvider>
      <Box>
        <Button
          onClick={() => navigate(-1)}
          size="small"
          sx={{
            height: 25,
            fontSize: "16px",
            fontWeight: 700,
            borderRadius: "12px",
            mb: 2,
          }}
          startIcon={<KeyboardBackspaceRoundedIcon />}
        >
          Back
        </Button>
        <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 2 }}>
          <Typography variant="h4" sx={{ fontWeight: 700 }}>
            Audit Data, Report, and Results
          </Typography>
        </Box>

        {role !== "isAuditor" && (
          <Card
            sx={{
              mt: 1,
              p: 2,
              boxShadow: 0,
              borderRadius: "10px",
              border: "1px solid #e5e5e5",
            }}
          >
            <Typography
              variant="h4"
              sx={{
                textAlign: "center",
                pb: 1,
                borderBottom: "1px solid #e5e5e5",
                fontWeight: 700,
              }}
            >
              Search Audit
            </Typography>
            <Stack alignItems="center" gap={1} sx={{ mt: "15px" }}>
              {dataViewType === "PJV" && (
                <Box sx={{ maxWidth: "400px", width: "100%" }}>
                  <InputLabel fullWidth>Document Number :</InputLabel>
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
                  <InputLabel sx={{ width: "100%", mt: "10px" }}>
                    Fiscal Year :
                  </InputLabel>
                  <Select
                    value={searchInputs.fiscalYear}
                    disabled={searchLoading}
                    name="fiscalYear"
                    placeholder="Select Fiscal Year"
                    fullWidth
                    displayEmpty
                    onChange={(e) => {
                      setSearchInputs({
                        ...searchInputs,
                        fiscalYear: e.target.value,
                        grrNumber: "",
                      });
                    }}
                  >
                    <MenuItem value="">Select Fiscal Year</MenuItem>
                    {getLastFiveYears().map((year) => (
                      <MenuItem key={year} value={year}>
                        {year}
                      </MenuItem>
                    ))}
                  </Select>
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
                        fiscalYear: "",
                      });
                    }}
                  />
                </Box>
              )}
              {dataViewType === "NONPO" && (
                <Box sx={{ maxWidth: "400px", width: "100%" }}>
                  <InputLabel fullWidth>Document Number :</InputLabel>
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
                  <InputLabel sx={{ width: "100%", mt: "10px" }}>
                    Fiscal Year :
                  </InputLabel>
                  <Select
                    value={searchInputs.fiscalYear}
                    disabled={searchLoading}
                    name="fiscalYear"
                    placeholder="Select Fiscal Year"
                    fullWidth
                    displayEmpty
                    onChange={(e) => {
                      setSearchInputs({
                        ...searchInputs,
                        fiscalYear: e.target.value,
                        grrNumber: "",
                      });
                    }}
                  >
                    <MenuItem value="">Select Fiscal Year</MenuItem>
                    {getLastFiveYears().map((year) => (
                      <MenuItem key={year} value={year}>
                        {year}
                      </MenuItem>
                    ))}
                  </Select>
                </Box>
              )}

              {dataViewType === "PO" && (
                <>
                  <Box sx={{ maxWidth: "400px", width: "100%" }}>
                    <InputLabel fullWidth>PO Number :</InputLabel>
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
                      Fiscal Year :
                    </InputLabel>
                    <Select
                      value={searchInputs.fiscalYear}
                      disabled={searchLoading}
                      name="fiscalYear"
                      placeholder="Select Fiscal Year"
                      fullWidth
                      displayEmpty
                      onChange={(e) => {
                        setSearchInputs({
                          ...searchInputs,
                          fiscalYear: e.target.value,
                        });
                      }}
                    >
                      <MenuItem value="">Select Fiscal Year</MenuItem>
                      {getLastFiveYears().map((year) => (
                        <MenuItem key={year} value={year}>
                          {year}
                        </MenuItem>
                      ))}
                    </Select>
                  </Box>
                </>
              )}
              {dataViewType === "BPV" && (
                <Box sx={{ maxWidth: "400px", width: "100%" }}>
                  <InputLabel fullWidth>Payment Document Number :</InputLabel>
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
                  <InputLabel sx={{ width: "100%", mt: "10px" }}>
                    Fiscal Year :
                  </InputLabel>
                  <Select
                    value={searchInputs.fiscalYear}
                    disabled={searchLoading}
                    name="fiscalYear"
                    placeholder="Select Fiscal Year"
                    fullWidth
                    displayEmpty
                    onChange={(e) => {
                      setSearchInputs({
                        ...searchInputs,
                        fiscalYear: e.target.value,
                        grrNumber: "",
                      });
                    }}
                  >
                    <MenuItem value="">Select Fiscal Year</MenuItem>
                    {getLastFiveYears().map((year) => (
                      <MenuItem key={year} value={year}>
                        {year}
                      </MenuItem>
                    ))}
                  </Select>
                </Box>
              )}
              <Button
                variant="contained"
                onClick={() => handleSearch(searchInputs)}
                disabled={searchLoading}
                sx={{ width: "400px", mt: "15px" }}
                startIcon={!searchLoading ? <SearchRoundedIcon /> : null}
              >
                {searchLoading ? <CircularProgress size={20} /> : "Search"}
              </Button>
            </Stack>
          </Card>
        )}

        {!!searchData && (
          <Card
            sx={{
              mt: 1,
              p: 1,
              boxShadow: 0,
              borderRadius: "10px",
              border: "1px solid #e5e5e5",
            }}
          >
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
                                {doc.signatures &&
                                doc.signatures.length > 0 ? (
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
                                                    sig.signedAt
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
                                        import.meta.env
                                          .VITE_APP_BACKEND_URL ||
                                        "http://localhost:5000";

                                      const fileUrl = `${baseUrl}/getDocument/${encodeURIComponent(
                                        doc.name
                                      )}?path=${encodeURIComponent(
                                        doc.path || ""
                                      )}`;

                                      if (isPdf) {
                                        setViewDocUrl(fileUrl);
                                      } else {
                                        const link =
                                          document.createElement("a");
                                        link.href = fileUrl;
                                        link.setAttribute(
                                          "download",
                                          doc.name
                                        );
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

            {role !== "isAuditor" ? (
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
          <DialogContent
            sx={{ height: "80vh", p: 0, overflow: "hidden" }}
          >
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