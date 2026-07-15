import MainCard from "components/MainCard";
import React from "react";
import Chart from "react-apexcharts";

const RadarMultiChart = ({ data }) => {
  // let suppliers = [];

  // data.highRiskPointResults.forEach((a) => {
  //   a.data.forEach((b) => {
  //     suppliers.push(b.supplierName);
  //   });
  // });

  // data.lowRiskPointResults.forEach((a) => {
  //   a.data.forEach((b) => {
  //     suppliers.push(b.supplierName);
  //   });
  // });

  // data.mediumRiskPointResults.forEach((a) => {
  //   a.data.forEach((b) => {
  //     suppliers.push(b.supplierName);
  //   });
  // });

  // data.notDeviatedResults.forEach((a) => {
  //   a.data.forEach((b) => {
  //     suppliers.push(b.supplierName);
  //   });
  // });

  // suppliers = [...new Set(suppliers)];

  // const highSeries = Array(suppliers.length).fill(0);
  // const mediumSeries = Array(suppliers.length).fill(0);
  // const lowSeries = Array(suppliers.length).fill(0);
  // const ndoSeries = Array(suppliers.length).fill(0);


  var options = {
    series: [
      {
        name: "Series 1",
        data: [80, 50, 30, 40, 100, 20],
      },
      {
        name: "Series 2",
        data: [20, 30, 40, 80, 20, 80],
      },
      {
        name: "Series 3",
        data: [44, 76, 78, 13, 43, 10],
      },
    ],
    chart: {
      type: "radar",
      height: 350,
      dropShadow: {
        enabled: true,
        blur: 1,
        left: 1,
        top: 1,
      },
    },
    title: {
      text: "Radar Chart - Multi Series",
    },
    stroke: {
      width: 2,
    },
    fill: {
      opacity: 0.1,
    },
    markers: {
      size: 5, // Set marker size for better visibility
    },
    xaxis: {
      categories: ["2011", "2012", "2013", "2014", "2015", "2016"],
    },
    dataLabels: {
      enabled: true, // Enable data labels on hover
    },
    tooltip: {
      y: {
        formatter: function (val) {
          return val; // Customize tooltip content if needed
        },
      },
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
      <Chart
        options={options}
        series={options.series}
        type="radar"
        height="350px"
      />
    </MainCard>
  );
};

export default RadarMultiChart;
