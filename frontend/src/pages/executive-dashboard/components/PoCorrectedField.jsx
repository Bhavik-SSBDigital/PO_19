import {
  alpha,
  Box,
  FormControl,
  FormHelperText,
  FormLabel,
  MenuItem,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
} from "@mui/material";

const DEFAULT_ALLOWED_RESULTS = [
  "Verified",
  "Not Verified",
  "Not Applicable",
];

const PoCorrectedField = ({
  value,
  onChange,
  systemResult = "",
  buyerResult,
  onBuyerResultChange,
  disabled = false,
  allowedResults = DEFAULT_ALLOWED_RESULTS,
  showErrors = false,
}) => {
  const normalizedSystemResult = String(systemResult || "").trim();
  const resultOptions =
    normalizedSystemResult && normalizedSystemResult !== "Manual Review Required"
      ? allowedResults.filter((option) => option !== normalizedSystemResult)
      : allowedResults;

  const answerError = showErrors && !value;
  const buyerResultError = showErrors && value === "no" && !buyerResult;

  const handleAnswerChange = (_, nextValue) => {
    if (!nextValue || nextValue === value) return;
    onChange?.(nextValue);
    onBuyerResultChange?.("");
  };

  return (
    <Box>
      <FormControl fullWidth disabled={disabled} error={answerError}>
        <FormLabel sx={{ fontWeight: 700, fontSize: "0.85rem", mb: 0.75 }}>
          Is PO corrected?
        </FormLabel>
        <ToggleButtonGroup
          exclusive
          fullWidth
          size="small"
          value={value}
          onChange={handleAnswerChange}
          sx={{
            border: "1px solid",
            borderColor: value ? "primary.main" : "divider",
            borderRadius: 1,
            bgcolor: value ? alpha("#1976d2", 0.08) : "background.paper",
            p: 0.5,
            "& .MuiToggleButton-root": {
              textTransform: "none",
              fontWeight: 700,
              fontSize: "0.85rem",
              border: "1px solid",
              borderColor: "divider",
              color: "text.primary",
              bgcolor: "background.paper",
              "&:hover": {
                bgcolor: alpha("#1976d2", 0.08),
              },
            },
            "& .MuiToggleButton-root.Mui-selected": {
              bgcolor: "#1565c0",
              color: "common.white",
              borderColor: "#1565c0",
              boxShadow: `0 0 0 2px ${alpha("#1565c0", 0.22)}`,
              "&:hover": {
                bgcolor: "#0d47a1",
                color: "common.white",
              },
            },
          }}
        >
          <ToggleButton value="yes">Yes</ToggleButton>
          <ToggleButton value="no">No</ToggleButton>
        </ToggleButtonGroup>
        <FormHelperText sx={{ ml: 0 }}>
          {answerError
            ? "Select Yes or No before submitting."
            : "Choose whether the PO has been corrected for this audit point."}
        </FormHelperText>
      </FormControl>

      {value === "no" && (
        <TextField
          select
          size="small"
          fullWidth
          label="Buyer's result"
          value={buyerResult}
          onChange={(event) => onBuyerResultChange?.(event.target.value)}
          disabled={disabled}
          error={buyerResultError}
          helperText={
            buyerResultError
              ? "Select the buyer's result before submitting."
              : normalizedSystemResult && normalizedSystemResult !== "Manual Review Required"
                ? `System result (${normalizedSystemResult}) is removed from this list.`
                : "Select what the result should be."
          }
          sx={{ mt: 1.5 }}
        >
          {resultOptions.map((option) => (
            <MenuItem key={option} value={option}>
              {option}
            </MenuItem>
          ))}
        </TextField>
      )}
    </Box>
  );
};

export default PoCorrectedField;
