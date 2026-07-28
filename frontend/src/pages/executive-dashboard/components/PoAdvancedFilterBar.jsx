import { useEffect, useState } from "react";
import {
  Box,
  Button,
  Card,
  Chip,
  Collapse,
  Grid,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
  Autocomplete,
  Badge,
} from "@mui/material";
import TuneRoundedIcon from "@mui/icons-material/TuneRounded";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import ExpandLessRoundedIcon from "@mui/icons-material/ExpandLessRounded";
import ClearRoundedIcon from "@mui/icons-material/ClearRounded";
import { toast } from "react-toastify";
import {
  getPurchaseGroupsForFilter,
  getPoTypesForFilter,
  getPlantsForFilter,
} from "../../../api/api-functions";

const SEVERITY_OPTIONS = ["Critical", "High", "Medium", "Low"];

const emptyFilters = {
  poNumberSearch: "",
  vendorSearch: "",
  purchaseGroup: [], // array of {code, name} objects — code is what's sent
  plant: [], // array of {code, name} objects
  poType: [], // array of {code, name} objects
  severity: [],
  pointNo: "",
  poDateFrom: "",
  poDateTo: "",
};

const countActive = (f) =>
  Object.entries(f).reduce((n, [, v]) => {
    if (Array.isArray(v)) return n + (v.length > 0 ? 1 : 0);
    return n + (v && String(v).trim() !== "" ? 1 : 0);
  }, 0);

// Shared option renderer: "CODE — Name" so code and name are both always
// visible and distinguishable — never just one or the other.
const optionLabel = (opt) => (opt?.name ? `${opt.code} — ${opt.name}` : opt?.code || "");

const PoAdvancedFilterBar = ({ isAdmin, isProcurementManager, onApply }) => {
  const canUseGroupFilters = isAdmin || isProcurementManager;
  console.log("canUseGroupFilters", canUseGroupFilters)

  const [expanded, setExpanded] = useState(false);
  const [filters, setFilters] = useState(emptyFilters);

  const [groupOptions, setGroupOptions] = useState([]);
  const [poTypeOptions, setPoTypeOptions] = useState([]);
  const [plantOptions, setPlantOptions] = useState([]);
  const [optionsLoading, setOptionsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const loaders = [
      getPoTypesForFilter()
        .then((res) => !cancelled && setPoTypeOptions(res?.poTypes || [])),
      getPlantsForFilter()
        .then((res) => !cancelled && setPlantOptions(res?.plants || [])),
    ];
    if (canUseGroupFilters) {
      loaders.push(
        getPurchaseGroupsForFilter().then(
          (res) => !cancelled && setGroupOptions(res?.groups || []),
        ),
      );
    }
    Promise.all(loaders)
      .catch(() => toast.error("Failed to load some filter options"))
      .finally(() => !cancelled && setOptionsLoading(false));
    return () => {
      cancelled = true;
    };
  }, [canUseGroupFilters]);

  const setField = (key, value) => setFilters((prev) => ({ ...prev, [key]: value }));

  const buildPayload = (f) => {
    const payload = {
      poNumberSearch: f.poNumberSearch.trim() || undefined,
      vendorSearch: f.vendorSearch.trim() || undefined,
      pointNo: f.pointNo.trim() || undefined,
      poDateFrom: f.poDateFrom || undefined,
      poDateTo: f.poDateTo || undefined,
      // Only the codes are sent to the backend — names were purely for
      // display/search in the dropdown.
      poType: f.poType.length ? f.poType.map((o) => o.code) : undefined,
      plant: f.plant.length ? f.plant.map((o) => o.code) : undefined,
      severity: f.severity.length ? f.severity.join(",") : undefined,
    };
    if (canUseGroupFilters) {
      payload.purchaseGroup = f.purchaseGroup.length
        ? f.purchaseGroup.map((o) => o.code)
        : undefined;
    }
    return payload;
  };

  const handleApply = () => {
    if (filters.poDateFrom && filters.poDateTo && filters.poDateFrom > filters.poDateTo) {
      toast.error("PO date 'from' cannot be after 'to'");
      return;
    }
    onApply(buildPayload(filters));
  };

  const handleClear = () => {
    setFilters(emptyFilters);
    onApply({});
  };

  const activeCount = countActive(filters);

  return (
    <Card
      elevation={0}
      sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, mb: 3, overflow: "visible" }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          px: 2.5,
          py: 1.5,
          cursor: "pointer",
        }}
        onClick={() => setExpanded((e) => !e)}
      >
        <Stack direction="row" spacing={1.5} alignItems="center">
          <Badge badgeContent={activeCount} color="primary" invisible={activeCount === 0}>
            <TuneRoundedIcon color="action" />
          </Badge>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            Advanced Filters
          </Typography>
          {activeCount > 0 && (
            <Typography variant="caption" color="text.secondary">
              {activeCount} active
            </Typography>
          )}
        </Stack>
        <IconButton size="small">
          {expanded ? <ExpandLessRoundedIcon /> : <ExpandMoreRoundedIcon />}
        </IconButton>
      </Box>

      <Collapse in={expanded}>
        <Box sx={{ px: 2.5, pb: 2.5, pt: 0.5 }}>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6} md={3}>
              <InputLabel sx={{ mb: 0.5, fontSize: "0.8rem" }}>PO Number</InputLabel>
              <TextField
                fullWidth
                size="small"
                placeholder="Search PO number"
                value={filters.poNumberSearch}
                onChange={(e) => setField("poNumberSearch", e.target.value)}
              />
            </Grid>

            <Grid item xs={12} sm={6} md={3}>
              <InputLabel sx={{ mb: 0.5, fontSize: "0.8rem" }}>Vendor</InputLabel>
              <TextField
                fullWidth
                size="small"
                placeholder="Vendor code or name"
                value={filters.vendorSearch}
                onChange={(e) => setField("vendorSearch", e.target.value)}
              />
            </Grid>

            <Grid item xs={12} sm={6} md={3}>
              <InputLabel sx={{ mb: 0.5, fontSize: "0.8rem" }}>Point No.</InputLabel>
              <TextField
                fullWidth
                size="small"
                placeholder="e.g. 7"
                value={filters.pointNo}
                onChange={(e) => setField("pointNo", e.target.value)}
              />
            </Grid>

            <Grid item xs={12} sm={6} md={3}>
              <InputLabel sx={{ mb: 0.5, fontSize: "0.8rem" }}>Severity</InputLabel>
              <Select
                fullWidth
                size="small"
                multiple
                displayEmpty
                value={filters.severity}
                onChange={(e) => setField("severity", e.target.value)}
                renderValue={(selected) =>
                  selected.length ? (
                    <Stack direction="row" spacing={0.5} flexWrap="wrap">
                      {selected.map((v) => (
                        <Chip key={v} label={v} size="small" />
                      ))}
                    </Stack>
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      Any
                    </Typography>
                  )
                }
              >
                {SEVERITY_OPTIONS.map((opt) => (
                  <MenuItem key={opt} value={opt}>
                    {opt}
                  </MenuItem>
                ))}
              </Select>
            </Grid>

            {/* Plant — real searchable dropdown from Plant Master, shows
                code and name together, sends only codes. */}
            <Grid item xs={12} sm={6} md={4}>
              <InputLabel sx={{ mb: 0.5, fontSize: "0.8rem" }}>Plant</InputLabel>
              <Autocomplete
                multiple
                size="small"
                loading={optionsLoading}
                options={plantOptions}
                value={filters.plant}
                isOptionEqualToValue={(opt, val) => opt.code === val.code}
                getOptionLabel={optionLabel}
                onChange={(_, value) => setField("plant", value)}
                renderInput={(params) => (
                  <TextField {...params} placeholder="Search plant code or name" />
                )}
              />
            </Grid>

            {/* PO Type — real searchable dropdown sourced from
                master-data.js's PO_TYPE_NAMES, not a hardcoded guess. */}
            <Grid item xs={12} sm={6} md={4}>
              <InputLabel sx={{ mb: 0.5, fontSize: "0.8rem" }}>PO Type</InputLabel>
              <Autocomplete
                multiple
                size="small"
                loading={optionsLoading}
                options={poTypeOptions}
                value={filters.poType}
                isOptionEqualToValue={(opt, val) => opt.code === val.code}
                getOptionLabel={optionLabel}
                onChange={(_, value) => setField("poType", value)}
                renderInput={(params) => (
                  <TextField {...params} placeholder="Search PO type code or name" />
                )}
              />
            </Grid>

            <Grid item xs={12} sm={6} md={4}>
              <InputLabel sx={{ mb: 0.5, fontSize: "0.8rem" }}>PO Date From</InputLabel>
              <TextField
                fullWidth
                size="small"
                type="date"
                value={filters.poDateFrom}
                onChange={(e) => setField("poDateFrom", e.target.value)}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>

            <Grid item xs={12} sm={6} md={4}>
              <InputLabel sx={{ mb: 0.5, fontSize: "0.8rem" }}>PO Date To</InputLabel>
              <TextField
                fullWidth
                size="small"
                type="date"
                value={filters.poDateTo}
                onChange={(e) => setField("poDateTo", e.target.value)}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>

            {/* Purchasing Group — Admin/PM only. ONE searchable dropdown,
                not a code-select plus a separate name-text-field: typing
                either the code (e.g. "P15") or the name (e.g. "Packaging")
                filters the same list, because the visible option label is
                "CODE — Name" and MUI's Autocomplete matches against that
                whole label. Only the CODE is ever sent to the backend —
                that's the actual filter value AuditResult.purchase_group
                is stored as. */}
            {canUseGroupFilters && (
              <Grid item xs={12} sm={8} md={6}>
                <InputLabel sx={{ mb: 0.5, fontSize: "0.8rem" }}>
                  Purchasing Group
                </InputLabel>
                <Autocomplete
                  multiple
                  size="small"
                  loading={optionsLoading}
                  options={groupOptions}
                  value={filters.purchaseGroup}
                  isOptionEqualToValue={(opt, val) => opt.code === val.code}
                  getOptionLabel={optionLabel}
                  onChange={(_, value) => setField("purchaseGroup", value)}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      placeholder="Search by group code or name"
                    />
                  )}
                  renderOption={(props, option) => (
                    <li {...props} key={option.code}>
                      <Stack>
                        <Typography variant="body2" sx={{ fontWeight: 700 }}>
                          {option.code}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {option.name || "—"}
                        </Typography>
                      </Stack>
                    </li>
                  )}
                />
              </Grid>
            )}
          </Grid>

          <Stack direction="row" spacing={1.5} sx={{ mt: 3 }}>
            <Button variant="contained" disableElevation onClick={handleApply}>
              Apply Filters
            </Button>
            <Button
              variant="outlined"
              startIcon={<ClearRoundedIcon />}
              onClick={handleClear}
              disabled={activeCount === 0}
            >
              Clear All
            </Button>
          </Stack>
        </Box>
      </Collapse>
    </Card>
  );
};

export default PoAdvancedFilterBar;