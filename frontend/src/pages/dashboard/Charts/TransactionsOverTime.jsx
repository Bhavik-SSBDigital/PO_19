const TransactionsOverTime = ({data }) => {
  const options = {
    chart: {
      type: "bar",
    },
    title: {
      text: "Historic World Population by Region",
      align: "left",
    },
    tooltip: {
      y: {
        formatter: (val) => `${val} millions`,
      },
    },
    plotOptions: {
      bar: {
        borderRadius: 10,
        dataLabels: {
          enabled: true,
        },
        horizontal: false,
      },
    },
    legend: {
      position: "top",
      horizontalAlign: "right",
      floating: true,
      offsetY: -10,
    },
  };

  const series = [
    {
      name: "Year 1990",
      data: [631, 727, 3202, 721],
    },

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
      <Chart options={options} series={series} type="bar" height={350} />
    </MainCard>
  );
};

export default TransactionsOverTime;
