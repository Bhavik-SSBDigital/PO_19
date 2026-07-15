import CloseIcon from "@mui/icons-material/Close";
import {
  Box,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Typography,
  LinearProgress,
} from "@mui/material";
import MainCard from "components/MainCard";
import ReactECharts from "echarts-for-react";
import moment from "moment";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
// import { getDocumentsForRiskTable } from "../../../api/api-functions";
import { calculateDateRangeForTimeSlot } from "utils/calculateDateRange";
import { dateRangeToLocal } from "utils/dateRangeToLocal";
import { formatTimeSlot } from "utils/formatTimeSlot";
import RiskDataTable from "../table/RiskDataTable";
import { toast } from "react-toastify";
import { useSelector } from "react-redux";
import { get } from "utils/axiosApi";

const HIGH_RISK = "High Risk";
const LOW_RISK = "Low Risk";
const MEDIUM_RISK = "Medium Risk";
const NDO = "NDO";

const TIME_INDEX_KEY = "pie_chart_time_index";

const DEFAULT_PAGE_SIZE = 50;

const defaultData = [0, 0, 0, 0, 0, 0, 0];

const RiskComboChart = ({ filterType, counts, startDate, endDate }) => {
  const { dataViewType } = useSelector((state) => state.menu);
  const chartContainerRef = useRef();
  // perticular risk table data state
  const [tableData, setTableData] = useState({
    results: [],
    currentPage: 1,
    count: 1,
    pageSize: DEFAULT_PAGE_SIZE,
    dateRange: null,
    riskType: null,
  });
  const [tableTitle, setTableTitle] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const chartRef = useRef(null);

  const getPageData = useCallback(
    async (page, riskType, dateRange) => {
      const timeOut = setTimeout(() => setLoading(true), 500);
      let isSuccess = true;
      try {
        const { count, result } = await get("/getPointWiseData", {
          riskType: riskType,
          limit: 50,
          startDate: dateRange.startDate,
          endDate: dateRange.endDate,
          page: page,
          type: dataViewType,
        });

        setTableData((state) => ({
          ...state,
          count,
          results: result,
          currentPage: page,
          dateRange,
          riskType,
        }));
      } catch (error) {
        isSuccess = false;
        console.log(error);
        toast.error("Something went wrong. Please try again");
        return false;
      } finally {
        clearTimeout(timeOut);
        setLoading(false);
      }
      return isSuccess;
    },
    [dataViewType]
  );

  const chartData = useMemo(() => {
    if (!counts) return null;

    const timeLabels = [];

    const highRiskData = [];
    const mediumRiskData = [];
    const lowRiskData = [];
    const ndoData = [];
    const rawTimeList = [];

    let formatter =
      filterType === "weekly"
        ? counts[0]?.time
          ? moment(counts[0]?.time).format("DD-MM-YYYY")
          : counts[0]?.time
        : counts[0]?.time;

    counts.map(({ time: timeSlot, count }) => {
      rawTimeList.push(timeSlot);
      timeLabels.push(formatTimeSlot(timeSlot, filterType, startDate, endDate));
      highRiskData.push(count.highRiskPointFailureCount);
      mediumRiskData.push(count.mediumRiskPOintFailureCount);
      lowRiskData.push(count.lowRiskPointFailureCount);
      ndoData.push(count.NDOPointCount);
    });

    return {
      formatter,
      rawTimeList,
      timeLabels,
      highRiskData,
      mediumRiskData,
      lowRiskData,
      ndoData,
    };
  }, [counts, filterType, startDate, endDate]);

  const option = useMemo(
    () => ({
      title: {
        text: chartData?.timeLabels?.length ? chartData?.timeLabels[0] : "",
        top: "top",
        left: "right",
        textStyle: {
          fontSize: "12px",
        },
      },
      legend: {
        left: "left",
      },
      tooltip: {
        trigger: "item",
        showContent: true,
      },
      dataset: {
        source: [
          [
            "Timeline",
            ...(chartData?.timeLabels ? chartData.timeLabels : defaultData),
          ],
          [
            "Low Risk",
            ...(chartData?.lowRiskData ? chartData.lowRiskData : defaultData),
          ],
          ["NDO", ...(chartData?.ndoData ? chartData.ndoData : defaultData)],
          [
            "Medium Risk",
            ...(chartData?.mediumRiskData
              ? chartData.mediumRiskData
              : defaultData),
          ],
          [
            "High Risk",
            ...(chartData?.highRiskData ? chartData.highRiskData : defaultData),
          ],
        ],
      },
      xAxis: {
        type: "category",
        axisLabel: {
          rotate: 45,
        },
        axisPointer: {
          show: true,
          type: "line",
          label: {
            show: true,
            precision: 0,
          },
        },
      },
      yAxis: { gridIndex: 0 },
      grid: { top: "54%" },
      series: [
        {
          type: "line",
          smooth: true,
          seriesLayoutBy: "row",
          emphasis: { focus: "series" },
        },
        {
          type: "line",
          smooth: true,
          seriesLayoutBy: "row",
          emphasis: { focus: "series" },
        },
        {
          type: "line",
          smooth: true,
          seriesLayoutBy: "row",
          emphasis: { focus: "series" },
        },
        {
          type: "line",
          smooth: true,
          seriesLayoutBy: "row",
          emphasis: { focus: "series" },
        },
        {
          type: "pie",
          id: "pie",
          radius: "30%",
          center: ["50%", "30%"],
          emphasis: {
            focus: "self",
          },
          // label: {
          //   show: true,
          //   formatter: "{c} ({d}%)", // Display label, value, and percentage
          // },
          itemStyle: {
            opacity: 1, // Set opacity during hover
          },
          label: {
            formatter: `{@${
              chartData?.formatter ? chartData.formatter : ""
            }} ({d}%)`,
          },
          encode: {
            itemName: "Timeline",
            value: chartData.timeLabels,
            tooltip: chartData.formatter,
          },
        },
      ],
    }),
    [
      chartData.formatter,
      chartData.highRiskData,
      chartData.lowRiskData,
      chartData.mediumRiskData,
      chartData.ndoData,
      chartData.timeLabels,
    ]
  );

  useEffect(() => {
    // Points pie chart to first timeslot with count > 0;

    if (!counts) return;

    const myChart = chartRef.current.getEchartsInstance();

    let i = 0;

    for (i = 0; i < counts.length; i++) {
      const sum =
        counts[i].count.highRiskPointFailureCount +
        counts[i].count.mediumRiskPOintFailureCount +
        counts[i].count.lowRiskPointFailureCount +
        counts[i].count.NDOPointCount;

      if (sum) break;
    }

    myChart.setOption({
      title: {
        text: `${counts[i]?.time || ""}`,
      },
      series: {
        id: "pie",
        label: {
          formatter: `{b}: {@[${i + 1}]} ({d}%)`,
        },
        encode: {
          value: i + 1,
          tooltip: i + 1,
        },
      },
    });
  }, [counts]);

  useEffect(() => {
    const myChart = chartRef.current.getEchartsInstance();
    myChart.on("updateAxisPointer", function (event) {
      // setTimeIndex(event.dataIndex);
      if (event.dataIndex !== undefined && event.dataIndex !== null) {
        localStorage.setItem(TIME_INDEX_KEY, event.dataIndex);
      }

      const xAxisInfo = event.axesInfo[0];
      if (xAxisInfo) {
        const dimension = xAxisInfo.value + 1;
        myChart.setOption({
          title: {
            text: `${chartData?.timeLabels[dimension - 1]}`,
          },
          series: {
            id: "pie",
            label: {
              formatter: `{b}: {@[${dimension}]} ({d}%)`,
            },
            encode: {
              value: dimension,
              tooltip: dimension,
            },
          },
        });
      }
    });
  }, [chartData.timeLabels]);

  const onChartClick = useCallback(
    async ({ name, seriesName, seriesType, dataIndex }) => {
      const timeIndex =
        seriesType === "pie" ? localStorage.getItem(TIME_INDEX_KEY) : dataIndex;

      if (!timeIndex) return;

      const time = chartData.timeLabels;
      const rawTimeList = chartData.rawTimeList;

      const timeSlot = time[timeIndex];

      const riskType = seriesType === "pie" ? name : seriesName;

      let riskParam;

      switch (riskType) {
        case HIGH_RISK:
          riskParam = "highRisk";
          break;
        case MEDIUM_RISK:
          riskParam = "mediumRisk";
          break;
        case LOW_RISK:
          riskParam = "lowRisk";
          break;
        case NDO:
          riskParam = "NDO";
          break;
        default:
          console.log("Error opening pie data.");
          break;
      }

      const isFirstTimeSlot = timeIndex == 0;
      const isLastTimeSlot = timeIndex == time.length - 1;

      const dateRange = dateRangeToLocal(
        calculateDateRangeForTimeSlot(
          filterType,
          rawTimeList[timeIndex],
          startDate,
          endDate,
          isFirstTimeSlot,
          isLastTimeSlot
        )
      );

      setLoading(true);
      setModalOpen(true);
      const isSuccess = await getPageData(1, riskParam, dateRange);

      setLoading(false);
      if (!isSuccess) {
        setModalOpen(false);
      }

      setTableTitle(`${riskType} (${timeSlot}) Data`);
    },
    [chartData, startDate, endDate, filterType, getPageData, dataViewType]
  );

  const onEvents = useMemo(
    () => ({
      click: onChartClick,
    }),
    [onChartClick]
  );

  return (
    <MainCard
      sx={{
        border: "1px solid #000",
        borderRadius: "18px",
        borderColor: "#d5d5d5",
      }}
    >
      <Typography
        variant="h6"
        sx={{ mb: 1 }}
        style={{
          fontWeight: "900",
          fontFamily: "sans-serif",
          fontSize: "14px",
          fill: "rgb(55, 61, 63)",
          textAnchor: "start",
          dominantBaseline: "auto",
          display: "block",
          userSelect: "none",
          color: "#262626",
        }}
      >
        Deviations Observed Over Time
      </Typography>
      <div ref={chartContainerRef} id="chartContainer">
        <ReactECharts
          option={option}
          id="riskChart"
          ref={chartRef}
          onEvents={onEvents}
          style={{ height: "350px" }}
        />
      </div>

      {/* Table Modal */}

      <Dialog
        open={modalOpen}
        maxWidth="xl"
        onClose={() => {
          setModalOpen(false);
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
            <Box />
            <Typography
              variant="h4"
              sx={{ borderBottom: "2px solid", height: "30px" }}
            >
              {tableTitle} Data
            </Typography>
            <IconButton
              onClick={() => {
                setModalOpen(false);
              }}
            >
              <CloseIcon />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent>
          {loading ? (
            <Box sx={{ minWidth: "92vw", height: "74vh", overflowX: "hidden" }}>
              <LinearProgress />
            </Box>
          ) : (
            <RiskDataTable
              currentDataTitle={tableTitle}
              tableData={tableData}
              getPageData={getPageData}
              loading={loading}
            />
          )}
        </DialogContent>
      </Dialog>
    </MainCard>
  );
};
export default RiskComboChart;
