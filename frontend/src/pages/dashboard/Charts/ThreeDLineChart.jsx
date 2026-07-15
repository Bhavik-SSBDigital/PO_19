import ReactEcharts from "echarts-for-react";
import "echarts-gl";
import MainCard from "components/MainCard";

const ThreeDLineChart = () => {
  // Generate fake data
  const data = [];
  const data2 = [];
  const data3 = [];
  const x = [
    0, 1, 2, 3, 4, 5, 6, 9, 11, 16, 19, 22, 23, 27, 35, 45, 55, 59, 70,
  ];
  const y = [0, 10, 22, 33, 46, 59, 70, 88, 100, 134, 222, 290, 300, 350];
  const z = [0, 100, 110, 120, 130, 150, 170, 190, 210, 250, 280, 310, 340];
  for (let t = 0; t < 12; t += 1) {
    // const x = (1 + 0.25 * Math.cos(75 * t)) * Math.cos(t);
    // const y = (1 + 0.25 * Math.cos(75 * t)) * Math.sin(t);
    // const z = t + 2.0 * Math.sin(75 * t);
    data.push([x[t], y[t], z[t]]);
    data2.push([y[t], z[t], x[t]]);
    data3.push([z[t], y[t], x[t]]);
  }

  const option = {
    tooltip: {},
    backgroundColor: "#fff",
    visualMap: {
      show: false,
      dimension: 2,
      min: 0,
      max: 30,
      inRange: {
        color: [
          "#313695",
          "#4575b4",
          "#74add1",
          "#abd9e9",
          "#e0f3f8",
          "#ffffbf",
          "#fee090",
          "#fdae61",
          "#f46d43",
          "#d73027",
          "#a50026",
        ],
      },
    },
    legend: {
      data: ["Line 1", "Line 2", "Line 3"], // Legend labels for each line
    },
    xAxis3D: {
      type: "value",
    },
    yAxis3D: {
      type: "value",
    },
    zAxis3D: {
      type: "value",
    },
    grid3D: {
      viewControl: {
        projection: "orthographic",
      },
    },
    series: [
      {
        type: "line3D",
        data: data,
        lineStyle: {
          width: 4,
        },
      },
      {
        type: "line3D",
        data: data2,
        lineStyle: {
          width: 4,
        },
      },
      {
        type: "line3D",
        data: data3,
        lineStyle: {
          width: 4,
        },
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
      <ReactEcharts option={option} style={{ height: "450px" }} />
    </MainCard>
  );
};

export default ThreeDLineChart;
// import React from "react";
// import ReactEcharts from "echarts-for-react";
// import "echarts-gl";
// import MainCard from "components/MainCard";

// const ThreeDLineChart = () => {
//   // Generate fake data
//   const data = [];
//   for (let t = 0; t < 25; t += 0.001) {
//     const x = (1 + 0.25 * Math.cos(75 * t)) * Math.cos(t);
//     const y = (1 + 0.25 * Math.cos(75 * t)) * Math.sin(t);
//     const z = t + 2.0 * Math.sin(75 * t);
//     data.push([x, y, z]);
//   }

//   const option = {
//     tooltip: {},
//     backgroundColor: "#fff",
//     visualMap: {
//       show: false,
//       dimension: 2,
//       min: 0,
//       max: 30,
//       inRange: {
//         color: [
//           "#313695",
//           "#4575b4",
//           "#74add1",
//           "#abd9e9",
//           "#e0f3f8",
//           "#ffffbf",
//           "#fee090",
//           "#fdae61",
//           "#f46d43",
//           "#d73027",
//           "#a50026",
//         ],
//       },
//     },
//     xAxis3D: {
//       type: "value",
//     },
//     yAxis3D: {
//       type: "value",
//     },
//     zAxis3D: {
//       type: "value",
//     },
//     grid3D: {
//       viewControl: {
//         projection: "orthographic",
//       },
//     },
//     series: [
//       {
//         type: "line3D",
//         data: data,
//         lineStyle: {
//           width: 4,
//         },
//       },
//     ],
//   };

//   return (
//     <MainCard
//       sx={{
//         border: 0,
//         borderRadius: 5,
//         "&:hover": {
//           boxShadow:
//             "#dddddd22 0px 1px 0px, #dddddd22 0px 8px 24px, #dddddd22 0px 16px 48px",
//         },
//         boxShadow:
//           "#dddddd22 0px 1px 0px, #dddddd22 0px 8px 24px, #dddddd22 0px 16px 48px",
//       }}
//     >
//       <ReactEcharts option={option} style={{ height: "450px" }} />
//     </MainCard>
//   );
// };

// export default ThreeDLineChart;
