import MainCard from "components/MainCard";
import { useMemo, useState } from "react";
import Chart from "react-apexcharts";
import {
  Box,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Modal,
  Typography,
} from "@mui/material";
import RiskDataTable from "../table/RiskDataTable";
import moment from "moment";
import CloseIcon from "@mui/icons-material/Close";

const AreaLineChart = ({ isWeekly, auditData, data: chartData }) => {
  const [riskData, setRiskData] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [tableTitle, setTableTitle] = useState("");

  const series = useMemo(() => {
    const data = auditData?.auditResultAnalyticsData;

    const lowRisk = [];
    const mediumRisk = [];
    const highRisk = [];
    const ndo = [];

    data?.lowRiskPointResults?.forEach((_, index) => {
      const lowValue = data.lowRiskPointResults[index].data.length;
      const medValue = data.mediumRiskPointResults[index].data.length;
      const highValue = data.highRiskPointResults[index].data.length;
      const ndoValue = data.notDeviatedResults[index].data.length;

      const total = lowValue + medValue + highValue + ndoValue;

      const lowPercentage = total ? (lowValue / total) * 100 : 0;
      const medPercentage = total ? (medValue / total) * 100 : 0;
      const highPercentage = total ? (highValue / total) * 100 : 0;
      const ndoPercentage = total ? (ndoValue / total) * 100 : 0;

      lowRisk.push(Math.round(lowPercentage * 100) / 100);
      mediumRisk.push(Math.round(medPercentage * 100) / 100);
      highRisk.push(Math.round(highPercentage * 100) / 100);
      ndo.push(Math.round(ndoPercentage * 100) / 100);
    });

    return [
      {
        name: "Low Risk",
        data: lowRisk,
      },
      {
        name: "NDO",
        data: ndo,
      },

      {
        name: "Medium Risk",
        data: mediumRisk,
      },
      {
        name: "High Risk",
        data: highRisk,
      },
    ];

    // return [
    //   {
    //     name: "Low Risk",
    //     data:
    //       auditData?.auditResultAnalyticsData?.lowRiskPointResults?.map(
    //         (a, index) => {
    //           a.data.length;
    //         }
    //       ) || [],
    //   },
    //   {
    //     name: "NDO",
    //     data:
    //       auditData?.auditResultAnalyticsData?.notDeviatedResults?.map(
    //         (a) => a.data.length
    //       ) || [],
    //   },

    //   {
    //     name: "Medium Risk",
    //     data:
    //       auditData?.auditResultAnalyticsData?.mediumRiskPointResults?.map(
    //         (a) => a.data.length
    //       ) || [],
    //   },
    //   {
    //     name: "High Risk",
    //     data:
    //       auditData?.auditResultAnalyticsData?.highRiskPointResults?.map(
    //         (a) => a.data.length
    //       ) || [],
    //   },
    // ];
  }, [auditData]);

  const categories =
    auditData?.auditResultAnalyticsData?.notDeviatedResults
      // ?.filter((a) => a.data.length)
      ?.map((a) => a.time) || [];

  const options = {
    title: {
      left: "center",
      text: "Risk Results Over Time",
    },
    series: series,
    chart: {
      height: 350,
      type: "area",
      events: {
        markerClick: (event, chartContext, { seriesIndex, dataPointIndex }) => {
          const month = categories[dataPointIndex];
          let tempRiskData;
          let title;
          switch (seriesIndex) {
            case 0:
              tempRiskData =
                auditData?.auditResultAnalyticsData?.lowRiskPointResults.find(
                  (a) => a.time == month
                ).data;
              title = `Low Risk ${month}`;
              break;
            case 1:
              tempRiskData =
                auditData?.auditResultAnalyticsData?.notDeviatedResults.find(
                  (a) => a.time == month
                ).data;
              title = `NDO ${month}`;
              break;
            case 2:
              tempRiskData =
                auditData?.auditResultAnalyticsData?.mediumRiskPointResults.find(
                  (a) => a.time == month
                ).data;
              title = `Medium Risk ${month}`;
              break;
            case 3:
              tempRiskData =
                auditData?.auditResultAnalyticsData?.highRiskPointResults.find(
                  (a) => a.time == month
                ).data;
              title = `High Risk ${month}`;
              break;
          }
          setTimeout(() => {
            setRiskData(tempRiskData);
            setTableTitle(title);
            setIsModalOpen(true);
          }, 10);
        },
      },
    },
    dataLabels: {
      enabled: false,
    },
    stroke: {
      curve: "smooth",
    },
    yaxis: {
      labels: {
        formatter: function (value) {
          return `${parseInt(value)}%`;
        },
      },
    },
    xaxis: {
      
      labels: {
        formatter: function (value) {
          return isWeekly ? moment(value).format("DD-MM-YYYY") : value;
        },
      },
      categories: categories,
    },
    tooltip: {
      y: {
      // format: "dd/MM/yy HH:mm",
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
        type="area"
        height={350}
      />
      <Dialog
        open={isModalOpen}
        maxWidth="xl"
        onClose={() => {
          setIsModalOpen(false);
        }}
        aria-labelledby="Risk Data Modal"
      >
        <DialogTitle>
          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
            }}
          >
            <Box />
            <Typography
              variant="h4"
              sx={{ borderBottom: "2px solid", height: "30px" }}
            >
              {tableTitle} Data
            </Typography>
            <IconButton
              onClick={() => {
                setIsModalOpen(false);
              }}
            >
              <CloseIcon />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent>
          <RiskDataTable currentDataTitle={tableTitle} riskData={riskData} />
        </DialogContent>
      </Dialog>
    </MainCard>
  );
};

export default AreaLineChart;
