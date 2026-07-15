import { useEffect, useState } from "react";
// material-ui
import { Box, Stack, Typography } from "@mui/material";

// project import
import { get } from "utils/axiosApi";
import UserTable from "./components/user-table";
import { CreateButton } from "./components/user-form";
import { TableSkeleton } from "../../components/Skeletons";
import DownloadExcel from "./components/download-excel";

// ================================|| REGISTER ||================================ //

const UserList = () => {
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchUsers = async () => {
    setIsLoading(true);
    try {
      let response = await get("/getUsers");
      setUsers(response?.users);
    } catch (error) {
      console.error("Error fetching users:", error);
    } finally {
      setIsLoading(false);
    }
  };
  useEffect(() => {
    fetchUsers();
  }, []);
  if (isLoading) {
    return <TableSkeleton />;
  }
  return (
    <>
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="baseline"
        sx={{ mb: 2 }}
      >
        <Box>
          <Typography variant="h3" sx={{ fontWeight: 700 }}>
            Users
          </Typography>
          {/* descript for user management and lisr */}
          {/* <Typography variant="body1" sx={{ color: "text.secondary" }}>
            View the list of all registered users, manage user details, and
            register new users.
          </Typography> */}
        </Box>

        <Box sx={{ display: "flex", gap: 2 }}>
          <CreateButton fetchUsers={fetchUsers} />
          <DownloadExcel loading={isLoading} />
        </Box>
      </Stack>
      <UserTable users={users} fetchUsers={fetchUsers} />
    </>
  );
};

export default UserList;
