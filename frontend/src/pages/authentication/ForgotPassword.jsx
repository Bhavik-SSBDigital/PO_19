import {
  Box,
  Button,
  TextField,
  Typography,
  Paper,
  InputLabel,
  Stack,
} from "@mui/material";

import * as yup from "yup";
import { useForm } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";

import { toast } from "react-toastify";
import { Link, useNavigate } from "react-router-dom";

import { post } from "utils/axiosApi";

const schema = yup.object().shape({
  username: yup.string().required("Username is required"),
  email: yup.string().email("Invalid email").required("Email is required"),
});

const ForgotPassword = () => {
  const navigate = useNavigate();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: yupResolver(schema),
  });

  const onSubmit = async (data) => {
    try {
      await post("/forgetPassword", data);
      toast.success("Password sent successfully!");
      setTimeout(() => navigate("/login"), 1500);
    } catch (error) {
      const msg = error?.response?.data?.message || "Something went wrong";
      toast.error(msg);
    }
  };

  return (
    <Box
      sx={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        height: "100vh",
      }}
    >
      <Paper
        elevation={1}
        sx={{ p: 4, borderRadius: 3, minWidth: { sm: "600px", xs: "300px" } }}
      >
        <Typography variant="h4" gutterBottom>
          Forgot Password
        </Typography>
        <Typography color="textSecondary" gutterBottom>
          Please enter your username and email to forgot your password.
        </Typography>
        <Box component="form" onSubmit={handleSubmit(onSubmit)} noValidate>
          <InputLabel>Username :</InputLabel>
          <TextField
            fullWidth
            required
            placeholder="Enter your username"
            {...register("username")}
            error={!!errors.username}
            helperText={errors.username?.message}
          />
          <InputLabel sx={{ mt: 2 }}>Email :</InputLabel>
          <TextField
            fullWidth
            required
            placeholder="Enter your email"
            {...register("email")}
            type="email"
            error={!!errors.email}
            helperText={errors.email?.message}
          />
          <Button
            fullWidth
            type="submit"
            variant="contained"
            color="primary"
            disabled={isSubmitting}
            sx={{ mt: 2 }}
          >
            {isSubmitting ? "Submitting..." : "Submit"}
          </Button>
        </Box>
        <Stack
          direction="row"
          sx={{ justifyContent: "flex-end", gap: 1, mt: 1 }}
        >
          <Typography>Remembered your password?</Typography>
          <Typography
            component={Link}
            to="/login"
            sx={{
              textDecoration: "none",
              color: "primary.main",
              fontWeight: 600,
            }}
          >
            Click here to log in.
          </Typography>
        </Stack>
      </Paper>
    </Box>
  );
};

export default ForgotPassword;
