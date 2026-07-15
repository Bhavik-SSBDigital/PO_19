import React from "react";
import ReactEcharts from "echarts-for-react";
import * as echarts from "echarts/core";

import MainCard from "components/MainCard";

const GradientStackedAreaChart = () => {
  const option = {
    color: ["#80FFA5", "#00DDFF", "#37A2FF", "#FF0087", "#FFBF00"],
    title: {
      text: "Gradient",
    },
    tooltip: {
      trigger: "axis",
      axisPointer: {
        type: "cross",
        label: {
          backgroundColor: "#6a7985",
        },
      },
    },
    legend: {
      data: ["Line 1", "Line 2", "Line 3"],
    },
    toolbox: {
      feature: {
        saveAsImage: {},
      },
    },
    grid: {
      left: "3%",
      right: "4%",
      bottom: "3%",
      containLabel: true,
    },
    xAxis: [
      {
        type: "category",
        boundaryGap: false,
        data: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
      },
    ],
    yAxis: [
      {
        type: "value",
      },
    ],
    series: [
      {
        name: "Line 1",
        type: "line",
        stack: "Total",
        smooth: true,
        lineStyle: {
          width: 0,
        },
        showSymbol: false,
        areaStyle: {
          opacity: 0.8,
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            {
              offset: 0,
              color: "rgb(128, 255, 165)",
            },
            {
              offset: 1,
              color: "rgb(1, 191, 236)",
            },
          ]),
        },
        emphasis: {
          focus: "series",
        },
        data: [140, 232, 101, 264, 90, 340, 250],
      },
      {
        name: "Line 2",
        type: "line",
        stack: "Total",
        smooth: true,
        lineStyle: {
          width: 0,
        },
        showSymbol: false,
        areaStyle: {
          opacity: 0.8,
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            {
              offset: 0,
              color: "rgb(255, 0, 0)",
            },
            {
              offset: 1,
              color: "rgb(0, 255, 0)",
            },
          ]),
        },
        emphasis: {
          focus: "series",
        },
        data: [120, 282, 111, 234, 220, 340, 310],
      },
      {
        name: "Line 3",
        type: "line",
        stack: "Total",
        smooth: true,
        lineStyle: {
          width: 0,
        },
        showSymbol: false,
        areaStyle: {
          opacity: 0.8,
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            {
              offset: 0,
              color: "rgb(0, 0, 255)",
            },
            {
              offset: 1,
              color: "rgb(255, 255, 0)",
            },
          ]),
        },
        emphasis: {
          focus: "series",
        },
        data: [320, 132, 201, 334, 190, 130, 220],
      },
    ],
  };

  return (
    <MainCard
      sx={{
        // backgroundColor: '#f4f2ff',
        border: 0,
        borderRadius: 5,
        "&:hover": {
          boxShadow:
            "#dddddd22 0px 1px 0px, #dddddd22 0px 8px 24px, #dddddd22 0px 16px 48px",
        },
        boxShadow:
          "#dddddd22 0px 1px 0px, #dddddd22 0px 8px 24px, #dddddd22 0px 16px 48px",
      }}
    >
      <ReactEcharts
        echarts={echarts}
        option={option}
        style={{ height: "350px" }}
      />
    </MainCard>
  );
};

export default GradientStackedAreaChart;
