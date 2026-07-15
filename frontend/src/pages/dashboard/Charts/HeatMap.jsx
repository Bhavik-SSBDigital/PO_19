import { useCallback, useEffect, useMemo, useState } from "react";
import ReactECharts from "echarts-for-react";
import MainCard from "components/MainCard";
import moment from "moment";
import {
  Box,
  Dialog,
  DialogContent,
  Divider,
  IconButton,
  LinearProgress,
  Typography,
} from "@mui/material";
import { useSelector } from "react-redux";
import { toast } from "react-toastify";

import { DataGrid, GridCloseIcon } from "@mui/x-data-grid";
// import { getDefaultDocumentDetails } from "../../../api/api-functions";
import { dateRangeToLocal } from "utils/dateRangeToLocal";
import { calculateDateRangeForTimeSlot } from "utils/calculateDateRange";
import { PrettoSlider } from "../../../components/slider/PrettoSlider";
import { PrettoTextField } from "../../../components/textfield/PrettoTextField";
import { get } from "utils/axiosApi";

const columns = [
  { field: "srNo", headerName: "Sr No", width: 100 },
  { field: "documentNumber", headerName: "Document Number", width: 200 },
  { field: "documenDate", headerName: "Document Date", width: 200 },
  { field: "fiscalYear", headerName: "Fiscal Year", width: 150 },
];

const pageSize = 10;

const documentSearch = (documentNo, year) => {
  const url = `/search-data?documentNo=${documentNo}&year=${year}`;
  window.open(url, "_blank");
};

const HeatMap = ({ defaultData, filterType, startDate, endDate }) => {
  const { dataViewType, drawerOpen } = useSelector((state) => state.menu);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedVendor, setSelectedVendor] = useState(null);
  const [selectedTimeSlot, setSelectedTimeSlot] = useState(null);
  const [tableLabel, setTabelLabel] = useState("");
  const [documentData, setDocumentData] = useState([]);
  const [loading, setLoading] = useState(false);

  const time = useMemo(
    () =>
      filterType === "weekly"
        ? defaultData?.map((a) => moment(a.time).format("DD-MM-YYYY")) || []
        : defaultData?.map((a) => a.time) || [],
    [defaultData, filterType]
  );

  // const { drawerOpen } = useSelector((state) => state.menu);

  const [chartData, setChartData] = useState({
    time: [],
    suppliers: [],
    data: [],
    max: 0,
    total: 0,
  });

  const getDoucmentDetails = useCallback(
    async (nameOfVendor, { startDate, endDate }) => {
      try {
        const response = await get("/getDefaultDocumentDetails", {
          startDate,
          endDate,
          nameOfVendor,
          type: dataViewType,
        });
        // const res = await getDefaultDocumentDetails({
        //   startDate,
        //   endDate,
        //   nameOfVendor,
        //   type: dataViewType,
        // });

        setDocumentData(
          // res?.data?.vendorWiseDocumentDetails?.map((b, index) => ({
          response?.vendorWiseDocumentDetails?.map((b, index) => ({
            id: index + 1,
            srNo: index + 1,
            documenDate: moment(b.documentDate).format("MM-DD-YYYY"),
            documentNumber: b.documentNumber,
            fiscalYear: b.fiscalYear,
            // supplierName: selectedVendor,
          })) || []
        );

        return true;
      } catch (error) {
        console.log(error);
        toast.error("Something went wrong. Please try again.");

        return false;
      }
    },
    []
  );

  const [page, setPage] = useState(1);
  const [totalPage, setTotalPage] = useState(1);

  // const onPageChange = useCallback((page) => {}, [defaultData, time]);

  useEffect(() => {
    const interval = setTimeout(() => {
      let supplierData = {};

      let chartData = [];

      let max = -9999;

      let total = 0;

      defaultData?.forEach((a, index) => {
        a.defaultDocumentDetails?.forEach((b) => {
          if (b?.count && b.supplierName !== "") {
            if (supplierData[b.supplierName] == undefined) {
              supplierData[b.supplierName] = new Array(defaultData.length).fill(
                0
              );
            }

            const numberofDefaults = b?.count || 0;

            let arr = supplierData[b.supplierName];
            arr[index] = arr[index] + numberofDefaults;

            const temp = {
              [b.supplierName]: arr,
            };

            // if (max < numberofDefaults) {
            //   max = numberofDefaults;
            // }

            total += numberofDefaults;

            supplierData = { ...supplierData, ...temp };
          }
        });
      });

      const supplierList = Object.keys(supplierData);

      setTotalPage(Math.ceil(supplierList.length / pageSize));

      const finalSupplierList = [];

      let chartDataIndex = 0;

      const startIndex = (page - 1) * pageSize;
      const endIndex = startIndex + pageSize;

      supplierList
        .sort((a, b) => {
          const supplier1total = supplierData[a].length
            ? supplierData[a].reduce((p, c) => p + c, 0)
            : 0;
          const supplier2total = supplierData[b].length
            ? supplierData[b].reduce((p, c) => p + c, 0)
            : 0;
          return supplier2total - supplier1total;
        })
        .slice(startIndex, endIndex)
        .reverse()
        .forEach((supplierName) => {
          const supplier = supplierData[supplierName];
          finalSupplierList.push(supplierName);
          supplier.forEach((value, x) => {
            if (max < value) {
              max = value;
            }
            chartData = [...chartData, [x, chartDataIndex, value || 0]];
          });
          chartDataIndex++;
        });

      setChartData({
        time: time,
        suppliers: finalSupplierList,
        data: chartData,
        max,
        total,
      });
    }, 100);

    return () => clearTimeout(interval);
  }, [defaultData, time, page]);

  const option = useMemo(
    () => ({
      title: {
        left: "center",
        text: `Default Documents Per Supplier`,
      },
      tooltip: {
        position: "top",
      },
      grid: {
        containLabel: true, // Ensures that the labels are inside the grid area
        borderRadius: "10px",
      },
      xAxis: [
        {
          type: "category",
          data: chartData.time,
          axisLabel: {
            rotate: 45,
          },
          position: "bottom", // Positioning the x-axis at the top
        },
      ],
      yAxis: {
        type: "category",
        data: chartData.suppliers,
        splitArea: {
          show: true,
        },
        axisPointer: {
          show: false,
        },
      },
      visualMap: {
        min: 0,
        max: chartData.max,
        calculable: false,
        inRange: {
          color: ["#73c0de", "#ee6666", "#FF0000"],
        },
      },
      series: [
        {
          name: "Default Documents",
          type: "heatmap",
          data: chartData.data,
          label: {
            show: true,
          },
          itemStyle: {
            borderColor: "white", // Set the border color
            borderWidth: 1, // Set the border width
          },
          emphasis: {
            itemStyle: {
              shadowBlur: 10,
              shadowColor: "rgba(0, 0, 0, 0.5)",
            },
          },
        },
      ],
    }),
    [chartData.max, chartData.data, chartData.suppliers, chartData.time]
  );

  return (
    <MainCard
      sx={{
        maxWidth: drawerOpen ? "calc(95.5vw - 260px)" : "98vw",
        border: "1px solid #000",
        borderRadius: "18px",
        borderColor: "#d5d5d5",
      }}
    >
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          // alignItems: "center",
          flexDirection: "column",
        }}
      >
        <Box sx={{ width: "100%" }}>
          <ReactECharts
            option={option}
            style={{
              height: `${
                (chartData?.suppliers?.length > 20
                  ? chartData?.suppliers?.length
                  : 15) * 35
              }px`,
              maxWidth: "100%",
            }}
            onEvents={{
              click: async (e) => {
                const [timeIndex, supplierIndex, value] = e.data;

                if (!value) {
                  toast.info("No documents to show.", { autoClose: 2000 });
                  return;
                }

                const timeSlot = chartData.time[timeIndex];
                const supplier = chartData.suppliers[supplierIndex];

                const isFirst = timeIndex === 0;
                const isLast = timeIndex === chartData.time.length - 1;

                const dateRange = dateRangeToLocal(
                  calculateDateRangeForTimeSlot(
                    filterType,
                    timeSlot,
                    startDate,
                    endDate,
                    isFirst,
                    isLast
                  )
                );
                setLoading(true);
                setIsModalOpen(true);

                const isSuccess = await getDoucmentDetails(supplier, dateRange);
                if (isSuccess) {
                  setSelectedTimeSlot(timeSlot);
                  setSelectedVendor(supplier);
                  setTabelLabel(
                    `${supplier} (${timeSlot}) Defaulted Documents`
                  );
                } else {
                  setIsModalOpen(false);
                }
                setLoading(false);
              },
            }}
          />
        </Box>
        {totalPage > 1 ? (
          <Box
            display="flex"
            sx={{
              flexDirection: "row",
              width: "100%",
              justifyContent: "space-around",
              gap: 2,
            }}
          >
            <PrettoSlider
              defaultValue={page}
              getAriaValueText={(value) => value}
              // step={1}
              value={page}
              onChange={(_, page) => setPage(page)}
              sx={{ maxWidth: "400px" }}
              valueLabelDisplay="auto"
              min={1}
              max={totalPage}
              marks={[
                {
                  value: 1,
                  label: 1,
                },
                {
                  value: totalPage,
                  label: totalPage,
                },
              ]}
            />

            <PrettoTextField
              type="number"
              label="Go to"
              min={1}
              max={totalPage}
              value={page}
              onChange={(e) => {
                try {
                  const value = parseInt(e.target.value);
                  if (value >= 1 && value <= totalPage) setPage(value);
                } catch {
                  //
                }
              }}
            />
          </Box>
        ) : null}
      </Box>

      <Dialog
        open={isModalOpen && documentData?.length}
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
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              alignItems: "center",
              flex: 1,
              width: "90%",
              py: 1,
            }}
          >
            <Typography
              align="justify"
              variant="h5"
              sx={{
                maxWidth: "70vw",
                py: 1,
                px: 4,
                position: "sticky",
                top: "22px",
                backgroundColor: "white",
                zIndex: 100,
                color: "rgba(0,0,0,0.6)",
              }}
            >
              {tableLabel}
            </Typography>
          </Box>

          <IconButton
            onClick={() => {
              setIsModalOpen(false);
            }}
          >
            <GridCloseIcon />
          </IconButton>
        </Box>
        <DialogContent sx={{ postion: "relative" }}>
          {loading ? (
            <Box sx={{ minWidth: "50vw", height: "80vh" }}>
              <LinearProgress />
            </Box>
          ) : (
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
              {selectedVendor !== null ? (
                <>
                  <Divider orientation="vertical" flexItem />
                  <Box
                    display="flex"
                    sx={{
                      px: 5,
                      flexDirection: "column",
                    }}
                  >
                    <Box display="flex" sx={{ flexDirection: "row" }}>
                      {selectedVendor &&
                      selectedTimeSlot &&
                      documentData &&
                      documentData?.length ? (
                        <DataGrid
                          onRowClick={(
                            params // GridRowParams
                          ) => {
                            documentSearch(
                              params.row.documentNumber,
                              params.row.fiscalYear
                            );
                          }}
                          sx={{
                            maxHeight: "550px",
                            "& .MuiDataGrid-cell:hover": {
                              cursor: "pointer",
                            },
                          }}
                          rows={documentData}
                          columns={columns}
                        />
                      ) : null}
                    </Box>
                  </Box>
                </>
              ) : null}
            </Box>
          )}
        </DialogContent>
      </Dialog>
    </MainCard>
  );
};

export default HeatMap;
