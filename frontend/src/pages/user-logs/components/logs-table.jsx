// material-ui
import {
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from "@mui/material";

// ================================|| REGISTER ||================================ //

const LogsTable = ({ userLogs }) => {
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
            <TableCell>Username</TableCell>
            <TableCell>Role Name</TableCell>
            <TableCell>First Name</TableCell>
            <TableCell>Last Name</TableCell>
            <TableCell>Login Time</TableCell>
            <TableCell>Logout Time</TableCell>
            <TableCell>Designation</TableCell>
          </TableRow>
        </TableHead>

        <TableBody>
          {!userLogs?.length && (
            <TableRow>
              <TableCell colSpan={8} align="center">
                No logs found
              </TableCell>
            </TableRow>
          )}
          {userLogs?.map((userLog, index) => (
            <TableRow key={userLog?.loginTime?.toString() + index}>
              <TableCell align="center">{index + 1}</TableCell>
              <TableCell>{userLog.username}</TableCell>
              <TableCell>{userLog.roleName}</TableCell>
              <TableCell>{userLog.firstName}</TableCell>
              <TableCell>{userLog.lastName}</TableCell>
              <TableCell>{userLog.loginTime}</TableCell>
              <TableCell>{userLog.logoutTime}</TableCell>
              <TableCell>{userLog.designation}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
};

export default LogsTable;
