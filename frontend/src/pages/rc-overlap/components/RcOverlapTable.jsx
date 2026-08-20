import { useMemo, useState } from "react";
import {
  Box, Paper, Skeleton, Typography, Chip, TextField, Table,
  TableHead, TableRow, TableCell, TableBody, TableSortLabel, InputAdornment,
  alpha, MenuItem, Select, FormControl, Pagination, Tooltip as MuiTooltip,
} from "@mui/material";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";

const STATUS_COLORS = {
  Verified: { bg: alpha("#059669", 0.1), color: "#059669" },
  "Not Verified": { bg: alpha("#dc2626", 0.1), color: "#dc2626" },
};

const InfoTip = ({ text }) => {
  if (!text) return null;
  return (
    <MuiTooltip title={text} placement="top" arrow enterTouchDelay={0}>
      <InfoOutlinedIcon sx={{
        fontSize: 18, ml: 0.75, color: "text.disabled", cursor: "help",
        verticalAlign: "text-bottom", transition: "color 0.2s",
        "&:hover": { color: "#4f46e5" },
      }} />
    </MuiTooltip>
  );
};

// Cells in the "Overlapping RC(s)" column are pinned to the left edge of
// the scroll container (both header and body) so the column stays visible
// even if the table has to be scrolled horizontally on narrower screens —
// this is the column people care about most at a glance, so it shouldn't
// require scrolling to discover it exists.
const overlapStickySx = {
  position: "sticky",
  left: 0,
  zIndex: 2,
  bgcolor: "#fff",
  boxShadow: "2px 0 4px -2px rgba(0,0,0,0.08)",
};

/**
 * Standalone RC Overlap (rule 19) table. One row per RC (vendor + material
 * + RC number), NOT per PO line — this is the dedicated section the client
 * asked for, separate from the PO Data & Results / PO-Wise Exceptions
 * tables, which no longer show rule 19 at all.
 *
 * `restrictedNotice` mirrors PoWiseExceptionsTable's prop of the same name:
 * the backend (rc-overlap-controller.js) scopes a Buyer's results down to
 * their own purchasing group server-side; this is just the matching UI
 * affordance so the buyer understands why the list is smaller than an
 * Admin/PM would see.
 *
 * The "Purchase Group(s)" column shows which purchasing group(s)' PO lines
 * actually reference each RC (derived server-side — see
 * engine.py's build_rc_purchase_groups()). Each chip prints BOTH the code
 * and the resolved name directly ("P15 — Packaging").
 *
 * Vendor is shown as code + resolved name (with GSTIN on hover), and
 * Purchase Group chips show resolved names — both sourced from
 * master-data.js via rc-overlap-controller.js's enrichRcOverlapRow().
 *
 * "Overlapping RC(s)" is the FIRST column (sticky-pinned to the left edge
 * of the scroll area) so it's visible without any horizontal scrolling.
 *
 * "Status" now shows the WHY inline for Not Verified rows, not just on
 * hover: r.remark (e.g. "Overlaps with RC(s): [...]") is rendered as a
 * small caption directly under the chip, so the reason is visible at a
 * glance without any interaction. A tooltip on the chip repeats the same
 * text for accessibility/mobile, but the caption is the primary surface.
 *
 * Sorting/searching here is client-side over the current page only, since
 * the backend already paginates and filters server-side (search box /
 * status dropdown re-fetch via onSearchChange / onStatusChange).
 */
const RcOverlapTable = ({
  rows = [],
  loading = false,
  total = 0,
  notVerifiedCount = 0,
  page = 1,
  pageCount = 1,
  onPageChange = () => {},
  search = "",
  onSearchChange = () => {},
  status = "",
  onStatusChange = () => {},
  onRowClick = () => {},
  title = "RC Overlap",
  infoText = "Every Rate Contract (RC) checked for overlapping validity periods against other RCs for the same vendor and material.",
  restrictedNotice,
}) => {
  const [orderBy, setOrderBy] = useState("rcNumber");
  const [order, setOrder] = useState("asc");

  const sortedRows = useMemo(() => {
    const sorted = [...rows].sort((a, b) => {
      const av = a[orderBy] ?? "";
      const bv = b[orderBy] ?? "";
      if (typeof av === "number" && typeof bv === "number") return order === "asc" ? av - bv : bv - av;
      return order === "asc" ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });
    return sorted;
  }, [rows, orderBy, order]);

  const toggleSort = (field) => {
    if (orderBy === field) {
      setOrder(order === "asc" ? "desc" : "asc");
    } else {
      setOrderBy(field);
      setOrder("asc");
    }
  };

  const headerCellSx = {
    height: 48, bgcolor: "#f8fafc", fontWeight: 700, color: "#475569",
    borderBottom: "2px solid", borderColor: "grey.100", whiteSpace: "nowrap",
    py: 0,
  };

  // "Overlapping RC(s)" moved to the front so it's visible without
  // horizontal scrolling (see overlapStickySx above for the pinned-column
  // treatment that backs this up on narrow viewports).
  const columns = [
    { key: "overlappingRcs", label: "Overlapping RC(s)", minWidth: 200 },
    { key: "rcNumber", label: "RC Number", minWidth: 140 },
    { key: "vendorCode", label: "Vendor", minWidth: 200 },
    { key: "rcMaterialCode", label: "Material Code", minWidth: 150 },
    { key: "purchaseGroups", label: "Purchase Group(s)", minWidth: 240 },
    { key: "validFrom", label: "Valid From", minWidth: 130 },
    { key: "validTo", label: "Valid To", minWidth: 130 },
    { key: "status", label: "Status", minWidth: 220 },
  ];

  const formatDate = (v) => {
    if (!v) return "—";
    const d = new Date(v);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("en-GB");
  };

  // Falls back to raw codes if purchaseGroupNames wasn't sent (e.g. a
  // stale cached response), so this never breaks even mid-rollout.
  const purchaseGroupChips = (r) => {
    if (r.purchaseGroupNames && r.purchaseGroupNames.length > 0) {
      return r.purchaseGroupNames;
    }
    return (r.purchaseGroups || []).map((code) => ({ code, name: code }));
  };

  // Human-readable fallback if the backend's `remark` is ever missing but
  // we still know what it overlaps with — so there's always SOME reason
  // shown, never a bare "Not Verified" with no explanation.
  const notVerifiedReason = (r) => {
    if (r.remark) return r.remark;
    if (r.overlappingRcs && r.overlappingRcs.length > 0) {
      return `Validity period overlaps with RC(s): ${r.overlappingRcs.join(", ")}`;
    }
    return "Could not be verified — reason not recorded.";
  };

  const renderCell = (col, r) => {
    switch (col.key) {
      case "validFrom":
        return formatDate(r.validFrom);
      case "validTo":
        return formatDate(r.validTo);
      case "vendorCode": {
        const nameKnown = r.vendorName && r.vendorName !== r.vendorCode;
        return (
          <Box>
            <Typography variant="body2" sx={{ fontWeight: 700, color: "#0f172a" }}>
              {r.vendorCode || "—"}
            </Typography>
            {nameKnown ? (
              <MuiTooltip title={r.vendorGstin ? `GSTIN: ${r.vendorGstin}` : ""} placement="bottom" arrow>
                <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block", maxWidth: 190 }}>
                  {r.vendorName}
                </Typography>
              </MuiTooltip>
            ) : (
              <Typography variant="caption" color="text.disabled">
                Name not on file
              </Typography>
            )}
          </Box>
        );
      }
      case "purchaseGroups": {
        const chips = purchaseGroupChips(r);
        return chips.length > 0 ? (
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
            {chips.map((g) => (
              <Chip
                key={g.code}
                size="small"
                label={g.name && g.name !== g.code ? `${g.code} — ${g.name}` : g.code}
                sx={{ height: 22, fontWeight: 700, fontSize: "0.7rem", bgcolor: "grey.100", color: "#334155" }}
              />
            ))}
          </Box>
        ) : (
          <Typography variant="body2" color="text.secondary">—</Typography>
        );
      }
      case "status": {
        const style = STATUS_COLORS[r.status] || { bg: "grey.100", color: "text.secondary" };
        const chip = (
          <Chip
            size="small"
            label={r.status || "—"}
            sx={{ height: 24, fontWeight: 700, fontSize: "0.75rem", bgcolor: style.bg, color: style.color }}
          />
        );
        if (r.status !== "Not Verified") {
          return chip;
        }
        // Not Verified: show the WHY as a visible caption directly under
        // the chip, not only on hover — reason should be readable at a
        // glance while scanning the table.
        const reason = notVerifiedReason(r);
        return (
          <Box>
            <MuiTooltip title={reason} placement="top" arrow>
              <span>{chip}</span>
            </MuiTooltip>
            <Typography
              variant="caption"
              sx={{ display: "block", color: "#b91c1c", mt: 0.5, maxWidth: 200, lineHeight: 1.3 }}
            >
              {reason}
            </Typography>
          </Box>
        );
      }
      case "overlappingRcs":
        return r.overlappingRcs && r.overlappingRcs.length > 0 ? (
          <MuiTooltip title={r.overlappingRcs.join(", ")}>
            <Typography variant="body2" noWrap sx={{ maxWidth: 220, color: "#dc2626", fontWeight: 600 }}>
              {r.overlappingRcs.join(", ")}
            </Typography>
          </MuiTooltip>
        ) : (
          <Typography variant="body2" color="text.secondary">None</Typography>
        );
      default:
        return r[col.key] ?? "—";
    }
  };

  return (
    <Paper elevation={0} sx={{
      p: 0, borderRadius: 4, background: "#ffffff", border: "1px solid",
      borderColor: "grey.100", boxShadow: "0 10px 30px -5px rgba(0,0,0,0.04)", overflow: "hidden",
    }}>
      <Box sx={{ p: 3, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 2 }}>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 800, color: "#0f172a", display: "flex", alignItems: "center" }}>
            {title}
            <Chip size="small" label={`${total} RC(s)`} sx={{ ml: 2, fontWeight: 700, bgcolor: alpha("#4f46e5", 0.1), color: "#4f46e5" }} />
            {notVerifiedCount > 0 && (
              <Chip
                size="small"
                label={`${notVerifiedCount} Not Verified`}
                sx={{ ml: 1, fontWeight: 700, bgcolor: alpha("#dc2626", 0.1), color: "#dc2626" }}
              />
            )}
            <InfoTip text={infoText} />
          </Typography>
          {restrictedNotice && (
            <Typography variant="caption" sx={{ color: "#64748b", fontWeight: 600, mt: 0.5, display: "block" }}>
              {restrictedNotice}
            </Typography>
          )}
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
          <TextField
            size="small"
            placeholder="Search RC no., vendor, material..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            InputProps={{
              startAdornment: <InputAdornment position="start"><SearchRoundedIcon fontSize="small" sx={{ color: "text.secondary" }} /></InputAdornment>,
              sx: { borderRadius: 3, bgcolor: "#f8fafc", "& fieldset": { borderColor: "transparent" }, "&:hover fieldset": { borderColor: "grey.300" } },
            }}
            sx={{ minWidth: 260 }}
          />
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <Select
              value={status}
              displayEmpty
              onChange={(e) => onStatusChange(e.target.value)}
              sx={{ borderRadius: 3, bgcolor: "#f8fafc" }}
            >
              <MenuItem value="">All Statuses</MenuItem>
              <MenuItem value="Verified">Verified</MenuItem>
              <MenuItem value="Not Verified">Not Verified</MenuItem>
            </Select>
          </FormControl>
        </Box>
      </Box>

      {loading ? (
        <Box sx={{ p: 3 }}><Skeleton variant="rectangular" height={320} sx={{ borderRadius: 2 }} /></Box>
      ) : (
        <Box sx={{ overflowX: "auto" }}>
          <Table size="medium" sx={{ minWidth: 1400 }}>
            <TableHead>
              <TableRow>
                {columns.map((c) => (
                  <TableCell
                    key={c.key}
                    sx={{
                      ...headerCellSx,
                      minWidth: c.minWidth,
                      ...(c.key === "overlappingRcs" ? overlapStickySx : {}),
                    }}
                  >
                    <TableSortLabel
                      active={orderBy === c.key}
                      direction={orderBy === c.key ? order : "asc"}
                      onClick={() => toggleSort(c.key)}
                    >
                      {c.label}
                    </TableSortLabel>
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {sortedRows.map((r) => (
                <TableRow
                  key={r.id}
                  hover
                  sx={{ cursor: "pointer", "&:last-child td": { border: 0 }, "&:hover": { bgcolor: alpha("#4f46e5", 0.04) } }}
                  onClick={() => onRowClick(r)}
                >
                  {columns.map((c) => (
                    <TableCell
                      key={c.key}
                      sx={{
                        whiteSpace: c.key === "purchaseGroups" || c.key === "vendorCode" || c.key === "status" ? "normal" : "nowrap",
                        verticalAlign: "top",
                        py: 1.25,
                        ...(c.key === "overlappingRcs" ? overlapStickySx : {}),
                      }}
                    >
                      {renderCell(c, r)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
              {sortedRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={columns.length} align="center" sx={{ color: "text.secondary", py: 4 }}>
                    No RC Overlap records found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Box>
      )}

      {pageCount > 1 && (
        <Box display="flex" justifyContent="center" sx={{ py: 2 }}>
          <Pagination count={pageCount} page={page} onChange={(_, v) => onPageChange(v)} color="primary" />
        </Box>
      )}
    </Paper>
  );
};

export default RcOverlapTable;