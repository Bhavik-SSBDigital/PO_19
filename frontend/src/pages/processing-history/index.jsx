import { useEffect, useState } from "react";
import {
  Box,
  Card,
  Grid,
  Stack,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  CircularProgress,
} from "@mui/material";

import { getProcessingHistory } from "../../api/api-functions";

/**
 * pages/processing-history
 * ==========================
 * Item 1 — "when did the system last process this data". Three plain
 * lists (date processed, batch id, count of records touched), one per
 * entity type, backed by SyncBatchLog (see
 * controller/processing-history-controller.js). No dashboards, no
 * charts, per the spec.
 */

function formatDate(d) {
  if (!d) return "—";
  const date = new Date(d);
  if (isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}

function HistoryList({ title, rows, countLabel, extraColumn }) {
  return (
    <Card sx={{ p: 2, height: "100%" }}>
      <Typography variant="h5" sx={{ mb: 2 }}>
        {title}
      </Typography>
      <TableContainer sx={{ maxHeight: 480 }}>
        <Table stickyHeader size="small">
          <TableHead>
            <TableRow>
              <TableCell>Date Processed</TableCell>
              <TableCell>Batch ID</TableCell>
              <TableCell align="right">{countLabel}</TableCell>
              {extraColumn && <TableCell>{extraColumn}</TableCell>}
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={extraColumn ? 4 : 3}>
                  <Typography variant="body2" color="text.secondary">
                    No batches logged yet.
                  </Typography>
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => (
              <TableRow key={r.batchId}>
                <TableCell>{formatDate(r.date)}</TableCell>
                <TableCell>{r.batchId}</TableCell>
                <TableCell align="right">{r.count}</TableCell>
                {extraColumn && (
                  <TableCell>
                    {r.rcCached ? (
                      <Chip size="small" label="Cached RC" color="warning" />
                    ) : (
                      ""
                    )}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Card>
  );
}

export default function ProcessingHistoryPage() {
  const [data, setData] = useState({ lineItems: [], headers: [], rc: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await getProcessingHistory({});
        if (!cancelled) setData(res.data || res);
      } catch (err) {
        console.error("Failed to load processing history:", err);
        if (!cancelled) setError("Failed to load processing history.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Processing History
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        When the sync pipeline last ran, and how many records each run
        touched — one row per completed batch, per entity type.
      </Typography>

      {loading ? (
        <Stack alignItems="center" py={6}>
          <CircularProgress />
        </Stack>
      ) : error ? (
        <Typography color="error">{error}</Typography>
      ) : (
        <Grid container spacing={3}>
          <Grid item xs={12} md={4}>
            <HistoryList
              title="PO Line Items"
              rows={data.lineItems || []}
              countLabel="Lines Touched"
            />
          </Grid>
          <Grid item xs={12} md={4}>
            <HistoryList
              title="PO Headers"
              rows={data.headers || []}
              countLabel="Headers Touched"
            />
          </Grid>
          <Grid item xs={12} md={4}>
            <HistoryList
              title="RC Records"
              rows={data.rc || []}
              countLabel="RC Records Touched"
              extraColumn="Note"
            />
          </Grid>
        </Grid>
      )}
    </Box>
  );
}
