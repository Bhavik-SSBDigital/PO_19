import { useState } from "react";
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  Grid,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Typography,
} from "@mui/material";

import moment from "moment";
import { toast } from "react-toastify";
import { useSelector } from "react-redux";

import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import FileDownloadOutlinedIcon from "@mui/icons-material/FileDownloadOutlined";
import { postMedia } from "utils/axiosApi";

const DEFAULT_PAGE_SIZE = 20;

const isTenDigitNumber = (val) => /^\d{10}$/.test(val.trim());

const DEFAULT_INPUTS = {
  fiscalYear: "",
  status: "",
  pointNo: "",
  imported: "",
  vendor: "",
  amountMin: "",
  amountMax: "",
  minUnverified: "",
  sortBy: "",
  includeResults: "",
  documentNumber: "",
  po_material_number: "",
  page: 1,
  pageSize: DEFAULT_PAGE_SIZE,
  totalPages: 0,
  auditedOnFrom: "",
  auditedOnTo: "",
  manuallyVerifiedFrom: moment().subtract(7, "days").format("YYYY-MM-DD"),
  manuallyVerifiedTo: moment().endOf("day").format("YYYY-MM-DD"),
};

function DownloadExcel({ loading }) {
  const { dataViewType } = useSelector((state) => state.menu);

  const [open, setOpen] = useState(false);

  const [inputValue, setInputValue] = useState("");
  const [inputValuePO, setInputValuePO] = useState("");
  const [PONumbers, setPONumbers] = useState([]);
  const [documentNumbers, setDocumentNumbers] = useState([]);

  const [inputs, setInputs] = useState(DEFAULT_INPUTS);

  const handleInputChange = (event) => {
    const { name, value } = event.target;
    setInputs((prevInputs) => ({ ...prevInputs, [name]: value }));
  };

  const handlTabValueMulti = (e) => {
    if (e.target.value?.length < 10) {
      setInputValue(e.target.value);
      return;
    }
    const value = e.target.value;
    const parts = value
      .split(/[\s\n]+/)
      .map((val) => val.trim())
      .filter((val) => val !== "");

    const valid = [];
    const invalid = [];

    parts.forEach((num) => {
      if (isTenDigitNumber(num) && !documentNumbers.includes(num))
        valid.push(num);
    });

    setDocumentNumbers([...documentNumbers, ...valid]);
    setInputValue(invalid.join(" "));
  };
  const handleDelete = (chipToDelete) => {
    setDocumentNumbers(documentNumbers.filter((chip) => chip !== chipToDelete));
  };
  const [loading2, setLoading2] = useState("");
  const handleDWExcel = async () => {
    setLoading2(true);

    const filteredQuery = Object.fromEntries(
      Object.entries(inputs).filter(([_, value]) => {
        return value !== "" && value !== undefined && value !== null;
      })
    );

    const query = new URLSearchParams({
      ...filteredQuery,
      limit: inputs?.pageSize || DEFAULT_PAGE_SIZE,
    }).toString();
    try {
      const payload =
        dataViewType === "PO"
          ? PONumbers?.length
            ? { poNumbers: PONumbers, type: dataViewType }
            : { type: dataViewType }
          : documentNumbers.length
          ? { documentNumbers, type: dataViewType }
          : { type: dataViewType };
      const response = await postMedia(
        `/audit/export-point?${query}`,
        payload,
        {
          responseType: "blob",
          headers: { "Content-Type": "application/json" },
        }
      );

      const blob = new Blob([response], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `issueTracker.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      let err = "Error on downloading excel file";
      if (error?.response?.data instanceof Blob) {
        let text = await error?.response?.data.text();
        text = JSON.parse(text);
        err = text?.message || err;
      } else {
        err = error?.response?.data?.message || error?.message || err;
      }

      toast.error(err);
    } finally {
      setLoading2(false);
    }
  };

  const handlTabValueMultiPO = (e) => {
    if (e.target.value?.length < 10) {
      setInputValuePO(e.target.value);
      return;
    }
    const value = e.target.value;
    const parts = value
      .split(/[\s\n]+/)
      .map((val) => val.trim())
      .filter((val) => val !== "");

    const valid = [];
    const invalid = [];

    parts.forEach((num) => {
      if (isTenDigitNumber(num) && !PONumbers.includes(num)) valid.push(num);
    });

    setPONumbers([...PONumbers, ...valid]);
    setInputValuePO(invalid.join(" "));
  };
  const handleDeletePO = (chipToDelete) => {
    setPONumbers(PONumbers.filter((chip) => chip !== chipToDelete));
  };
  return (
    <>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        fullWidth
        maxWidth="xs"
        sx={{ "& .MuiDialog-paper": { borderRadius: "12px" } }}
      >
        <DialogTitle sx={{ display: "flex", justifyContent: "center" }}>
          <Typography variant="h3" align="center" sx={{ fontWeight: 700 }}>
            Download Excel
          </Typography>
          <IconButton
            onClick={() => setOpen(false)}
            sx={{ position: "absolute", top: "5px", right: "10px" }}
          >
            <CloseRoundedIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={2}>
            {dataViewType === "PJV" && (
              <>
                <Grid item xs={12}>
                  <InputLabel>Point No :</InputLabel>
                  <TextField
                    name="pointNo"
                    placeholder="Enter Point No"
                    fullWidth
                    value={inputs.pointNo}
                    onChange={handleInputChange}
                  />
                </Grid>
                <Grid item xs={12}>
                  <InputLabel>Document Nos :</InputLabel>
                  <TextField
                    name="documentNumber"
                    fullWidth
                    value={inputValue}
                    onChange={handlTabValueMulti}
                    placeholder="Paste or type 10-digit numbers"
                  />
                </Grid>
                {documentNumbers.length > 0 && (
                  <Grid item xs={12}>
                    <Box
                      sx={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 0.5,
                        maxHeight: "80px",
                        overflowY: "scroll",
                      }}
                    >
                      {documentNumbers.map((num) => (
                        <Chip
                          key={num}
                          label={num}
                          sx={{ borderRadius: "60px" }}
                          onDelete={() => handleDelete(num)}
                          size="small"
                        />
                      ))}
                    </Box>
                  </Grid>
                )}

                <Grid item xs={12}>
                  <InputLabel>Vendor :</InputLabel>
                  <TextField
                    name="vendor"
                    placeholder="Enter Vendor"
                    fullWidth
                    value={inputs.vendor}
                    onChange={handleInputChange}
                  />
                </Grid>
              </>
            )}
            {dataViewType === "NONPO" && (
              <>
                <Grid item xs={12}>
                  <InputLabel>Point No :</InputLabel>
                  <TextField
                    name="pointNo"
                    placeholder="Enter Point No"
                    fullWidth
                    value={inputs.pointNo}
                    onChange={handleInputChange}
                  />
                </Grid>
                <Grid item xs={12}>
                  <InputLabel>Document Nos :</InputLabel>
                  <TextField
                    name="documentNumber"
                    fullWidth
                    value={inputValue}
                    onChange={handlTabValueMulti}
                    placeholder="Paste or type 10-digit numbers"
                  />
                </Grid>
                {documentNumbers.length > 0 && (
                  <Grid item xs={12}>
                    <Box
                      sx={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 0.5,
                        maxHeight: "80px",
                        overflowY: "scroll",
                      }}
                    >
                      {documentNumbers.map((num) => (
                        <Chip
                          key={num}
                          label={num}
                          sx={{ borderRadius: "60px" }}
                          onDelete={() => handleDelete(num)}
                          size="small"
                        />
                      ))}
                    </Box>
                  </Grid>
                )}

                <Grid item xs={12}>
                  <InputLabel>Vendor :</InputLabel>
                  <TextField
                    name="vendor"
                    placeholder="Enter Vendor"
                    fullWidth
                    value={inputs.vendor}
                    onChange={handleInputChange}
                  />
                </Grid>
              </>
            )}
            {dataViewType === "PO" && (
              <>
                <Grid item xs={12}>
                  <InputLabel>PO Nos :</InputLabel>
                  <TextField
                    name="PONumber"
                    fullWidth
                    value={inputValuePO}
                    onChange={handlTabValueMultiPO}
                    placeholder="Paste or type 10-digit numbers"
                  />
                </Grid>
                {PONumbers.length > 0 && (
                  <Grid item xs={12}>
                    <Box
                      sx={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 0.5,
                        maxHeight: "80px",
                        overflowY: "scroll",
                      }}
                    >
                      {PONumbers.map((num) => (
                        <Chip
                          key={num}
                          label={num}
                          sx={{ borderRadius: "60px" }}
                          onDelete={() => handleDeletePO(num)}
                          size="small"
                        />
                      ))}
                    </Box>
                  </Grid>
                )}
              </>
            )}
            <Grid item xs={12}>
              <InputLabel>Status</InputLabel>
              <Select
                name="status"
                fullWidth
                value={inputs.status}
                onChange={handleInputChange}
                displayEmpty
              >
                <MenuItem value="">Select Status</MenuItem>
                <MenuItem value="resolved">Resolved</MenuItem>
                <MenuItem value="work_under_progress">
                  Work under progress
                </MenuItem>
                <MenuItem value="closed">Closed</MenuItem>
                <MenuItem value="pending">Pending</MenuItem>
              </Select>
            </Grid>
            <Grid item xs={6}>
              <InputLabel>Sys. AuditedOn From</InputLabel>
              <TextField
                name="auditedOnFrom"
                type="date"
                fullWidth
                value={inputs.auditedOnFrom}
                onChange={handleInputChange}
              />
            </Grid>
            <Grid item xs={6}>
              <InputLabel>Sys. AuditedOn To</InputLabel>
              <TextField
                name="auditedOnTo"
                type="date"
                fullWidth
                value={inputs.auditedOnTo}
                onChange={handleInputChange}
              />
            </Grid>

            {/* Vendor Verified */}
            <Grid item xs={6}>
              <InputLabel>Man. VerifiedOn From</InputLabel>
              <TextField
                name="manuallyVerifiedFrom"
                type="date"
                fullWidth
                value={inputs.manuallyVerifiedFrom}
                onChange={handleInputChange}
              />
            </Grid>
            <Grid item xs={6}>
              <InputLabel>Man. VerifiedOn To</InputLabel>
              <TextField
                name="manuallyVerifiedTo"
                type="date"
                fullWidth
                value={inputs.manuallyVerifiedTo}
                onChange={handleInputChange}
              />
            </Grid>
            <Grid item xs={12}>
              <Button
                variant="outlined"
                color="inherit"
                sx={{ width: "48%", mr: 1 }}
                onClick={() => {
                  setOpen(false);
                }}
              >
                Cancel
              </Button>

              <Button
                variant="contained"
                color="primary"
                sx={{ width: "48%" }}
                onClick={handleDWExcel}
                disabled={!!loading2}
              >
                Download
              </Button>
            </Grid>
          </Grid>
        </DialogContent>
      </Dialog>
      <Button
        variant="contained"
        onClick={() => setOpen(true)}
        disabled={loading || !!loading2}
        style={{ width: "120px" }}
        startIcon={<FileDownloadOutlinedIcon />}
      >
        Excel
      </Button>
    </>
  );
}

export default DownloadExcel;
