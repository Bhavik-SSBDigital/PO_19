// Document view component for displaying audit-related documents

import PropTypes from "prop-types";
import { Box, Button, IconButton, Paper, Typography } from "@mui/material";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import { useViewDocument } from "../contexts";

// ==============================|| DOCUMENT VIEW ||============================== //

const DocumentView = ({ fileURL }) => {
  const { viewDocument, setViewDocument } = useViewDocument();
  if (!viewDocument?.isOpen) return null;
  return (
    <Paper
      sx={{
        mt: "5px",
        flex: 1,
        overflow: "auto",
        // resize: "horizontal",
        // minWidth: "200px",
        border: "1px solid #e5e5e5",
        borderRadius: "10px",
        maxHeight: "600px",
      }}
    >
      <Box
        sx={{
          display: "flex",
          position: "sticky",
          top: "0px",
          width: "100%",
          bgcolor: "background.paper",
          zIndex: 1,
        }}
      >
        <Typography variant="h6" sx={{ p: 2, flex: 1 }}>
          Document : {fileURL}
        </Typography>
        <IconButton
          //   variant="outlined"
          onClick={() =>
            setViewDocument({ isOpen: false, document: null, documents: [] })
          }
          //   size="small"
          sx={{ my: 1 }}
        >
          <CloseRoundedIcon />
        </IconButton>
      </Box>
      <iframe
        src={`${import.meta.env.VITE_APP_BACKEND_URL}getDocument/${fileURL}`}
        width="100%"
        height="600px"
      ></iframe>
    </Paper>
  );
};

export default DocumentView;
DocumentView.propTypes = {
  fileURL: PropTypes.string.isRequired,
};
