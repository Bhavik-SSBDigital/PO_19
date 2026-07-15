import { useEffect, useState } from "react";
import {
  Button,
  Checkbox,
  CircularProgress,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from "@mui/material";

import { useSelector } from "react-redux";

// toast messages
import { toast } from "react-toastify";

import { get, post } from "utils/axiosApi";
import { TableSkeleton } from "../../../components/Skeletons";

const RiskCategorizationForm = () => {
  const isExecutor = localStorage.getItem("role") === "isExecutor";
  const { dataViewType } = useSelector((state) => state.menu);
  const [data, setData] = useState([]);
  const [initialDataCopy, setInitialDataCopy] = useState([]);
  const [saveLoading, setSaveLoading] = useState(false);

  //   handlers
  const handleCheckboxChange = (id, type) => {
    if (isExecutor) return;
    setData((prevData) =>
      prevData.map((item) => {
        if (item._id === id) {
          return {
            ...item,
            high: type === "high" ? (item.high ? false : true) : false,
            medium: type === "medium" ? (item.medium ? false : true) : false,
            low: type === "low" ? (item.low ? false : true) : false,
          };
        }
        return item;
      })
    );
  };
  const handleResetForm = async () => {
  if (isExecutor) return;

  const resetData = data.map((item) => ({
    ...item,
    high: false,
    medium: false,
    low: false,
  }));

  setSaveLoading(true);
  try {
    await post(`/editPoints`, {
      type: dataViewType,
      points: resetData,
    });

    await get(`/clearCache`);

    setData(resetData);
    setInitialDataCopy(resetData);

    toast.success("All points reset successfully");
  } catch (error) {
    toast.error(error?.response?.data?.message || error?.message);
  } finally {
    setSaveLoading(false);
  }
};
  const handleSaveChanges = async () => {
    let isDataModified = false;
    data.forEach((originalObj, index) => {
      const modifiedObj = initialDataCopy[index];
      // Compare the properties
      if (originalObj.high !== modifiedObj.high) {
        isDataModified = true;
      }

      if (originalObj.medium !== modifiedObj.medium) {
        isDataModified = true;
      }

      if (originalObj.low !== modifiedObj.low) {
        isDataModified = true;
      }
    });
    if (isDataModified) {
      setSaveLoading(true);
      try {
        await post(`/editPoints`, {
          type: dataViewType,
          points: data,
        });
        await get(`/clearCache`);
        toast.success("Saved changes");
        setInitialDataCopy(data);
      } catch (error) {
        toast.error(error?.response?.data?.message || error?.message);
      }
      setSaveLoading(false);
    } else {
      toast.info("No changes to save.");
    }
  };
  //   network calls
  const get_points = async () => {
    setSaveLoading(true);
    try {
      const res = await post(`/getPoints`, { type: dataViewType });
      setData(res.points);
      setInitialDataCopy(res.points);
    } catch (error) {
      console.error(error?.response?.data?.message || error?.message);
    } finally {
      setSaveLoading(false);
    }
  };
  useEffect(() => {
    get_points();
  }, [dataViewType]);
  if (saveLoading) {
    return <TableSkeleton />;
  }
  return (
    <>
      <Paper
        sx={{
          border: "1px solid #e6e6e6",
          borderRadius: "10px",
          paddingRight: "3px",
        }}
        elevation={0}
      >
        <TableContainer
          sx={{
            maxHeight: "500px",
            width: "100%",
            overflow: "auto",
            borderRadius: "10px",
          }}
        >
          <Table
            sx={{ minWidth: 650 }}
            size="small"
            stickyHeader
            aria-label="risk categorization table"
          >
            <TableHead>
              <TableRow>
                <TableCell width="80px" align="center">
                  Point No
                </TableCell>
                <TableCell>Description</TableCell>
                <TableCell width="70px" align="center">
                  High
                </TableCell>
                <TableCell width="70px" align="center">
                  Medium
                </TableCell>
                <TableCell width="70px" align="center">
                  Low
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.length ? (
                data
                  ?.sort((a, b) => +a.pointNo - +b.pointNo)
                  .map((row) => {
                    return (
                      <TableRow key={row.pointNo}>
                        <TableCell align="center">{row.pointNo}</TableCell>
                        <TableCell>{row.description}</TableCell>
                        <TableCell align="center">
                          <Checkbox
                            sx={{ padding: "5px" }}
                            checked={row.high}
                            onChange={() =>
                              handleCheckboxChange(row._id, "high")
                            }
                          />
                        </TableCell>
                        <TableCell align="center">
                          <Checkbox
                            sx={{ padding: "5px" }}
                            checked={row.medium}
                            onChange={() =>
                              handleCheckboxChange(row._id, "medium")
                            }
                          />
                        </TableCell>
                        <TableCell align="center">
                          <Checkbox
                            sx={{ padding: "5px" }}
                            checked={row.low}
                            onChange={() =>
                              handleCheckboxChange(row._id, "low")
                            }
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })
              ) : (
                <TableRow>
                  <TableCell align="center" colSpan={5}>
                    No Data
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
      {!isExecutor && data.length ? (
        <Stack
          gap={2}
          flexDirection="row"
          justifyContent="end"
          sx={{ mt: "10px" }}
        >
          <Button
            sx={{ width: "140px" }}
            variant="outlined"
            color="error"
            disabled={saveLoading}
            onClick={handleResetForm}
          >
            Reset
          </Button>
          <Button
            sx={{ width: "140px" }}
            variant="contained"
            disabled={saveLoading}
            color="primary"
            onClick={handleSaveChanges}
          >
            {saveLoading ? <CircularProgress size={20} /> : "Submit"}
          </Button>
        </Stack>
      ) : null}
    </>
  );
};
export default RiskCategorizationForm;
