import React from "react";
import ReactECharts from "echarts-for-react";
import MainCard from "components/MainCard";

const LifeExpectancyChart = () => {
  // Static data
  const data = [
    [1000, 534, 550000, "Countrya", "2020"],
    [1100, 634, 550000, "Countrya", "2020"],
    [1200, 734, 550000, "Countrya", "2020"],
    [1300, 834, 550000, "Countrya", "2020"],
    [1400, 934, 550000, "Countrya", "2020"],
    [1500, 1034, 550000, "Countrya", "2020"],
    [1600, 1134, 550000, "Countrya", "2020"],
    [1800, 1234, 550000, "Countrya", "2020"],
    [1900, 1334, 550000, "Countrya", "2020"],
    [2000, 1434, 550000, "Countrya", "2020"],
    [2100, 1534, 550000, "Countryb", "2020"],
    [2200, 1634, 550000, "Countryb", "2020"],
    [2300, 1734, 550000, "Countryb", "2020"],
    [1000, 534, 550000, "Countryb", "2020"],
    [1100, 634, 550000, "Countryb", "2020"],
    [1200, 734, 550000, "Countryb", "2020"],
    [1300, 834, 550000, "Countryb", "2020"],
    [1400, 934, 550000, "Countryb", "2020"],
    [1500, 1034, 550000, "Countryb", "2020"],
    [1600, 1134, 550000, "Countryb", "2020"],
    [1800, 1234, 550000, "Countryb", "2020"],
    [1900, 1334, 550000, "Countryb", "2020"],
    [2000, 1434, 550000, "Countryb", "2020"],
    [2100, 1534, 550000, "Countryb", "2020"],
    [2200, 1634, 550000, "Countryb", "2020"],
    [2300, 1734, 550000, "Countryb", "2020"],
    [2100, 1534, 550000, "CountryD", "2020"],
    [2200, 1634, 550000, "CountryD", "2020"],
    [2300, 1734, 550000, "CountryD", "2020"],
    [1000, 534, 550000, "CountryD", "2020"],
    [1100, 634, 550000, "CountryD", "2020"],
    [1200, 734, 550000, "CountryD", "2020"],
    [1300, 834, 550000, "CountryD", "2020"],
    [1400, 934, 550000, "CountryD", "2020"],
    [1500, 1034, 550000, "CountryD", "2020"],
    [1600, 1134, 550000, "CountryD", "2020"],
    [1800, 1234, 550000, "CountryD", "2020"],
    [1900, 1334, 550000, "CountryD", "2020"],
    [2000, 1434, 550000, "CountryD", "2020"],
    [2100, 1534, 550000, "CountryD", "2020"],
    [2200, 1634, 550000, "CountryD", "2020"],
    [2300, 1734, 550000, "CountryD", "2020"],
  ];

  const symbolSize = 2.5;

  // ECharts option
  const option = {
    grid3D: {},
    xAxis3D: {
      type: "category",
    },
    yAxis3D: {},
    zAxis3D: {},
    dataset: {
      dimensions: [
        "Income",
        "Life Expectancy",
        "Population",
        "Country",
        { name: "Year", type: "ordinal" },
      ],
      source: data,
    },
    series: [
      {
        type: "scatter3D",
        symbolSize: symbolSize,
        encode: {
          x: "Country",
          y: "Life Expectancy",
          z: "Income",
          tooltip: [0, 1, 2, 3, 4],
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
      <ReactECharts option={option} style={{ height: "365px" }} />
    </MainCard>
  );
};

export default LifeExpectancyChart;
