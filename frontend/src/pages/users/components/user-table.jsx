import React, { useState } from "react";
// material-ui
import {
  Button,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Stack,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Typography,
  Tooltip,
} from "@mui/material";
import { DocumentScannerRounded, DeleteOutlineRounded } from "@mui/icons-material";
import { toast } from "react-toastify";

// project import
import { UpdateButton } from "./user-form";
import UserDetailsDialog from "./user-details-dialog";
// Import your delete method from your axiosApi. If you don't have 'del', you can use standard axios.delete()
import { del } from "utils/axiosApi"; 

// ================================|| DELETE BUTTON COMPONENT ||================================ //

export const DeleteUserButton = ({ userId, userName, fetchUsers }) => {
  const [open, setOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      // Adjust this path if your backend URL structure is different
      await del(`/deleteUser/${userId}`); 
      
      toast.success("User deleted successfully");
      fetchUsers(); // Refresh the table
      setOpen(false);
    } catch (error) {
      const errMsg = error.response?.data?.message || "Failed to delete user";
      toast.error(errMsg);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <Tooltip title="Delete User">
        <IconButton 
          color="error" 
          onClick={() => setOpen(true)}
          sx={{ border: "1px solid", borderColor: "error.main", borderRadius: 1 }}
        >
          <DeleteOutlineRounded />
        </IconButton>
      </Tooltip>

      <Dialog 
        open={open} 
        onClose={() => !isDeleting && setOpen(false)}
        sx={{ "& .MuiDialog-paper": { borderRadius: "12px", padding: 1 } }}
      >
        <DialogTitle>
          <Typography variant="h4" sx={{ fontWeight: 700, color: "error.main" }}>
            Confirm Deletion
          </Typography>
        </DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete the user <strong>{userName}</strong>? This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button 
            onClick={() => setOpen(false)} 
            disabled={isDeleting}
            color="inherit"
          >
            Cancel
          </Button>
          <Button 
            onClick={handleDelete} 
            disabled={isDeleting} 
            variant="contained" 
            color="error"
            disableElevation
          >
            {isDeleting ? "Deleting..." : "Delete User"}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

// ================================|| USER TABLE ||================================ //

const UserTable = ({ users, fetchUsers }) => {
  const [selectedUser, setSelectedUser] = React.useState(null);
  
  return (
    <TableContainer
      component={Paper}
      elevation={0}
      sx={{
        overflow: "auto",
        maxHeight: "500px",
        maxWidth: "100%",
        borderRadius: "12px",
        border: "1px solid lightgray",
      }}
    >
      <Table stickyHeader aria-label="user list table" size="small">
        <TableHead>
          <TableRow>
            <TableCell align="center">ID</TableCell>
            <TableCell>Name</TableCell>
            <TableCell>Username</TableCell>
            <TableCell>Email</TableCell>
            <TableCell>Role</TableCell>
            <TableCell align="center">Actions</TableCell>
          </TableRow>
        </TableHead>

        <TableBody>
          {!users?.length && (
            <TableRow>
              <TableCell colSpan={6} align="center">
                No users found
              </TableCell>
            </TableRow>
          )}
          {users?.map((user, index) => (
            <TableRow key={user.id + index}>
              <TableCell align="center">{index + 1}</TableCell>
              <TableCell>{user.firstName + " " + user.lastName}</TableCell>
              <TableCell>{user.username}</TableCell>
              <TableCell>{user.email}</TableCell>
              <TableCell>{user.roleName}</TableCell>
              
              <TableCell align="center">
                {/* Stack keeps the Update, View, and Delete buttons cleanly aligned in a row */}
                <Stack direction="row" spacing={1} justifyContent="center" alignItems="center">
                  <UpdateButton fetchUsers={fetchUsers} data={user} />
                  
                  <Button
                    onClick={() => setSelectedUser(user)}
                    variant="contained"
                    sx={{ maxHeight: "35px", fontWeight: "650" }}
                    startIcon={<DocumentScannerRounded />}
                  >
                    View
                  </Button>

                  <DeleteUserButton 
                    userId={user.id || user._id} 
                    userName={user.username} 
                    fetchUsers={fetchUsers} 
                  />
                </Stack>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      
      <UserDetailsDialog
        user={selectedUser}
        onClose={() => setSelectedUser(null)}
      />
    </TableContainer>
  );
};

export default UserTable;