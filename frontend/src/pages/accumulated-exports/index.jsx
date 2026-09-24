import { useState } from "react";
import {
  Box,
  Card,
  Grid,
  Stack,
  Typography,
  Button,
  CircularProgress,
  Switch,
  FormControlLabel,
} from "@mui/material";
import DownloadIcon from "@mui/icons-material/Download";

import {
  downloadAccumulatedPoLineExport,
  downloadAccumulatedPoHeaderExport,
  downloadAccumulatedRcExport,
} from "../../api/api-functions";

/**
 * pages/accumulated-exports
 * ==========================
 * Item 3 — three full-table, unscoped exports (line-item PO, header-only
 * PO, RC). Admin/SSBDigital only (enforced server-side too — see
 * routes.js). Deliberately plain: three cards, three download buttons, no
 * filters, since the whole point of "accumulated" is the entire table.
 */

async function saveBlob(res, filename, mimeType) {
  const blob = new Blob([res.data], { type: mimeType });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

function ExportCard({ title, description, downloading, onDownload }) {
  return (
    <Card sx={{ p: 3, height: "100%" }}>
      <Stack spacing={2} height="100%" justifyContent="space-between">
        <Box>
          <Typography variant="h5" gutterBottom>
            {title}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {description}
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={
            downloading ? <CircularProgress size={16} color="inherit" /> : <DownloadIcon />
          }
          disabled={downloading}
          onClick={onDownload}
        >
          {downloading ? "Generating..." : "Download"}
        </Button>
      </Stack>
    </Card>
  );
}

export default function AccumulatedExportsPage() {
  const [loading, setLoading] = useState({ lines: false, headers: false, rc: false });
  const [rcRaw, setRcRaw] = useState(false);
  const today = new Date().toISOString().slice(0, 10);

  const run = async (key, fn, filename, mimeType) => {
    setLoading((s) => ({ ...s, [key]: true }));
    try {
      const res = await fn();
      await saveBlob(res, filename, mimeType);
    } catch (err) {
      console.error(`Failed to download ${key} export:`, err);
    } finally {
      setLoading((s) => ({ ...s, [key]: false }));
    }
  };

  const xlsxMime =
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Accumulated Exports
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Full-table exports across the entire history — not filtered or
        scoped by purchase group, unlike the other reports in this app.
      </Typography>

      <Grid container spacing={3}>
        <Grid item xs={12} md={4}>
          <ExportCard
            title="Accumulated PO File — Line Items"
            description="One row per PO line item across the entire AuditResult table, enriched with vendor, plant, purchase group, and severity."
            downloading={loading.lines}
            onDownload={() =>
              run(
                "lines",
                downloadAccumulatedPoLineExport,
                `accumulated-po-line-items-${today}.xlsx`,
                xlsxMime,
              )
            }
          />
        </Grid>

        <Grid item xs={12} md={4}>
          <ExportCard
            title="Accumulated PO File — Headers"
            description="One row per PO (no line items) across the entire PoHeaderResult table, same enrichment as the line-item export."
            downloading={loading.headers}
            onDownload={() =>
              run(
                "headers",
                downloadAccumulatedPoHeaderExport,
                `accumulated-po-headers-${today}.xlsx`,
                xlsxMime,
              )
            }
          />
        </Grid>

        <Grid item xs={12} md={4}>
          <Card sx={{ p: 3, height: "100%" }}>
            <Stack spacing={2} height="100%" justifyContent="space-between">
              <Box>
                <Typography variant="h5" gutterBottom>
                  Accumulated RC File
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Every RC record, enriched the same way as the RC Overlap
                  export — or toggle below for the untouched sync master
                  CSV (data/rc_master_cumulative.csv) instead.
                </Typography>
                <FormControlLabel
                  sx={{ mt: 1 }}
                  control={
                    <Switch
                      checked={rcRaw}
                      onChange={(e) => setRcRaw(e.target.checked)}
                      size="small"
                    />
                  }
                  label="Raw sync master CSV instead of enriched .xlsx"
                />
              </Box>
              <Button
                variant="contained"
                startIcon={
                  loading.rc ? (
                    <CircularProgress size={16} color="inherit" />
                  ) : (
                    <DownloadIcon />
                  )
                }
                disabled={loading.rc}
                onClick={() =>
                  run(
                    "rc",
                    () => downloadAccumulatedRcExport(rcRaw),
                    rcRaw
                      ? `rc-master-cumulative-${today}.csv`
                      : `accumulated-rc-${today}.xlsx`,
                    rcRaw ? "text/csv" : xlsxMime,
                  )
                }
              >
                {loading.rc ? "Generating..." : "Download"}
              </Button>
            </Stack>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}
