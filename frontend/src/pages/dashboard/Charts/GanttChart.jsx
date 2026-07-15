import MainCard from "components/MainCard";
import React from "react";
import Chart from "react-google-charts";

const GanttChart = () => {
  const options = {
    gantt: {
      trackHeight: 50,
    },
  };
  const data = [
    [
      "Task ID",
      "Task Name",
      "Resource",
      "Start Date",
      "End Date",
      "Duration",
      "Percent Complete",
      "Dependencies",
    ],
    [
      "Task1",
      "Design",
      "Team A",
      new Date(2022, 2, 1),
      new Date(2022, 3, 10),
      10,
      80,
      null,
    ],
    [
      "Task2",
      "Development",
      "Team B",
      new Date(2022, 5, 5),
      new Date(2022, 3, 20),
      15,
      60,
      null,
    ],
    [
      "Task3",
      "Testing",
      "Team C",
      new Date(2022, 1, 15),
      new Date(2022, 10, 25),
      10,
      90,
      null,
    ],
    [
      "Task4",
      "Deployment",
      "Team A",
      new Date(2022, 12, 22),
      new Date(2022, 11, 5),
      15,
      75,
      null,
    ],
    [
      "Task5",
      "Documentation",
      "Team B",
      new Date(2022, 5, 1),
      new Date(2022, 7, 10),
      10,
      50,
      null,
    ],
  ];

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
      <Chart chartType="Gantt" data={data} options={options} height="365px" />
    </MainCard>
  );
};

export default GanttChart;
