import MainCard from "components/MainCard";
import React from "react";
import Chart from "react-apexcharts";

const getRandomValue = () => Math.floor(Math.random() * 20) + 1; // Generates random values between 1 and 50

const generateRandomData = (count) => {
  const data = [];
  for (let i = 0; i < count; i++) {
    data.push({
      protein: getRandomValue(),
      fiber: getRandomValue(),
      sodium: getRandomValue(),
      vitaminc: getRandomValue(),
      symbolSize: getRandomValue(),
    });
  }
  return data;
};

const TwoDBubbleChart = () => {
  // Generate random data
  const staticData = generateRandomData(7); // Adjust the count as needed

  // Set the options object for ApexCharts
  const options = {
    chart: {
      height: 350,
      type: "scatter",
      toolbar: {
        show: true,
      },
    },
    xaxis: {
      title: {
        text: "protein",
      },
    },
    yaxis: {
      title: {
        text: "fiber",
      },
    },
    zaxis: {
      title: {
        text: "sodium",
      },
    },
    grid: {
      borderColor: "#fff",
    },
    series: [
      {
        name: "3D Scatter Plot",
        data: staticData.map((item) => ({
          x: item.protein,
          y: item.fiber,
          z: item.sodium,
          size: item.symbolSize,
        })),
      },
    ],
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
        type="scatter"
        height={"350px"}
      />
    </MainCard>
  );
};

export default TwoDBubbleChart;
