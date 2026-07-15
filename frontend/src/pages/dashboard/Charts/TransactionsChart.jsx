// material-ui
import { Box, Stack, Typography } from "@mui/material";

// project import
import MainCard from "components/MainCard";

import {
  PlaylistAddCheckOutlined,
  TextSnippetOutlined,
  SubtitlesOffOutlined,
} from "@mui/icons-material";

// ==============================|| STATISTICS - ECOMMERCE CARD  ||============================== //

const TransactionsChart = ({ count, numberOfResults, totalDefaults }) => {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "row",
        gap: "20px",
        flexWrap: "wrap",
      }}
    >
      <MainCard
        contentSX={{ p: 2.25 }}
        sx={{
          flex: 1,
          minWidth: "250px",
          border: "1px solid #000",
          borderRadius: "12px",
          borderColor: "#d5d5d5",
        }}
      >
        <Stack
          direction="row"
          alignItems="center"
          justifyContent={"space-between"}
          spacing={1}
        >
          <Stack spacing={0.5}>
            <Typography variant="h5">Total Transactions Processed</Typography>
            <Typography sx={{ fontWeight: 700, color: "#555555" }} variant="h3">
              {count}
            </Typography>
          </Stack>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              bgcolor: "#DCFCE7",
              fontSize: "40px",
              p: 1,
              height: "45px",
              borderRadius: "8px",
            }}
          >
            <PlaylistAddCheckOutlined
              sx={{ color: "#43b76eff", fontSize: "30px" }}
            />
          </Box>
        </Stack>
      </MainCard>
      <MainCard
        contentSX={{ p: 2.25 }}
        sx={{
          flex: 1,
          minWidth: "250px",
          border: "1px solid #000",
          borderRadius: "12px",
          borderColor: "#d5d5d5",
        }}
      >
        <Stack
          direction="row"
          alignItems="center"
          justifyContent={"space-between"}
          spacing={1}
        >
          <Stack spacing={0.5}>
            <Typography variant="h5">Total Number of Results</Typography>
            <Typography variant="h3" sx={{ fontWeight: 700, color: "#555555" }}>
              {numberOfResults}
            </Typography>
          </Stack>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              bgcolor: "#DBEAFE",
              fontSize: "40px",
              p: 1,
              height: "45px",
              borderRadius: "8px",
            }}
          >
            <TextSnippetOutlined sx={{ color: "#3B82F6", fontSize: "30px" }} />
          </Box>
        </Stack>
      </MainCard>
      <MainCard
        contentSX={{ p: 2.25 }}
        sx={{
          flex: 1,
          minWidth: "250px",
          border: "1px solid #000",
          borderRadius: "12px",
          borderColor: "#d5d5d5",
        }}
      >
        <Stack
          direction="row"
          alignItems="center"
          justifyContent={"space-between"}
          spacing={1}
        >
          <Stack spacing={0.5}>
            <Typography variant="h5">Results Defaulted</Typography>
            <Typography variant="h3" sx={{ fontWeight: 700, color: "#555555" }}>
              {totalDefaults}
            </Typography>
          </Stack>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              bgcolor: "#FEE2E2",
              fontSize: "40px",
              p: 1,
              height: "45px",
              borderRadius: "8px",
            }}
          >
            <SubtitlesOffOutlined
              sx={{ color: "#ef2b2bff", fontSize: "30px" }}
            />
          </Box>
        </Stack>
      </MainCard>
    </div>
  );
};
export default TransactionsChart;
