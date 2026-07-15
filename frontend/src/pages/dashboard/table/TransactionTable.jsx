import { useRef, useState } from "react";
import {
  Box,
  Divider,
  FormControl,
  InputLabel,
  MenuItem,
  Pagination,
  Paper,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { useMemo } from "react";
import SearchResultLink from "../../../components/SearchResultLink";

const documentSearch = (documentNo, year) => {
  const url = `/search-data?documentNo=${documentNo}&year=${year}`;
  window.open(url, "_blank");
};

const TransactionTable = ({ riskData, defaultData }) => {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);

  const tableBodyRef = useRef(null);

  if (riskData == undefined || riskData == null) return null;

  const totalPages = Math.floor(riskData.length / pageSize);

  const startIndex = (page - 1) * pageSize;

  const endIndex = Math.min(startIndex + pageSize, riskData.length);

  const paginatedResults = useMemo(
    () => riskData.slice(startIndex, endIndex),
    [riskData, startIndex, endIndex]
  );

  const handleChange = (event, value) => {
    setPage(value);
    if (tableBodyRef.current) {
      tableBodyRef.current.scroll({
        top: 0,
        left: 0,
        behavior: "smooth",
      });
    }
  };

  return (
    <>
      <Box
        display="flex"
        justifyContent="center"
        alignItems="center"
        gap={1}
        sx={{ flexDirection: "column" }}
      >
        <TableContainer
          id="barDataTable"
          component={Paper}
          ref={tableBodyRef}
          sx={{ mt: "5px", maxHeight: "70vh" }}
        >
          <Table size="small" stickyHeader>
            <TableHead sx={{ backgroundColor: "#f9f9f9" }}>
              <TableRow>
                <TableCell>Sr No</TableCell>
                <TableCell>Document No/Ref No</TableCell>
                <TableCell>Supplier Name</TableCell>
                <TableCell>Point Description</TableCell>
                <TableCell>Deviation Description</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {paginatedResults?.length ? (
                paginatedResults.map((result, index) => {
                  return (
                    <TableRow>
                      <TableCell>{startIndex + 1 + index}</TableCell>
                      <TableCell>
                        {result.documentNumber ? (
                          <SearchResultLink
                            number={result.documentNumber}
                            year={result.fiscalYear}
                            poMaterialNo={result.po_number}
                            target="_blank"
                          >
                            {result.documentNumber}
                          </SearchResultLink>
                        ) : (
                          "-"
                        )}
                        {/* {result.documentNumber ? (
                          <p
                            style={{ color: "blue", cursor: "pointer" }}
                            onClick={() =>
                              documentSearch(
                                result.documentNumber,
                                result.fiscalYear
                              )
                            }
                          >
                            {result.documentNumber}
                          </p>
                        ) : (
                          "-"
                        )} */}
                      </TableCell>
                      <TableCell>
                        {result.supplierName ? result.supplierName : "-"}
                      </TableCell>
                      <TableCell>
                        {result.pointDescription
                          ? result.pointDescription
                          : "-"}
                      </TableCell>
                      <TableCell>
                        <ul>
                          {result.deviationDescription.length
                            ? result.deviationDescription?.map(
                                (list, index) => <li key={index}>{list}</li>
                              )
                            : "-"}
                        </ul>
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={3} sx={{ width: "100%" }} align="center">
                    No Data
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
        {totalPages > 1 ? (
          <Box
            sx={{ width: "100%" }}
            display="flex"
            gap={8}
            justifyContent="center"
            alignItems="center"
          >
            {/* <FormControl
              sx={{
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                flexDirection: "row",
                gap: 1,
              }}
              size="small"
            >
              <Typography sx={{ fontSize: "14px" }}>Items Per Page</Typography>
              <Select
                value={pageSize}
                onChange={(e) => setPageSize(e.target.value)}
              >
                <MenuItem value={10}>10</MenuItem>
                <MenuItem value={50}>50</MenuItem>
                <MenuItem value={100}>100</MenuItem>
                <MenuItem value={200}>200</MenuItem>
                <MenuItem value={500}>500</MenuItem>
                <MenuItem value={1000}>1000</MenuItem>
              </Select>
            </FormControl> */}

            <Pagination
              count={totalPages}
              page={page}
              onChange={handleChange}
              shape="rounded"
              showFirstButton
              showLastButton
            />
          </Box>
        ) : null}
      </Box>
    </>
  );
};

export default RiskDataTable;
