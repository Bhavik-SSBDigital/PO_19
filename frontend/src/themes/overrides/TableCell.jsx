// ==============================|| OVERRIDES - TABLE CELL ||============================== //

export default function TableCell(theme) {
  return {
    MuiTableCell: {
      styleOverrides: {
        root: {
          fontSize: "0.875rem",
          padding: 12,
          borderColor: theme.palette.divider,
        },
        head: {
          fontWeight: 700,
          paddingTop: 16,
          paddingBottom: 16,
        },
        body: ({ ownerState }) => ({
          ...(ownerState.size === "small" && {
            paddingTop: 8,
            paddingBottom: 8,
          }),
        }),
      },
    },
  };
}
