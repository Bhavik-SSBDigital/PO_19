import { useState } from "react";
import { Button, ButtonGroup, CircularProgress } from "@mui/material";
import FileDownloadOutlinedIcon from "@mui/icons-material/FileDownloadOutlined";
import { toast } from "react-toastify";
import { postMedia } from "utils/axiosApi";

/**
 * RC Overlap's own Excel export, matching the "2 export types" pattern
 * used everywhere else in the app (see issue-tracker/components/
 * download-excel.jsx and controller/po-remarks-report-controller.js):
 *   - Exceptions only: currently "Not Verified" AND not yet closed - the
 *     actionable subset a buyer still needs to work through.
 *   - All RCs: every RC in scope, regardless of status.
 * Both respect the same search/status the table is currently filtered to
 * (server-side scoping to the buyer's own purchasing group is enforced
 * either way - see rc-overlap-export-controller.js).
 */
const RcOverlapDownloadExcel = ({ search = "", status = "" }) => {
  const [downloading, setDownloading] = useState(null); // "exceptions" | "all" | null

  const download = async (exportType) => {
    setDownloading(exportType);
    try {
      const response = await postMedia(
        "/reports/rc-overlap/download",
        {
          search: search || undefined,
          status: status || undefined,
          exportType,
        },
        { responseType: "blob" },
      );
      const blob = new Blob([response], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute(
        "download",
        `rc-overlap-${exportType}-${new Date().toISOString().slice(0, 10)}.xlsx`,
      );
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      toast.error("Failed to download RC Overlap export");
    } finally {
      setDownloading(null);
    }
  };

  return (
    <ButtonGroup variant="outlined" size="small" sx={{ borderRadius: 3 }}>
      <Button
        onClick={() => download("exceptions")}
        disabled={!!downloading}
        startIcon={
          downloading === "exceptions" ? (
            <CircularProgress size={14} />
          ) : (
            <FileDownloadOutlinedIcon fontSize="small" />
          )
        }
      >
        Export Exceptions
      </Button>
      <Button
        onClick={() => download("all")}
        disabled={!!downloading}
        startIcon={
          downloading === "all" ? (
            <CircularProgress size={14} />
          ) : (
            <FileDownloadOutlinedIcon fontSize="small" />
          )
        }
      >
        Export All RCs
      </Button>
    </ButtonGroup>
  );
};

export default RcOverlapDownloadExcel;
