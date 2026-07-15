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
} from "@mui/material";

// project import
import { UpdateButton } from "./user-form";
import UserDetailsDialog from "./user-details-dialog";
import React from "react";
import { DocumentScannerRounded } from "@mui/icons-material";

// ================================|| REGISTER ||================================ //

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
              <TableCell colSpan={5} align="center">
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
                <UpdateButton fetchUsers={fetchUsers} data={user} />
                <Button
                  onClick={() => setSelectedUser(user)}
                  variant="contained"
                  sx={{ maxHeight: "35px", fontWeight: "650" }}
                  startIcon={<DocumentScannerRounded />}
                >
                  View
                </Button>
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
