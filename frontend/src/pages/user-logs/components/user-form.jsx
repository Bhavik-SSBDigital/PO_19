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
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  TableContainer,
  Paper,
  Typography,
  DialogActions,
  Checkbox,
  FormControlLabel,
  Box,
} from "@mui/material";

import * as Yup from "yup";
import { toast } from "react-toastify";
import { useForm, Controller } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";

import {
  CloseRounded,
  PersonAddOutlined,
  AddOutlined,
  BorderColorOutlined,
  DeleteOutlineRounded,
} from "@mui/icons-material";

import { get, post } from "utils/axiosApi";

const validationSchema = Yup.object().shape({
  firstName: Yup.string().max(255).required("First Name is required"),
  lastName: Yup.string().max(255).required("Last Name is required"),
  email: Yup.string()
    .email("Must be a valid email")
    .max(255)
    .required("Email is required"),
  roleName: Yup.string().required("Role is required"),
  username: Yup.string().required("Username is required"),
  password: Yup.string(),
});

// ================================|| REGISTER ||================================ //

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

        {/* <DialogContent> */}
        <UserForm fetchUsers={fetchUsers} />
        {/* </DialogContent> */}
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
        {/* <DialogContent> */}
        <UserForm fetchUsers={fetchUsers} type="update" data={data} />
        {/* </DialogContent> */}
      </Dialog>
    </>
  );
};

export const UserForm = ({ type = "create", data = {}, fetchUsers }) => {
  const [roles, setRoles] = useState([]);
  const [selectedRole, setSelectedRole] = useState(null);

  const [allowedAuditors, setAllowedAuditors] = useState([]);
  const [allowedAuditor, setAllowedAuditor] = useState({
    firstName: "",
    lastName: "",
  });

  const {
    control,
    handleSubmit,
    reset,
    setError,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: yupResolver(validationSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      roleName: "",
      username: "",
      password: "",
      allowedAuditors: [],
      allowedModules: [],
      ...data,
    },
  });

  const [watchedRole, FirstName, LastName, allowedModules] = watch([
    "roleName",
    "firstName",
    "lastName",
    "allowedModules",
  ]);

  useLayoutEffect(() => {
    const fetchRoles = async () => {
      try {
        const response = await get("/getRoles");
        const roleList = response?.data?.filter((role) => !role.isAdmin) || [];
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

  useEffect(() => {
    const matchedRole = roles.find((role) => role.name === watchedRole);
    setSelectedRole(matchedRole || null);
  }, [watchedRole]);
  useEffect(() => {
    if (!data?.allowedAuditors?.length) return;
    const allowedAuditors = [...(data?.allowedAuditors || [])];
    allowedAuditors.shift();
    setAllowedAuditors(allowedAuditors);
  }, [data]);

  const onSubmit = async (values) => {
    try {
      const payload = {
        ...values,
        allowedAuditors: [
          `${values.firstName.trim()} ${values.lastName.trim()}`,
          ...allowedAuditors,
        ],
        allowedModules: selectedRole?.isAuditor ? allowedModules : null,
      };

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
  const handleModuleChange = (module) => {
    if (selectedRole?.isAuditor) {
      setValue(
        "allowedModules",
        (allowedModules || []).includes(module)
          ? (allowedModules || []).filter((m) => m !== module)
          : [...(allowedModules || []), module]
      );
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
          style={{ margin: "10px -10px 5px 2px" }}
        >
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <InputLabel htmlFor="roleName">Role *</InputLabel>
              <Controller
                name="roleName"
                control={control}
                render={({ field }) => (
                  <Autocomplete
                    disablePortal
                    options={roles.map((r) => r.name)}
                    value={field.value || ""}
                    onChange={(_, value) => field.onChange(value)}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        placeholder="Select role"
                        size="small"
                        error={!!errors.roleName}
                        helperText={errors.roleName?.message}
                      />
                    )}
                  />
                )}
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
                    helperText={errors.email?.message}
                  />
                )}
              />
            </Grid>

            <Grid item xs={12} sm={6}>
              <InputLabel htmlFor="username">Username *</InputLabel>
              <Controller
                name="username"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    placeholder="Enter username"
                    fullWidth
                    error={!!errors.username}
                    helperText={errors.username?.message}
                  />
                )}
              />
            </Grid>

            {/* Extra Table for Allowed Auditors */}
            {selectedRole?.isAuditor && (
              <>
                <Grid item xs={12}>
                  <Typography variant="h5">Allowed Auditors</Typography>

                  <TableContainer
                    sx={{
                      maxHeight: 160,
                      overflowY: "auto",
                      border: "1px solid #ccc",
                      borderRadius: 2,
                    }}
                    component={Paper}
                    elevation={0}
                  >
                    <Table
                      stickyHeader
                      aria-label="allowed auditors table"
                      size="small"
                    >
                      <TableHead>
                        <TableRow>
                          <TableCell>Auditor Name</TableCell>
                          <TableCell sx={{ width: "60px" }}>Action</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {(FirstName || LastName) && (
                          <TableRow>
                            <TableCell>{FirstName + " " + LastName}</TableCell>
                            <TableCell sx={{ width: "60px" }}></TableCell>
                          </TableRow>
                        )}
                        {allowedAuditors?.map((auditor, index) => {
                          return (
                            <TableRow key={index}>
                              <TableCell>{auditor}</TableCell>
                              <TableCell sx={{ width: "60px" }}>
                                <IconButton
                                  onClick={() =>
                                    setAllowedAuditors((prev) =>
                                      prev.filter((_, i) => i !== index)
                                    )
                                  }
                                >
                                  <DeleteOutlineRounded
                                    fontSize="small"
                                    color="error"
                                  />
                                </IconButton>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Grid>
                <Grid item xs={6} sm={5}>
                  <InputLabel>First Name</InputLabel>
                  <TextField
                    value={allowedAuditor.firstName}
                    placeholder="First name"
                    onChange={(e) =>
                      setAllowedAuditor({
                        ...allowedAuditor,
                        firstName: e.target.value,
                      })
                    }
                    fullWidth
                  />
                </Grid>
                <Grid item xs={6} sm={5}>
                  <InputLabel>Last Name</InputLabel>
                  <TextField
                    value={allowedAuditor.lastName}
                    placeholder="Last name"
                    onChange={(e) =>
                      setAllowedAuditor({
                        ...allowedAuditor,
                        lastName: e.target.value,
                      })
                    }
                    fullWidth
                  />
                </Grid>
                <Grid item xs={12} sm={2}>
                  <InputLabel> </InputLabel>
                  <Button
                    variant="contained"
                    onClick={() => {
                      console.log(allowedAuditor);

                      setAllowedAuditors((prev) => [
                        ...prev,
                        `${allowedAuditor.firstName} ${allowedAuditor.lastName}`,
                      ]);
                      setAllowedAuditor({ firstName: "", lastName: "" });
                    }}
                    fullWidth
                    sx={{ mt: { xs: "-10px", sm: "20px" }, height: "40px" }}
                    endIcon={<AddOutlined style={{ fontSize: "18px" }} />}
                  >
                    ADD
                  </Button>
                </Grid>
              </>
            )}
            {selectedRole?.isAuditor && (
              <Grid item xs={12}>
                <Typography variant="h5">Allowed Modules</Typography>
                <Box>
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={allowedModules.includes("PJV")}
                        onChange={() => handleModuleChange("PJV")}
                      />
                    }
                    label="PJV"
                  />
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={allowedModules.includes("NONPO")}
                        onChange={() => handleModuleChange("NONPO")}
                      />
                    }
                    label="Non-PO"
                  />
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={allowedModules.includes("BPV")}
                        onChange={() => handleModuleChange("BPV")}
                      />
                    }
                    label="BPV"
                  />
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={allowedModules.includes("PO")}
                        onChange={() => handleModuleChange("PO")}
                      />
                    }
                    label="PO"
                  />
                </Box>
              </Grid>
            )}
          </Grid>
        </form>
      </DialogContent>
      <DialogActions>
        <Button
          disableElevation
          form="user-form"
          disabled={isSubmitting}
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
