import { useLayoutEffect, useState } from "react";

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

import { get, post, put } from "utils/axiosApi";

// ============================================================
// VALIDATION SCHEMA
// ============================================================
//
// IMPORTANT:
// Password is NOT part of user creation/update anymore.
// Backend always generates the password automatically.
//
// allowedAuditors / allowedModules are also not user inputs.
// ============================================================

const validationSchema = Yup.object().shape({
  firstName: Yup.string()
    .max(255)
    .required("First Name is required"),

  lastName: Yup.string()
    .max(255)
    .required("Last Name is required"),

  email: Yup.string()
    .email("Must be a valid email")
    .max(255)
    .required("Email is required"),

  roleName: Yup.string()
    .required("Role is required"),

  formUsername: Yup.string()
    .required("Username is required"),

  canViewDashboard: Yup.boolean().default(false),
});

// ============================================================
// CREATE USER BUTTON
// ============================================================

export const CreateButton = ({ fetchUsers }) => {
  const [modelOpen, setModelOpen] = useState(false);

  const handleClose = () => {
    setModelOpen(false);
  };

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
        onClose={handleClose}
        sx={{
          "& .MuiDialog-paper": {
            borderRadius: "12px",
          },
        }}
      >
        <DialogTitle>
          <Typography
            variant="h4"
            sx={{ fontWeight: 700 }}
          >
            Create User
          </Typography>

          <Typography>
            Fill in the details below to create a new user account.
            A password will be generated automatically and sent to
            the user's email address.
          </Typography>

          <IconButton
            onClick={handleClose}
            sx={{
              position: "absolute",
              top: 8,
              right: 8,
            }}
          >
            <CloseRounded />
          </IconButton>
        </DialogTitle>

        <UserForm
          fetchUsers={fetchUsers}
          onSuccess={handleClose}
        />
      </Dialog>
    </>
  );
};

// ============================================================
// UPDATE USER BUTTON
// ============================================================

export const UpdateButton = ({
  fetchUsers,
  data,
}) => {
  const [modelOpen, setModelOpen] = useState(false);

  const handleClose = () => {
    setModelOpen(false);
  };

  return (
    <>
      <Button
        onClick={() => setModelOpen(true)}
        sx={{
          fontWeight: 700,
          width: "100px",
        }}
        startIcon={
          <BorderColorOutlined
            style={{ fontSize: "16px" }}
          />
        }
      >
        Update
      </Button>

      <Dialog
        open={!!modelOpen}
        fullWidth
        maxWidth="sm"
        onClose={handleClose}
        sx={{
          "& .MuiDialog-paper": {
            borderRadius: "12px",
          },
        }}
      >
        <DialogTitle>
          <Typography
            variant="h4"
            sx={{ fontWeight: 700 }}
          >
            Update User Details
          </Typography>

          <Typography>
            Modify the user details below. Password cannot be
            changed from this screen.
          </Typography>

          <IconButton
            onClick={handleClose}
            sx={{
              position: "absolute",
              top: 8,
              right: 8,
            }}
          >
            <CloseRounded />
          </IconButton>
        </DialogTitle>

        <UserForm
          fetchUsers={fetchUsers}
          type="update"
          data={data}
          onSuccess={handleClose}
        />
      </Dialog>
    </>
  );
};

// ============================================================
// USER FORM
// ============================================================

export const UserForm = ({
  type = "create",
  data = {},
  fetchUsers,
  onSuccess,
}) => {
  const [roles, setRoles] = useState([]);
  const [selectedRole, setSelectedRole] = useState(null);

  const {
    control,
    handleSubmit,
    reset,
    setError,
    formState: {
      errors,
      isSubmitting,
      isValid,
    },
  } = useForm({
    resolver: yupResolver(validationSchema),

    mode: "onChange",

    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      roleName: "",
      formUsername: "",
      canViewDashboard: false,
    },
  });

  // ==========================================================
  // LOAD EXISTING USER DATA WHEN UPDATING
  // ==========================================================

  useLayoutEffect(() => {
    const fetchRoles = async () => {
      try {
        const response = await get("/getRoles");

        const roleList =
          response?.data ||
          response ||
          [];

        setRoles(roleList);

        if (data?.roleName) {
          const matchedRole = roleList.find(
            (r) => r.name === data.roleName
          );

          setSelectedRole(
            matchedRole || null
          );
        }
      } catch (error) {
        console.error(
          "Error fetching roles:",
          error
        );
      }
    };

    fetchRoles();
  }, [data?.roleName]);

  // ==========================================================
  // RESET FORM WHEN UPDATE DATA CHANGES
  // ==========================================================

  useLayoutEffect(() => {
    if (type === "update" && data) {
      reset({
        firstName: data.firstName || "",
        lastName: data.lastName || "",
        email: data.email || "",
        roleName: data.roleName || "",
        formUsername: data.username || "",
        canViewDashboard:
          data.canViewDashboard ?? false,
      });
    } else if (type === "create") {
      reset({
        firstName: "",
        lastName: "",
        email: "",
        roleName: "",
        formUsername: "",
        canViewDashboard: false,
      });
    }
  }, [type, data, reset]);

  // ==========================================================
  // SUBMIT
  // ==========================================================

  const onSubmit = async (values) => {
    try {
      // ------------------------------------------------------
      // CREATE USER
      // ------------------------------------------------------
      //
      // IMPORTANT:
      // No password is sent.
      //
      // Backend generates it automatically.
      // ------------------------------------------------------

      if (type === "create") {
        const payload = {
          username: values.formUsername.trim(),
          email: values.email.trim(),
          firstName: values.firstName.trim(),
          lastName: values.lastName.trim(),
          roleName: values.roleName,
          canViewDashboard:
            values.canViewDashboard ?? false,
        };

        const response = await post(
          "/signup",
          payload
        );

        toast.success(
          response?.message ||
            "User created successfully. Credentials have been emailed."
        );

        if (fetchUsers) {
          await fetchUsers();
        }

        reset();

        if (onSuccess) {
          onSuccess();
        }

        return;
      }

      // ------------------------------------------------------
      // UPDATE USER
      // ------------------------------------------------------
      //
      // IMPORTANT:
      // Password is deliberately NOT included.
      //
      // Backend will never change the password from this
      // endpoint.
      // ------------------------------------------------------

      const userId =
        data?.id || data?._id;

      if (!userId) {
        toast.error(
          "User ID is missing"
        );

        return;
      }

      const payload = {
        username: values.formUsername.trim(),
        email: values.email.trim(),
        firstName: values.firstName.trim(),
        lastName: values.lastName.trim(),
        roleName: values.roleName,
        canViewDashboard:
          values.canViewDashboard ?? false,
      };

      const response = await put(
        `/users/${userId}`,
        payload
      );

      toast.success(
        response?.message ||
          "User updated successfully!"
      );

      if (fetchUsers) {
        await fetchUsers();
      }

      reset();

      if (onSuccess) {
        onSuccess();
      }
    } catch (err) {
      console.error(
        "Error submitting user form:",
        err
      );

      const error =
        err?.response?.data?.message ||
        err?.message ||
        "Something went wrong";

      toast.error(error);

      setError("root", {
        type: "manual",
        message: error,
      });
    }
  };

  // ==========================================================
  // UI
  // ==========================================================

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
          style={{
            margin: "10px -10px 5px 2px",
          }}
        >
          <Grid container spacing={2}>

            {/* =================================================
                ROLE
            ================================================= */}

            <Grid item xs={12}>
              <InputLabel htmlFor="roleName">
                Role *
              </InputLabel>

              <Controller
                name="roleName"
                control={control}
                render={({ field }) =>
                  !data?.isAdmin ? (
                    <Autocomplete
                      disablePortal
                      options={roles}
                      getOptionLabel={(option) =>
                        option?.name || ""
                      }
                      value={
                        roles.find(
                          (r) =>
                            r.name === field.value
                        ) || null
                      }
                      onChange={(_, value) => {
                        field.onChange(
                          value?.name || ""
                        );

                        setSelectedRole(
                          value || null
                        );
                      }}
                      isOptionEqualToValue={(
                        option,
                        value
                      ) =>
                        (option.id &&
                          option.id === value.id) ||
                        (option._id &&
                          option._id === value._id)
                      }
                      renderInput={(params) => (
                        <TextField
                          {...params}
                          placeholder="Select role"
                          size="small"
                          error={
                            !!errors.roleName
                          }
                          helperText={
                            errors.roleName
                              ?.message
                          }
                          autoComplete="off"
                        />
                      )}
                    />
                  ) : (
                    <TextField
                      value={
                        field.value || ""
                      }
                      fullWidth
                      disabled
                      error={
                        !!errors.roleName
                      }
                      helperText={
                        errors.roleName
                          ?.message
                      }
                    />
                  )
                }
              />
            </Grid>

            {/* =================================================
                FIRST NAME
            ================================================= */}

            <Grid item xs={12} sm={6}>
              <InputLabel htmlFor="firstName">
                First Name *
              </InputLabel>

              <Controller
                name="firstName"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    placeholder="Enter first name"
                    fullWidth
                    error={
                      !!errors.firstName
                    }
                    autoComplete="off"
                    inputProps={{
                      autoComplete: "off",
                      form: {
                        autoComplete: "off",
                      },
                    }}
                    helperText={
                      errors.firstName
                        ?.message
                    }
                  />
                )}
              />
            </Grid>

            {/* =================================================
                LAST NAME
            ================================================= */}

            <Grid item xs={12} sm={6}>
              <InputLabel htmlFor="lastName">
                Last Name *
              </InputLabel>

              <Controller
                name="lastName"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    placeholder="Enter last name"
                    fullWidth
                    error={
                      !!errors.lastName
                    }
                    autoComplete="off"
                    inputProps={{
                      autoComplete: "off",
                      form: {
                        autoComplete: "off",
                      },
                    }}
                    helperText={
                      errors.lastName
                        ?.message
                    }
                  />
                )}
              />
            </Grid>

            {/* =================================================
                EMAIL
            ================================================= */}

            <Grid item xs={12} sm={6}>
              <InputLabel htmlFor="email">
                Email Address *
              </InputLabel>

              <Controller
                name="email"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    placeholder="Enter email address"
                    fullWidth
                    type="email"
                    error={
                      !!errors.email
                    }
                    autoComplete="off"
                    inputProps={{
                      autoComplete: "off",
                      form: {
                        autoComplete: "off",
                      },
                    }}
                    helperText={
                      errors.email?.message
                    }
                  />
                )}
              />
            </Grid>

            {/* =================================================
                USERNAME
            ================================================= */}

            <Grid item xs={12} sm={6}>
              <InputLabel htmlFor="formUsername">
                Username *
              </InputLabel>

              <Controller
                name="formUsername"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    placeholder="Enter username"
                    fullWidth
                    error={
                      !!errors.formUsername
                    }
                    autoComplete="off"
                    inputProps={{
                      autoComplete: "off",
                      form: {
                        autoComplete: "off",
                      },
                    }}
                    helperText={
                      errors.formUsername
                        ?.message
                    }
                  />
                )}
              />
            </Grid>

            {/* =================================================
                PASSWORD NOTICE
            ================================================= */}

            {type === "create" && (
              <Grid item xs={12}>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{
                    mt: 0.5,
                    px: 1,
                  }}
                >
                  A secure password will be generated
                  automatically and sent to the user's
                  email address after the account is created.
                </Typography>
              </Grid>
            )}

            {type === "update" && (
              <Grid item xs={12}>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{
                    mt: 0.5,
                    px: 1,
                  }}
                >
                  Password cannot be changed while updating
                  user details. Use the password change or
                  forgot-password process to change it.
                </Typography>
              </Grid>
            )}

            {/* =================================================
                DASHBOARD PERMISSION
            ================================================= */}

            <Grid item xs={12}>
              <FormGroup
                sx={{
                  mt: 1,
                  p: 2,
                  border:
                    "1px solid #e0e0e0",
                  borderRadius: 1,
                }}
              >
                <Controller
                  name="canViewDashboard"
                  control={control}
                  render={({ field }) => (
                    <FormControlLabel
                      control={
                        <Switch
                          {...field}
                          checked={
                            !!field.value
                          }
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

                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ ml: 4 }}
                >
                  If disabled, this user will not
                  see the dashboard in their navigation
                  menu.
                </Typography>
              </FormGroup>
            </Grid>

          </Grid>
        </form>
      </DialogContent>

      {/* ========================================================
          SUBMIT BUTTON
      ======================================================== */}

      <DialogActions>
        <Button
          disableElevation
          form="user-form"
          disabled={
            isSubmitting || !isValid
          }
          fullWidth
          type="submit"
          sx={{
            mx: 2,
          }}
          variant="contained"
        >
          {type === "update"
            ? "Update"
            : "Register"}
        </Button>
      </DialogActions>
    </>
  );
};