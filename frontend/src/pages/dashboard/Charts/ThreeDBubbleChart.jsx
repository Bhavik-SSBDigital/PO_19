import MainCard from "components/MainCard";
import React from "react";
import ApexCharts from "react-apexcharts";

const generateData = (baseval, count, yrange) => {
  var i = 0;
  var series = [];
  while (i < count) {
    var x = baseval;
    var y =
      Math.floor(Math.random() * (yrange.max - yrange.min + 1)) + yrange.min;
    var z = Math.floor(Math.random() * (75 - 15 + 1)) + 15;

    series.push({ x, y, z });
    baseval += 86400000;
    i++;
  }
  return series;
};

const ThreeDBubbleChart = () => {
  const options = {
    series: [
      {
        name: "Product1",
        data: generateData(new Date("11 Feb 2017 GMT").getTime(), 20, {
          min: 10,
          max: 60,
        }),
      },
      {
        name: "Product2",
        data: generateData(new Date("11 Feb 2017 GMT").getTime(), 20, {
          min: 10,
          max: 60,
        }),
      },
      {
        name: "Product3",
        data: generateData(new Date("11 Feb 2017 GMT").getTime(), 20, {
          min: 10,
          max: 60,
        }),
      },
      {
        name: "Product4",
        data: generateData(new Date("11 Feb 2017 GMT").getTime(), 20, {
          min: 10,
          max: 60,
        }),
      },
    ],
    chart: {
      height: 350,
      type: "bubble",
    },
    dataLabels: {
      enabled: false,
    },
    fill: {
      type: "gradient",
    },
    title: {
      text: "3D Bubble Chart",
    },
    xaxis: {
      type: "datetime",
    },
    yaxis: {
      max: 70,
    },
    theme: {
      palette: "palette2",
    },
  };

  return (
    <MainCard
      sx={{
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
      <ApexCharts
        options={options}
        series={options.series}
        type="bubble"
        height={435}
      />
    </MainCard>
  );
};

export default ThreeDBubbleChart;
