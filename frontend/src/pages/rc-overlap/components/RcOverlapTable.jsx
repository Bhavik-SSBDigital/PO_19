import { useMemo, useState } from "react";
import {
  Box,
  Paper,
  Skeleton,
  Typography,
  Chip,
  TextField,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  TableSortLabel,
  InputAdornment,
  alpha,
  MenuItem,
  Select,
  FormControl,
  Pagination,
  Tooltip as MuiTooltip,
  IconButton,
  Popover,
} from "@mui/material";

import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import LockRoundedIcon from "@mui/icons-material/LockRounded";
import LockOpenRoundedIcon from "@mui/icons-material/LockOpenRounded";
import ChatBubbleOutlineRoundedIcon from "@mui/icons-material/ChatBubbleOutlineRounded";

import RcRemarkPanel from "pages/rc-overlap/components/RcRemarkPanel";

const STATUS_COLORS = {
  Verified: {
    bg: alpha("#059669", 0.1),
    color: "#059669",
  },
  "Not Verified": {
    bg: alpha("#dc2626", 0.1),
    color: "#dc2626",
  },
};

const InfoTip = ({ text }) => {
  if (!text) return null;

  return (
    <MuiTooltip
      title={text}
      placement="top"
      arrow
      enterTouchDelay={0}
    >
      <InfoOutlinedIcon
        sx={{
          fontSize: 18,
          ml: 0.75,
          color: "text.disabled",
          cursor: "help",
          verticalAlign: "text-bottom",
          transition: "color 0.2s",
          "&:hover": {
            color: "#4f46e5",
          },
        }}
      />
    </MuiTooltip>
  );
};

const overlapStickySx = {
  position: "sticky",
  left: 0,
  zIndex: 2,
  bgcolor: "#fff",
  boxShadow: "2px 0 4px -2px rgba(0,0,0,0.08)",
};

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
  infoText =
    "Every Rate Contract (RC) checked for overlapping validity periods against other RCs for the same vendor and material.",
  restrictedNotice,
  roleFlags,
  currentUserId,
  onChanged = () => {},
}) => {
  const [orderBy, setOrderBy] = useState("rcNumber");
  const [order, setOrder] = useState("asc");

  const [quickRemarkAnchor, setQuickRemarkAnchor] = useState(null);
  const [quickRemarkRow, setQuickRemarkRow] = useState(null);

  const openQuickRemark = (event, row) => {
    event.stopPropagation();

    setQuickRemarkAnchor(event.currentTarget);
    setQuickRemarkRow(row);
  };

  const closeQuickRemark = () => {
    setQuickRemarkAnchor(null);
    setQuickRemarkRow(null);
  };

  const sortedRows = useMemo(() => {
    const sorted = [...rows].sort((a, b) => {
      const av = a[orderBy] ?? "";
      const bv = b[orderBy] ?? "";

      if (typeof av === "number" && typeof bv === "number") {
        return order === "asc" ? av - bv : bv - av;
      }

      return order === "asc"
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
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
    height: 48,
    bgcolor: "#f8fafc",
    fontWeight: 700,
    color: "#475569",
    borderBottom: "2px solid",
    borderColor: "grey.100",
    whiteSpace: "nowrap",
    py: 0,
  };

  const columns = [
    {
      key: "overlappingRcs",
      label: "Overlapping RC(s)",
      minWidth: 200,
    },
    {
      key: "rcNumber",
      label: "RC Number",
      minWidth: 140,
    },
    {
      key: "vendorCode",
      label: "Vendor",
      minWidth: 200,
    },
    {
      key: "rcMaterialCode",
      label: "Material Code",
      minWidth: 150,
    },
    {
      key: "purchaseGroups",
      label: "Purchase Group(s)",
      minWidth: 240,
    },
    {
      key: "validFrom",
      label: "Valid From",
      minWidth: 130,
    },
    {
      key: "validTo",
      label: "Valid To",
      minWidth: 130,
    },
    {
      key: "status",
      label: "Status",
      minWidth: 220,
    },
    {
      key: "remarksLocked",
      label: "Buyer Check",
      minWidth: 170,
    },
  ];

  const formatDate = (value) => {
    if (!value) return "—";

    const d = new Date(value);

    if (isNaN(d.getTime())) return "—";

    return d.toLocaleDateString("en-GB");
  };

  const purchaseGroupChips = (row) => {
    if (
      row.purchaseGroupNames &&
      row.purchaseGroupNames.length > 0
    ) {
      return row.purchaseGroupNames;
    }

    return (row.purchaseGroups || []).map((code) => ({
      code,
      name: code,
    }));
  };

  const notVerifiedReason = (row) => {
    if (row.remark) return row.remark;

    if (
      row.overlappingRcs &&
      row.overlappingRcs.length > 0
    ) {
      return `Validity period overlaps with RC(s): ${row.overlappingRcs.join(
        ", "
      )}`;
    }

    return "Could not be verified — reason not recorded.";
  };

  const renderCell = (column, row) => {
    switch (column.key) {
      case "validFrom":
        return formatDate(row.validFrom);

      case "validTo":
        return formatDate(row.validTo);

      case "vendorCode": {
        const nameKnown =
          row.vendorName &&
          row.vendorName !== row.vendorCode;

        return (
          <Box sx={{ minWidth: 0 }}>
            <Typography
              variant="body2"
              sx={{
                fontWeight: 700,
                color: "#0f172a",
              }}
            >
              {row.vendorCode || "—"}
            </Typography>

            {nameKnown ? (
              <MuiTooltip
                title={
                  row.vendorGstin
                    ? `GSTIN: ${row.vendorGstin}`
                    : ""
                }
                placement="bottom"
                arrow
              >
                <Typography
                  variant="caption"
                  color="text.secondary"
                  noWrap
                  sx={{
                    display: "block",
                    maxWidth: 190,
                  }}
                >
                  {row.vendorName}
                </Typography>
              </MuiTooltip>
            ) : (
              <Typography
                variant="caption"
                color="text.disabled"
              >
                Name not on file
              </Typography>
            )}
          </Box>
        );
      }

      case "purchaseGroups": {
        const chips = purchaseGroupChips(row);

        return chips.length > 0 ? (
          <Box
            sx={{
              display: "flex",
              flexWrap: "wrap",
              gap: 0.5,
              minWidth: 0,
            }}
          >
            {chips.map((group, index) => (
              <Chip
                key={`${group.code}-${index}`}
                size="small"
                label={
                  group.name &&
                  group.name !== group.code
                    ? `${group.code} — ${group.name}`
                    : group.code
                }
                sx={{
                  height: 22,
                  maxWidth: "100%",
                  fontWeight: 700,
                  fontSize: "0.7rem",
                  bgcolor: "grey.100",
                  color: "#334155",
                }}
              />
            ))}
          </Box>
        ) : (
          <Typography
            variant="body2"
            color="text.secondary"
          >
            —
          </Typography>
        );
      }

      case "status": {
        const style =
          STATUS_COLORS[row.status] || {
            bg: "grey.100",
            color: "text.secondary",
          };

        const chip = (
          <Chip
            size="small"
            label={row.status || "—"}
            sx={{
              height: 24,
              fontWeight: 700,
              fontSize: "0.75rem",
              bgcolor: style.bg,
              color: style.color,
            }}
          />
        );

        if (row.status !== "Not Verified") {
          return chip;
        }

        const reason = notVerifiedReason(row);

        return (
          <Box sx={{ minWidth: 0 }}>
            <MuiTooltip
              title={reason}
              placement="top"
              arrow
            >
              <span>{chip}</span>
            </MuiTooltip>

            <Typography
              variant="caption"
              sx={{
                display: "block",
                color: "#b91c1c",
                mt: 0.5,
                maxWidth: 200,
                lineHeight: 1.3,
                wordBreak: "break-word",
                overflowWrap: "anywhere",
              }}
            >
              {reason}
            </Typography>
          </Box>
        );
      }

      case "remarksLocked":
        return (
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 0.75,
              minWidth: 0,
            }}
          >
            {row.remarksLocked ? (
              <Chip
                size="small"
                icon={
                  <LockRoundedIcon fontSize="small" />
                }
                label="Closed"
                sx={{
                  fontWeight: 700,
                  bgcolor: alpha("#059669", 0.1),
                  color: "#059669",
                }}
              />
            ) : (
              <Chip
                size="small"
                icon={
                  <LockOpenRoundedIcon fontSize="small" />
                }
                label="Open"
                sx={{
                  fontWeight: 700,
                  bgcolor: alpha("#d97706", 0.1),
                  color: "#d97706",
                }}
              />
            )}

            {!row.remarksLocked &&
              roleFlags?.isBuyer && (
                <MuiTooltip
                  title="Add a quick remark"
                  placement="top"
                  arrow
                >
                  <IconButton
                    size="small"
                    onClick={(event) =>
                      openQuickRemark(event, row)
                    }
                    sx={{
                      color: "#4f46e5",
                      flexShrink: 0,
                    }}
                  >
                    <ChatBubbleOutlineRoundedIcon fontSize="small" />
                  </IconButton>
                </MuiTooltip>
              )}
          </Box>
        );

      case "overlappingRcs":
        return row.overlappingRcs &&
          row.overlappingRcs.length > 0 ? (
          <MuiTooltip
            title={row.overlappingRcs.join(", ")}
          >
            <Typography
              variant="body2"
              noWrap
              sx={{
                maxWidth: 220,
                color: "#dc2626",
                fontWeight: 600,
              }}
            >
              {row.overlappingRcs.join(", ")}
            </Typography>
          </MuiTooltip>
        ) : (
          <Typography
            variant="body2"
            color="text.secondary"
          >
            None
          </Typography>
        );

      default:
        return row[column.key] ?? "—";
    }
  };

  return (
    <Paper
      elevation={0}
      sx={{
        p: 0,
        borderRadius: 4,
        background: "#ffffff",
        border: "1px solid",
        borderColor: "grey.100",
        boxShadow:
          "0 10px 30px -5px rgba(0,0,0,0.04)",
        overflow: "hidden",
        minWidth: 0,
      }}
    >
      {/* HEADER */}
      <Box
        sx={{
          p: 3,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 2,
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography
            variant="h6"
            sx={{
              fontWeight: 800,
              color: "#0f172a",
              display: "flex",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 1,
            }}
          >
            {title}

            <Chip
              size="small"
              label={`${total} RC(s)`}
              sx={{
                fontWeight: 700,
                bgcolor: alpha("#4f46e5", 0.1),
                color: "#4f46e5",
              }}
            />

            {notVerifiedCount > 0 && (
              <Chip
                size="small"
                label={`${notVerifiedCount} Not Verified`}
                sx={{
                  fontWeight: 700,
                  bgcolor: alpha("#dc2626", 0.1),
                  color: "#dc2626",
                }}
              />
            )}

            <InfoTip text={infoText} />
          </Typography>

          {restrictedNotice && (
            <Typography
              variant="caption"
              sx={{
                color: "#64748b",
                fontWeight: 600,
                mt: 0.5,
                display: "block",
              }}
            >
              {restrictedNotice}
            </Typography>
          )}
        </Box>

        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1.5,
            flexWrap: "wrap",
          }}
        >
          <TextField
            size="small"
            placeholder="Search RC no., vendor, material..."
            value={search}
            onChange={(event) =>
              onSearchChange(event.target.value)
            }
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchRoundedIcon
                    fontSize="small"
                    sx={{
                      color: "text.secondary",
                    }}
                  />
                </InputAdornment>
              ),
              sx: {
                borderRadius: 3,
                bgcolor: "#f8fafc",
                "& fieldset": {
                  borderColor: "transparent",
                },
                "&:hover fieldset": {
                  borderColor: "grey.300",
                },
              },
            }}
            sx={{
              minWidth: 260,
            }}
          />

          <FormControl
            size="small"
            sx={{
              minWidth: 160,
            }}
          >
            <Select
              value={status}
              displayEmpty
              onChange={(event) =>
                onStatusChange(event.target.value)
              }
              sx={{
                borderRadius: 3,
                bgcolor: "#f8fafc",
              }}
            >
              <MenuItem value="">
                All Statuses
              </MenuItem>

              <MenuItem value="Verified">
                Verified
              </MenuItem>

              <MenuItem value="Not Verified">
                Not Verified
              </MenuItem>
            </Select>
          </FormControl>
        </Box>
      </Box>

      {/* TABLE */}
      {loading ? (
        <Box sx={{ p: 3 }}>
          <Skeleton
            variant="rectangular"
            height={320}
            sx={{ borderRadius: 2 }}
          />
        </Box>
      ) : (
        <Box
          sx={{
            overflowX: "auto",
            overflowY: "visible",
            position: "relative",
          }}
        >
          <Table
            size="medium"
            sx={{
              minWidth: 1500,
            }}
          >
            <TableHead>
              <TableRow>
                {columns.map((column) => (
                  <TableCell
                    key={column.key}
                    sx={{
                      ...headerCellSx,
                      minWidth: column.minWidth,
                      ...(column.key === "overlappingRcs"
                        ? overlapStickySx
                        : {}),
                    }}
                  >
                    <TableSortLabel
                      active={orderBy === column.key}
                      direction={
                        orderBy === column.key
                          ? order
                          : "asc"
                      }
                      onClick={() =>
                        toggleSort(column.key)
                      }
                    >
                      {column.label}
                    </TableSortLabel>
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>

            <TableBody>
              {sortedRows.map((row) => (
                <TableRow
                  key={row.id}
                  hover
                  sx={{
                    cursor: "pointer",
                    "&:last-child td": {
                      border: 0,
                    },
                    "&:hover": {
                      bgcolor: alpha(
                        "#4f46e5",
                        0.04
                      ),
                    },
                  }}
                  onClick={() =>
                    onRowClick(row)
                  }
                >
                  {columns.map((column) => (
                    <TableCell
                      key={column.key}
                      sx={{
                        whiteSpace:
                          column.key ===
                            "purchaseGroups" ||
                          column.key ===
                            "vendorCode" ||
                          column.key === "status"
                            ? "normal"
                            : "nowrap",
                        verticalAlign: "top",
                        py: 1.25,
                        ...(column.key ===
                        "overlappingRcs"
                          ? overlapStickySx
                          : {}),
                      }}
                    >
                      {renderCell(column, row)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}

              {sortedRows.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={columns.length}
                    align="center"
                    sx={{
                      color: "text.secondary",
                      py: 4,
                    }}
                  >
                    No RC Overlap records found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Box>
      )}

      {/* PAGINATION */}
      {pageCount > 1 && (
        <Box
          display="flex"
          justifyContent="center"
          sx={{ py: 2 }}
        >
          <Pagination
            count={pageCount}
            page={page}
            onChange={(_, value) =>
              onPageChange(value)
            }
            color="primary"
          />
        </Box>
      )}

      {/* ============================================================
          QUICK REMARK POPOVER
          ============================================================ */}
      <Popover
        open={Boolean(quickRemarkAnchor)}
        anchorEl={quickRemarkAnchor}
        onClose={closeQuickRemark}
        onClick={(event) => event.stopPropagation()}
        marginThreshold={12}
        anchorOrigin={{
          vertical: "bottom",
          horizontal: "right",
        }}
        transformOrigin={{
          vertical: "top",
          horizontal: "right",
        }}
        PaperProps={{
          elevation: 8,
          sx: {
            // HARD WIDTH — this is important.
            width: {
              xs: "calc(100vw - 24px)",
              sm: "360px",
            },

            // Never allow it to exceed the viewport.
            maxWidth: "calc(100vw - 24px)",

            // Never allow the popup to become taller than
            // the visible screen.
            maxHeight: "calc(100vh - 24px)",

            // If content becomes tall, scroll INSIDE popup.
            overflowX: "hidden",
            overflowY: "auto",

            borderRadius: 2.5,
            boxSizing: "border-box",

            // Prevent any child from visually stretching it.
            "& > *": {
              maxWidth: "100%",
              minWidth: 0,
              boxSizing: "border-box",
            },
          },
        }}
      >
        <Box
          sx={{
            width: "100%",
            maxWidth: "100%",
            minWidth: 0,
            boxSizing: "border-box",
            p: {
              xs: 1.5,
              sm: 2,
            },
            overflow: "hidden",
          }}
        >
          {quickRemarkRow && (
            <RcRemarkPanel
              compact
              rcId={quickRemarkRow.id}
              roleFlags={roleFlags}
              currentUserId={currentUserId}
              onChanged={() => {
                onChanged();
              }}
            />
          )}
        </Box>
      </Popover>
    </Paper>
  );
};

export default RcOverlapTable;