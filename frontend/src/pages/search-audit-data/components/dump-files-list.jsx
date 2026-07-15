import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  IconButton,
  Typography,
} from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import { useState } from "react";

const DumpFilesList = ({ files }) => {
  const [open, setOpen] = useState(false);
  const handleCopy = (text) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <>
      <Button variant="contained" onClick={() => setOpen(true)} sx={{ mb: 2 }}>
        View Dump Files
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)}>
        <Typography variant="h4" sx={{ fontWeight: 600, m: 1 }}>
          Dump Files
        </Typography>
        <DialogContent>
          <Box
            sx={{
              border: "1px solid #ddd",
              borderRadius: 2,
              // padding: "8px 12px",
              display: "flex",
              width: "fit-content",
              maxWidth: 360,
              maxHeight: 500,
              height: "fit-content",
              gap: 1,
              flexDirection: "column",
              overflow: "auto",
              padding: 2,
            }}
          >
            <Box>
              {files.map((file, idx) => (
                <Box
                  key={idx}
                  sx={{
                    borderBottom: "1px solid #ddd",
                    paddingBottom: "2px",
                    width: 230,
                    minWidth: 230,
                    maxWidth: 230,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 1,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  <Typography
                    variant="body2"
                    sx={{
                      flexGrow: 1,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                    title={file}
                  >
                    {file}
                  </Typography>

                  <IconButton
                    size="small"
                    onClick={() => handleCopy(file)}
                    sx={{ padding: 0 }}
                  >
                    <ContentCopyIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </Box>
              ))}
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default DumpFilesList;
