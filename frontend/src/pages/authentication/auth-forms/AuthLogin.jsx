import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import {
  Autocomplete,
  Button,
  FormHelperText,
  Grid,
  IconButton,
  InputAdornment,
  InputLabel,
  OutlinedInput,
  Stack,
  TextField,
  Typography,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from "@mui/material";

import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import VisibilityOffOutlinedIcon from "@mui/icons-material/VisibilityOffOutlined";

import { toast } from "react-toastify";

import * as Yup from "yup";
import { useForm, Controller } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";

import { get, post } from "utils/axiosApi";

const schema = Yup.object().shape({
  username: Yup.string().max(255).required("Username is required"),
  password: Yup.string().max(255).required("Password is required"),
});

const AuthLogin = () => {
  const navigate = useNavigate();

  const [showPassword, setShowPassword] = useState(false);

  const [tempName, setTempName] = useState();
  const [loginResponse, setResponse] = useState("");
  const [openDialog, setOpenDialog] = useState(false);
  const [allowedAuditors, setAllowedAuditors] = useState([]);

  const handleClickShowPassword = () => setShowPassword((show) => !show);

  const {
    handleSubmit,
    control,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: yupResolver(schema),
    defaultValues: {
      username: "",
      password: "",
    },
  });

  const onSubmit = async (values) => {
    try {
      const response = await post("/signin", values);
      if (response.isAuditor) {
        if (
          !response?.allowedModules ||
          response?.allowedModules?.length === 0
        ) {
          toast.warning("You have no access to any of the audit modules");
          return;
        }

        try {
          const res = await get(
            "/getAllowedAuditors" + "/" + response.userName
          );
          setAllowedAuditors(res?.allowedAuditors);
        } catch (error) {
          console.error("Error fetching allowed auditors:", error);
        }
        setResponse(response);
        setOpenDialog(true);
      }

      if (!response.isAuditor) {
        toast.success(response.message || "Login Successful");

        localStorage.setItem("token", response.accessToken);
        localStorage.setItem(
          "role",
          response.isAuditHead
            ? "isAuditHead"
            : response.isAdmin
            ? "isAdmin"
            : response.isAuditor
            ? "isAuditor"
            : response.isExecutor
            ? "isExecutor"
            : response.fromSSBD
            ? "fromSSBD"
            : "user"
        );
        localStorage.setItem("name", response.name);
        localStorage.setItem("email", response.email);
        localStorage.setItem("username", response.userName);
        
        // NEW: Save dashboard access for NON-auditors
        localStorage.setItem("canViewDashboard", response.canViewDashboard);

        const { userId, roleId, firstName, lastName, loginTime, logId } =
          response;

        localStorage.setItem(
          "logsDetails",
          JSON.stringify({
            userId,
            logId,
            roleId,
            firstName,
            lastName,
            loginTime: loginTime || new Date().toISOString(),
          })
        );

        navigate("/");
      }
    } catch (err) {
      const message =
        err.response?.data?.message ||
        err.response?.data?.error ||
        err.message ||
        "Error while login";
      setError("root", { type: "manual", message });
      toast.error(message);
    }
  };

  return (
    <>
      <Dialog
        open={openDialog}
        aria-labelledby="get-auditor-name"
        fullWidth
        maxWidth="xs"
        sx={{
          "& .MuiDialog-paper": { overflow: "unset", borderRadius: "10px" },
        }}
      >
        <DialogTitle>
          <Typography variant="h4" sx={{ fontWeight: 700 }}>
            Select your name
          </Typography>
        </DialogTitle>
        <DialogContent>
          <Typography>Auditor Name</Typography>
          <Autocomplete
            disablePortal
            options={allowedAuditors || []}
            value={tempName || ""}
            onChange={(_, value) => setTempName(value)}
            renderInput={(params) => (
              <TextField {...params} placeholder="Select your name" />
            )}
          />
        </DialogContent>
        <DialogActions>
          <Button
            onClick={async () => {
              if (tempName.trim()) {
                localStorage.setItem("auditorFullName", tempName);
                toast.success(loginResponse.message || "Login Successful");

                localStorage.setItem("token", loginResponse.accessToken);
                localStorage.setItem("role", "isAuditor");
                localStorage.setItem("name", loginResponse.name);
                localStorage.setItem("email", loginResponse.email);
                localStorage.setItem("username", loginResponse.userName);
                localStorage.setItem(
                  "allowedModules",
                  JSON.stringify(loginResponse.allowedModules)
                );

                // NEW: Save dashboard access for AUDITORS
                localStorage.setItem("canViewDashboard", loginResponse.canViewDashboard);

                const userLogst = await post("/addAuditorLog", {
                  auditorName: tempName,
                });

                const {
                  userId,
                  roleId,
                  firstName,
                  lastName,
                  loginTime,
                  logId,
                } = userLogst;

                localStorage.setItem(
                  "logsDetails",
                  JSON.stringify({
                    userId,
                    logId,
                    roleId,
                    firstName,
                    lastName,
                    loginTime: loginTime || new Date().toISOString(),
                  })
                );

                navigate("/check-invoice-item");
                setOpenDialog(false);
              } else {
                toast.error("Please enter a your first and last name.");
              }
            }}
            disabled={!tempName}
            variant="contained"
            sx={{ width: "150px", mb: 1, mr: 2 }}
          >
            Continue
          </Button>
        </DialogActions>
      </Dialog>
      <form noValidate onSubmit={handleSubmit(onSubmit)}>
        <Grid container spacing={3}>
          <Grid item xs={12}>
            <Stack spacing={1}>
              <InputLabel htmlFor="username-login">Username :</InputLabel>
              <Controller
                name="username"
                control={control}
                render={({ field }) => (
                  <OutlinedInput
                    {...field}
                    id="username-login"
                    type="text"
                    placeholder="Enter username"
                    fullWidth
                    error={!!errors.username}
                  />
                )}
              />
              {errors.username && (
                <FormHelperText error>{errors.username.message}</FormHelperText>
              )}
            </Stack>
          </Grid>

          <Grid item xs={12}>
            <Stack spacing={1}>
              <InputLabel htmlFor="password-login">Password :</InputLabel>
              <Controller
                name="password"
                control={control}
                render={({ field }) => (
                  <OutlinedInput
                    {...field}
                    id="password-login"
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter password"
                    fullWidth
                    error={!!errors.password}
                    endAdornment={
                      <InputAdornment position="end">
                        <IconButton onClick={handleClickShowPassword}>
                          {showPassword ? (
                            <VisibilityOutlinedIcon />
                          ) : (
                            <VisibilityOffOutlinedIcon />
                          )}
                        </IconButton>
                      </InputAdornment>
                    }
                  />
                )}
              />
              {errors.password && (
                <FormHelperText error>{errors.password.message}</FormHelperText>
              )}
            </Stack>
            <Stack
              direction="row"
              sx={{ justifyContent: "flex-end", gap: 1, mt: 1 }}
            >
              <Typography align="center">
                Forgot your login password?
              </Typography>
              <Typography
                component={Link}
                to="/forgot-password"
                align="center"
                sx={{
                  textDecoration: "none",
                  color: "primary.main",
                  fontWeight: 600,
                }}
              >
                Click here to recover.
              </Typography>
            </Stack>
          </Grid>

          {errors.root && (
            <Grid item xs={12}>
              <FormHelperText error>{errors.root.message}</FormHelperText>
            </Grid>
          )}

          <Grid item xs={12}>
            <Button
              disableElevation
              disabled={isSubmitting}
              fullWidth
              type="submit"
              variant="contained"
            >
              Click to Login
            </Button>
          </Grid>
        </Grid>
      </form>
    </>
  );
};

export default AuthLogin;