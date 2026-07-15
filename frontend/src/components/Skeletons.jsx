import {
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from "@mui/material";

export const TableSkeleton = () => {
  return (
    <TableContainer
      sx={{ border: "1px solid lightgray", borderRadius: "12px" }}
    >
      <Table size="small">
        <TableHead>
          <TableRow sx={{ backgroundColor: "lightgray" }}>
            <TableCell>
              <Skeleton sx={{ width: "50%" }} />
            </TableCell>
            <TableCell>
              <Skeleton sx={{ width: "50%" }} />
            </TableCell>
            <TableCell>
              <Skeleton sx={{ width: "50%" }} />
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          <TableRow>
            <TableCell>
              <Skeleton sx={{ width: "50%" }} />
            </TableCell>
            <TableCell>
              <Skeleton sx={{ width: "50%" }} />
            </TableCell>
            <TableCell>
              <Skeleton sx={{ width: "50%" }} />
            </TableCell>
          </TableRow>
          <TableRow>
            <TableCell>
              <Skeleton sx={{ width: "50%" }} />
            </TableCell>
            <TableCell>
              <Skeleton sx={{ width: "50%" }} />
            </TableCell>
            <TableCell>
              <Skeleton sx={{ width: "50%" }} />
            </TableCell>
          </TableRow>
          <TableRow>
            <TableCell>
              <Skeleton sx={{ width: "50%" }} />
            </TableCell>
            <TableCell>
              <Skeleton sx={{ width: "50%" }} />
            </TableCell>
            <TableCell>
              <Skeleton sx={{ width: "50%" }} />
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </TableContainer>
  );
};
