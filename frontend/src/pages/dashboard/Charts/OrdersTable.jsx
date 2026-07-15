import React, { useEffect, useState } from "react";
import PropTypes from "prop-types";
import { Box } from "@mui/material";
import * as echarts from "echarts";
import ReactECharts from "echarts-for-react";
import ApexCharts from "react-apexcharts";

// react chart
// const jsonData = [
//   ['Year', 'Number of Successful Documents Proceed'],
//   [2012, 1],
//   [2013, 100],
//   [2014, 50],
//   [2015, 200],
//   [2016, 250],
//   [2017, 240],
//   [2018, 300],
//   [2019, 500],
// ];

// const option = {
//   animationDuration: 10000,
//   dataset: [{ id: 'dataset_raw', source: jsonData }],
//   tooltip: { order: 'valueDesc', trigger: 'axis' },
//   xAxis: { type: 'category', nameLocation: 'middle' },
//   yAxis: { name: 'Number of Successful Documents Proceed' },
//   grid: { right: 140 },
//   series: [
//     {
//       type: 'line',
//       encode: { x: 'Year', y: 'Number of Successful Documents Proceed' },
//       showSymbol: false,
//       endLabel: {
//         show: true,
//         formatter: function (params) {
//           return `${params.value[1]}: ${params.value[0]}`;
//         },
//       },
//       labelLayout: {
//         moveOverlap: 'shiftY',
//       },
//       emphasis: {
//         focus: 'series',
//       },
//     },
//   ],
// };
const JsonData = [
  [
    "Type of damage inflicted",
    "Life Expectancy",
    "Population",
    "Country",
    "Year",
  ],
  [1, 81.8, 22542371, "Documents Proceed", 2012],
  [100, 81.8, 22911375, "Documents Proceed", 2013],
  [50, 81.8, 23622353, "Documents Proceed", 2014],
  [200, 81.8, 22542371, "Documents Proceed", 2015],
  [250, 81.8, 22542371, "Documents Proceed", 2016],
  [240, 81.8, 22542371, "Documents Proceed", 2017],
  [300, 81.8, 22542371, "Documents Proceed", 2018],
  [500, 81.8, 22542371, "Documents Proceed", 2019],
];
export default function OrderTable() {
  // react chart
  const datasetWithFilters = [];
  const seriesList = [];
  const countries = [
    "Documents Proceed",
  ];
  echarts.util.each(countries, function (country) {
    var datasetId = "dataset_" + country;
    datasetWithFilters.push({
      id: datasetId,
      fromDatasetId: "dataset_raw",
      transform: {
        type: "filter",
        config: {
          and: [
            { dimension: "Year", gte: 1950 },
            { dimension: "Country", "=": country },
          ],
        },
      },
    });
    seriesList.push({
      type: "line",
      datasetId: datasetId,
      showSymbol: false,
      name: country,
      endLabel: {
        show: true,
        formatter: function (params) {
          return params.value[3] + ": " + params.value[0];
        },
      },
      labelLayout: {
        moveOverlap: "shiftY",
      },
      emphasis: {
        focus: "series",
      },
      encode: {
        x: "Year",
        y: "Type of damage inflicted",
        label: ["Country", "Type of damage inflicted"],
        itemName: "Year",
        tooltip: ["Type of damage inflicted"],
      },
    });
  });
  const option = {
    animationDuration: 10000,
    dataset: [{ id: "dataset_raw", source: JsonData }, ...datasetWithFilters],
    // title: { text: "Victim", subtext: "Type of damage inflicted" },
    tooltip: { order: "valueDesc", trigger: "axis" },
    xAxis: { type: "category", nameLocation: "middle" },
    yAxis: { name: "" },
    grid: { right: 140 },
    series: seriesList,
  };

  // apex chart
  // const [data, setData] = useState([]);
  // const [lastDate, setLastDate] = useState(new Date());

  // const generateFakeData = () => {
  //   const newDataPoint = {
  //     x: new Date().getTime(),
  //     y: Math.floor(Math.random() * (90 - 10 + 1)) + 10,
  //   };

  //   setData((prevData) => [...prevData, newDataPoint]);
  //   setLastDate(newDataPoint.x);
  // };

  // useEffect(() => {
  //   const interval = setInterval(() => {
  //     generateFakeData();
  //   }, 1000);

  //   return () => clearInterval(interval);
  // }, []);

  // const options = {
  //   series: [{ data }],
  //   chart: {
  //     id: "realtime",
  //     height: 350,
  //     type: "line",
  //     animations: {
  //       enabled: true,
  //       easing: "linear",
  //       dynamicAnimation: {
  //         speed: 1000,
  //       },
  //     },
  //     toolbar: {
  //       show: false,
  //     },
  //     zoom: {
  //       enabled: false,
  //     },
  //   },
  //   dataLabels: {
  //     enabled: false,
  //   },
  //   stroke: {
  //     curve: "smooth",
  //   },
  //   markers: {
  //     size: 0,
  //   },
  //   xaxis: {
  //     type: "datetime",
  //     range: 60000,
  //   },
  //   yaxis: {
  //     max: 100,
  //   },
  //   legend: {
  //     show: false,
  //   },
  // };
  return (
    <Box>
      <ReactECharts
        option={option}
        style={{ height: "400px", width: "100%" }}
      />
      {/* <ApexCharts
        options={options}
        series={options.series}
        type="line"
        height={385}
      /> */}
    </Box>
  );
}
