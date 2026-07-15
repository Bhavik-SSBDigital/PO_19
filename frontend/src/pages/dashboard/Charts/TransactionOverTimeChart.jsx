import CloseIcon from "@mui/icons-material/Close";
import {
  Box,
  Dialog,
  DialogContent,
  Divider,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  ListSubheader,
  Pagination,
  Paper,
  LinearProgress,
  Typography,
} from "@mui/material";
import MainCard from "components/MainCard";
import { useCallback, useMemo, useState } from "react";
import Chart from "react-apexcharts";
import { calculateDateRangeForTimeSlot } from "utils/calculateDateRange";
import { formatTimeSlot } from "utils/formatTimeSlot";
import { dateRangeToLocal } from "utils/dateRangeToLocal";
// import { getVendorWiseTransactionDetails } from "../../../api/api-functions";
import { toast } from "react-toastify";
import { useSelector } from "react-redux";
import { poMaterialNumberSearch } from "utils/navigation";
import { get } from "utils/axiosApi";
import SearchResultLink from "../../../components/SearchResultLink";
const documentSearch = (documentNo, year) => {
  const url = `/search-data?documentNo=${documentNo}&year=${year}`;
  window.open(url, "_blank");
};

const BAR_DIFF = 0;

const TransactionOverTimeChart = ({
  noOfTransactionsOverTime,
  slot,
  startDate,
  endDate,
}) => {
  const { dataViewType } = useSelector((state) => state.menu);
  // const [vendorList, setVendorList] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [vendorSearchQuery, setVendorSearch] = useState("");
  const [selectedVendor, setSelectedVendor] = useState(null);
  const [tableLabel, setTabelLabel] = useState("");
  const [loading, setLoading] = useState(false);
  const [tableData, setTableData] = useState({
    results: [],
    currentPage: 1,
    count: 1,
    totalPages: 1,
    pageSize: 50,
    dateRange: null,
  });

  const loadData = useCallback(
    async (page, dateRange) => {
      const timeOut = setTimeout(() => setLoading(true), 500);
      let isSuccess = true;
      try {
        const {
          vendorWiseTransactionDetails: { count, vendorWiseTransactions },
        } = await get("/getVendorWiseTransactionDetails", {
          startDate: dateRange.startDate,
          endDate: dateRange.endDate,
          page,
          limit: 50,
          type: dataViewType,
        });
        // const {
        //   data: {
        //     vendorWiseTransactionDetails: { count, vendorWiseTransactions },
        //   },
        // } = await getVendorWiseTransactionDetails({
        //   startDate: dateRange.startDate,
        //   endDate: dateRange.endDate,
        //   page,
        //   limit: 50,
        //   type: dataViewType,
        // });

        setTableData((state) => ({
          ...state,
          results: vendorWiseTransactions,
          currentPage: page,
          totalPages: count
            ? Math.ceil(count / state.pageSize)
            : state.totalPages,
          count: count || state.count,
          dateRange,
        }));
      } catch (error) {
        console.error("Cannot get transaction vendor data", error);
        toast.error("Something went wrong. Please try again");
        isSuccess = false;
      }
      clearTimeout(timeOut);
      setLoading(false);
      return isSuccess;
    },
    [dataViewType]
  );

  const { series, options } = useMemo(() => {
    const timeLabels = [];
    const seriesData = [];
    const unfilteredTimeLables = [];
    const unformattedTimeLables = [];

    noOfTransactionsOverTime.forEach(({ time, count }) => {
      const formattedTimeSlot = formatTimeSlot(time, slot, startDate, endDate);
      unfilteredTimeLables.push(formattedTimeSlot);
      unformattedTimeLables.push(time);
      if (count) {
        timeLabels.push(formattedTimeSlot);
        seriesData.push(count + BAR_DIFF);
      }
    });

    const series = [
      {
        name: "Number of transactions",
        data: seriesData,
      },
    ];

    const options = {
      type: "bar",
      chart: {
        type: "bar",

        events: {
          click: async function (event, chartContext, { dataPointIndex }) {
            if (dataPointIndex === -1) return;

            const timeSlot = timeLabels[dataPointIndex];

            const timeIndex = unfilteredTimeLables.findIndex(
              (label) => label === timeSlot
            );

            const isFirst = timeIndex === 0;
            const isLast = timeIndex === unfilteredTimeLables.length - 1;

            const dateRange = dateRangeToLocal(
              calculateDateRangeForTimeSlot(
                slot,
                unformattedTimeLables[timeIndex],
                startDate,
                endDate,
                isFirst,
                isLast
              )
            );

            setLoading(true);
            setIsModalOpen(true);
            setSelectedVendor(null);
            setVendorSearch("");
            setTabelLabel(timeSlot);

            const isSuccess = await loadData(1, dateRange);

            if (!isSuccess) {
              setIsModalOpen(false);
            }
            setLoading(false);
          },
          // mouseMove: console.log,
        },
      },
      title: {
        text: "Number of transactions over time",
        align: "left",
      },
      dataLabels: {
        enabled: true,
        offsetY: -20,
        formatter: function (val) {
          return val !== 0 && val !== "0" ? val - BAR_DIFF : "";
        },
        style: {
          fontSize: "12px",
          colors: ["#304758"],
        },
      },
      tooltip: {
        intersect: false,
        y: {
          formatter: (val) => `${val - BAR_DIFF}`,
        },
      },
      xaxis: {
        categories: timeLabels,
      },
      plotOptions: {
        bar: {
          borderRadius: 10,
          dataLabels: {
            position: "top", // top, center, bottom
          },
          horizontal: false,
          minBarHeight: 5,
          barHeight: "100%",
        },
      },
      legend: {
        position: "top",
        horizontalAlign: "right",
        floating: true,
        offsetY: -10,
      },
    };

    return {
      series,
      options,
    };
  }, [
    noOfTransactionsOverTime,
    startDate,
    endDate,
    slot,
    loadData,
    dataViewType,
  ]);

  return (
    <MainCard
      sx={{
        border: "1px solid #000",
        borderRadius: "18px",
        borderColor: "#d5d5d5",
      }}
    >
      {options && (
        <Chart options={options} series={series} height={350} type="bar" />
      )}

      <Dialog
        open={isModalOpen}
        maxWidth="xl"
        onClose={() => {
          setIsModalOpen(false);
        }}
        aria-labelledby="Risk Data Modal"
      >
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <Box />

          <IconButton
            onClick={() => {
              setIsModalOpen(false);
            }}
          >
            <CloseIcon />
          </IconButton>
        </Box>
        <DialogContent sx={{ overflow: "hidden", postion: "relative" }}>
          <Box
            display="flex"
            justifyContent="center"
            alignItems="top"
            sx={{
              flexDirection: "row",
              position: "relative",
              height: "80vh",
            }}
          >
            <Box display="flex" sx={{ flexDirection: "column" }}>
              <Paper
                sx={{
                  overflow: "auto",
                  width: "100%",
                  maxWidth: 380,
                  minWidth: 360,
                  height: "80vh",
                  position: "relative",
                }}
              >
                <List
                  sx={{
                    bgcolor: "background.paper",
                    maxHeight: "100%",
                  }}
                  component="nav"
                  aria-labelledby="nested-list-subheader"
                  subheader={
                    <ListSubheader component="div" id="nested-list-subheader">
                      {/* <Box
                        display="flex"
                        justifyContent="center"
                        alignItems="center"
                        gap={0}
                        sx={{ flexDirection: "column", mb: 0 }}
                      > */}
                      Transactions Per Vendor ({tableLabel})
                      {/* <TextField
                          label="Search Vendors"
                          value={vendorSearchQuery}
                          onChange={(e) => setVendorSearch(e.target.value)}
                        /> */}
                      {/* </Box> */}
                    </ListSubheader>
                  }
                >
                  {loading ? (
                    <LinearProgress sx={{ height: 3 }} />
                  ) : (
                    tableData?.results.map((a, index) => {
                      return (
                        <>
                          <ListItemButton
                            onClick={() => {
                              setSelectedVendor(a);
                            }}
                          >
                            <ListItemIcon sx={{ margin: "0px 12px 0px 0px" }}>
                              {tableData.pageSize *
                                (tableData.currentPage - 1) +
                                index +
                                1}
                            </ListItemIcon>
                            <ListItemText
                              primary={a.supplierName}
                              secondary={`Verified: ${
                                a.verified_transactions?.length || 0
                              } | Non-verified: ${
                                a.not_verified_transactions?.length || 0
                              }`}
                            />
                          </ListItemButton>
                          <Divider variant="inset" component="li" />
                        </>
                      );
                    })
                  )}
                </List>
              </Paper>

              {tableData.totalPages > 1 ? (
                <Box
                  sx={{ width: "100%" }}
                  display="flex"
                  gap={8}
                  justifyContent="center"
                  alignItems="center"
                >
                  <Pagination
                    sx={{ maxWidth: 380, minWidth: 360, pt: 2 }}
                    count={tableData.totalPages}
                    page={tableData.currentPage}
                    onChange={async (event, page) => {
                      await loadData(page, tableData.dateRange);
                    }}
                    shape="rounded"
                    // showFirstButton
                    // showLastButton
                  />
                </Box>
              ) : null}
            </Box>

            {selectedVendor ? (
              <>
                <Divider orientation="vertical" flexItem />
                <Box
                  display="flex"
                  sx={{
                    px: 5,
                    flexDirection: "column",
                    minWidth: "30vw",
                    overflow: "auto",
                  }}
                >
                  <Typography
                    variant="h5"
                    sx={{
                      position: "sticky",
                      top: "0px",
                      backgroundColor: "white",
                      zIndex: 100,
                      color: "rgba(0,0,0,0.6)",
                    }}
                  >
                    {selectedVendor.supplierName}
                  </Typography>
                  <Box display="flex" gap={8} sx={{ flexDirection: "row" }}>
                    {selectedVendor.verified_transactions &&
                    selectedVendor.verified_transactions.length ? (
                      <List
                        component="nav"
                        subheader={
                          <ListSubheader
                            sx={{ top: "20px" }}
                            component="div"
                            id="nested-list-subheader"
                          >
                            Verified Transactions (
                            {selectedVendor.verified_transactions.length})
                          </ListSubheader>
                        }
                      >
                        {selectedVendor.verified_transactions.map((a) => {
                          return (
                            <>
                              <ListItemButton
                                sx={{
                                  border: "1px solid lightgray",
                                  borderRadius: "4px",
                                  my: 2,
                                }}
                                // onClick={() => {
                                //   if (["PJV", "BPV"].includes(dataViewType)) {
                                //     documentSearch(
                                //       a.documentNumber,
                                //       a.fiscalYear
                                //     );
                                //   } else {
                                //     poMaterialNumberSearch(
                                //       a.po_material_number
                                //     );
                                //   }
                                // }}
                              >
                                <SearchResultLink
                                  number={a.documentNumber}
                                  year={a.fiscalYear}
                                  poMaterialNo={a.po_number}
                                  target="_blank"
                                >
                                  <ListItemText
                                    primary={
                                      ["PJV", "BPV", "NONPO"].includes(
                                        dataViewType
                                      )
                                        ? a.documentNumber
                                        : a.po_number || a.documentNumber
                                    }
                                    secondary={a.fiscalYear}
                                  />
                                </SearchResultLink>
                              </ListItemButton>
                              <Divider variant="inset" component="li" />
                            </>
                          );
                        })}
                      </List>
                    ) : null}

                    {selectedVendor.not_verified_transactions &&
                    selectedVendor.not_verified_transactions.length ? (
                      <List
                        component="nav"
                        subheader={
                          <ListSubheader
                            component="div"
                            sx={{ top: "20px" }}
                            id="nested-list-subheader"
                          >
                            Not Verified Transactions (
                            {selectedVendor.not_verified_transactions.length})
                          </ListSubheader>
                        }
                      >
                        {selectedVendor.not_verified_transactions.map(
                          (a, index) => {
                            return (
                              <SearchResultLink
                                number={a.documentNumber}
                                year={a.fiscalYear}
                                poMaterialNo={a.po_number}
                                target="_blank"
                              >
                                <ListItemButton
                                  key={index}
                                  sx={{
                                    border: "1px solid lightgray",
                                    borderRadius: "4px",
                                    my: 2,
                                  }}
                                  // onClick={() => {
                                  //   if (["PJV", "BPV"].includes(dataViewType)) {
                                  //     documentSearch(
                                  //       a.documentNumber,
                                  //       a.fiscalYear
                                  //     );
                                  //   } else {
                                  //     poMaterialNumberSearch(
                                  //       a.po_material_number
                                  //     );
                                  //   }
                                  // }}
                                >
                                  <ListItemText
                                    primary={
                                      ["PJV", "BPV", "NONPO"].includes(
                                        dataViewType
                                      )
                                        ? a.documentNumber
                                        : a.po_number || a.documentNumber
                                    }
                                    secondary={a.fiscalYear}
                                  />
                                </ListItemButton>
                              </SearchResultLink>
                            );
                          }
                        )}
                      </List>
                    ) : null}
                  </Box>
                </Box>
              </>
            ) : null}
          </Box>
        </DialogContent>
      </Dialog>
    </MainCard>
  );
};

export default TransactionOverTimeChart;
