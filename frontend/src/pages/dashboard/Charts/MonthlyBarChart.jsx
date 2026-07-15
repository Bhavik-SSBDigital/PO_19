import { useEffect, useState } from "react";

// material-ui
import { useTheme } from "@mui/material/styles";

// third-party
import ReactApexChart from "react-apexcharts";
import ReactECharts from "echarts-for-react";

// chart options for apex chart
const barChartOptions = {
  chart: {
    type: "bar",
    height: 365,
    toolbar: {
      show: false,
    },
  },
  plotOptions: {
    bar: {
      columnWidth: "45%",
      borderRadius: 4,
    },
  },
  dataLabels: {
    enabled: false,
  },
  xaxis: {
    categories: ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"],
    axisBorder: {
      show: false,
    },
    axisTicks: {
      show: false,
    },
  },
  yaxis: {
    show: false,
  },
  grid: {
    show: false,
  },
};

// -------------pie chart echarts----------
// const option = {
//   backgroundColor: "#ffffff",
//   title: {
//     text: 'Documents',
//     textStyle: {
//       color: '#235894'
//     }
//   },
//   tooltip: {},
//   series: [
//     {
//       // name: 'pie',
//       type: 'pie',
//       selectedMode: 'single',
//       selectedOffset: 30,
//       clockwise: true,
//       label: {
//         fontSize: 18,
//         color: '#235894'
//       },
//       labelLine: {
//         lineStyle: {
//           color: '#235894'
//         }
//       },
//       data: [
//         { value: 50, name: 'sunday' },
//         { value: 735, name: 'monday' },
//         { value: 580, name: 'tue' },
//         { value: 484, name: 'wed' },
//         { value: 300, name: 'thu' },
//         { value: 400, name: 'fri' },
//         { value: 660, name: 'sat' }
//       ],
//       itemStyle: {
//         opacity: 0.7,
//         color: {
//           // image: piePatternImg,
//           repeat: 'repeat'
//         },
//         borderWidth: 3,
//         borderColor: '#235894'
//       }
//     }
//   ]
// };
// ==============================|| MONTHLY BAR CHART ||============================== //

const MonthlyBarChart = () => {
  const theme = useTheme();

  //   --------------------echarts -----------------
  const { primary, secondary } = theme.palette.text;
  const info = theme.palette.info.light;
  const option = {
    legend: {},
    tooltip: {
      trigger: "axis",
      showContent: false,
    },
    dataset: {
      source: [
        ["product", "2012", "2013", "2014", "2015", "2016", "2017"],
        ["Documents", 56, 82, 88, 70, 53, 85],
      ],
    },
    xAxis: { type: "category" },
    yAxis: { gridIndex: 0 },
    grid: { top: "55%" },
    series: [
      {
        type: "line",
        smooth: true,
        seriesLayoutBy: "row",
        emphasis: { focus: "series" },
      },
      {
        type: "line",
        smooth: true,
        seriesLayoutBy: "row",
        emphasis: { focus: "series" },
      },
      {
        type: "line",
        smooth: true,
        seriesLayoutBy: "row",
        emphasis: { focus: "series" },
      },
      {
        type: "line",
        smooth: true,
        seriesLayoutBy: "row",
        emphasis: { focus: "series" },
      },
      {
        type: "pie",
        id: "pie",
        radius: "30%",
        center: ["50%", "25%"],
        emphasis: {
          focus: "self",
        },
        label: {
          formatter: "{b}: {@2012} ({d}%)",
        },
        encode: {
          itemName: "product",
          value: "2012",
          tooltip: "2012",
        },
      },
    ],
  };
  const [series] = useState([
  	{
  		data: [80, 95, 70, 42, 65, 55, 78]
  	}
  ]);

  // const [options, setOptions] = useState(barChartOptions);

  useEffect(() => {
    // setOptions((prevState) => ({
    //   ...prevState,
    //   colors: [info],
    //   xaxis: {
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
    //         ],
    //       },
    //     },
    //   },
    //   tooltip: {
    //     theme: "light",
    //   },
    // }));
  }, [primary, info, secondary]);

  return (
    <div id="chart">
      {/* <ReactApexChart
        options={options}
        series={series}
        type="bar"
        height={365}
      /> */}
      <ReactECharts
        option={option}
        style={{ height: "450px", width: "100%" }}
      />
    </div>
  );
};

export default MonthlyBarChart;
