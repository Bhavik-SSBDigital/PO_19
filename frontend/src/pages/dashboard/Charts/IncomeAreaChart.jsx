import PropTypes from "prop-types";
import { useState, useEffect } from "react";

// material-ui
import { useTheme } from "@mui/material/styles";

// third-party
import ReactApexChart from "react-apexcharts";
import ReactECharts from "echarts-for-react";

// chart options
// const areaChartOptions = {
//   chart: {
//     height: 450,
//     type: "area",
//     toolbar: {
//       show: false,
//     },
//   },
//   dataLabels: {
//     enabled: false,
//   },
//   stroke: {
//     curve: "smooth",
//     width: 2,
//   },
//   grid: {
//     strokeDashArray: 0,
//   },
// };

// ==============================|| INCOME AREA CHART ||============================== //

const IncomeAreaChart = ({ slot }) => {
  const theme = useTheme();
  // ------------ ercharts -----------------
  const { primary, secondary } = theme.palette.text;
  const line = theme.palette.divider;
  const option = {
    angleAxis: {
      type: "category",
      data: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    },
    radiusAxis: {},
    polar: {},
    series: [
      {
        type: "bar",
        data: [1, 2, 3, 4, 3, 5, 1],
        coordinateSystem: "polar",
        name: "Not verified",
        stack: "a",
        emphasis: {
          focus: "series",
        },
      },
      {
        type: "bar",
        data: [2, 4, 6, 1, 3, 2, 1],
        coordinateSystem: "polar",
        name: "Verified",
        stack: "a",
        emphasis: {
          focus: "series",
        },
      },
      {
        type: "bar",
        data: [1, 2, 3, 4, 1, 2, 5],
        coordinateSystem: "polar",
        name: "Missing",
        stack: "a",
        emphasis: {
          focus: "series",
        },
      },
    ],
    legend: {
      show: true,
      data: ["Not verified", "Verified", "Missing"],
    },
  };

  // -----------apex chart ------------
  // const [options, setOptions] = useState(areaChartOptions);
  useEffect(() => {
    // setOptions((prevState) => ({
    //   ...prevState,
    //   colors: [theme.palette.primary.main, theme.palette.primary[700]],
    //   xaxis: {
    //     categories:
    //       slot === "month"
    //         ? [
    //             "Jan",
    //             "Feb",
    //             "Mar",
    //             "Apr",
    //             "May",
    //             "Jun",
    //             "Jul",
    //             "Aug",
    //             "Sep",
    //             "Oct",
    //             "Nov",
    //             "Dec",
    //           ]
    //         : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    //     labels: {
    //       style: {
    //         colors: [
    //           secondary,
    //           secondary,
    //           secondary,
    //           secondary,
    //           secondary,
    //           secondary,
    //           secondary,
    //           secondary,
    //           secondary,
    //           secondary,
    //           secondary,
    //           secondary,
    //         ],
    //       },
    //     },
    //     axisBorder: {
    //       show: true,
    //       color: line,
    //     },
    //     tickAmount: slot === "month" ? 11 : 7,
    //   },
    //   yaxis: {
    //     labels: {
    //       style: {
    //         colors: [secondary],
    //       },
    //     },
    //   },
    //   grid: {
    //     borderColor: line,
    //   },
    //   colors: ["#4caf50", "#f44336", "#ff9800"],
    //   tooltip: {
    //     theme: "light",
    //   },
    // }));
  }, [primary, secondary, line, theme, slot]);
  // const [series, setSeries] = useState([
  //   {
  //     name: "Verified",
  //     data: [0, 86, 28, 115, 48, 210, 136],
  //   },
  //   {
  //     name: "Not verified",
  //     data: [0, 43, 14, 56, 24, 105, 68],
  //   },
  //   {
  //     name: "Missing",
  //     data: [0, 20, 34, 16, 64, 135, 58],
  //   },
  // ]);
  useEffect(() => {
    // setSeries([
    //   {
    //     name: "Verified",
    //     data:
    //       slot === "month"
    //         ? [76, 85, 101, 98, 87, 105, 91, 114, 94, 86, 115, 35]
    //         : [31, 40, 28, 51, 42, 109, 100],
    //   },
    //   {
    //     name: "Not verified",
    //     data:
    //       slot === "month"
    //         ? [110, 60, 150, 35, 60, 36, 26, 45, 65, 52, 53, 41]
    //         : [11, 32, 45, 32, 34, 52, 41],
    //   },
    //   {
    //     name: "Missing",
    //     data:
    //       slot === "month"
    //         ? [60, 90, 10, 55, 100, 36, 66, 25, 105, 32, 103, 49]
    //         : [20, 12, 35, 42, 14, 32, 11],
    //   },
    // ]);
  }, [slot]);

  return (
    // <ReactApexChart
    //   options={options}
    //   series={series}
    //   type="area"
    //   height={450}
    // />
    <ReactECharts option={option} style={{ height: "450px", width: "100%" }} />
  );
};

IncomeAreaChart.propTypes = {
  slot: PropTypes.string,
};

export default IncomeAreaChart;
