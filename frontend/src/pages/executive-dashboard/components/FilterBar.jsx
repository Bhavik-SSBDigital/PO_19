import { useState, useEffect } from "react";
import {
  Autocomplete,
  Box,
  Button,
  Chip,
  Collapse,
  Grid,
  IconButton,
  Paper,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import FilterAltRoundedIcon from "@mui/icons-material/FilterAltRounded";
import RestartAltRoundedIcon from "@mui/icons-material/RestartAltRounded";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import ExpandLessRoundedIcon from "@mui/icons-material/ExpandLessRounded";

export const DEFAULT_FILTERS = {
  poNumber: "",
  poDateFrom: "",
  poDateTo: "",
  prDateFrom: "",
  prDateTo: "",
  purchaseGroup: [],
  poType: [],
  plant: "",
  vendorCode: "",
  materialCode: "",
};

const countActive = (f) =>
  Object.entries(f).reduce((n, [, v]) => n + (Array.isArray(v) ? (v.length ? 1 : 0) : v ? 1 : 0), 0);

const FilterBar = ({ filters, onApply, onReset, options, loading }) => {
  const [draft, setDraft] = useState(filters);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => setDraft(filters), [filters]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(filters);
  const activeCount = countActive(filters);

  const set = (key) => (value) => setDraft((d) => ({ ...d, [key]: value }));
  const apply = () => onApply(draft);
  const reset = () => {
    setDraft(DEFAULT_FILTERS);
    onReset();
  };

  return (
    <Paper 
      elevation={0} 
      sx={{ 
        mb: 3, 
        borderRadius: 3, 
        border: '1px solid', 
        borderColor: 'divider',
        overflow: 'hidden'
      }}
    >
      <Box 
        sx={{ 
          p: 2, 
          display: "flex", 
          alignItems: "center", 
          justifyContent: "space-between",
          bgcolor: 'grey.50',
          borderBottom: expanded ? '1px solid' : 'none',
          borderColor: 'divider'
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          <FilterAltRoundedIcon fontSize="small" color="primary" />
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>Data Filters</Typography>
          {activeCount > 0 && (
            <Chip size="small" color="primary" label={`${activeCount} active`} sx={{ fontWeight: 600, height: 22 }} />
          )}
        </Box>
        <IconButton size="small" onClick={() => setExpanded((e) => !e)} sx={{ bgcolor: 'white', border: '1px solid', borderColor: 'divider' }}>
          {expanded ? <ExpandLessRoundedIcon fontSize="small" /> : <ExpandMoreRoundedIcon fontSize="small" />}
        </IconButton>
      </Box>

      <Collapse in={expanded} collapsedSize={0} timeout={200}>
        <Box sx={{ p: 2.5 }}>
          <Grid container spacing={2}>
            {/* NEW: PO Number Filter */}
            <Grid item xs={12} sm={6} md={2}>
              <TextField
                fullWidth
                size="small"
                label="PO Number"
                placeholder="Exact match"
                value={draft.poNumber || ""}
                onChange={(e) => set("poNumber")(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && apply()}
              />
            </Grid>

            <Grid item xs={6} sm={3} md={2}>
              <TextField
                fullWidth
                size="small"
                type="date"
                label="PO Date From"
                InputLabelProps={{ shrink: true }}
                value={draft.poDateFrom}
                onChange={(e) => set("poDateFrom")(e.target.value)}
              />
            </Grid>
            <Grid item xs={6} sm={3} md={2}>
              <TextField
                fullWidth
                size="small"
                type="date"
                label="PO Date To"
                InputLabelProps={{ shrink: true }}
                value={draft.poDateTo}
                onChange={(e) => set("poDateTo")(e.target.value)}
              />
            </Grid>
            <Grid item xs={6} sm={3} md={2}>
              <TextField
                fullWidth
                size="small"
                type="date"
                label="PR Date From"
                InputLabelProps={{ shrink: true }}
                value={draft.prDateFrom}
                onChange={(e) => set("prDateFrom")(e.target.value)}
              />
            </Grid>
            <Grid item xs={6} sm={3} md={2}>
              <TextField
                fullWidth
                size="small"
                type="date"
                label="PR Date To"
                InputLabelProps={{ shrink: true }}
                value={draft.prDateTo}
                onChange={(e) => set("prDateTo")(e.target.value)}
              />
            </Grid>
            
            <Grid item xs={12} sm={6} md={2}>
              <TextField
                fullWidth
                size="small"
                label="Material Code"
                placeholder="Exact match"
                value={draft.materialCode}
                onChange={(e) => set("materialCode")(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && apply()}
              />
            </Grid>

            <Grid item xs={12} sm={6} md={3}>
              <Autocomplete
                multiple
                size="small"
                options={options.purchaseGroups || []}
                value={draft.purchaseGroup}
                onChange={(_, value) => set("purchaseGroup")(value)}
                renderTags={(value, getTagProps) =>
                  value.map((option, index) => <Chip size="small" label={option} {...getTagProps({ index })} key={option} />)
                }
                renderInput={(params) => <TextField {...params} label="Purchase Group" placeholder="Any" />}
              />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Autocomplete
                multiple
                size="small"
                options={options.poTypes || []}
                value={draft.poType}
                onChange={(_, value) => set("poType")(value)}
                renderTags={(value, getTagProps) =>
                  value.map((option, index) => <Chip size="small" label={option} {...getTagProps({ index })} key={option} />)
                }
                renderInput={(params) => <TextField {...params} label="PO Type" placeholder="Any" />}
              />
            </Grid>

            <Grid item xs={12} sm={4} md={2}>
              <Autocomplete
                size="small"
                options={options.plants || []}
                value={draft.plant || null}
                onChange={(_, value) => set("plant")(value || "")}
                renderInput={(params) => <TextField {...params} label="Plant" placeholder="Any" />}
              />
            </Grid>
            <Grid item xs={12} sm={4} md={2.5}>
              <Autocomplete
                size="small"
                options={options.vendors || []}
                getOptionLabel={(o) => (typeof o === "string" ? o : `${o.code}${o.name ? ` — ${o.name}` : ""}`)}
                isOptionEqualToValue={(o, v) => o.code === v.code}
                value={options.vendors?.find((v) => v.code === draft.vendorCode) || null}
                onChange={(_, value) => set("vendorCode")(value?.code || "")}
                renderInput={(params) => <TextField {...params} label="Vendor" placeholder="Any" />}
              />
            </Grid>

            <Grid item xs={12} md={1.5} sx={{ display: "flex", gap: 1, alignItems: "flex-start", mt: 0.5 }}>
              <Tooltip title="Re-run every chart and KPI with these filters">
                <span style={{ flex: 1, display: "inline-flex", cursor: loading ? "not-allowed" : "pointer" }}>
                  <Button fullWidth variant="contained" onClick={apply} disabled={loading} sx={{ boxShadow: 'none' }}>
                    Apply
                  </Button>
                </span>
              </Tooltip>
              <Tooltip title="Clear all filters">
                <span style={{ display: "inline-flex", cursor: loading ? "not-allowed" : "pointer" }}>
                  <IconButton onClick={reset} disabled={loading} color="error" sx={{ bgcolor: 'error.50' }}>
                    <RestartAltRoundedIcon />
                  </IconButton>
                </span>
              </Tooltip>
            </Grid>
          </Grid>
          {dirty && (
            <Typography variant="caption" color="warning.main" sx={{ display: "block", mt: 2, fontWeight: 500 }}>
              • You have unapplied filter changes - click Apply to refresh the dashboard.
            </Typography>
          )}
        </Box>
      </Collapse>
    </Paper>
  );
};

export default FilterBar;