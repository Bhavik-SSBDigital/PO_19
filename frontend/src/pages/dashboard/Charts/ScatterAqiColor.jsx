import React from "react";
import ReactEcharts from "echarts-for-react";
import MainCard from "components/MainCard";

const ScatterAqiColor = () => {
  // Placeholder data for scatter plot series
  const dataBJ = [
    [1, 55, 9, 56, 1, 20, 6, "abc1"],
    [2, 225,100, 201, 0.65, 34, 9, "abc2"],
    [3, 56, 7, 63, 0.3, 14, 5, "abc"],
    [4, 33, 7, 29, 0.33, 16, 6, "abc4"],
    [5, 42, 24, 44, 0.76, 40, 16, "abc5"],
    [6, 82, 58, 90, 1.77, 68, 33, "abc6"],
    [7, 74, 49, 77, 1.46, 48, 27, "abc7"],
    [8, 78, 55, 80, 1.29, 59, 29, "abc8"],
    [9, 267, 216, 280, 4.8, 108, 64, "abc9"],
    [10, 185, 127, 216, 2.52, 61, 27, "abc10"],
    [11, 39, 19, 38, 0.57, 31, 15, "abc111"],
    [12, 41, 11, 40, 0.43, 21, 7, "abc12"],
    [13, 64, 38, 74, 1.04, 46, 22, "abc13"],
    [14, 108, 79, 120, 1.7, 75, 41, "abc14"],
    [15, 108, 63, 116, 1.48, 44, 26, "abc15"],
    [16, 33, 6, 29, 0.34, 13, 5, "abc16"],
    [17, 94, 66, 110, 1.54, 62, 31, "abc17"],
    [18, 186, 142, 192, 3.88, 93, 79, "abc18"],
    [19, 57, 31, 54, 0.96, 32, 14, "abc19"],
    [20, 22, 8, 17, 0.48, 23, 10, "abc20"],
    [21, 39, 15, 36, 0.61, 29, 13, "abc21"],
    [22, 94, 69, 114, 2.08, 73, 39, "abc22"],
    [23, 99, 73, 110, 2.43, 76, 48, "abc23"],
    [24, 31, 12, 30, 0.5, 32, 16, "abc24"],
    [25, 42, 27, 43, 1, 53, 22, "abc25"],
    [26, 154, 117, 157, 3.05, 92, 58, "abc26"],
    [27, 234, 185, 230, 4.09, 123, 69, "abc27"],
    [28, 160, 120, 186, 2.77, 91, 50, "abc28"],
    [29, 134, 96, 165, 2.76, 83, 41, "abc29"],
    [30, 52, 24, 60, 1.03, 50, 21, "abc30"],
    [31, 46, 5, 49, 0.28, 10, 6, "abc31"],
  ];
  const dataGZ = [
    [1, 26, 37, 27, 1.163, 27, 13, "abc1"],
    [2, 85, 62, 71, 1.195, 60, 8, "abc2"],
    [3, 78, 38, 74, 1.363, 37, 7, "abc3"],
    [4, 21, 21, 36, 0.634, 40, 9, "abc4"],
    [5, 41, 42, 46, 0.915, 81, 13, "abc5"],
    [6, 56, 52, 69, 1.067, 92, 16, "abc6"],
    [7, 64, 30, 28, 0.924, 51, 2, "abc7"],
    [8, 55, 48, 74, 1.236, 75, 26, "abc8"],
    [9, 76, 85, 113, 1.237, 114, 27, "abc9"],
    [10, 91, 81, 104, 1.041, 56, 40, "abc10"],
    [11, 84, 39, 60, 0.964, 25, 11, "abc11"],
    [12, 64, 51, 101, 0.862, 58, 23, "abc12"],
    [13, 70, 69, 120, 1.198, 65, 36, "abc13"],
    [14, 77, 105, 178, 2.549, 64, 16, "abc14"],
    [15, 109, 68, 87, 0.996, 74, 29, "abc15"],
    [16, 73, 68, 97, 0.905, 51, 34, "abc16"],
    [17, 54, 27, 47, 0.592, 53, 12, "abc17"],
    [18, 51, 61, 97, 0.811, 65, 19, "abc18"],
    [19, 91, 71, 121, 1.374, 43, 18, "abc19"],
    [20, 73, 102, 182, 2.787, 44, 19, "abc20"],
    [21, 73, 50, 76, 0.717, 31, 20, "abc21"],
    [22, 84, 94, 140, 2.238, 68, 18, "abc22"],
    [23, 93, 77, 104, 1.165, 53, 7, "abc23"],
    [24, 99, 130, 227, 3.97, 55, 15, "abc24"],
    [25, 146, 84, 139, 1.094, 40, 17, "abc25"],
    [26, 113, 108, 137, 1.481, 48, 15, "abc26"],
    [27, 81, 48, 62, 1.619, 26, 3, "abc27"],
    [28, 56, 48, 68, 1.336, 37, 9, "abc28"],
    [29, 82, 92, 174, 3.29, 0, 13, "abc29"],
    [30, 106, 116, 188, 3.628, 101, 16, "abc30"],
    [31, 118, 50, 0, 1.383, 76, 11, "abc31"],
  ];
  const dataSH = [
    [1, 91, 45, 125, 0.82, 34, 23, "abc1"],
    [2, 65, 27, 78, 0.86, 45, 29, "abc2"],
    [3, 83, 60, 84, 1.09, 73, 27, "abc3"],
    [4, 109, 81, 121, 1.28, 68, 51, "abc4"],
    [5, 106, 77, 114, 1.07, 55, 51, "abc5"],
    [6, 109, 81, 121, 1.28, 68, 51, "abc6"],
    [7, 106, 77, 114, 1.07, 55, 51, "abc7"],
    [8, 89, 65, 78, 0.86, 51, 26, "abc8"],
    [9, 53, 33, 47, 0.64, 50, 17, "abc9"],
    [10, 80, 55, 80, 1.01, 75, 24, "abc10"],
    [11, 117, 81, 124, 1.03, 45, 24, "abc11"],
    [12, 99, 71, 142, 1.1, 62, 42, "abc12"],
    [13, 95, 69, 130, 1.28, 74, 50, "abc13"],
    [14, 116, 87, 131, 1.47, 84, 40, "abc14"],
    [15, 108, 80, 121, 1.3, 85, 37, "abc15"],
    [16, 134, 83, 167, 1.16, 57, 43, "abc16"],
    [17, 79, 43, 107, 1.05, 59, 37, "abc17"],
    [18, 71, 46, 89, 0.86, 64, 25, "abc18"],
    [19, 97, 71, 113, 1.17, 88, 31, "abc19"],
    [20, 84, 57, 91, 0.85, 55, 31, "abc20"],
    [21, 87, 63, 101, 0.9, 56, 41, "abc21"],
    [22, 104, 77, 119, 1.09, 73, 48, "abc22"],
    [23, 87, 62, 100, 1, 72, 28, "abc23"],
    [24, 168, 128, 172, 1.49, 97, 56, "abc24"],
    [25, 65, 45, 51, 0.74, 39, 17, "abc25"],
    [26, 39, 24, 38, 0.61, 47, 17, "abc26"],
    [27, 39, 24, 39, 0.59, 50, 19, "abc27"],
    [28, 93, 68, 96, 1.05, 79, 29, "abc28"],
    [29, 188, 143, 197, 1.66, 99, 51, "abc29"],
    [30, 174, 131, 174, 1.55, 108, 50, "abc30"],
    [31, 187, 143, 201, 1.39, 89, 53, "abc31"],
  ];

  const itemStyle = {
    opacity: 0.8, // Adjust opacity (0-1)
    shadowBlur: 10, // Adjust shadow blur radius
    shadowOffsetX: 0, // Adjust shadow offset along X-axis
    shadowOffsetY: 0, // Adjust shadow offset along Y-axis
    shadowColor: "rgba(0,0,0,0.3)", // Adjust shadow color (RGBA format)
  };

  const option = {
    color: ["#dd4444", "#fec42c", "#80F1BE"],
    legend: {
      top: 10,
      data: ["Beijing", "Shanghai", "Guangzhou"],
      textStyle: {
        fontSize: 16,
      },
    },
    grid: {
      left: "10%",
      right: 150,
      top: "18%",
      bottom: "10%",
    },
    tooltip: {
      backgroundColor: "rgba(255,255,255,0.7)",
      formatter: function (param) {
        var value = param.value;
        return (
          '<div style="border-bottom: 1px solid rgba(255,255,255,.3); font-size: 18px;padding-bottom: 7px;margin-bottom: 7px">' +
          param.seriesName +
          " Day " +
          value[0] +
          ":" +
          value[7] +
          "</div>" +
          "AQI index: " +
          value[1] +
          "<br>" +
          "PM2.5: " +
          value[2] +
          "<br>" +
          "PM10: " +
          value[3] +
          "<br>" +
          "CO: " +
          value[4] +
          "<br>" +
          "NO2: " +
          value[5] +
          "<br>" +
          "SO2: " +
          value[6] +
          "<br>"
        );
      },
    },
    xAxis: {
      type: "value",
      name: "Date",
      nameGap: 16,
      nameTextStyle: {
        fontSize: 16,
      },
      max: 31,
      splitLine: {
        show: false,
      },
    },
    yAxis: {
      type: "value",
      name: "AQI index",
      nameLocation: "end",
      nameGap: 20,
      nameTextStyle: {
        fontSize: 16,
      },
      splitLine: {
        show: false,
      },
    },
    visualMap: [
      {
        left: "right",
        top: "10%",
        dimension: 2,
        min: 0,
        max: 250,
        itemWidth: 30,
        itemHeight: 120,
        calculable: true,
        precision: 0.1,
        text: ["Circle size: PM2.5"],
        textGap: 30,
        inRange: {
          symbolSize: [10, 70],
        },
        outOfRange: {
          symbolSize: [10, 70],
          color: ["rgba(255,255,255,0.4)"],
        },
        controller: {
          inRange: {
            color: ["#c23531"],
          },
          outOfRange: {
            color: ["#999"],
          },
        },
      },
      {
        left: "right",
        bottom: "5%",
        dimension: 6,
        min: 0,
        max: 50,
        itemHeight: 120,
        text: ["Brightness: SO2"],
        textGap: 30,
        inRange: {
          colorLightness: [0.9, 0.5],
        },
        outOfRange: {
          color: ["rgba(255,255,255,0.4)"],
        },
        controller: {
          inRange: {
            color: ["#c23531"],
          },
          outOfRange: {
            color: ["#999"],
          },
        },
      },
    ],
    series: [
      {
        name: "Beijing",
        type: "scatter",
        itemStyle: itemStyle,
        data: dataBJ,
      },
      {
        name: "Shanghai",
        type: "scatter",
        itemStyle: itemStyle,
        data: dataSH,
      },
      {
        name: "Guangzhou",
        type: "scatter",
        itemStyle: itemStyle,
        data: dataGZ,
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
      <ReactEcharts
        option={option}
        style={{ height: "365px" }}
      />
    </MainCard>
  );
};

export default ScatterAqiColor;
