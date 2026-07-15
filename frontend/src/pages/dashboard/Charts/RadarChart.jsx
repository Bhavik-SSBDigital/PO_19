import React, { useEffect } from "react";
import ApexCharts from "react-apexcharts";
import MainCard from "components/MainCard";

const RadarChart = () => {
  const options = {
    series: [
      {
        name: "Series 1",
        data: [20, 100, 40, 30, 50, 80, 33],
      },
    ],
    chart: {
      height: "350px",
      type: "radar",
    },
    dataLabels: {
      enabled: true,
    },
    plotOptions: {
      radar: {
        size: 140,
        polygons: {
          strokeColors: "#e9e9e9",
          fill: {
            colors: ["#f8f8f8", "#fff"],
          },
        },
      },
    },
    title: {
      text: "Radar with Polygon Fill",
    },
    colors: ["#FF4560"],
    markers: {
      size: 4,
      colors: ["#fff"],
      strokeColor: "#FF4560",
      strokeWidth: 2,
    },
    tooltip: {
      y: {
        formatter: function (val) {
          return val;
        },
      },
    },
    xaxis: {
      categories: [
        "Sunday",
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
      ],
    },
    yaxis: {
      tickAmount: 7,
      labels: {
        formatter: function (val, i) {
          if (i % 2 === 0) {
            return val;
          } else {
            return "";
          }
        },
      },
    },
  };
  return (
    <MainCard
      sx={{
        border: 0,
        "&:hover": {
          boxShadow:
            "#dddddd22 0px 1px 0px, #dddddd22 0px 8px 24px, #dddddd22 0px 16px 48px",
        },
        boxShadow:
          "#dddddd22 0px 1px 0px, #dddddd22 0px 8px 24px, #dddddd22 0px 16px 48px",
        borderRadius: 5,
        minHeight: "450px", // Default height for medium devices
        "@media (min-width: 960px)": {
          minHeight: "443px", // Adjusted height for large devices
        },
      }}
    >
      <ApexCharts options={options} series={options.series} type="radar" height="350px" />
    </MainCard>
  );
};
export default RadarChart;
