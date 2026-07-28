import { useMemo } from "react";
import { Autocomplete, TextField, Chip } from "@mui/material";

/**
 * Multi-select purchasing-group filter. Matches on either the raw code
 * ("P15") or the descriptive name ("Packaging & Print"), so admins /
 * procurement managers don't need to remember codes.
 *
 * Only rendered for users who are allowed to filter across purchasing
 * groups (admin / procurement manager) - buyers never see this control,
 * since their visibility is fixed server-side to their own group.
 */
const PurchaseGroupAutocomplete = ({
  purchaseGroups = [],
  purchaseGroupNames = {},
  value = [],
  onChange,
  disabled = false,
}) => {
  const options = useMemo(
    () =>
      purchaseGroups.map((code) => ({
        code,
        label: purchaseGroupNames[code] ? `${code} — ${purchaseGroupNames[code]}` : code,
      })),
    [purchaseGroups, purchaseGroupNames],
  );

  const selected = options.filter((o) => value.includes(o.code));

  return (
    <Autocomplete
      multiple
      disabled={disabled}
      options={options}
      value={selected}
      onChange={(_e, next) => onChange(next.map((o) => o.code))}
      isOptionEqualToValue={(o, v) => o.code === v.code}
      getOptionLabel={(o) => o.label}
      filterOptions={(opts, state) => {
        const term = state.inputValue.trim().toLowerCase();
        if (!term) return opts;
        return opts.filter(
          (o) =>
            o.code.toLowerCase().includes(term) ||
            (purchaseGroupNames[o.code] || "").toLowerCase().includes(term),
        );
      }}
      renderTags={(tagValue, getTagProps) =>
        tagValue.map((option, index) => (
          <Chip size="small" label={option.code} {...getTagProps({ index })} key={option.code} />
        ))
      }
      renderInput={(params) => (
        <TextField
          {...params}
          size="small"
          label="Filter by purchasing group"
          placeholder="Search by code (P15) or name"
        />
      )}
      sx={{ minWidth: 340 }}
    />
  );
};

export default PurchaseGroupAutocomplete;
