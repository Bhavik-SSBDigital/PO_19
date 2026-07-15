import {
  Avatar,
  Box,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  Grid,
  Typography,
  Divider,
  IconButton,
} from "@mui/material";
import { CardHeader, useTheme } from "@mui/material";
import {
  EmailOutlined as EmailIcon,
  AccountCircleRounded as RoleIcon,
  GroupOutlined as AuditorsIcon,
  PlaylistAddCheckRounded as ModulesIcon,
  Close,
  AlternateEmail,
  AssignmentIndOutlined,
} from "@mui/icons-material";

const roles = {
  isAdmin: "Admin",
  isAuditHead: "Audit Head",
  isAuditor: "Auditor",
  fromSSBD: "SSBD User",
  isExecutor: "Executor",
};

const roleName = (user) => {
  if (user.isAdmin) return roles.isAdmin;
  if (user.isAuditHead) return roles.isAuditHead;
  if (user.isAuditor) return roles.isAuditor;
  if (user.fromSSBD) return roles.fromSSBD;
  if (user.isExecutor) return roles.isExecutor;
  return "User";
};

const UserDetailsDialog = ({ user, onClose }) => {
  const theme = useTheme();
  if (!user) return null;
  return (
    <Dialog
      open={Boolean(user)}
      onClose={onClose}
      maxWidth="xs"
      fullWidth
      sx={{ "& .MuiDialog-paper": { borderRadius: 3 } }}
    >
      <DialogTitle
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Typography variant="h4" sx={{ fontWeight: "700" }}>
          User Details
        </Typography>
        <IconButton
          sx={{ borderRadius: "50%" }}
          aria-label="close"
          onClick={onClose}
        >
          <Close />
        </IconButton>
      </DialogTitle>
      <Divider />
      <DialogContent>
        {user && (
          <Card elevation={0} sx={{ width: "100%" }}>
            <CardHeader
              avatar={
                <Avatar
                  sx={{
                    width: 50,
                    height: 50,
                    bgcolor: theme.palette.primary.dark,
                    fontSize: "30px",
                  }}
                  aria-label="user"
                >
                  {user.firstName[0]?.toUpperCase()}
                </Avatar>
              }
              title={
                <Typography variant="h4" sx={{ fontWeight: "700", mr: "50px" }}>
                  {`${user.firstName?.toUpperCase()} ${user.lastName?.toUpperCase()}`}
                </Typography>
              }
              subheader={
                <Chip
                  icon={<RoleIcon />}
                  label={roleName(user)}
                  color="primary"
                  size="small"
                  sx={{ borderRadius: 6, p: "3px", mr: "50px" }}
                />
              }
              sx={{
                pb: 3,
                alignItems: "center",
                "& .MuiCardHeader-content": { textAlign: "center" },
              }}
            />
            <Divider />
            <CardContent sx={{ px: 4, py: 1 }}>
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: "3px",
                  justifyContent: "center",
                  mb: 2,
                }}
              >
                <AlternateEmail color="primary" />
                <Typography
                  variant="h4"
                  color="primary"
                  sx={{ fontWeight: "700", mb: "2px" }}
                >
                  {user.username}
                </Typography>
              </Box>
              <Box
                sx={{ display: "flex", gap: "9px", mb: 2, flexWrap: "wrap" }}
              >
                <Box sx={{ display: "flex", alignItems: "center", gap: "7px" }}>
                  <EmailIcon color="primary" />
                  <Box>
                    <Typography variant="h6">Email</Typography>
                    <Typography variant="body1" color="textSecondary">
                      {user.email}
                    </Typography>
                  </Box>
                </Box>

                <Box sx={{ display: "flex", alignItems: "center", gap: "3px" }}>
                  <AssignmentIndOutlined color="primary" />
                  <Box>
                    <Typography variant="h6">Role</Typography>
                    <Typography variant="body1" color="textSecondary">
                      {user.roleName}
                    </Typography>
                  </Box>
                </Box>
              </Box>
              {user.isAuditor && (
                <Grid container spacing={3}>
                  <Grid item xs={12}>
                    <Divider sx={{ mb: 2 }} />
                    <Typography
                      variant="h5"
                      gutterBottom
                      sx={{ display: "flex", alignItems: "center", gap: 1 }}
                    >
                      <AuditorsIcon color="primary" />
                      Allowed Auditors
                    </Typography>
                    {user.allowedAuditors.length > 0 ? (
                      <Box display="flex" flexWrap="wrap" gap={1}>
                        {user.allowedAuditors.map((auditor, idx) => (
                          <Chip
                            key={idx}
                            label={auditor}
                            color="primary"
                            variant="outlined"
                            sx={{
                              borderRadius: 6,
                              minWidth: "50px",
                              borderWidth: 2,
                            }}
                          />
                        ))}
                      </Box>
                    ) : (
                      <Typography variant="body2" color="text.secondary">
                        None
                      </Typography>
                    )}
                  </Grid>
                  <Grid item xs={12}>
                    <Divider sx={{ mb: 2 }} />
                    <Typography
                      variant="h5"
                      gutterBottom
                      sx={{ display: "flex", alignItems: "center", gap: 1 }}
                    >
                      <ModulesIcon color="primary" />
                      Allowed Modules
                    </Typography>
                    {user.allowedModules.length > 0 ? (
                      <Box display="flex" flexWrap="wrap" gap={1}>
                        {user.allowedModules.map((module, idx) => (
                          <Chip
                            key={idx}
                            label={module}
                            color="secondary"
                            size="small"
                            sx={{ borderRadius: 6, minWidth: "50px" }}
                            //   variant="outlined"
                          />
                        ))}
                      </Box>
                    ) : (
                      <Typography variant="body2" color="text.secondary">
                        None
                      </Typography>
                    )}
                  </Grid>
                </Grid>
              )}
            </CardContent>
          </Card>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default UserDetailsDialog;
