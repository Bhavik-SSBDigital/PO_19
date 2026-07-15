import MainCard from "components/MainCard";
import React from "react";
import Chart from "react-apexcharts";

const FunnelChart = ({ pointWiseIntensity }) => {
  const points = pointWiseIntensity.map((a) => a.point);
  const values = pointWiseIntensity.map((a) => a.count + 1);

  const options = {
    series: [
      {
        name: "Points",
        data: values,
      },
    ],
    options: {
      chart: {
        type: "bar",
        height: 350,
      },
      plotOptions: {
        bar: {
          borderRadius: 0,
          horizontal: true,
          distributed: true,
          barHeight: "80%",
          isFunnel: true,
        },
      },
      colors: [
        "#F44F5E",
        "#E55A89",
        "#D863B1",
        "#CA6CD8",
        "#B57BED",
        "#8D95EB",
        "#62ACEA",
        "#4BC3E6",
      ],
      dataLabels: {
        enabled: true,
        formatter: function (val, opt) {
          //   return opt.w.globals.labels[opt.dataPointIndex] + ":  " + val;
          return "fasf";
        },
        dropShadow: {
          enabled: true,
        },
      },
      title: {
        text: "Pyramid Chart",
        align: "middle",
      },
      xaxis: {
        categories: points,
      },
      legend: {
        show: false,
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
      {pointWiseIntensity && pointWiseIntensity.length != 0 ? (
        <Chart
          options={options}
          series={options.series}
          type="rangeBar"
          height="350px"
        />
      ) : null}
    </MainCard>
  );
};

export default FunnelChart;
