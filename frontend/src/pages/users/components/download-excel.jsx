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
  loginFrom: moment().subtract(7, "days").format("YYYY-MM-DD"),
  loginTo: moment().endOf("day").format("YYYY-MM-DD"),
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
      // const payload =
      //   dataViewType === "PO"
      //     ? PONumbers?.length
      //       ? { poNumbers: PONumbers, type: dataViewType }
      //       : { type: dataViewType }
      //     : documentNumbers.length
      //     ? { documentNumbers, type: dataViewType }
      //     : { type: dataViewType };
      const response = await postMedia(
        `/export-logs?${query}`,
        {},
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
      link.setAttribute("download", `logs.xlsx`);
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
            {/* Vendor Verified */}
            <Grid item xs={6}>
              <InputLabel>Login From</InputLabel>
              <TextField
                name="loginFrom"
                type="date"
                fullWidth
                value={inputs.loginFrom}
                onChange={handleInputChange}
              />
            </Grid>
            <Grid item xs={6}>
              <InputLabel>Login To</InputLabel>
              <TextField
                name="loginTo"
                type="date"
                fullWidth
                value={inputs.loginTo}
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
        style={{ width: "160px" }}
        startIcon={<FileDownloadOutlinedIcon />}
      >
        Login Report
      </Button>
    </>
  );
}

export default DownloadExcel;
