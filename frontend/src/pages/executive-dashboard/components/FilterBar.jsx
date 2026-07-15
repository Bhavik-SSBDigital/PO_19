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

/**
 * Controlled-draft filter bar: edits are local until "Apply" is pressed (or
 * Enter is hit in a text field), so every keystroke doesn't trigger a fresh
 * /reports/executive-summary call - the parent only re-fetches once per
 * Apply/Reset, which is the whole efficiency point of this component.
 */
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
    <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <FilterAltRoundedIcon fontSize="small" color="action" />
          <Typography variant="subtitle2">Filters</Typography>
          {activeCount > 0 && <Chip size="small" color="primary" label={`${activeCount} active`} />}
        </Box>
        <IconButton size="small" onClick={() => setExpanded((e) => !e)}>
          {expanded ? <ExpandLessRoundedIcon /> : <ExpandMoreRoundedIcon />}
        </IconButton>
      </Box>

      <Collapse in={expanded} collapsedSize={0} timeout={150}>
        <Box sx={{ mt: 2 }}>
          <Grid container spacing={1.5}>
            <Grid item xs={6} sm={3} md={1.7}>
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
            <Grid item xs={6} sm={3} md={1.7}>
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
            <Grid item xs={6} sm={3} md={1.7}>
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
            <Grid item xs={6} sm={3} md={1.7}>
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
            <Grid item xs={12} sm={6} md={2.6}>
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
            <Grid item xs={12} sm={6} md={2.6}>
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
            <Grid item xs={12} sm={4} md={2.6}>
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
            <Grid item xs={12} sm={4} md={2}>
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

            <Grid item xs={12} md={1.8} sx={{ display: "flex", gap: 1, alignItems: "flex-start" }}>
              <Tooltip title="Re-run every chart and KPI with these filters">
                {/* Updated wrapper for Apply button */}
                <span style={{ flex: 1, display: "inline-flex", cursor: loading ? "not-allowed" : "pointer" }}>
                  <Button fullWidth variant="contained" onClick={apply} disabled={loading}>
                    Apply
                  </Button>
                </span>
              </Tooltip>
              <Tooltip title="Clear all filters">
                {/* ✅ ADDED WRAPPER HERE for the Reset button */}
                <span style={{ display: "inline-flex", cursor: loading ? "not-allowed" : "pointer" }}>
                  <IconButton onClick={reset} disabled={loading}>
                    <RestartAltRoundedIcon />
                  </IconButton>
                </span>
              </Tooltip>
            </Grid>
          </Grid>
          {dirty && (
            <Typography variant="caption" color="warning.main" sx={{ display: "block", mt: 1 }}>
              You have unapplied filter changes - click Apply to refresh the dashboard.
            </Typography>
          )}
        </Box>
      </Collapse>
    </Paper>
  );
};

export default FilterBar;
