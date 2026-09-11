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
  const [showPassword, setShowPassword] = useState("");

  const username = localStorage.getItem("username");

  const handleChange = (e) => {
    const { name, value } = e.target;
    setInputs((prevState) => ({
      ...prevState,
      [name]: value,
    }));
  };

  const togglePasswordVisibility = (field) => {
    setShowPassword((prev) => (prev === field ? "" : field));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const currentPassword = inputs.currentPassword.trim();
    const newPassword = inputs.newPassword.trim();
    const confirmPassword = inputs.confirmPassword.trim();

    if (!username) {
      toast.error("Username not found. Please log in again.");
      return;
    }

    if (!currentPassword || !newPassword || !confirmPassword) {
      toast.error(
        "Current Password, New Password and Confirm Password are required"
      );
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error("New Password and Confirm Password do not match");
      return;
    }

    if (newPassword === currentPassword) {
      toast.error("New Password and Current Password cannot be the same");
      return;
    }

    setLoading(true);
    
    try {
      const response = await post("/changePassword", {
        username,
        currentPassword,
        newPassword,
        confirmPassword,
      });
      
      toast.success(response?.message || "Password changed successfully");
      
      // Password has changed, so log the user out.
      await logout(navigate);
    } catch (error) {
      toast.error(
        error?.response?.data?.message ||
        error?.message ||
        "Unable to change password"
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
          Enter your current password and choose a new password.
        </Typography>

        <form onSubmit={handleSubmit}>
          <InputLabel>Current Password :</InputLabel>
          <TextField
            type={showPassword === "currentPassword" ? "text" : "password"}
            name="currentPassword"
            fullWidth
            value={inputs.currentPassword}
            onChange={handleChange}
            disabled={loading}
            autoComplete="current-password"
            sx={{ mb: "10px" }}
            InputProps={{
              endAdornment: (
                <IconButton
                  type="button"
                  onClick={() => togglePasswordVisibility("currentPassword")}
                  disabled={loading}
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
            disabled={loading}
            autoComplete="new-password"
            sx={{ mb: "10px" }}
            InputProps={{
              endAdornment: (
                <IconButton
                  type="button"
                  onClick={() => togglePasswordVisibility("newPassword")}
                  disabled={loading}
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
            disabled={loading}
            autoComplete="new-password"
            sx={{ mb: "10px" }}
            InputProps={{
              endAdornment: (
                <IconButton
                  type="button"
                  onClick={() => togglePasswordVisibility("confirmPassword")}
                  disabled={loading}
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
            type="submit"
          >
            {loading ? "Changing Password..." : "Change Password"}
          </Button>
        </form>
      </MainCard>
    </Box>
  );
};

export default ChangePassword;