import { useRef } from "react";
import {
  Box,
  Pagination,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from "@mui/material";
import { useMemo } from "react";
import { useSelector } from "react-redux";
import { poMaterialNumberSearch } from "utils/navigation";
import SearchResultLink from "../../../components/SearchResultLink";

const documentSearch = (documentNo, year) => {
  const url = `/search-data?documentNo=${documentNo}&year=${year}`;
  window.open(url, "_blank");
};

const PointIntensityTable = ({ tableData, getPageData }) => {
  const tableBodyRef = useRef(null);

  const { dataViewType } = useSelector((state) => state.menu);

  const { totalPages, page, startIndex } = useMemo(() => {
    const totalPages = Math.ceil(tableData.count / tableData.pageSize);
    const startIndex = (tableData.currentPage - 1) * tableData.pageSize;
    return {
      totalPages,
      startIndex,
      page: tableData.currentPage,
      pageSize: tableData.pageSize,
    };
  }, [tableData]);

  const handleChange = async (event, value) => {
    await getPageData(tableData.pointNo, value);

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
      <TableContainer
        id="barDataTable"
        component={Paper}
        ref={tableBodyRef}
        elevation={0}
        sx={{
          mt: "5px",
          maxHeight: "60vh",
          border: "1px solid #d5d5d5",
          borderRadius: "12px",
        }}
      >
        <Table stickyHeader size="small">
          <TableHead sx={{ backgroundColor: "#f9f9f9" }}>
            <TableRow>
              <TableCell>Sr No</TableCell>
              <TableCell>Document No/Ref No</TableCell>
              {dataViewType === "PO" && (
                <TableCell>PO Material Number </TableCell>
              )}
              <TableCell>Supplier Name</TableCell>
              <TableCell>Fiscal Year</TableCell>
              <TableCell>Deviation Description</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {tableData?.results?.length ? (
              tableData.results.map((result, index) => {
                return (
                  <TableRow key={index}>
                    <TableCell>{startIndex + 1 + index}</TableCell>
                    {["PJV", "BPV", "NONPO"].includes(dataViewType) ? (
                      <TableCell>
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
                      </TableCell>
                    ) : (
                      <TableCell>{result.documentNumber}</TableCell>
                    )}
                    {dataViewType === "PO" && (
                      <TableCell>
                        {/* {result.documentNumber ? (
                          <p
                            style={{ color: "blue", cursor: "pointer" }}
                            onClick={() =>
                              poMaterialNumberSearch(result.po_material_number)
                            }
                          >
                            {result.po_material_number}
                          </p>
                        ) : (
                          "-"
                        )} */}
                        {result.documentNumber ? (
                          <SearchResultLink
                            number={result.documentNumber}
                            year={result.fiscalYear}
                            poMaterialNo={result.po_number}
                            target="_blank"
                          >
                            {result.po_material_number}
                          </SearchResultLink>
                        ) : (
                          "-"
                        )}
                      </TableCell>
                    )}
                    <TableCell>
                      {result.nameOfVendor ? result.nameOfVendor : "-"}
                    </TableCell>
                    <TableCell>
                      {result.fiscalYear ? result.fiscalYear : "-"}
                    </TableCell>
                    <TableCell>
                      <ul>
                        {result.remarks?.length
                          ? result.remarks?.map((list, index) => (
                              <li key={index}>{list}</li>
                            ))
                          : "-"}
                      </ul>
                    </TableCell>
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell colSpan={4} sx={{ width: "100%" }} align="center">
                  No Data
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
      {totalPages > 1 ? (
        <Box sx={{ mt: 2 }} display="flex" justifyContent="center">
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
    </>
  );
};

export default PointIntensityTable;
