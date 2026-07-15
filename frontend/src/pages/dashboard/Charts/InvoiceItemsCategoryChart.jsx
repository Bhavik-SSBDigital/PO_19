import React, { useMemo } from "react";
import Chart from "react-apexcharts";
import MainCard from "components/MainCard";
import { Typography, Box } from "@mui/material";

const InvoiceItemsCategoryChart = ({ categoryCounts = {}, type }) => {
  const { series, options, total } = useMemo(() => {
    const total = categoryCounts.total || 0;

    const statuses = ["Closed", "Assigned", "Unassigned"];

    const digital = [
      categoryCounts.closedDigital || 0,
      categoryCounts.assignedDigital || 0,
      categoryCounts.unassignedDigital || 0,
    ];

    const manual = [
      categoryCounts.closedManual || 0,
      categoryCounts.assignedManual || 0,
      categoryCounts.unassignedManual || 0,
    ];

    const advance =
      type === "BPV"
        ? [
            categoryCounts.closedAdvance || 0,
            categoryCounts.assignedAdvance || 0,
            categoryCounts.unassignedAdvance || 0,
          ]
        : [];

    const series = [
      { name: "Digital", data: digital },
      { name: "Manual", data: manual },
    ];

    if (type === "BPV") {
      series.push({ name: "Advance", data: advance });
    }

    const options = {
      chart: {
        type: "bar",
        stacked: true,
        toolbar: { show: false },
      },
      plotOptions: {
        bar: {
          columnWidth: "55%",
          borderRadius: 6,
        },
      },
      colors: ["#1976d2", "#fb8c00", "#7b1fa2"],
      dataLabels: { enabled: false },
      xaxis: {
        categories: statuses,
        title: { text: "Invoice Status" },
      },
      yaxis: {
        title: { text: "Number of Invoice Items" },
      },
      legend: {
        position: "top",
        horizontalAlign: "left",
      },
      title: {
        text: `Invoice Items Overview (Total: ${total})`,
        align: "left",
      },
      subtitle: {
        text: "Each bar shows status total. Segments show Digital / Manual / Advance within that status.",
        align: "left",
      },
      tooltip: {
        shared: false,
        intersect: true,
        custom: function ({ series, seriesIndex, dataPointIndex, w }) {
          const status = w.globals.labels[dataPointIndex];

          const totalForStatus = w.globals.series.reduce(
            (sum, s) => sum + (s[dataPointIndex] || 0),
            0,
          );

          let rows = w.globals.seriesNames
            .map((name, idx) => {
              const val = w.globals.series[idx][dataPointIndex] || 0;
              return `
        <div style="display:flex;justify-content:space-between;">
          <span>${name}</span>
          <b>${val}</b>
        </div>
      `;
            })
            .join("");

          return `
      <div style="padding:10px;min-width:180px;">
        <div style="font-weight:600;margin-bottom:6px;">
          ${status}
        </div>

        ${rows}

        <div style="border-top:1px solid #ddd;margin-top:6px;padding-top:6px;
                    display:flex;justify-content:space-between;">
          <span><b>Total ${status}</b></span>
          <b>${totalForStatus}</b>
        </div>
      </div>
    `;
        },
      },
    };

    return { series, options, total };
  }, [categoryCounts, type]);

  return (
    <MainCard
      sx={{
        borderRadius: "16px",
        border: "1px solid #e0e0e0",
        mt: 2,
      }}
    >
      <Box sx={{ p: 2 }}>
        <Typography variant="h6" mb={1}>
          Current Type: {type}
        </Typography>

        <Chart options={options} series={series} type="bar" height={380} />
      </Box>
    </MainCard>
  );
};

export default InvoiceItemsCategoryChart;
