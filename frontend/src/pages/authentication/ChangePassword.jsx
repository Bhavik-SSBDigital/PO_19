import { useState } from "react";
import {
  Box,
  Button,
  IconButton,
  InputLabel,
  TextField,
  Typography,
} from "@mui/material";

import { toast } from "react-toastify";
import { useNavigate } from "react-router-dom";

import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import VisibilityOffOutlinedIcon from "@mui/icons-material/VisibilityOffOutlined";

import MainCard from "components/MainCard";

import { post } from "utils/axiosApi";
import { logout } from "../../api/api-functions";

const ChangePassword = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [inputs, setInputs] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  const username = localStorage.getItem("username");

  const [showPassword, setShowPassword] = useState("");

  const handleChange = (e) => {
    setInputs((prevState) => ({
      ...prevState,
      [e.target.name]: e.target.value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (
      !inputs.currentPassword.trim() ||
      !inputs.newPassword.trim() ||
      !inputs.confirmPassword.trim()
    ) {
      toast.error(
        "Current Password, New Password and Confirm Password are required"
      );
      return;
    }

    if (inputs.newPassword !== inputs.confirmPassword) {
      toast.error("New Password and Confirm Password does not match");
      return;
    }

    if (inputs.newPassword === inputs.currentPassword) {
      toast.error("New Password and Current Password cannot be same");
      return;
    }

    setLoading(true);
    try {
      const response = await post("/changePassword", { ...inputs, username });
      toast.success(response.message || "Password changed successfully");
      logout();
      navigate("/login");
    } catch (error) {
      toast.error(
        error?.response?.data?.message ||
          error?.message ||
          "Something went wrong"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      sx={{
        height: "90%",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <MainCard>
        <Typography variant="h4">Change Password</Typography>
        <Typography sx={{ mb: "20px" }}>
          Please enter your current password and new password.
        </Typography>

        <form>
          <InputLabel>Current Password :</InputLabel>
          <TextField
            type={showPassword === "currentPassword" ? "text" : "password"}
            name="currentPassword"
            fullWidth
            value={inputs.currentPassword}
            onChange={handleChange}
            sx={{ mb: "10px" }}
            InputProps={{
              endAdornment: (
                <IconButton
                  onClick={() =>
                    setShowPassword((pre) =>
                      pre === "currentPassword" ? "" : "currentPassword"
                    )
                  }
                >
                  {showPassword === "currentPassword" ? (
                    <VisibilityOffOutlinedIcon />
                  ) : (
                    <VisibilityOutlinedIcon />
                  )}
                </IconButton>
              ),
            }}
          />
          <InputLabel>New Password :</InputLabel>
          <TextField
            type={showPassword === "newPassword" ? "text" : "password"}
            name="newPassword"
            fullWidth
            value={inputs.newPassword}
            onChange={handleChange}
            sx={{ mb: "10px" }}
            InputProps={{
              endAdornment: (
                <IconButton
                  onClick={() =>
                    setShowPassword((prev) =>
                      prev === "newPassword" ? "" : "newPassword"
                    )
                  }
                >
                  {showPassword === "newPassword" ? (
                    <VisibilityOffOutlinedIcon />
                  ) : (
                    <VisibilityOutlinedIcon />
                  )}
                </IconButton>
              ),
            }}
          />
          <InputLabel>Confirm New Password :</InputLabel>
          <TextField
            type={showPassword === "confirmPassword" ? "text" : "password"}
            name="confirmPassword"
            fullWidth
            value={inputs.confirmPassword}
            onChange={handleChange}
            sx={{ mb: "10px" }}
            InputProps={{
              endAdornment: (
                <IconButton
                  onClick={() =>
                    setShowPassword((prev) =>
                      prev === "confirmPassword" ? "" : "confirmPassword"
                    )
                  }
                >
                  {showPassword === "confirmPassword" ? (
                    <VisibilityOffOutlinedIcon />
                  ) : (
                    <VisibilityOutlinedIcon />
                  )}
                </IconButton>
              ),
            }}
          />
          <Button
            variant="contained"
            color="primary"
            fullWidth
            sx={{ mt: "10px" }}
            disabled={loading}
            onClick={handleSubmit}
          >
            {loading ? "Loading..." : "Change Password"}
          </Button>
        </form>
      </MainCard>
    </Box>
  );
};

export default ChangePassword;
