import { useMemo, useState, useEffect, useRef } from "react";
import {
  TextField,
  MenuItem,
  Box,
  Typography,
  Paper,
  InputAdornment,
  IconButton,
  Divider,
} from "@mui/material";

import * as yup from "yup";
import { yupResolver } from "@hookform/resolvers/yup";
import { useForm, Controller } from "react-hook-form";

import { SendRounded as SendRoundedIcon } from "@mui/icons-material";

import { post } from "utils/axiosApi";

// Status options

const workStatusOptions = [
  { label: "Closed", value: "closed" },
  { label: "Work Under Progress", value: "work_under_progress" },
  { label: "Resolved", value: "resolved" },
  { label: "Pending", value: "pending" },
];

// Validation schema
const schema = yup.object().shape({
  remarks: yup.string().required("Remarks are required"),
  ssbdWorkStatus: yup
    .string()
    .oneOf(["", "closed", "work_under_progress", "resolved", "pending"]),
});

const statusColors = {
  closed: "primary.main",
  work_under_progress: "warning.main",
  resolved: "success.main",
  pending: "error.main",
};

const SSBDRemarksChat = ({
  data = [],
  status,
  auditResultId,
  pointNo,
  onSuccess,
}) => {
  const role = useMemo(() => localStorage.getItem("role"), []);
  const [remarksList, setRemarksList] = useState([]);
  const [previousStatus, setPreviousStatus] = useState(status);
  const bottomRef = useRef(null);
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm({
    resolver: yupResolver(schema),
    defaultValues: {
      remarks: "",
      ssbdWorkStatus: "",
    },
  });

  useEffect(() => {
    setRemarksList(data || []);
  }, [data]);
  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [remarksList]);

  const onSubmit = async (values) => {
    const auditorName = localStorage.getItem("auditorFullName") || "";
    try {
      const payload = {
        ...values,
        pointNo,
        ...(auditorName && { auditorName }),
      };
      const endpoint =
        role === "fromSSBD" ? "addSSBDRemarks" : "addAuditorRemarks";
      await post(`${endpoint}/${auditResultId}`, payload, {
        headers: { "Content-Type": "application/json" },
      });

      const newEntry = {
        ...values,
        addedBy: role === "fromSSBD" ? "ssbd" : "auditor",
        auditorName,
        addedByUser: localStorage.getItem("username") || "unknown",
        addedOn: new Date().toISOString(),
        isStatusChanged: values?.ssbdWorkStatus !== previousStatus,
        previousStatus:
          values?.ssbdWorkStatus !== previousStatus ? previousStatus : null,
        newStatus: values?.ssbdWorkStatus,
      };

      setRemarksList((prev) => {
        const updated = [...prev, newEntry];
        onSuccess(updated, values?.ssbdWorkStatus);
        return updated;
      });
      reset({ remarks: "", ssbdWorkStatus: "" });
    } catch (error) {
      console.error(
        "Submission failed:",
        error.response?.data || error.message
      );
    }
  };

  return (
    <Box
      display="flex"
      flexDirection="column"
      gap={2}
      width="100%"
      sx={{ border: "2px solid #ccc", maxHeight: "80vh", borderRadius: 2 }}
    >
      <Box
        display="flex"
        flexDirection="column"
        gap={1}
        maxHeight={400}
        p={2}
        overflow="auto"
      >
        {remarksList?.map((item, index) => {
          const isLeft =
            role !== "isAuditor"
              ? item.addedBy === "auditor"
              : item.addedBy === "ssbd";

          return (
            <>
              {item.isStatusChanged && (
                <Divider>
                  {item?.previousStatus ? (
                    <>
                      Status Changed:{" "}
                      <Typography
                        sx={{
                          fontWeight: "bold",
                          display: "inline",
                          textTransform: "capitalize",
                          color: statusColors[item.previousStatus],
                        }}
                      >
                        {item.previousStatus}
                      </Typography>{" "}
                      to{" "}
                      <Typography
                        sx={{
                          fontWeight: "bold",
                          display: "inline",
                          textTransform: "capitalize",
                          color: statusColors[item.newStatus],
                        }}
                      >
                        {item.newStatus?.replaceAll("_", " ")}
                      </Typography>
                    </>
                  ) : (
                    <>
                      The status was set to{" "}
                      <Typography
                        sx={{
                          fontWeight: "bold",
                          display: "inline",
                          textTransform: "capitalize",
                          color: statusColors[item.newStatus],
                        }}
                      >
                        {item.newStatus?.replaceAll("_", " ")}
                      </Typography>
                    </>
                  )}
                </Divider>
              )}
              <Box
                key={index}
                display="flex"
                justifyContent={isLeft ? "flex-start" : "flex-end"}
                width="100%"
                px={1}
                mt={1}
              >
                <Box
                  display="flex"
                  flexDirection="column"
                  alignItems={isLeft ? "flex-start" : "flex-end"}
                  gap={0.5}
                >
                  {/* Sender Info */}
                  <Box
                    display="flex"
                    alignItems="center"
                    gap={1}
                    flexDirection={isLeft ? "row" : "row-reverse"}
                  >
                    <Box
                      sx={{
                        width: 24,
                        height: 24,
                        borderRadius: "50%",
                        bgcolor: isLeft ? "grey.400" : "grey.400",
                        color: isLeft ? "black" : "black",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 12,
                        fontWeight: 600,
                        border: "1px solid #999",
                        textTransform: "uppercase",
                      }}
                    >
                      {(item.auditorName || item.addedByUser)?.[0] || "U"}
                    </Box>
                    <Typography variant="caption" color="text.primary">
                      {item.auditorName
                        ? item.auditorName + " (" + item.addedByUser + ")"
                        : item.addedByUser}
                    </Typography>
                  </Box>

                  {/* Message Box */}
                  <Paper
                    elevation={0}
                    sx={{
                      bgcolor: isLeft ? "warning.light" : "primary.100",
                      color: "#000",
                      p: 1.5,
                      pb: 0.5,
                      maxWidth: "70%",
                      minWidth: 200,
                      borderRadius: 2,
                      ml: isLeft ? 3 : 0,
                      border: "2px solid #aaa",
                    }}
                  >
                    <Typography
                      // variant="body2"
                      sx={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}
                    >
                      {item.remarks}
                    </Typography>
                    <Typography
                      sx={{
                        fontSize: "0.7rem",
                        textAlign: "right",
                        textTransform: "capitalize",
                      }}
                    >
                      — {item.addedBy}
                    </Typography>
                  </Paper>

                  <Typography
                    variant="caption"
                    sx={{
                      color: "text.secondary",
                      fontSize: "0.7rem",
                      mt: 0.3,
                      ml: isLeft ? 3 : 0,
                      alignSelf: isLeft ? "flex-start" : "flex-end",
                    }}
                  >
                    {item.addedOn && new Date(item.addedOn).toLocaleString()}
                  </Typography>
                </Box>
              </Box>
            </>
          );
        })}
        {remarksList?.length === 0 && (
          <Typography variant="body2" color="text.secondary" mt={1}>
            No remarks found
          </Typography>
        )}
        <div ref={bottomRef} />
      </Box>

      {/* Input Form */}
      <Box
        component="form"
        onSubmit={handleSubmit(onSubmit)}
        m={2}
        mt={0}
        display="flex"
        flexDirection="column"
        gap={2}
      >
        {(role === "fromSSBD" || role === "isAuditor") &&
          status !== "closed" && (
            <>
              <Controller
                name="ssbdWorkStatus"
                control={control}
                render={({ field }) => (
                  <TextField
                    select
                    label="Status"
                    fullWidth
                    size="small"
                    {...field}
                    error={!!errors.ssbdWorkStatus}
                    helperText={errors.ssbdWorkStatus?.message}
                  >
                    {workStatusOptions.map((option) => (
                      <MenuItem key={option.value} value={option.value}>
                        {option.label}
                      </MenuItem>
                    ))}
                  </TextField>
                )}
              />
              <Controller
                name="remarks"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Remarks"
                    error={!!errors.remarks}
                    helperText={errors.remarks?.message}
                    multiline
                    minRows={2}
                    fullWidth
                    InputProps={{
                      endAdornment: (
                        <InputAdornment position="end">
                          <IconButton type="submit" disabled={isSubmitting}>
                            <SendRoundedIcon />
                          </IconButton>
                        </InputAdornment>
                      ),
                    }}
                  />
                )}
              />
            </>
          )}
      </Box>
    </Box>
  );
};

export default SSBDRemarksChat;
