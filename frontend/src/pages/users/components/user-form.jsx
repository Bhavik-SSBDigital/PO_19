import { useEffect, useLayoutEffect, useState } from "react";
import {
  Autocomplete,
  Dialog,
  DialogContent,
  DialogTitle,
  Button,
  Grid,
  InputLabel,
  TextField,
  IconButton,
  Typography,
  DialogActions,
  FormControlLabel,
  Switch,
  FormGroup,
} from "@mui/material";

import * as Yup from "yup";
import { toast } from "react-toastify";
import { useForm, Controller } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";

import {
  CloseRounded,
  PersonAddOutlined,
  BorderColorOutlined,
} from "@mui/icons-material";

import { get, post } from "utils/axiosApi";

// Validation schema updated for confirm password logic
const validationSchema = Yup.object().shape({
  firstName: Yup.string().max(255).required("First Name is required"),
  lastName: Yup.string().max(255).required("Last Name is required"),
  email: Yup.string()
    .email("Must be a valid email")
    .max(255)
    .required("Email is required"),
  roleName: Yup.string().required("Role is required"),
  formUsername: Yup.string().required("Username is required"),
  password: Yup.string().min(6, "Password must be at least 6 characters"),
  confirmPassword: Yup.string().oneOf(
    [Yup.ref("password"), null],
    "Passwords must match"
  ),
  canViewDashboard: Yup.boolean().default(false),
});

// ================================|| REGISTER / BUTTONS ||================================ //

export const CreateButton = ({ fetchUsers }) => {
  const [modelOpen, setModelOpen] = useState(false);

  return (
    <>
      <Button
        onClick={() => setModelOpen(true)}
        variant="contained"
        startIcon={<PersonAddOutlined />}
      >
        Create User
      </Button>
      <Dialog
        open={!!modelOpen}
        fullWidth
        maxWidth="sm"
        onClose={() => setModelOpen(false)}
        sx={{ "& .MuiDialog-paper": { borderRadius: "12px" } }}
      >
        <DialogTitle>
          <Typography variant="h4" sx={{ fontWeight: 700 }}>
            Create User
          </Typography>
          <Typography>
            Fill in the details below to create a new user account.
          </Typography>
          <IconButton
            onClick={() => setModelOpen(false)}
            sx={{ position: "absolute", top: 8, right: 8 }}
          >
            <CloseRounded />
          </IconButton>
        </DialogTitle>

        <UserForm fetchUsers={fetchUsers} />
      </Dialog>
    </>
  );
};

export const UpdateButton = ({ fetchUsers, data }) => {
  const [modelOpen, setModelOpen] = useState(false);

  return (
    <>
      <Button
        onClick={() => setModelOpen(true)}
        sx={{ fontWeight: 700, width: "100px" }}
        startIcon={<BorderColorOutlined style={{ fontSize: "16px" }} />}
      >
        Update
      </Button>
      <Dialog
        open={!!modelOpen}
        fullWidth
        maxWidth="sm"
        onClose={() => setModelOpen(false)}
        sx={{ "& .MuiDialog-paper": { borderRadius: "12px" } }}
      >
        <DialogTitle>
          <Typography variant="h4" sx={{ fontWeight: 700 }}>
            Update User Details
          </Typography>
          <Typography>
            Modify the user details below. Ensure all fields are correctly
            filled.
          </Typography>
          <IconButton
            onClick={() => setModelOpen(false)}
            sx={{ position: "absolute", top: 8, right: 8 }}
          >
            <CloseRounded />
          </IconButton>
        </DialogTitle>

        <UserForm fetchUsers={fetchUsers} type="update" data={data} />
      </Dialog>
    </>
  );
};

// ================================|| USER FORM ||================================ //

export const UserForm = ({ type = "create", data = {}, fetchUsers }) => {
  const [roles, setRoles] = useState([]);
  const [selectedRole, setSelectedRole] = useState(null);

  const {
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting, isValid },
  } = useForm({
    resolver: yupResolver(validationSchema),
    mode: "onChange",
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      roleName: "",
      password: "",
      confirmPassword: "", // Added confirm password field
      formUsername: data?.username || "",
      canViewDashboard: data?.canViewDashboard ?? false,
      ...data,
    },
  });

  useLayoutEffect(() => {
    const fetchRoles = async () => {
      try {
        const response = await get("/getRoles");
        const roleList = response?.data || response || [];

        setRoles(roleList);

        if (data?.roleName) {
          const matchedRole = roleList.find((r) => r.name === data.roleName);
          setSelectedRole(matchedRole || null);
        }
      } catch (error) {
        console.error("Error fetching roles:", error);
      }
    };
    fetchRoles();
  }, []);

  const onSubmit = async (values) => {
    // Manually enforce password creation for new users
    if (type === "create" && !values.password) {
      setError("password", { type: "manual", message: "Password is required" });
      return;
    }

    try {
      const payload = {
        ...values,
        username: values.formUsername,
      };

      // Strip confirmPassword before sending to the backend
      delete payload.confirmPassword;

      if (type === "update") {
        payload.id = data.id || data._id;
        // If password field is empty during update, remove it so we don't overwrite with a blank password
        if (!payload.password) {
          delete payload.password;
        }
      }

      if (values.formUsername) delete payload.formUsername;

      const path = type === "update" ? "/editUser" : "/signup";

      const response = await post(path, payload);

      toast.success(
        response.message ||
          `User ${type === "update" ? "updated" : "created"} successfully!`
      );

      fetchUsers();
      reset();
    } catch (err) {
      const error =
        err.response?.data?.message || err.message || "Something went wrong";
      toast.error(error);
      setError("root", { type: "manual", message: error });
    }
  };

  return (
    <>
      <DialogContent
        dividers
        sx={{
          maxHeight: "65vh",
          overflowY: "auto",
        }}
      >
        <form
          noValidate
          id="user-form"
          onSubmit={handleSubmit(onSubmit)}
          autoComplete="off"
          style={{ margin: "10px -10px 5px 2px" }}
        >
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <InputLabel htmlFor="roleName">Role *</InputLabel>
              <Controller
                name="roleName"
                control={control}
                render={({ field }) =>
                  !data?.isAdmin ? (
                    <Autocomplete
                      disablePortal
                      options={roles}
                      getOptionLabel={(option) => option.name || ""}
                      value={roles.find((r) => r.name === field.value) || null}
                      onChange={(_, value) => field.onChange(value?.name || "")}
                      isOptionEqualToValue={(option, value) =>
                        (option.id && option.id === value.id) ||
                        (option._id && option._id === value._id)
                      }
                      renderInput={(params) => (
                        <TextField
                          {...params}
                          placeholder="Select role"
                          size="small"
                          error={!!errors.roleName}
                          helperText={errors.roleName?.message}
                          autoComplete="off"
                        />
                      )}
                    />
                  ) : (
                    <TextField
                      value={field.value || ""}
                      fullWidth
                      disabled
                      helperText={errors.roleName?.message}
                    />
                  )
                }
              />
            </Grid>

            <Grid item xs={12} sm={6}>
              <InputLabel htmlFor="firstName">First Name *</InputLabel>
              <Controller
                name="firstName"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    placeholder="Enter first name"
                    fullWidth
                    error={!!errors.firstName}
                    autoComplete="off"
                    inputProps={{
                      autoComplete: "off",
                      form: { autoComplete: "off" },
                    }}
                    helperText={errors.firstName?.message}
                  />
                )}
              />
            </Grid>

            <Grid item xs={12} sm={6}>
              <InputLabel htmlFor="lastName">Last Name *</InputLabel>
              <Controller
                name="lastName"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    placeholder="Enter last name"
                    fullWidth
                    error={!!errors.lastName}
                    autoComplete="off"
                    inputProps={{
                      autoComplete: "off",
                      form: { autoComplete: "off" },
                    }}
                    helperText={errors.lastName?.message}
                  />
                )}
              />
            </Grid>

            <Grid item xs={12} sm={6}>
              <InputLabel htmlFor="email">Email Address *</InputLabel>
              <Controller
                name="email"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    placeholder="Enter your email"
                    fullWidth
                    type="email"
                    error={!!errors.email}
                    autoComplete="off"
                    inputProps={{
                      autoComplete: "off",
                      form: { autoComplete: "off" },
                    }}
                    helperText={errors.email?.message}
                  />
                )}
              />
            </Grid>

            <Grid item xs={12} sm={6}>
              <InputLabel htmlFor="formUsername">Username *</InputLabel>
              <Controller
                name="formUsername"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    placeholder="Enter username"
                    fullWidth
                    error={!!errors.formUsername}
                    autoComplete="off"
                    inputProps={{
                      autoComplete: "off",
                      form: { autoComplete: "off" },
                    }}
                    helperText={errors.formUsername?.message}
                  />
                )}
              />
            </Grid>

            {/* PASSWORD FIELDS */}
            <Grid item xs={12} sm={6}>
              <InputLabel htmlFor="password">
                {type === "update" ? "New Password" : "Password *"}
              </InputLabel>
              <Controller
                name="password"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    placeholder={type === "update" ? "Leave blank to keep current" : "Enter password"}
                    fullWidth
                    type="password"
                    error={!!errors.password}
                    autoComplete="new-password"
                    inputProps={{
                      autoComplete: "new-password",
                      form: { autoComplete: "off" },
                    }}
                    helperText={errors.password?.message}
                  />
                )}
              />
            </Grid>

            <Grid item xs={12} sm={6}>
              <InputLabel htmlFor="confirmPassword">Confirm Password</InputLabel>
              <Controller
                name="confirmPassword"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    placeholder="Confirm password"
                    fullWidth
                    type="password"
                    error={!!errors.confirmPassword}
                    autoComplete="new-password"
                    inputProps={{
                      autoComplete: "new-password",
                      form: { autoComplete: "off" },
                    }}
                    helperText={errors.confirmPassword?.message}
                  />
                )}
              />
            </Grid>

            {/* DASHBOARD PERMISSION TOGGLE */}
            <Grid item xs={12}>
              <FormGroup sx={{ mt: 1, p: 2, border: "1px solid #e0e0e0", borderRadius: 1 }}>
                <Controller
                  name="canViewDashboard"
                  control={control}
                  render={({ field }) => (
                    <FormControlLabel
                      control={
                        <Switch
                          {...field}
                          checked={field.value}
                          color="primary"
                        />
                      }
                      label={
                        <Typography fontWeight="500">
                          Allow Dashboard Access
                        </Typography>
                      }
                    />
                  )}
                />
                <Typography variant="caption" color="text.secondary" sx={{ ml: 4 }}>
                  If disabled, this user will not see the dashboard in their navigation menu.
                </Typography>
              </FormGroup>
            </Grid>
          </Grid>
        </form>
      </DialogContent>
      <DialogActions>
        <Button
          disableElevation
          form="user-form"
          disabled={isSubmitting || !isValid}
          fullWidth
          type="submit"
          sx={{ mx: 2 }}
          variant="contained"
        >
          {type === "update" ? "Update" : "Register"}
        </Button>
      </DialogActions>
    </>
  );
};