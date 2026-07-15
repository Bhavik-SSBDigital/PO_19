import { useEffect, useState } from "react";
// material-ui
import { Box, Pagination, Paper, Stack, Typography } from "@mui/material";

// project import
import { get } from "utils/axiosApi";
import { TableSkeleton } from "../../components/Skeletons";
import DownloadExcel from "./components/download-excel";
import LogsTable from "./components/logs-table";

const DEFAULT_PAGE_SIZE = 20;

const DEFAULT_INPUTS = {
  page: 1,
  limit: DEFAULT_PAGE_SIZE,
  totalPages: 1,
  totalRecords: 0,
};

// ================================|| REGISTER ||================================ //

const UserLogs = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [inputs, setInputs] = useState(DEFAULT_INPUTS);

  const [logs, setLogs] = useState([]);

  const fetchLogs = async (params) => {
    setIsLoading(true);
    try {
      let response = await get(`/getUsers`, { ...inputs, ...params });
      setLogs(response?.users || []);
      const { totalPages, totalRecords } = response?.pagination || {};
      setInputs((prev) => ({ ...prev, totalPages, totalRecords }));
    } catch (error) {
      console.error("Error fetching Logs:", error);
    } finally {
      setIsLoading(false);
    }
  };
  useEffect(() => {
    fetchLogs();
  }, []);

  const handlePageValue = (_, page) => {
    setInputs((prevInputs) => ({ ...prevInputs, page }));
    fetchLogs({ page });
  };

  if (isLoading) {
    return <TableSkeleton />;
  }
  return (
    <>
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="baseline"
        sx={{ mb: 2 }}
      >
        <Typography variant="h3" sx={{ fontWeight: 700 }}>
          User Logs
        </Typography>
        <DownloadExcel loading={isLoading} />
      </Stack>
      <Paper
        sx={{ borderRadius: "14px", border: "1px solid #e5e5e5" }}
        elevation={0}
      >
        <LogsTable userLogs={logs} fetchLogs={fetchLogs} />
        <Stack
          sx={{ p: 1, borderRadius: "14px", border: "1px solid #e5e5e5" }}
          alignItems="center"
        >
          <Pagination
            count={inputs.totalPages}
            page={inputs.page}
            onChange={handlePageValue}
            color="primary"
            showFirstButton
            showLastButton
          />
        </Stack>
      </Paper>
    </>
  );
};

export default UserLogs;
