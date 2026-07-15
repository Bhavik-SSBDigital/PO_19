import React, { useEffect } from "react";
import {
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  Grid,
  Paper,
  Typography,
} from "@mui/material";

import { yupResolver } from "@hookform/resolvers/yup";
import { useForm, Controller } from "react-hook-form";

import { toast } from "react-toastify";
import { useSelector } from "react-redux";

import {
  defaultValues,
  defaultValuesPO,
  defaultValuesBPV,
  fieldTitle,
  fieldTitlePO,
  fieldTitleBPV,
  validationSchema,
  validationSchemaPO,
  validationSchemaBPV,
  defaultValuesNonPO,
  validationSchemaNonPO,
  fieldTitleNonPO,
} from "../data";
import { get, post } from "utils/axiosApi";
import Loader from "components/Loader";

const defaultVal = {
  PJV: defaultValues,
  NONPO: defaultValuesNonPO,
  PO: defaultValuesPO,
  BPV: defaultValuesBPV,
};

const validationSchemaMap = {
  PJV: validationSchema,
  NONPO: validationSchemaNonPO,
  PO: validationSchemaPO,
  BPV: validationSchemaBPV,
};

const fieldTitleMap = {
  PJV: fieldTitle,
  NONPO: fieldTitleNonPO,
  PO: fieldTitlePO,
  BPV: fieldTitleBPV,
};

const cardTitleMap = {
  PJV: "Check Invoice Item Table",
  PO: "Check PO Item Table",
  NONPO: "Check Non-PO Item Table",
  BPV: "Check BPV Item Table",
};

const VisibilitySettingsForm = () => {
  const { dataViewType } = useSelector((state) => state.menu);
  const isExecutor = localStorage.getItem("role") === "isExecutor";

  const [isLoading, setLoading] = React.useState(false);

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting },
  } = useForm({
    resolver: yupResolver(validationSchemaMap[dataViewType]),
    defaultValues: defaultVal[dataViewType],
  });

  // ✅ Fetch settings
  useEffect(() => {
    const fetchVisibilitySettings = async () => {
      setLoading(true);
      try {
        const response = await get(
          `/getVisibilitySettings?type=${dataViewType}`
        );

        if (response && typeof response?.settings === "object") {
          reset(response?.settings);
        }
      } catch (error) {
        console.error("Error fetching visibility settings:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchVisibilitySettings();
  }, [dataViewType]);

  // ✅ Submit handler
  const onSubmit = async (data) => {
    try {
      await post("/updateVisibilitySettings", {
        newSettings: data,
        type: dataViewType,
      });
      toast.success("Visibility settings updated successfully");
    } catch (error) {
      const errorMessage =
        error?.response?.data?.message ||
        error?.message ||
        "Error updating visibility settings";
      toast.error(errorMessage);
    }
  };

  if (isLoading) {
    return <Loader />;
  }

  return (
    <>
      <Paper
        sx={{
          padding: 2,
          border: "1px solid #e5e5e5",
          width: "100%",
          borderRadius: "10px",
        }}
        elevation={0}
        component="form"
        id="visibility-settings-form"
        onSubmit={handleSubmit(onSubmit)}
      >
        <Typography
          variant="h5"
          gutterBottom
          align="center"
          sx={{
            borderBottom: "1px solid #e5e5e5",
            pb: 1,
          }}
        >
          Visibility Settings for {cardTitleMap[dataViewType]}
        </Typography>
        <Grid container spacing={2}>
          {Object.keys(defaultVal[dataViewType]).map((key) => (
            <Grid item xs={12} lg={6} key={key}>
              <Controller
                name={key}
                control={control}
                render={({ field }) => (
                  <FormControlLabel
                    control={
                      <Checkbox
                        {...field}
                        checked={field.value ?? false}
                        onChange={(e) =>
                          !isExecutor && field.onChange(e.target.checked)
                        }
                      />
                    }
                    label={fieldTitleMap[dataViewType][key] || key}
                  />
                )}
              />
            </Grid>
          ))}
        </Grid>
      </Paper>
      {!isExecutor && (
        <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
          <Button
            form="visibility-settings-form"
            type="submit"
            variant="contained"
            disabled={isSubmitting}
            sx={{ mt: 2, width: "150px" }}
          >
            {isSubmitting ? "Saving..." : "Save"}
          </Button>
        </Box>
      )}
    </>
  );
};

export default VisibilitySettingsForm;
