import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Box,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Typography,
  useMediaQuery,
  LinearProgress,
  Button,
  Popper,
  Fade,
  Paper,
  Stack,
  Select,
  MenuItem,
  CircularProgress,
} from "@mui/material";

import { toast } from "react-toastify";
import { useSelector } from "react-redux";
import ReactEcharts from "echarts-for-react";
import CloseIcon from "@mui/icons-material/Close";

import MainCard from "components/MainCard";
import { post, postMedia } from "utils/axiosApi";
import PointIntensityTable from "../table/PointIntensityTable";
// import { getPointIntensityDocument } from "../../../api/api-functions";
import { get } from "utils/axiosApi";

const years = Array.from(
  { length: 7 },
  (_, index) => new Date().getFullYear() - index
);

const PointIntensityChart = ({ data, startDate, endDate }) => {
  const { dataViewType } = useSelector((state) => state.menu);

  // device state
  const mediumDevice = useMediaQuery("(max-width:767px)");

  const [isModalOpen, setIsModalOpen] = useState(false);
  // const [selectedVendor, setSelectedVendor] = useState(null);
  const [tableLabel, setTabelLabel] = useState({
    pointNo: null,
    pointName: null,
  });
  const [loading, setLoading] = useState(false);
  const [tableData, setTableData] = useState({
    results: [],
    currentPage: 1,
    count: 1,
    pageSize: 50,
    pointNo: null,
  });

  const [pointList, setPointList] = useState([]);

  useEffect(() => {
    const fetchPointList = async () => {
      try {
        const response = await post("/getPoints", { type: dataViewType });

        setPointList(response?.points || response || []);
      } catch (error) {
        console.error("Error fetching point list:", error);
      }
    };
    fetchPointList();
  }, [dataViewType]);

  const chartData = useMemo(
    () =>
      data
        ?.filter((a) => a.count)
        ?.map((a) => ({
          name: pointList.find((p) => String(p.pointNo) === String(a.pointNo))
            ?.description,
          value: a.count,
        })) || [],
    [data, pointList]
  );

  const loadPointData = useCallback(
    async (pointNo, page) => {
      const timeOut = setTimeout(() => {
        setLoading(true);
      }, 500);
      let isSuccess = true;
      try {
        const { count, result } = await get("/getPointWiseData", {
          pointNo,
          page,
          startDate,
          endDate,
          limit: 50,
          type: dataViewType,
        });
        // const {
        //   data: { count, result },
        // } = await getPointIntensityDocument({
        //   pointNo,
        //   page,
        //   startDate,
        //   endDate,
        //   limit: 50,
        //   type: dataViewType,
        // });

        setTableData((state) => ({
          ...state,
          results: result,
          currentPage: page,
          count,
          pointNo,
        }));
      } catch (error) {
        console.error("Error getting point data", error);
        toast.error("Something went wrong. Please try again");

        isSuccess = false;
      }
      clearTimeout(timeOut);
      setLoading(false);
      return isSuccess;
    },
    [startDate, endDate]
  );

  const [excelInputs, setExcelInputs] = useState({
    point: "",
    year: "",
  });

  const option = useMemo(
    () => ({
      title: {
        left: "center",
        text: `Point Intensity(Point failure map during selected duration)`,
      },
      tooltip: {
        trigger: "item",
        formatter: function (params) {
          return `<div style="width: 33vw; white-space: pre-wrap; word-wrap: break-word;">${params.name} : ${params.value} (${params.percent}%)</div>`;
        },
      },
      legend: {
        show: false,
        top: "35%",
        left: "4%",
      },
      series: [
        {
          type: "pie",
          radius: mediumDevice ? ["40px", "120px"] : ["30%", "65%"],
          center: mediumDevice ? ["50%", "20%"] : ["50%", "50%"],
          data: chartData,
          itemStyle: {
            borderRadius: 5,
            borderColor: "#fff",
            borderWidth: 1,
          },
          label: {
            show: true,
            position: "outer",
            alignTo: "labelLine",
            bleedMargin: 5,
            fontSize: 15,
          },
          emphasis: {
            itemStyle: {
              shadowBlur: 10,
              shadowOffsetX: 0,
              shadowColor: "rgba(0, 0, 0, 0.5)",
            },
          },
        },
      ],
    }),
    [chartData, mediumDevice]
  );

  // Media query to adjust options for small devices
  if (window.innerWidth <= 768) {
    option.series[0].label.show = false; // Show labels
    option.legend.show = true; // Hide legend
  }

  const onChartClick = useCallback(
    async (params) => {
      const point = chartData[params.dataIndex].name;
      const pointNo = pointList.find(
        (p) => String(p.description) === String(point)
      )?.pointNo;

      setLoading(true);
      setIsModalOpen(true);

      const success = await loadPointData(pointNo, 1);

      if (success) {
        // setSelectedVendor(params.dataIndex);
        setTabelLabel({ pointNo, pointName: point });
      } else {
        setIsModalOpen(false);
      }
      setLoading(false);
    },
    [chartData, loadPointData, pointList]
  );

  const onEvents = useMemo(
    () => ({
      click: onChartClick,
    }),
    [onChartClick]
  );

  const [anchorEl, setAnchorEl] = useState(null);

  const yearClick = (event) => {
    setAnchorEl(event.currentTarget);
  };
  const [loading2, setLoading2] = useState("");
  const handleDWExcel = async () => {
    setLoading2("dwexcel");
    try {
      const pointNo = pointList.find(
        (p) => String(p.description) === String(excelInputs.point)
      )?.pointNo;

      const response = await postMedia(
        "/audit/export-point",
        {
          pointNo,
          fiscalYear: excelInputs.year,
          type: dataViewType,
        },
        {
          responseType: "blob", // Important to handle binary data
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      const blob = new Blob([response], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `${pointNo}_${excelInputs.year}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url); // Clean up
    } catch (error) {
      console.error("Download failed:", error);
    } finally {
      setLoading2("");
    }
  };

  return (
    <>
      {/* <Box
        sx={{ display: "flex", justifyContent: "flex-end", marginBottom: 2 }}
      >
        <Button size="small" onClick={yearClick} variant="contained">
          Download excel
        </Button>
      </Box> */}
      <MainCard
        sx={{
          border: "1px solid #000",
          borderRadius: "18px",
          borderColor: "#d5d5d5",
        }}
      >
        <ReactEcharts
          option={option}
          style={{ height: mediumDevice ? "900px" : "400px" }}
          onEvents={onEvents}
        />

        <Popper
          sx={{ zIndex: 1200 }}
          open={Boolean(anchorEl)}
          anchorEl={anchorEl}
          placement="bottom-end"
          transition
          onClose={() => {
            setExcelInputs({
              point: "",
              year: "",
            });
            setAnchorEl(null);
          }}
        >
          {({ TransitionProps }) => (
            <Fade {...TransitionProps} timeout={350}>
              <Paper
                sx={{
                  padding: "20px",
                  borderRadius: "12px",
                  position: "relative",
                  width: "min(400px, 90vw)",
                }}
              >
                <IconButton
                  sx={{
                    position: "absolute",
                    right: "4px",
                    top: "0",
                  }}
                  onClick={() => setAnchorEl(null)}
                >
                  <CloseIcon sx={{ fontSize: "19px" }} />
                </IconButton>

                <Stack gap={1} sx={{ marginTop: "5px" }}>
                  <label>Point</label>
                  <Select
                    value={excelInputs?.point}
                    onChange={(e) =>
                      setExcelInputs({
                        ...excelInputs,
                        point: e.target.value,
                      })
                    }
                    labelId="pointDropdownLabel"
                    id="pointDropdown"
                  >
                    <MenuItem value="">Select Point</MenuItem>
                    {pointList.map((point, index) => (
                      <MenuItem
                        key={point?.pointNo + index}
                        value={point?.description}
                      >
                        {point?.description}
                      </MenuItem>
                    ))}
                  </Select>
                  <label>Year</label>

                  <Select
                    value={excelInputs?.year}
                    onChange={(e) =>
                      setExcelInputs({
                        ...excelInputs,
                        year: e.target.value,
                      })
                    }
                    labelId="yearDropdownLabel"
                    id="yearDropdown"
                  >
                    <MenuItem value="">Select Year</MenuItem>
                    {years.map((year) => (
                      <MenuItem key={year} value={year}>
                        {year}
                      </MenuItem>
                    ))}
                  </Select>

                  <Button
                    variant="contained"
                    sx={{ backgroundColor: "#40a9ff" }}
                    size="small"
                    onClick={handleDWExcel}
                    disabled={loading2 === "dwexcel"}
                  >
                    {loading2 === "dwexcel" ? (
                      <CircularProgress size={20} />
                    ) : (
                      "Download Excel"
                    )}
                  </Button>
                </Stack>
              </Paper>
            </Fade>
          )}
        </Popper>

        <Dialog
          open={isModalOpen}
          maxWidth="xl"
          onClose={() => {
            setIsModalOpen(false);
          }}
          aria-labelledby="Risk Data Modal"
        >
          <DialogTitle>
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
                  py: 0,
                }}
              >
                <Typography
                  sx={{
                    position: "sticky",
                    top: "0px",
                    backgroundColor: "white",
                    zIndex: 100,
                    color: "rgba(0,0,0,0.6)",
                  }}
                >
                  Documents with point
                </Typography>
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
                  {tableLabel?.pointName}
                </Typography>
              </Box>

              <IconButton
                onClick={() => {
                  setIsModalOpen(false);
                }}
              >
                <CloseIcon />
              </IconButton>
            </Box>
          </DialogTitle>

          <DialogContent>
            {loading ? (
              <Box sx={{ minWidth: "85vw", height: "74vh" }}>
                <LinearProgress sx={{ height: 5 }} />
              </Box>
            ) : (
              <>
                <PointIntensityTable
                  tableData={tableData}
                  getPageData={loadPointData}
                />
              </>
            )}
          </DialogContent>
        </Dialog>
      </MainCard>
    </>
  );
};

export default PointIntensityChart;

// const documentData = data
//   ?.filter((a) => a.count)
//   ?.map((a) =>
//     a.documentDetails.map((b, index) => ({
//       id: index + 1,
//       srNo: index + 1,
//       documentNumber: b.documentNumber,
//       fiscalYear: b.fiscalYear,
//       supplierName: b.supplierName,
//     }))
//   );
