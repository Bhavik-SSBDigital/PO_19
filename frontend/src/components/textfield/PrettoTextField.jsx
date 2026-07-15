import { TextField } from "@mui/material";
import { styled } from "@mui/material/styles";

export const PrettoTextField = styled(TextField)({
  "& label.Mui-focused": {
    color: "#A0AAB4",
  },
  "& .MuiInput-underline:after": {
    borderBottomColor: "#73c0de",
  },
  "& .MuiOutlinedInput-root": {
    "& fieldset": {
      borderColor: "#73c0de",
    },
    "&:hover fieldset": {
      borderColor: "#73c0de",
    },
    "&.Mui-focused fieldset": {
      borderColor: "#73c0de",
    },
  },
});
