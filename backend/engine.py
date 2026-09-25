#!/usr/bin/env python3
import argparse
import csv
import json
import os
import re
from collections import defaultdict
from datetime import datetime, timedelta

import pandas as pd

# ============================================================================
# CHANGELOG (see point_guide.md - this is the running log of every rule
# change, kept here so future edits know why a check does what it does)
#
# THIS REVISION:
#   - Points #6 (EYW freight required) and #7 (EXW/FCA must not have
#     freight) now return Data Missing ("Manual"/"MANUAL") instead of a
#     false Not Verified (#6) or false Verified (#7) when the PO has ZERO
#     matching rows at all in that batch's POAUDITCND file. Previously an
#     empty cnd_by_po.get(po_number, []) list was indistinguishable from
#     "CND has rows for this PO but none are freight-type", so a PO that
#     was simply never captured in the condition extract silently got a
#     confident-looking wrong verdict instead of a flag to check manually.
#     See _po_missing_from_cnd(). Confirmed against real data (2026-09):
#     24 POs / 58 lines across multiple batches were affected before this
#     fix; backfilled retroactively via scripts/fix-point6-7-data-missing.js.
#   - build_po_header_records()'s multi-line verdict aggregation now also
#     prioritizes MANUAL/MANUAL_CHECK above NA (previously only
#     NOT_VERIFIED > VERIFIED > NA was considered, so a genuinely
#     Data-Missing line could be hidden behind an NA line from another
#     line item on the same PO for a header-level point).
#
# PREVIOUS REVISION:
#   - RC Overlap `purchaseGroups` is now read DIRECTLY from the RC master's
#     own "Purchase group" column instead of being derived by cross-
#     referencing the current batch's POAUDIT PO lines. The old approach
#     (build_rc_purchase_groups(po_rows), now REMOVED) had two bugs stacked
#     on top of each other:
#       1. NOT CUMULATIVE - it only looked at whichever PO lines happened
#          to be in the CURRENT POAUDIT batch. An RC not referenced by any
#          PO line in this run's extract got purchaseGroups=[] even if it
#          had a group before, and addrc.js does a wholesale field replace
#          on every re-import, so that emptiness stuck permanently.
#       2. VENDOR CODE FORMAT MISMATCH - the join matched on raw Vendor
#          Code strings with no normalization, so a merged/cumulative RC
#          master containing both zero-padded ("0000200683") and bare
#          ("200683") vendor codes from different source extracts would
#          silently fail to match whichever format the current POAUDIT
#          batch happened to use, producing purchaseGroups=[] even when a
#          perfectly good Purchase group value existed.
#     CONFIRMED against a real POAUDITRC sample (2026-09-22): the file
#     already carries a "Purchase group" column directly on every RC line
#     (one value per RC number + material + vendor combination), making
#     the PO cross-reference unnecessary. This is deterministic per RC
#     row, immune to the vendor-code padding issue, and inherits the RC
#     master's own cumulative nature (see merge-rc-master.js) automatically.
#
# EARLIER REVISION:
#   - Point 4 (MSME payment term): the allowed payment-term set now ALSO
#     includes Z107 (100% after satisfactory commissioning), Z112 (quarterly
#     advance), Z147 (half yearly advance) and Z154 (on receipt of periodical
#     bills), in addition to Z100, Z101, Z102, Z105, Z126, Z146, Z148.
#   - Point 9 (multiple POs, same Vendor/Purchasing Group/Plant/Purchasing
#     Date) is now CUMULATIVE: the current batch is checked against the
#     current batch PLUS every PO processed in earlier runs, not only the POs
#     inside a single file. engine.py has no DB access, so - exactly like the
#     cumulative RC master - the history lives in a small file
#     (data/po9_history.csv, see --po9-history). Each run:
#         * checks the current batch against (current batch + history),
#         * replaces the history rows of any PO present in the current batch
#           (re-running a file never creates duplicates),
#         * removes history rows of POs that are now fully deleted
#           (every line Deletion indicator 'L'),
#         * writes the updated history back at the end of the run.
#     Vendor Code is compared with leading zeros stripped, because the same
#     vendor can be exported as "0000208190" in one file and "208190" in
#     another.
#
#   - Point 15 replaced/confirmed: now (and going forward) an RC-material-
#     -validity check (PO Type ZLRM/ZLCP only), not the old "PO Qty vs PR
#     Qty" logic - the DB text in seed-point-definitions.js had drifted and
#     was still describing the old PO-Qty-vs-PR-Qty logic; fixed in the same
#     change per point_guide.md. Also added: when the PO's RC no. matches a
#     valid RC and MULTIPLE RCs are valid for that material on that date,
#     the other valid RC number(s) are now listed in the Verified remark.
#   - Point 15 / RC Overlap now formally require the RC master to be
#     CUMULATIVE (every RC file received is merged into history, never
#     overwritten) - see merge-rc-master.js and the --rc argument's help
#     text below. engine.py itself is unchanged for this - it already just
#     reads whatever file --rc points at; the cumulative behavior lives in
#     the merge step that must run before engine.py now.
#   - Point 6 (EYW freight condition): now also requires the matched
#     freight condition's VALUE to be > INR 0.00, not just the condition
#     type being present. See FREIGHT_CONDITION_VALUE_COLUMNS,
#     _condition_value(), _freight_condition_value_match(). Column name
#     CONFIRMED as "Condition value" against a real POAUDITCND sample
#     (2026-09-18) - falls back to Manual Check only if none of the
#     fallback-cased names are found at all.
#   - Global exclusions (PO Type ZSTO; PO Type ZJVW/ZVJW with Net Price
#     INR 0/0.01/1) were ALREADY implemented in a prior revision
#     (_is_excluded_line / JOB_WORK_PO_TYPES / ZSTO_PO_TYPE) and apply to
#     every point automatically via evaluate_rule() - reconfirmed, no
#     change needed.
# ============================================================================

VERIFIED = "Verified"
NOT_VERIFIED = "Not Verified"
NA = "Not Applicable"
MANUAL = "Data Missing"
MANUAL_CHECK = "Manual Check"

FREIGHT_CONDITION_TYPES = {"ZBF1", "ZBF2", "ZRA3", "ZRB3", "ZRE3", "ZFB5"}

# Point 6 (EYW inco-term) needs more than "is a freight condition type
# present" - the condition's VALUE must also be > INR 0.00. CONFIRMED
# against a real POAUDITCND sample (2026-09-18): the column is literally
# named "Condition value" (lowercase v). Kept as a list, with that
# confirmed name first, so a differently-cased export still works without
# a code change.
FREIGHT_CONDITION_VALUE_COLUMNS = (
    "Condition value",
    "Condition Value",
    "Amount",
    "Condition Amount",
    "Net value",
)

NON_FREIGHT_REFERENCE_CONDITION_TYPES = {
    "R000", "NAVM", "PBXX", "NAVS", "JEXS", "ZPB0", "R001", "ZIB2", "ZPB1",
}
DWS_APPROVERS = {"KKB", "SRS", "PJP", "DAULAT", "NHV", "CVS"}

# Point 4 - payment terms allowed for MSME vendors.
MSME_PAYMENT_TERMS = {
    "Z100": {"days": 15, "desc": "15 DAYS CREDIT"},
    "Z101": {"days": 30, "desc": "30 DAYS CREDIT"},
    "Z102": {"days": 45, "desc": "45 DAYS CREDIT"},
    "Z146": {"days": 10, "desc": "10 DAYS CREDIT"},
    "Z148": {"days": 21, "desc": "21 DAYS CREDIT"},
    "Z105": {"days": None, "desc": "100% ADVANCE AGAINST PI"},
    "Z126": {"days": None, "desc": "PAYMENT AS PER NOTE"},
    "Z107": {"days": None, "desc": "100% AFTER SATISFACTORY COMMISSIONING"},
    "Z112": {"days": None, "desc": "QUARTERLY ADVANCE"},
    "Z147": {"days": None, "desc": "HALF YEARLY ADVANCE"},
    "Z154": {"days": None, "desc": "ON RECEIPT OF PERIODICAL BILLS"},
}

GENERAL_TERM_EXCLUDED_PURCHASE_GROUPS = {"P46", "P02", "P43"}
GENERAL_TERM_EXCLUDED_PAYMENT_TERMS = {"Z105", "Z126", "Z142"}
GUJARAT_STATE_CODE = "GJ"

VALID_PURCHASE_GROUPS = {
    "P02", "P09", "P13", "P14", "P15", "P16", "P43", "P46",
    "P55", "P60", "P61", "P64", "P62",
}

RC_PLACEHOLDER_PO_TYPES = {"ZTWK"}

PR_RELEASED_VALUES = {"2"}
RC_RELEASED_VALUES = {"R"}

SIX_MONTHS_DAYS = 180

RETURN_ITEM_COLUMN = "Returns Item"
DELETION_INDICATOR_COLUMN = "Deletion indicator"

EXCLUDED_LINE_REMARK = (
    "Not Applicable - line item excluded from all audit points "
    "(Deletion indicator 'L' and/or Returns Item 'X')"
)

ZSTO_PO_TYPE = "ZSTO"
JOB_WORK_PO_TYPES = {"ZJVW", "ZVJW"}
JOB_WORK_LOW_VALUE_NET_PRICES = {0.0, 0.01, 1.0}
NET_PRICE_COLUMN = "Net price"

MANUAL_CHECK_PO_TYPES = {"ZIRM", "ZICP"}

GSTIN_COLUMN = "Tax Number 3"
GST_STATE_CODE_MAP = {
    "01": "JAMMU AND KASHMIR", "02": "HIMACHAL PRADESH", "03": "PUNJAB",
    "04": "CHANDIGARH", "05": "UTTARAKHAND", "06": "HARYANA", "07": "DELHI",
    "08": "RAJASTHAN", "09": "UTTAR PRADESH", "10": "BIHAR", "11": "SIKKIM",
    "12": "ARUNACHAL PRADESH", "13": "NAGALAND", "14": "MANIPUR",
    "15": "MIZORAM", "16": "TRIPURA", "17": "MEGHALAYA", "18": "ASSAM",
    "19": "WEST BENGAL", "20": "JHARKHAND", "21": "ODISHA",
    "22": "CHHATTISGARH", "23": "MADHYA PRADESH", "24": "GUJARAT",
    "26": "DADRA AND NAGAR HAVELI AND DAMAN AND DIU", "27": "MAHARASHTRA",
    "29": "KARNATAKA", "30": "GOA", "31": "LAKSHADWEEP", "32": "KERALA",
    "33": "TAMIL NADU", "34": "PUDUCHERRY", "35": "ANDAMAN AND NICOBAR ISLANDS",
    "36": "TELANGANA", "37": "ANDHRA PRADESH", "38": "LADAKH",
}

PURCHASING_DATE_COLUMN = "PO Date(Doc date)"
RFQ_NO_COLUMN = "order acknowledgement"

# Point 9 cumulative history: the compact per-PO fields that are enough to
# re-run the "multiple POs, same vendor/group/plant/date" comparison later.
PO9_HISTORY_COLUMNS = [
    "PO number",
    "Vendor Code",
    "Purchase Group",
    "Plant",
    PURCHASING_DATE_COLUMN,
    "PO Type",
    RFQ_NO_COLUMN,
]
DEFAULT_PO9_HISTORY_PATH = "data/po9_history.csv"

# RC master column carrying the RC's assigned purchasing group directly.
# CONFIRMED against a real POAUDITRC sample (2026-09-22): the header is
# literally "Purchase group" (lowercase g).
RC_PURCHASE_GROUP_COLUMN = "Purchase group"


def _state_from_gstin(gstin_raw):
    g = (gstin_raw or "").strip().upper()
    if len(g) < 2 or not g[:2].isdigit():
        return None
    return GST_STATE_CODE_MAP.get(g[:2])


def _normalize_category_tokens(category_raw):
    c = (category_raw or "").upper()
    c = c.replace(" ", "")
    c = re.sub(r"\+TCS$", "", c)
    parts = sorted(p for p in c.split("+") if p)
    return "+".join(parts)


GST_LOCAL_TOKENS = {_normalize_category_tokens("SGST+CGST"), _normalize_category_tokens("CGST+SGST")}
GST_IGST_TOKENS = {_normalize_category_tokens("IGST")}
GST_NOT_APPLICABLE_TOKENS = {
    _normalize_category_tokens(x)
    for x in [
        "VAT", "VAT,ED", "VAT,EXCISE", "VAT,ST", "VAT,TCS,ED",
        "CST", "CST,ED", "CST,EXCISE", "CST,ST", "CST EXEMPTED",
        "ED", "EXCISE", "ST", "ST (WORKS CONTRACT)",
        "WORKS CONTRACTS", "NGP WORKS CONTRACTS",
        "GTA", "GTA EXEMPTION",
        "NO GST", "GST EXEMPTED", "GST EXEMPTED+TCS", "OUT OF GST",
        "INPUT TAX", "OUTPUT TAX", "COMPOSIT SCHEME", "SEZ", "REG",
        "NGP", "NGP,ED", "NGP,ST", "NGP RD,ED",
    ]
}

ITEM_CATEGORY_CODE_MAP = {
    "0": {"desc": "Standard", "letter": None},
    "1": {"desc": "Limit", "letter": "B"},
    "2": {"desc": "Consignment", "letter": "K"},
    "3": {"desc": "Subcontracting", "letter": "L"},
    "4": {"desc": "Material unknown", "letter": "M"},
    "5": {"desc": "Third-party", "letter": "S"},
    "6": {"desc": "Text", "letter": "T"},
    "7": {"desc": "Stock transfer", "letter": "U"},
    "8": {"desc": "Material group", "letter": "W"},
    "9": {"desc": "Service", "letter": "D"},
}

ITEM_CATEGORY_CODES_SEEN_IN_DATA = {"0", "3", "7", "9"}

ITEM_CATEGORY_SERVICE_CODE = next(
    code for code, v in ITEM_CATEGORY_CODE_MAP.items() if v["letter"] == "D"
)
ITEM_CATEGORY_SUBCONTRACTING_CODE = next(
    code for code, v in ITEM_CATEGORY_CODE_MAP.items() if v["letter"] == "L"
)

RATE_APPROVAL_TAG_TOKENS = {
    "DWSAPPROVED", "DWSAAPPROVED", "DWSAPPROVAL", "DWSAPPROVE",
}


def _is_rate_approval_tag(our_ref_raw):
    normalized = re.sub(r"[\s\-]", "", (our_ref_raw or "").upper())
    return any(token in normalized for token in RATE_APPROVAL_TAG_TOKENS)


DWS_PO_NUMBER_COLUMN = "po_number"
DWS_APPROVER_USERNAME_COLUMN = "dws_approver_username"
DWS_APPROVER_IS_MANAGER_COLUMN = "dws_approver_is_manager"
DWS_DECISION_AT_COLUMN = "dws_decision_at"
DWS_PROCESS_STATUS_COLUMN = "dws_process_status"


ASSUMPTIONS = []


def log_assumption(rule_no, text):
    ASSUMPTIONS.append({"Rule": rule_no, "Assumption": text})


def parse_sap_date(value):
    if value is None:
        return None
    v = str(value).strip()
    if not v or v == "00000000":
        return None
    if v.isdigit() and len(v) < 8:
        return datetime(1899, 12, 30) + timedelta(days=int(v))
    try:
        return datetime.strptime(v, "%Y%m%d")
    except ValueError:
        try:
            return datetime.fromisoformat(v.split(" ")[0])
        except ValueError:
            return None


def parse_sap_number(value):
    if value is None:
        return None
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return float(value)
    v = str(value).strip()
    if not v:
        return None
    negative = v.endswith("-")
    v = v.rstrip("-").strip()
    v = v.replace(",", "")
    try:
        n = float(v)
    except ValueError:
        return None
    return -n if negative else n


def s(row, col):
    return str(row.get(col, "") or "").strip()


def normalize_tax_code(value):
    s_ = str(value).strip().upper()
    if not s_:
        return s_
    if re.match(r"^\d+\.0$", s_):
        s_ = s_[:-2]
    s_ = re.sub(r"^0+(?=\d)", "", s_)
    return s_


EXCEL_EXTENSIONS = {".xlsx", ".xlsm", ".xls"}
CSV_EXTENSIONS = {".csv", ".txt"}

PO_DATE_COLUMNS = ("PO Created date", "PO Date(Doc date)", "PR Creation date", "Delivery Date")
RC_DATE_COLUMNS = ("RC valid from", "RC valid to")


def normalize_sap_date(value):
    if value is None:
        return ""

    if isinstance(value, float):
        try:
            if pd.isna(value):
                return ""
        except Exception:
            pass

    if isinstance(value, datetime):
        return value.strftime("%Y%m%d")
    if hasattr(value, "to_pydatetime"):
        try:
            return value.to_pydatetime().strftime("%Y%m%d")
        except Exception:
            pass

    if isinstance(value, (int, float)) and not isinstance(value, bool):
        ival = int(value)
        if ival == 0:
            return ""
        if 1 <= ival <= 100000:
            try:
                return (datetime(1899, 12, 30) + timedelta(days=ival)).strftime("%Y%m%d")
            except Exception:
                return ""
        value = str(ival)

    v = str(value).strip()
    if not v or v in {"00000000", "nan", "NaT", "None"}:
        return ""

    if re.match(r"^\d{8}$", v):
        return v

    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})", v)
    if m:
        return f"{m.group(1)}{m.group(2)}{m.group(3)}"

    m = re.match(r"^(\d{1,2})[.\-](\d{1,2})[.\-](\d{4})$", v)
    if m:
        day, month, year = m.groups()
        return f"{year}{int(month):02d}{int(day):02d}"

    m = re.match(r"^(\d{1,2})/(\d{1,2})/(\d{4})$", v)
    if m:
        month, day, year = m.groups()
        return f"{year}{int(month):02d}{int(day):02d}"

    try:
        return datetime.fromisoformat(v.split(" ")[0]).strftime("%Y%m%d")
    except Exception:
        return v


def load_table(path):
    ext = os.path.splitext(path)[1].lower()

    if ext in EXCEL_EXTENSIONS:
        df = pd.read_excel(path, dtype=object).fillna("")
        return df.to_dict(orient="records")
    elif ext in CSV_EXTENSIONS:
        with open(path, encoding="latin-1") as f:
            return list(csv.DictReader(f))
    else:
        raise ValueError(
            f"Unsupported file type '{ext}' for {path} - expected one of "
            f"{sorted(EXCEL_EXTENSIONS | CSV_EXTENSIONS)}"
        )


def load_all(poaudit_path, cnd_path, rc_path):
    po_rows = load_table(poaudit_path)
    cnd_rows = load_table(cnd_path)
    rc_rows = load_table(rc_path)

    for row in po_rows:
        for col in PO_DATE_COLUMNS:
            if col in row:
                row[col] = normalize_sap_date(row[col])

    for row in rc_rows:
        for col in RC_DATE_COLUMNS:
            if col in row:
                row[col] = normalize_sap_date(row[col])

    cnd_by_po = defaultdict(list)
    for r in cnd_rows:
        cnd_by_po[s(r, "PO NO")].append(r)

    return po_rows, cnd_rows, rc_rows, cnd_by_po


def load_dws_rate_approvals(path):
    if not path:
        log_assumption(
            8,
            "No --dws file was supplied to this run, so point #8 (Rate Approval) "
            "could not look up any DWS data and returned Not Applicable for every "
            "PO. Run dws_rate_approval_extract.js first and pass its output via "
            "--dws to get real results for this point.",
        )
        return {}
    rows = load_table(path)
    by_po = {}
    for r in rows:
        po = s(r, DWS_PO_NUMBER_COLUMN)
        if po:
            by_po[po] = r
    return by_po


def filter_to_scope(po_rows):
    in_scope = [r for r in po_rows if s(r, "Purchase Group") in VALID_PURCHASE_GROUPS]
    dropped = len(po_rows) - len(in_scope)
    if dropped:
        log_assumption(
            "Scope",
            f"{dropped} of {len(po_rows)} PO line(s) were excluded from the audit because their "
            f"Purchase Group was not in the sheet's confirmed list ({sorted(VALID_PURCHASE_GROUPS)}). "
            f"The sheet's header note also says 'and PO Type' should further scope the data, but "
            f"does not say which PO types - that half of the filter was NOT applied."
        )
    return in_scope


def load_tax_master(base_folder):
    parent_dir = os.path.dirname(base_folder)
    path = os.path.join(parent_dir, "Masters", "TAX code Master - Working.xlsx")

    if not os.path.exists(path):
        path = os.path.join(base_folder, "Masters", "TAX code Master - Working.xlsx")

    if not os.path.exists(path):
        print(f"WARNING: Tax Master not found! Checked {path}")
        return {}

    df = pd.read_excel(path, dtype={"Tax Code": str}).fillna("")
    mapping = {}
    for _, r in df.iterrows():
        code = normalize_tax_code(r["Tax Code"])
        if not code:
            continue
        mapping[code] = {
            "category": str(r["Category"]).strip().upper(),
            "description": str(r["Tax Description"]).strip(),
        }
    return mapping


def _is_return_item(row):
    return s(row, RETURN_ITEM_COLUMN).strip().upper() == "X"


def _is_deleted_line(row):
    return s(row, DELETION_INDICATOR_COLUMN).strip().upper() == "L"


def _is_zsto_po(row):
    return s(row, "PO Type").strip().upper() == ZSTO_PO_TYPE


def _is_low_value_job_work_po(row):
    po_type = s(row, "PO Type").strip().upper()
    if po_type not in JOB_WORK_PO_TYPES:
        return False
    net_price = parse_sap_number(s(row, NET_PRICE_COLUMN))
    if net_price is None:
        return False
    return any(abs(net_price - v) < 0.0001 for v in JOB_WORK_LOW_VALUE_NET_PRICES)


def _is_excluded_line(row):
    return (
        _is_deleted_line(row)
        or _is_return_item(row)
        or _is_zsto_po(row)
        or _is_low_value_job_work_po(row)
    )


def _exclusion_remark(row):
    if _is_deleted_line(row):
        return (
            "Not Applicable - line item excluded from all audit points "
            "(Deletion indicator 'L')"
        )
    if _is_return_item(row):
        return (
            "Not Applicable - line item excluded from all audit points "
            "(Returns Item 'X')"
        )
    if _is_zsto_po(row):
        return (
            "Not Applicable - line item excluded from all audit points "
            "(PO Type 'ZSTO')"
        )
    if _is_low_value_job_work_po(row):
        return (
            f"Not Applicable - line item excluded from all audit points "
            f"(Job Work PO Type '{s(row, 'PO Type')}' with nominal Net Price "
            f"of {s(row, NET_PRICE_COLUMN)})"
        )
    return EXCLUDED_LINE_REMARK


def drop_lines_with_deletion_indicator(po_rows):
    kept = [row for row in po_rows if not _is_deleted_line(row)]
    dropped = len(po_rows) - len(kept)
    if dropped:
        log_assumption(
            "Global Exclusion - Deletion Indicator (line-level)",
            f"{dropped} PO line item(s) were removed COMPLETELY from the audit - not "
            f"marked Not Applicable, but dropped before any output, JSON export, or "
            f"cross-row aggregate was built - because they carry Deletion indicator = "
            f"'L'. This removal is per LINE ITEM, not per PO: any OTHER, non-'L' line "
            f"items on the same PO number are left untouched and continue to be fully "
            f"audited and appear in every output as normal."
        )
    return kept


def evaluate_rule(rule_no, fn, row, ctx):
    if _is_excluded_line(row):
        return NA, _exclusion_remark(row)
    return fn(row, ctx)


# ---------------------------------------------------------------------------
# Points #6/#7 CND-presence guard (THIS REVISION)
# ---------------------------------------------------------------------------
def _po_missing_from_cnd(po_number, cnd_by_po):
    """
    True only if POAUDITCND has ZERO rows at all for this PO number in the
    current batch - distinct from "CND has rows for this PO, but none of
    them are freight-type condition rows".

    Before this guard existed, rule_13_eyw_freight_required (point #6) and
    rule_14_exw_fca_no_freight (point #7) both called
    ctx["cnd_by_po"].get(po_number, []), and an empty list meant EITHER of
    those two very different situations - a PO the condition extract
    simply never captured looked identical to a PO whose freight condition
    was genuinely absent. That produced a confident but WRONG verdict
    (Not Verified for point #6, Verified for point #7) instead of a
    Data Missing flag. Confirmed against real data (2026-09): 24 POs / 58
    lines were affected before this fix.
    """
    return not cnd_by_po.get(po_number)


# ---------------------------------------------------------------------------
# Point 9 helpers (multiple POs, same Vendor/Purchasing Group/Plant/Date)
# ---------------------------------------------------------------------------
def _po9_vendor(row):
    """Vendor Code with leading zeros stripped, so '0000208190' (one export)
    and '208190' (another export) are treated as the same vendor when the
    current batch is compared against history."""
    v = s(row, "Vendor Code")
    return v.lstrip("0") or v


def _po9_four_key(row):
    return (
        _po9_vendor(row),
        s(row, "Purchase Group"),
        s(row, "Plant"),
        s(row, PURCHASING_DATE_COLUMN),
    )


def _po9_core_key(row):
    return (
        _po9_vendor(row),
        s(row, "Purchase Group"),
        s(row, "Plant"),
    )


def load_po9_history(path):
    """Reads the cumulative point-9 history file (empty list if none yet)."""
    if not path or not os.path.exists(path):
        return []
    with open(path, encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


def po9_rows_from_batch(po_rows):
    """One compact history row per (PO number, Vendor/Group/Plant/Date)
    combination present in the current batch. Plant etc. can differ by line,
    so a PO can legitimately produce more than one row."""
    seen = {}
    for row in po_rows:
        key = (s(row, "PO number"), _po9_four_key(row))
        if key not in seen:
            seen[key] = {col: s(row, col) for col in PO9_HISTORY_COLUMNS}
    return list(seen.values())


def save_po9_history(path, rows):
    folder = os.path.dirname(path)
    if folder:
        os.makedirs(folder, exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=PO9_HISTORY_COLUMNS)
        writer.writeheader()
        writer.writerows(rows)


def _format_po_list(pos, limit=5):
    pos = sorted(pos)
    shown = ", ".join(pos[:limit])
    if len(pos) > limit:
        shown += f", and {len(pos) - limit} more"
    return shown


def rule_01_release_verification(row, ctx):
    po_type = s(row, "PO Type")
    purchase_req = s(row, "Purchase Req")
    if po_type in {"ZSER", "ZJVW", "ZJWV"}:
        return NA, f"Not applicable for PO type {po_type}"
    if not purchase_req:
        return NOT_VERIFIED, "Purchase Req is blank"
    rel_ind = s(row, "PR Release Ind")
    log_assumption(10, "PR Release Ind code meaning assumed: '2' = released (PR_RELEASED_VALUES). Confirm actual codes with client.")
    if rel_ind in PR_RELEASED_VALUES:
        return VERIFIED, "PR is released"
    return NOT_VERIFIED, f"PR Release Ind = '{rel_ind}' not in released set {sorted(PR_RELEASED_VALUES)}"


def rule_02_pr_assigned(row, ctx):
    purchase_req = s(row, "Purchase Req")
    if purchase_req:
        return VERIFIED, "PR assigned to PO line"
    return NOT_VERIFIED, "No PR assigned to this PO line"


def rule_03_pr_within_6_months(row, ctx):
    purchase_req = s(row, "Purchase Req")
    if not purchase_req:
        return NA, "No PR assigned"
    po_date = parse_sap_date(s(row, "PO Created date"))
    pr_date = parse_sap_date(s(row, "PR Creation date"))
    if not po_date or not pr_date:
        return MANUAL, "PO/PR creation date missing or unparseable"
    if pr_date >= po_date - timedelta(days=SIX_MONTHS_DAYS):
        return VERIFIED, "PR within 6 months of PO"
    return NOT_VERIFIED, f"PR date {pr_date.date()} is more than 6 months (180 days) before PO date {po_date.date()}"


def rule_04_pr_precedes_po(row, ctx):
    purchase_req = s(row, "Purchase Req")
    if not purchase_req:
        return NA, "No PR assigned"
    po_date = parse_sap_date(s(row, "PO Created date"))
    pr_date = parse_sap_date(s(row, "PR Creation date"))
    if not po_date or not pr_date:
        return MANUAL, "PO/PR creation date missing or unparseable"
    if pr_date <= po_date:
        return VERIFIED, "PR date precedes PO date"
    return NOT_VERIFIED, f"PR date {pr_date.date()} is not before PO date {po_date.date()}"


def rule_05_delivery_after_pr(row, ctx):
    purchase_req = s(row, "Purchase Req")
    if not purchase_req:
        return NA, "No PR assigned"
    pr_date = parse_sap_date(s(row, "PR Creation date"))
    delivery_date = parse_sap_date(s(row, "Delivery Date"))
    if not pr_date or not delivery_date:
        return MANUAL, "PR/Delivery date missing or unparseable"
    if delivery_date >= pr_date:
        return VERIFIED, "Delivery date after PR date"
    return NOT_VERIFIED, f"Delivery date {delivery_date.date()} is before PR date {pr_date.date()}"


def rule_07_rc_released(row, ctx):
    rc_no = s(row, "RC no.")
    if not rc_no:
        return NA, "No RC assigned to this line"
    rc_status = s(row, "RC Release status")
    log_assumption(1, "RC Release status code meaning assumed: 'R' = released. Confirm actual codes with client.")
    if rc_status in RC_RELEASED_VALUES:
        return VERIFIED, "RC is released"
    return NOT_VERIFIED, f"RC Release status = '{rc_status}' not in released set"


def rule_08_rc_consistency(row, ctx):
    po_number = s(row, "PO number")
    material = s(row, "Material Code")

    group = ctx["po_material_groups"].get((po_number, material), [])

    rc_numbers = {
        s(r, "RC no.")
        for r in group
        if s(r, "RC no.")
    }

    if not rc_numbers:
        return NA, "RC not applicable to any line for this PO+Material"

    if len(rc_numbers) > 1:
        return NOT_VERIFIED, f"Different RCs assigned for same PO+Material: {sorted(rc_numbers)}"

    expected_rc = next(iter(rc_numbers))

    if s(row, "RC no.") == expected_rc:
        return VERIFIED, f"RC {expected_rc} consistently assigned"

    return NOT_VERIFIED, f"Expected RC {expected_rc} but found blank/different RC"


def rule_09_tax_logic(row, ctx):
    tax_code = s(row, "Tax code")

    if not tax_code:
        return MANUAL, "Tax code is missing/blank"

    tax_master = ctx.get("tax_master", {})
    tax = tax_master.get(normalize_tax_code(tax_code))

    if not tax:
        return MANUAL, f"Tax Code {tax_code} not found in Tax Master"

    category_token = _normalize_category_tokens(tax["category"])

    if category_token in GST_NOT_APPLICABLE_TOKENS:
        return NA, f"Tax Code {tax_code} category '{tax['category']}' is not a GST in-state/out-of-state code (VAT/CST/exempt/Input Tax/No GST/etc.)"

    vendor_state = s(row, "Vendor State").upper()

    if not vendor_state:
        gstin = s(row, GSTIN_COLUMN)
        derived_state = _state_from_gstin(gstin)
        if derived_state:
            vendor_state = derived_state
            log_assumption(
                3,
                f"'Vendor State' was blank; state was derived from the GSTIN state code in "
                f"'{GSTIN_COLUMN}' instead. Column name '{GSTIN_COLUMN}' is UNCONFIRMED - "
                f"verify against the real extract header."
            )

    if not vendor_state:
        return MANUAL, f"Vendor State is missing/blank (and could not be derived from GSTIN) - needed to compare Tax Code {tax_code} ({tax['category']}) against Gujarat/non-Gujarat"

    is_gujarat = vendor_state in ("GUJARAT", GUJARAT_STATE_CODE)

    if is_gujarat:
        if category_token in GST_LOCAL_TOKENS:
            return VERIFIED, f"Local (Gujarat) vendor. Tax code {tax_code} is {tax['category']} (in-state)."
        if category_token in GST_IGST_TOKENS:
            return NOT_VERIFIED, f"Vendor is in Gujarat but Tax Code {tax_code} is {tax['category']} (IGST, out-of-state)."
        return MANUAL, f"Vendor is in Gujarat; Tax Code {tax_code} category '{tax['category']}' does not clearly map to in-state/out-of-state GST - needs manual review."

    if category_token in GST_IGST_TOKENS:
        return VERIFIED, f"Outside Gujarat. Tax code {tax_code} is {tax['category']} (IGST)."
    if category_token in GST_LOCAL_TOKENS:
        return NOT_VERIFIED, f"Vendor is outside Gujarat but Tax Code {tax_code} is {tax['category']} (in-state, expected IGST)."
    return MANUAL, f"Vendor is outside Gujarat; Tax Code {tax_code} category '{tax['category']}' does not clearly map to in-state/out-of-state GST - needs manual review."


def rule_10_vendor_material_tax_consistency(row, ctx):
    vendor = s(row, "Vendor Code")
    material = s(row, "Material Code")
    tax_codes = ctx["vendor_material_tax"].get((vendor, material), set())
    if len(tax_codes) <= 1:
        return VERIFIED, "Consistent tax code for this vendor-material combination (within this extract)"
    log_assumption(16, "This rule is described as needing 'historical data' across all past POs. This script only checks consistency "
                        "within the single extract provided; a production run should compare against the full transaction history.")
    return NOT_VERIFIED, f"Multiple tax codes found for vendor {vendor} / material {material}: {sorted(tax_codes)}"


def rule_11_msme_payment_term(row, ctx):
    msme_status = s(row, "Vendor MSME Status")
    if not msme_status:
        return NA, "Vendor has no MSME certificate on file"
    payment_term = s(row, "Payment Term")
    if payment_term in MSME_PAYMENT_TERMS:
        info = MSME_PAYMENT_TERMS[payment_term]
        detail = f"{info['days']} days credit" if info["days"] is not None else info["desc"]
        return VERIFIED, f"MSME vendor with payment term {payment_term} ({detail})"
    return NOT_VERIFIED, (
        f"MSME vendor with payment term '{payment_term}', expected one of "
        f"{sorted(MSME_PAYMENT_TERMS)} (<=45 days credit / advance / commissioning / "
        f"quarterly-half-yearly advance / periodical bills / as-per-note)"
    )


def rule_12_general_payment_term(row, ctx):
    msme_status = s(row, "Vendor MSME Status")
    purchase_group = s(row, "Purchase Group")
    payment_term = s(row, "Payment Term")
    po_type = s(row, "PO Type")
    if msme_status:
        return NA, "MSME vendor (covered by point #4)"
    if purchase_group in GENERAL_TERM_EXCLUDED_PURCHASE_GROUPS:
        return NA, f"Purchase group {purchase_group} excluded"
    if payment_term in GENERAL_TERM_EXCLUDED_PAYMENT_TERMS:
        return NA, f"Payment term {payment_term} excluded (display remark: {payment_term})"
    if po_type in {"ZSER", "ZCSR"}:
        return NA, f"PO type {po_type} excluded"
    payment_days = parse_sap_number(s(row, "Payment days"))
    if payment_days is None:
        return MANUAL, "Payment days not available"
    if payment_days >= 21:
        return VERIFIED, f"Payment days = {payment_days:.0f} (>=21)"
    return NOT_VERIFIED, f"Payment days = {payment_days:.0f} (<21)"


def _condition_types_for_item(po_number, item_no, cnd_by_po):
    item_s = str(item_no).lstrip("0")
    return [
        s(c, "Condition Type")
        for c in cnd_by_po.get(po_number, [])
        if s(c, "Item no").lstrip("0") == item_s and s(c, "Condition Type")
    ]


def _freight_condition_match(po_number, item_no, cnd_by_po):
    all_types = _condition_types_for_item(po_number, item_no, cnd_by_po)
    for t in all_types:
        if t in FREIGHT_CONDITION_TYPES:
            return t, all_types
    return None, all_types


def _other_condition_types_note(matched_type, all_types):
    others = sorted({t for t in all_types if t != matched_type})
    if not others:
        return ""
    return f" (other condition type(s) on this line, not freight: {others})"


def _condition_value(c):
    """Best-effort read of a single condition row's amount, trying each
    candidate column name in FREIGHT_CONDITION_VALUE_COLUMNS in turn.
    Returns None if none of them are present/parseable - callers must
    treat None as "unknown", never as "zero"."""
    for col in FREIGHT_CONDITION_VALUE_COLUMNS:
        if col in c and s(c, col) != "":
            v = parse_sap_number(s(c, col))
            if v is not None:
                return v
    return None


def _freight_condition_value_match(po_number, item_no, cnd_by_po):
    """
    Point 6 (EYW) variant of _freight_condition_match(): also requires the
    matched condition's value to be > 0. Returns a tuple:
      (verified_type_or_None, freight_rows_found, any_value_readable)
    - verified_type_or_None: the freight condition type with value > 0,
      or None if no such row exists.
    - freight_rows_found: list of (type, value_or_None) for every freight
      -type condition row found on this line, regardless of value.
    - any_value_readable: True if at least one freight row's value could
      actually be parsed (used to tell "definitively <= 0" apart from
      "column name unrecognised, can't tell").
    """
    item_s = str(item_no).lstrip("0")
    freight_rows = [
        c for c in cnd_by_po.get(po_number, [])
        if s(c, "Item no").lstrip("0") == item_s and s(c, "Condition Type") in FREIGHT_CONDITION_TYPES
    ]
    found = []
    any_value_readable = False
    verified_type = None
    for c in freight_rows:
        t = s(c, "Condition Type")
        val = _condition_value(c)
        found.append((t, val))
        if val is not None:
            any_value_readable = True
            if val > 0 and verified_type is None:
                verified_type = t
    return verified_type, found, any_value_readable


def rule_13_eyw_freight_required(row, ctx):
    po_type = s(row, "PO Type")
    if po_type in MANUAL_CHECK_PO_TYPES:
        return MANUAL_CHECK, (
            f"PO type {po_type} is an import PO type flagged by the client for manual "
            f"check rather than an automated EYW freight-condition verdict."
        )

    inco_term = s(row, "Inco term")
    if inco_term != "EYW":
        return NA, f"Inco term is {inco_term}, not EYW"

    po_number = s(row, "PO number")

    # THIS REVISION: if POAUDITCND has ZERO rows at all for this PO, we
    # cannot tell "no freight condition" apart from "condition extract
    # never captured this PO" - flag Data Missing instead of guessing
    # Not Verified. See _po_missing_from_cnd().
    if _po_missing_from_cnd(po_number, ctx["cnd_by_po"]):
        return MANUAL, (
            f"PO {po_number} has no matching row(s) at all in the POAUDITCND file "
            f"for this batch - freight condition presence/value cannot be confirmed "
            f"for this EYW PO line (Data Missing)"
        )

    item_no = s(row, "PO Line item")
    verified_type, found, any_value_readable = _freight_condition_value_match(
        po_number, item_no, ctx["cnd_by_po"]
    )

    if verified_type:
        return VERIFIED, (
            f"Freight condition '{verified_type}' present for EYW PO line with a "
            f"value > INR 0.00"
        )

    if not found:
        return NOT_VERIFIED, (
            "EYW PO line missing a freight condition (no applicable freight "
            f"condition type {sorted(FREIGHT_CONDITION_TYPES)} found for this line)"
        )

    if any_value_readable:
        return NOT_VERIFIED, (
            f"EYW PO line has freight condition type(s) {sorted({t for t, _ in found})} "
            f"but the value is INR 0.00 or less on all of them "
            f"({[(t, v) for t, v in found]}) - a freight condition must carry a "
            f"positive value"
        )

    return MANUAL_CHECK, (
        f"EYW PO line has freight condition type(s) {sorted({t for t, _ in found})}, "
        f"but this condition file does not have a recognised value/amount column "
        f"(tried {list(FREIGHT_CONDITION_VALUE_COLUMNS)}) - cannot confirm the "
        f"value is > INR 0.00 automatically; please verify manually"
    )


def rule_14_exw_fca_no_freight(row, ctx):
    po_type = s(row, "PO Type")
    if po_type in MANUAL_CHECK_PO_TYPES:
        return MANUAL_CHECK, (
            f"PO type {po_type} is an import PO type flagged by the client for manual "
            f"check rather than an automated EXW/FCA freight-condition verdict."
        )

    inco_term = s(row, "Inco term")
    if inco_term not in {"EXW", "FCA"}:
        return NA, f"Inco term is {inco_term}, not EXW/FCA"

    po_number = s(row, "PO number")

    # THIS REVISION: same CND-presence guard as point #6 - see
    # _po_missing_from_cnd(). Without this, a PO absent from CND entirely
    # was silently treated as "no freight condition -> Verified", which is
    # a false-positive verdict, not a real one.
    if _po_missing_from_cnd(po_number, ctx["cnd_by_po"]):
        return MANUAL, (
            f"PO {po_number} has no matching row(s) at all in the POAUDITCND file "
            f"for this batch - absence of freight condition cannot be confirmed for "
            f"this EXW/FCA PO line (Data Missing)"
        )

    item_no = s(row, "PO Line item")
    matched_type, all_types = _freight_condition_match(po_number, item_no, ctx["cnd_by_po"])
    if matched_type:
        return NOT_VERIFIED, (
            f"EXW/FCA PO line has freight condition '{matched_type}' (should be omitted)"
            f"{_other_condition_types_note(matched_type, all_types)}"
        )
    return VERIFIED, (
        f"No freight condition on EXW/FCA PO line"
        + (f" (other condition type(s) present, none are freight: {sorted(set(all_types))})" if all_types else "")
    )


def rule_15_rate_approval(row, ctx):
    po_number = s(row, "PO number")
    dws = ctx.get("dws_by_po", {}).get(po_number)

    if not dws:
        return NA, (
            f"No DWS 'Rate Approval'-tagged process found attached to PO {po_number} "
            f"(joined on PO number via the DWS extract - see dws_rate_approval_extract.js)"
        )

    approver = s(dws, DWS_APPROVER_USERNAME_COLUMN)
    is_manager = s(dws, DWS_APPROVER_IS_MANAGER_COLUMN).strip().lower() == "true"
    decision_at = s(dws, DWS_DECISION_AT_COLUMN)

    if approver and is_manager:
        return VERIFIED, f"Approved in DWS by '{approver}' (role: Manager) on {decision_at or 'unknown date'}"
    if approver:
        return NOT_VERIFIED, f"DWS approver '{approver}' does not hold the Manager role"
    return NOT_VERIFIED, (
        f"DWS process found for PO {po_number} (status: {s(dws, DWS_PROCESS_STATUS_COLUMN)}) "
        f"but no approved step by a Manager was recorded"
    )


RULE_15_APPLICABLE_PO_TYPES = {"ZLRM", "ZLCP"}


def rule_15c_rc_material_validity(row, ctx):
    log_assumption(
        15,
        f"Point #15 (RC validity by Material Code) now applies ONLY to PO Type "
        f"ZLRM/ZLCP per the client's flowchart - every other PO Type is Not "
        f"Applicable for this point (this is a NARROWING from the prior revision, "
        f"which ran this check for every PO line). It reads the PO's date from "
        f"'{PURCHASING_DATE_COLUMN}'. A Material Code with no RC master record at "
        f"all, OR with RC record(s) but none valid as of the PO's date, is Not "
        f"Applicable (the 'PO Date within RC validity?' NO branch was changed from "
        f"Not Verified to Not Applicable per the flowchart).",
    )

    po_type = s(row, "PO Type")
    if po_type not in RULE_15_APPLICABLE_PO_TYPES:
        return NA, f"PO type is {po_type}, not one of {sorted(RULE_15_APPLICABLE_PO_TYPES)}"

    material = s(row, "Material Code")
    po_rc_no = s(row, "RC no.")

    candidates = ctx.get("rc_by_material", {}).get(material, [])

    if not candidates:
        return NA, (
            f"Material {material} does not appear in the RC master (POAUDITRC) at "
            f"all - point #15 is Not Applicable for this line"
        )

    po_date = parse_sap_date(s(row, PURCHASING_DATE_COLUMN))

    if not po_date:
        return NA, (
            f"PO date ('{PURCHASING_DATE_COLUMN}') is missing or unparseable - "
            f"cannot confirm a valid RC for Material {material} as of the PO date"
        )

    valid_rcs = [
        c for c in candidates
        if c["from"] and c["to"] and c["from"] <= po_date <= c["to"]
    ]

    if not valid_rcs:
        return NA, (
            f"Material {material} has {len(candidates)} RC master record(s), but "
            f"none is valid as of PO date {po_date.date()}"
        )

    valid_rc_numbers = sorted({c["rc_no"] for c in valid_rcs})

    if not po_rc_no:
        if valid_rc_numbers:
            return NOT_VERIFIED, (
                f"PO's RC no. is blank, but RC {valid_rc_numbers} is available and "
                f"valid for Material {material} as of PO date {po_date.date()}"
            )
        return VERIFIED, (
            f"PO's RC no. is blank and no RC is available for Material {material} "
            f"as of PO date {po_date.date()}"
        )

    if po_rc_no in valid_rc_numbers:
        other_valid_rcs = sorted(n for n in valid_rc_numbers if n != po_rc_no)
        note = (
            f" (other RC(s) also valid for Material {material} as of this date: "
            f"{other_valid_rcs})"
            if other_valid_rcs
            else ""
        )
        return VERIFIED, (
            f"PO references RC {po_rc_no}, which is valid for Material {material} "
            f"as of PO date {po_date.date()}{note}"
        )

    return NOT_VERIFIED, (
        f"PO's RC no. is '{po_rc_no}', but the RC valid for Material {material} as "
        f"of PO date {po_date.date()} is {valid_rc_numbers} - PO does not "
        f"reference the applicable RC"
    )


def rule_16_zser_item_category(row, ctx):
    po_type = s(row, "PO Type")
    if po_type != "ZSER":
        return NA, f"PO type is {po_type}, not ZSER"

    item_cat_raw = s(row, "Item Category")
    account_assignment = s(row, "Account Assignment")

    if item_cat_raw not in ITEM_CATEGORY_CODE_MAP:
        return MANUAL, f"Item Category raw code '{item_cat_raw}' is not a recognised code (expected one of {sorted(ITEM_CATEGORY_CODE_MAP)})"

    if item_cat_raw == ITEM_CATEGORY_SERVICE_CODE and account_assignment == "K":
        return VERIFIED, f"Item Category '{item_cat_raw}' (Service/D) with Account Assignment 'K' as required"
    return NOT_VERIFIED, (
        f"Expected Item Category '{ITEM_CATEGORY_SERVICE_CODE}' (Service/D) + Account Assignment 'K'; "
        f"found Item Category='{item_cat_raw}', Account Assignment='{account_assignment}'"
    )


def rule_17_zcsr_item_category(row, ctx):
    po_type = s(row, "PO Type")
    if po_type != "ZCSR":
        return NA, f"PO type is {po_type}, not ZCSR"

    item_cat_raw = s(row, "Item Category")
    account_assignment = s(row, "Account Assignment")

    if item_cat_raw not in ITEM_CATEGORY_CODE_MAP:
        return MANUAL, f"Item Category raw code '{item_cat_raw}' is not a recognised code (expected one of {sorted(ITEM_CATEGORY_CODE_MAP)})"

    if item_cat_raw == ITEM_CATEGORY_SERVICE_CODE and account_assignment == "A":
        return VERIFIED, f"Item Category '{item_cat_raw}' (Service/D) with Account Assignment 'A' as required"
    return NOT_VERIFIED, (
        f"Expected Item Category '{ITEM_CATEGORY_SERVICE_CODE}' (Service/D) + Account Assignment 'A'; "
        f"found Item Category='{item_cat_raw}', Account Assignment='{account_assignment}'"
    )


RULE_18_APPLICABLE_PO_TYPES = {"ZLRM", "ZLCP", "ZIRM", "ZICP"}


def rule_18_lrm_no_l_category(row, ctx):
    po_type = s(row, "PO Type")
    if po_type not in RULE_18_APPLICABLE_PO_TYPES:
        return NA, f"PO type is {po_type}, not one of {sorted(RULE_18_APPLICABLE_PO_TYPES)}"

    item_cat_raw = s(row, "Item Category")
    account_assignment = s(row, "Account Assignment")

    if item_cat_raw not in ITEM_CATEGORY_CODE_MAP:
        return MANUAL, f"Item Category raw code '{item_cat_raw}' is not a recognised code (expected one of {sorted(ITEM_CATEGORY_CODE_MAP)})"

    if item_cat_raw == ITEM_CATEGORY_SUBCONTRACTING_CODE and account_assignment == "K":
        return NOT_VERIFIED, (
            f"Disallowed combination found: Item Category '{item_cat_raw}' (Subcontracting/L) "
            f"with Account Assignment 'K'"
        )
    return VERIFIED, (
        f"Disallowed combination (Item Cat 'L' + Acct Assignment 'K') not present "
        f"(Item Category='{item_cat_raw}', Account Assignment='{account_assignment}')"
    )


def rule_19_multiple_po_same_day(row, ctx):
    po_number = s(row, "PO number")
    four_key = _po9_four_key(row)
    rep_key = (four_key, po_number)

    own_rfq = ctx["po9_rfq_by_po"].get(rep_key, s(row, RFQ_NO_COLUMN))
    own_po_type = ctx["po9_po_type_by_po"].get(rep_key, s(row, "PO Type"))

    others_four = ctx["po9_four_groups"].get(four_key, set()) - {po_number}

    duplicates = set()
    diff_po_type = set()
    diff_rfq_only = set()

    for other_po in others_four:
        other_key = (four_key, other_po)
        other_po_type = ctx["po9_po_type_by_po"].get(other_key, "")
        other_rfq = ctx["po9_rfq_by_po"].get(other_key, "")

        if own_po_type != other_po_type:
            diff_po_type.add(other_po)
            continue

        if own_rfq == "" and other_rfq == "":
            duplicates.add(other_po)
        elif own_rfq != "" and other_rfq != "" and own_rfq == other_rfq:
            duplicates.add(other_po)
        else:
            diff_rfq_only.add(other_po)

    if duplicates:
        return NOT_VERIFIED, (
            f"Vendor, Purchasing Group, Plant, Purchasing Date and PO Type are all the "
            f"same as PO(s) {_format_po_list(duplicates)}, and RFQ no. does not "
            f"differentiate them (both blank or both equal)"
        )

    if not others_four:
        return VERIFIED, "No other PO found with the same Vendor, Purchasing Group, Plant and Purchasing Date"

    reasons = []
    if diff_po_type:
        reasons.append(
            f"PO Type is different from PO(s) {_format_po_list(diff_po_type)}"
        )
    if diff_rfq_only:
        reasons.append(
            f"RFQ no. is different from PO(s) {_format_po_list(diff_rfq_only)} "
            f"(Vendor, Purchasing Group, Plant, Purchasing Date and PO Type match)"
        )

    return VERIFIED, (
        "Same Vendor, Purchasing Group, Plant and Purchasing Date as other PO(s), but not "
        "treated as a duplicate: " + "; ".join(reasons)
    )


def rule_rc_overlap(row, ctx):
    rc_no = s(row, "RC no.")
    if not rc_no:
        return NA, "No RC assigned to this line"

    vendor = s(row, "Vendor Code")
    material = s(row, "Material Code")

    overlaps = ctx.get("rc_overlaps", {}).get((vendor, material, rc_no))
    if overlaps:
        return NOT_VERIFIED, f"RC {rc_no} overlaps with other RC(s): {overlaps}"
    return VERIFIED, "No overlapping RC validity found"


HEADER_LEVEL_RULE_NOS = {1, 2, 3, 4, 5, 6, 7, 8, 9}

PO_LINE_RULES = [
    (1, "RC released", rule_07_rc_released),
    (2, "RC assigned consistently across same-material lines", rule_08_rc_consistency),
    (3, "IGST only for non-Gujarat vendors", rule_09_tax_logic),
    (4, "MSME payment term (Z100/Z101/Z102/Z105/Z107/Z112/Z126/Z146/Z147/Z148/Z154)", rule_11_msme_payment_term),
    (5, "General payment term >=21 days", rule_12_general_payment_term),
    (6, "EYW inco-term requires freight condition", rule_13_eyw_freight_required),
    (7, "EXW/FCA must not have freight condition", rule_14_exw_fca_no_freight),
    (8, "Rate approval by authorised approver (DWS, joined by PO number)", rule_15_rate_approval),
    (9, "Multiple POs to same Vendor/Purchasing Group/Plant/Purchasing Date (CUMULATIVE: current batch + all previously processed POs) - PO Type is the primary differentiator, RFQ secondary; always Verified/Not Verified", rule_19_multiple_po_same_day),
    (10, "Release Verification (PR released before PO)", rule_01_release_verification),
    (11, "PR assigned to each PO line", rule_02_pr_assigned),
    (12, "PR Creation date within 6 months (180 days) of PO", rule_03_pr_within_6_months),
    (13, "PR date precedes PO date", rule_04_pr_precedes_po),
    (14, "Delivery date after PR date", rule_05_delivery_after_pr),
    (15, "For ZLRM/ZLCP only: PO's RC no. matches the RC that is valid for its Material Code as of the PO date", rule_15c_rc_material_validity),
    (16, "Vendor-Material tax code consistency (all lines count, including deleted/returned)", rule_10_vendor_material_tax_consistency),
    (17, "Service PO (ZSER) uses Item Cat D + Acct Assignment K", rule_16_zser_item_category),
    (18, "Service PO (ZCSR) uses Item Cat D + Acct Assignment A", rule_17_zcsr_item_category),
    (19, "ZLRM/ZLCP/ZIRM/ZICP must not use Item Cat L + Acct Assignment K", rule_18_lrm_no_l_category),
]

HEADER_RULES = [r for r in PO_LINE_RULES if r[0] in HEADER_LEVEL_RULE_NOS]
LINE_ONLY_RULES = [r for r in PO_LINE_RULES if r[0] not in HEADER_LEVEL_RULE_NOS]


def run_rc_overlap(rc_rows):
    """Excel-sheet ('RC Overlap' tab) version - now also surfaces the RC
    master's own Purchase Group column directly, for parity with
    build_rc_overlap_records()."""
    results = []
    by_vendor_material = defaultdict(list)
    for r in rc_rows:
        vendor = s(r, "Vendor Code")
        material = s(r, "RC Material Code")
        valid_from = parse_sap_date(s(r, "RC valid from"))
        valid_to = parse_sap_date(s(r, "RC valid to"))
        purchase_group = s(r, RC_PURCHASE_GROUP_COLUMN).upper()
        by_vendor_material[(vendor, material)].append(
            {
                "RC number": s(r, "RC number"),
                "from": valid_from,
                "to": valid_to,
                "purchase_group": purchase_group,
                "raw": r,
            }
        )

    for (vendor, material), rcs in by_vendor_material.items():
        for i, rc_a in enumerate(rcs):
            overlaps = []
            for j, rc_b in enumerate(rcs):
                if i == j or rc_a["RC number"] == rc_b["RC number"]:
                    continue
                if not rc_a["from"] or not rc_a["to"] or not rc_b["from"] or not rc_b["to"]:
                    continue
                if rc_a["from"] <= rc_b["to"] and rc_b["from"] <= rc_a["to"]:
                    overlaps.append(rc_b["RC number"])
            status = NOT_VERIFIED if overlaps else VERIFIED
            remark = f"Overlaps with RC(s): {overlaps}" if overlaps else "No overlapping RC validity found"
            results.append(
                {
                    "Vendor Code": vendor,
                    "RC Material Code": material,
                    "RC number": rc_a["RC number"],
                    "Purchase Group": rc_a["purchase_group"],
                    "Valid From": rc_a["from"].date() if rc_a["from"] else None,
                    "Valid To": rc_a["to"].date() if rc_a["to"] else None,
                    "RC Overlap Status": status,
                    "Remark": remark,
                }
            )
    return pd.DataFrame(results)


def build_rc_overlap_records(rc_rows):
    """
    Point 20 - RC Overlap, for storage via addrc.js -> rc_overlap_results.

    `purchaseGroups` is read DIRECTLY from the RC master's own "Purchase
    group" column (RC_PURCHASE_GROUP_COLUMN), one value per (vendor,
    material, RC number) row - NOT derived by cross-referencing PO lines
    from a separate POAUDIT batch. See the top-of-file changelog entry for
    why the old approach (build_rc_purchase_groups(po_rows), now removed)
    was unreliable.

    NOTE: this function does not take `po_rows` as a parameter - the RC
    master alone is sufficient to build the full RC Overlap output,
    purchaseGroups included.
    """
    records = []
    by_vendor_material = defaultdict(list)
    skipped_incomplete = 0
    for r in rc_rows:
        vendor = s(r, "Vendor Code")
        material = s(r, "RC Material Code")
        valid_from = parse_sap_date(s(r, "RC valid from"))
        valid_to = parse_sap_date(s(r, "RC valid to"))
        rc_no = s(r, "RC number")
        # Normalized (trimmed + uppercased) so it matches whatever casing
        # convention the Purchasing Group Master / master-data.js uses when
        # a Buyer's own group is looked up for the `purchaseGroups.has(...)`
        # scoping check in rc-overlap-controller.js.
        purchase_group = s(r, RC_PURCHASE_GROUP_COLUMN).upper()

        if not (vendor and material and rc_no):
            skipped_incomplete += 1
            continue

        by_vendor_material[(vendor, material)].append(
            {"rc_no": rc_no, "from": valid_from, "to": valid_to, "purchase_group": purchase_group}
        )

    if skipped_incomplete:
        log_assumption(
            "RC Overlap",
            f"{skipped_incomplete} row(s) in the RC master (POAUDITRC) were excluded from the "
            f"RC Overlap output because Vendor Code and/or RC Material Code and/or RC number "
            f"was blank."
        )

    missing_pg_count = sum(
        1
        for rcs in by_vendor_material.values()
        for c in rcs
        if not c["purchase_group"]
    )
    if missing_pg_count:
        log_assumption(
            "RC Overlap - Purchase Group",
            f"{missing_pg_count} RC master row(s) had a blank '{RC_PURCHASE_GROUP_COLUMN}' "
            f"value - those specific RC Overlap records will have purchaseGroups=[] and "
            f"will not be visible to any Buyer (only Admin/Procurement Manager). This is a "
            f"data-quality gap in the RC master itself, not a derivation bug - check the "
            f"source POAUDITRC extract for these rows.",
        )

    for (vendor, material), rcs in by_vendor_material.items():
        for i, rc_a in enumerate(rcs):
            overlaps = []
            for j, rc_b in enumerate(rcs):
                if i == j or rc_a["rc_no"] == rc_b["rc_no"]:
                    continue
                if not rc_a["from"] or not rc_a["to"] or not rc_b["from"] or not rc_b["to"]:
                    continue
                if rc_a["from"] <= rc_b["to"] and rc_b["from"] <= rc_a["to"]:
                    overlaps.append(rc_b["rc_no"])

            purchase_groups = [rc_a["purchase_group"]] if rc_a["purchase_group"] else []

            records.append({
                "vendorCode": vendor,
                "rcMaterialCode": material,
                "rcNumber": rc_a["rc_no"],
                "validFrom": rc_a["from"].strftime("%Y-%m-%d") if rc_a["from"] else None,
                "validTo": rc_a["to"].strftime("%Y-%m-%d") if rc_a["to"] else None,
                "status": NOT_VERIFIED if overlaps else VERIFIED,
                "overlappingRcs": overlaps,
                "remark": f"Overlaps with RC(s): {overlaps}" if overlaps else "No overlapping RC validity found",
                "purchaseGroups": purchase_groups,
            })
    return records


def build_context(po_rows, cnd_by_po, rc_rows, dws_by_po=None, po9_extra_rows=None):
    """
    po9_extra_rows: rows (same column names as PO9_HISTORY_COLUMNS) for POs
    processed in EARLIER runs and not present in the current batch. They are
    folded into the point-#9 lookups only (never into any other point), which
    is what makes point #9 cumulative.
    """
    po_material_groups = defaultdict(list)
    vendor_material_tax = defaultdict(set)
    po9_four_groups = defaultdict(set)
    po9_core_groups = defaultdict(set)
    po9_rfq_by_po = {}
    po9_po_type_by_po = {}
    rc_overlaps = {}
    rc_by_material = defaultdict(list)

    by_vendor_material = defaultdict(list)
    for r in rc_rows:
        vendor = s(r, "Vendor Code")
        material = s(r, "RC Material Code")
        valid_from = parse_sap_date(s(r, "RC valid from"))
        valid_to = parse_sap_date(s(r, "RC valid to"))
        rc_no = s(r, "RC number")
        if vendor and material and valid_from and valid_to and rc_no:
            by_vendor_material[(vendor, material)].append({
                "rc_no": rc_no,
                "from": valid_from,
                "to": valid_to
            })

        if material and rc_no:
            rc_by_material[material].append({
                "rc_no": rc_no,
                "from": valid_from,
                "to": valid_to,
            })

    for (vendor, material), rcs in by_vendor_material.items():
        for i, rc_a in enumerate(rcs):
            overlaps = []
            for j, rc_b in enumerate(rcs):
                if i == j or rc_a["rc_no"] == rc_b["rc_no"]:
                    continue
                if rc_a["from"] <= rc_b["to"] and rc_b["from"] <= rc_a["to"]:
                    overlaps.append(rc_b["rc_no"])
            if overlaps:
                rc_overlaps[(vendor, material, rc_a["rc_no"])] = overlaps

    # ---- Current-batch-only aggregates (all points except #9) ----
    for row in po_rows:
        po_number = s(row, "PO number")
        material = s(row, "Material Code")
        po_material_groups[(po_number, material)].append(row)

        vendor = s(row, "Vendor Code")
        tax_code = s(row, "Tax code")
        if vendor and material and tax_code:
            vendor_material_tax[(vendor, material)].add(tax_code)

    # ---- Point #9: CUMULATIVE. Current batch FIRST (so its own values are
    # the representative RFQ/PO Type for its POs), then every earlier PO from
    # the history file. ----
    for row in list(po_rows) + list(po9_extra_rows or []):
        po_number = s(row, "PO number")
        four_key = _po9_four_key(row)
        po9_four_groups[four_key].add(po_number)
        rep_key = (four_key, po_number)

        rfq_value = s(row, RFQ_NO_COLUMN)
        if rep_key not in po9_rfq_by_po:
            po9_rfq_by_po[rep_key] = rfq_value
        elif rfq_value and po9_rfq_by_po[rep_key] and rfq_value != po9_rfq_by_po[rep_key]:
            log_assumption(
                9,
                f"PO {po_number}: lines disagree on '{RFQ_NO_COLUMN}' "
                f"('{po9_rfq_by_po[rep_key]}' vs '{rfq_value}') - the first value "
                f"encountered was used as this PO's representative RFQ for point #9.",
            )

        po_type_value = s(row, "PO Type")
        if rep_key not in po9_po_type_by_po:
            po9_po_type_by_po[rep_key] = po_type_value
        elif po_type_value and po9_po_type_by_po[rep_key] and po_type_value != po9_po_type_by_po[rep_key]:
            log_assumption(
                9,
                f"PO {po_number}: lines disagree on 'PO Type' "
                f"('{po9_po_type_by_po[rep_key]}' vs '{po_type_value}') - the first value "
                f"encountered was used as this PO's representative PO Type for point #9.",
            )

        core_key = _po9_core_key(row)
        po9_core_groups[core_key].add(po_number)

    log_assumption(
        9,
        f"Point #9 is CUMULATIVE: it compares each PO in the current batch against the "
        f"current batch PLUS {len(po9_extra_rows or [])} history row(s) from earlier runs "
        f"(--po9-history). It slices on Vendor (leading zeros ignored) + Purchasing Group "
        f"+ Plant + Purchasing Date ('{PURCHASING_DATE_COLUMN}'), then decides Verified/"
        f"Not Verified using PO Type as the PRIMARY differentiator and, only when PO Type "
        f"matches, RFQ (sourced from '{RFQ_NO_COLUMN}') as the SECONDARY differentiator. "
        f"This point never produces a Manual Verify / Data Missing result. NOTE: an "
        f"earlier PO's stored result is not retroactively changed when a later PO "
        f"duplicates it - only the later PO is flagged (its remark names the earlier PO).",
    )

    return {
        "po_material_groups": po_material_groups,
        "vendor_material_tax": vendor_material_tax,
        "po9_four_groups": po9_four_groups,
        "po9_rfq_by_po": po9_rfq_by_po,
        "po9_po_type_by_po": po9_po_type_by_po,
        "po9_core_groups": po9_core_groups,
        "cnd_by_po": cnd_by_po,
        "rc_overlaps": rc_overlaps,
        "rc_by_material": rc_by_material,
        "dws_by_po": dws_by_po or {},
    }

STATUS_TO_RESULT_FLAGS = {
    VERIFIED: {"verified": True, "not_applicable": False, "missing_data": False, "manual_verification": False},
    NOT_VERIFIED: {"verified": False, "not_applicable": False, "missing_data": False, "manual_verification": False},
    NA: {"verified": False, "not_applicable": True, "missing_data": False, "manual_verification": False},
    MANUAL: {"verified": False, "not_applicable": False, "missing_data": True, "manual_verification": True},
    MANUAL_CHECK: {"verified": False, "not_applicable": False, "missing_data": False, "manual_verification": True},
}


def build_addpo_records(po_rows, ctx):
    records = []
    for row in po_rows:
        po_number = s(row, "PO number")
        line_item = s(row, "PO Line item")

        results = []
        for rule_no, _title, fn in LINE_ONLY_RULES:
            status, remark = evaluate_rule(rule_no, fn, row, ctx)
            flags = STATUS_TO_RESULT_FLAGS[status]
            results.append({"pointNo": str(rule_no), "remarks": [remark], **flags})

        po_created_date = parse_sap_date(s(row, "PO Created date"))
        po_delivery_date = parse_sap_date(s(row, "Delivery Date"))
        pr_create_date = parse_sap_date(s(row, "PR Creation date"))
        po_status = s(row, "PO status")

        record = {
            "type": "PO",
            "po_number": po_number,
            "po_line_item": line_item,
            "po_material_number": f"{po_number}-{line_item}",
            "po_type": s(row, "PO Type"),
            "po_status": po_status,
            "hold_due_date": (po_created_date + timedelta(days=30)).strftime("%Y-%m-%d") if (po_status == "H" and po_created_date) else None,
            "purchase_req": s(row, "Purchase Req"),
            "vendor_code": s(row, "Vendor Code"),
            "purchase_group": s(row, "Purchase Group"),
            "vendor_msme_status": s(row, "Vendor MSME Status"),
            "material_code": s(row, "Material Code"),
            "material_disc": s(row, "Material Disc."),
            "plant": s(row, "Plant"),
            "payment_term": s(row, "Payment Term"),
            "inco_term": s(row, "Inco term"),
            "doc_cond_no": s(row, "Doc. Cond. No."),
            "tax_code": s(row, "Tax code"),
            "hsn_code": s(row, "HSN code"),
            "po_qty": parse_sap_number(s(row, "PO Qty.")),
            "pr_quantity": parse_sap_number(s(row, "PR Qty.")),
            "net_value": s(row, "Net Value"),
            "po_created_date": po_created_date.strftime("%Y-%m-%d") if po_created_date else None,
            "po_delivery_date": po_delivery_date.strftime("%Y-%m-%d") if po_delivery_date else None,
            "pr_create_date": pr_create_date.strftime("%Y-%m-%d") if pr_create_date else None,
            "fiscalYear": str(po_created_date.year) if po_created_date else None,
            "auditedOn": datetime.now().strftime("%Y-%m-%d"),
            "results": results,
        }
        records.append(record)
    return records


# THIS REVISION: priority order used when a PO's line items disagree on a
# header-level point's verdict. MANUAL/MANUAL_CHECK (Data Missing) now
# ranks above NA - previously only NOT_VERIFIED > VERIFIED > NA was
# considered, so a genuinely Data-Missing line could be hidden behind an
# NA line from another line item on the same PO.
_HEADER_STATUS_PRIORITY = [NOT_VERIFIED, VERIFIED, MANUAL, MANUAL_CHECK, NA]


def build_po_header_records(po_rows, ctx):
    by_po = defaultdict(list)
    for row in po_rows:
        po_number = s(row, "PO number")
        if po_number:
            by_po[po_number].append(row)

    records = []
    for po_number, rows in by_po.items():
        eligible_rows = [r for r in rows if not _is_excluded_line(r)]

        results = []
        for rule_no, _title, fn in HEADER_RULES:
            if not eligible_rows:
                status, remark = NA, (
                    "No eligible line items for this PO (all line items are "
                    "excluded - Deletion indicator 'L', Returns Item 'X', PO "
                    "Type 'ZSTO', and/or a low-value ZJVW/ZVJW Job Work PO)"
                )
            else:
                per_line = [
                    (s(r, "PO Line item"), evaluate_rule(rule_no, fn, r, ctx))
                    for r in eligible_rows
                ]
                statuses = {st for _li, (st, _remark) in per_line}

                if len(statuses) == 1:
                    status, remark = per_line[0][1]
                else:
                    status = None
                    for candidate in _HEADER_STATUS_PRIORITY:
                        if candidate in statuses:
                            status = candidate
                            remark = next(r for _li, (st, r) in per_line if st == candidate)
                            break
                    if status is None:
                        # Should not happen - every status value is in
                        # _HEADER_STATUS_PRIORITY - but fall back safely
                        # to the first line's verdict rather than crash.
                        status, remark = per_line[0][1]

            flags = STATUS_TO_RESULT_FLAGS[status]
            results.append({"pointNo": str(rule_no), "remarks": [remark], **flags})

        first = rows[0]
        records.append({
            "po_number": po_number,
            "vendor_code": s(first, "Vendor Code"),
            "purchase_group": s(first, "Purchase Group"),
            "po_type": s(first, "PO Type"),
            "auditedOn": datetime.now().strftime("%Y-%m-%d"),
            "results": results,
        })
    return records

def run(poaudit_path, cnd_path, rc_path, out_path, addpo_json_path=None, header_json_path=None, rc_json_path=None, dws_path=None, po9_history_path=None):
    po_rows, cnd_rows, rc_rows, cnd_by_po = load_all(poaudit_path, cnd_path, rc_path)
    dws_by_po = load_dws_rate_approvals(dws_path)

    po_rows = filter_to_scope(po_rows)

    # Remember which POs exist BEFORE line-level deletion, so a PO whose every
    # line is now 'L' can be purged from the cumulative point-9 history.
    scoped_pos = {s(r, "PO number") for r in po_rows}
    po_rows = drop_lines_with_deletion_indicator(po_rows)
    fully_deleted_pos = scoped_pos - {s(r, "PO number") for r in po_rows}

    # ---- Point #9 cumulative history ----
    batch_po9_rows = po9_rows_from_batch(po_rows)
    batch_pos = {r["PO number"] for r in batch_po9_rows}
    history_rows = load_po9_history(po9_history_path)
    # Earlier POs = history minus (POs re-sent in this batch) minus (POs now fully deleted).
    # POs re-sent in this batch are REPLACED by their fresh rows, never duplicated.
    history_extra = [
        r for r in history_rows
        if s(r, "PO number") not in batch_pos
        and s(r, "PO number") not in fully_deleted_pos
    ]

    returns_count = sum(1 for r in po_rows if _is_return_item(r) and not _is_deleted_line(r))
    if returns_count:
        log_assumption(
            "Global Exclusion - Returns Item (line-level)",
            f"{returns_count} of {len(po_rows)} remaining in-scope PO line(s) were "
            f"excluded from ALL 19 audit points (marked Not Applicable on every point, "
            f"line-level and header-level alike) because they have Returns Item = 'X'.",
        )

    zsto_count = sum(1 for r in po_rows if _is_zsto_po(r))
    if zsto_count:
        log_assumption(
            "Global Exclusion - PO Type ZSTO",
            f"{zsto_count} of {len(po_rows)} remaining in-scope PO line(s) were excluded "
            f"from ALL 19 audit points (marked Not Applicable on every point, line-level "
            f"and header-level alike) because PO Type = 'ZSTO', per client instruction "
            f"('In all points, PO Type (ZSTO) to be excluded'). Rows are KEPT in every "
            f"output rather than dropped - confirm this is the behaviour wanted, versus "
            f"dropping them entirely the way Deletion Indicator 'L' rows are dropped.",
        )

    job_work_count = sum(1 for r in po_rows if _is_low_value_job_work_po(r))
    if job_work_count:
        log_assumption(
            "Global Exclusion - Low-value Job Work ZJVW/ZVJW",
            f"{job_work_count} of {len(po_rows)} remaining in-scope PO line(s) were "
            f"excluded from ALL 19 audit points (marked Not Applicable on every point) "
            f"because PO Type is ZJVW or ZVJW AND the Net Price ('{NET_PRICE_COLUMN}') "
            f"is 0, 0.01, or 1, per client instruction.",
        )

    ctx = build_context(po_rows, cnd_by_po, rc_rows, dws_by_po, po9_extra_rows=history_extra)

    base_folder = os.path.dirname(os.path.abspath(poaudit_path))
    ctx["tax_master"] = load_tax_master(base_folder)

    output_rows = []
    for row in po_rows:
        record = {
            "PO number": s(row, "PO number"),
            "PO Line item": s(row, "PO Line item"),
            "PO Type": s(row, "PO Type"),
            "Vendor Code": s(row, "Vendor Code"),
            "Material Code": s(row, "Material Code"),
            "Purchase Group": s(row, "Purchase Group"),
        }
        for rule_no, _title, fn in PO_LINE_RULES:
            status, remark = evaluate_rule(rule_no, fn, row, ctx)
            record[f"Rule {rule_no}"] = status
            record[f"Rule {rule_no} Remark"] = remark
        output_rows.append(record)

    df = pd.DataFrame(output_rows)
    rc_overlap_df = run_rc_overlap(rc_rows)
    assumptions_df = pd.DataFrame(ASSUMPTIONS).drop_duplicates()

    with pd.ExcelWriter(out_path, engine="openpyxl") as writer:
        df.to_excel(writer, sheet_name="PO Line Results", index=False)
        rc_overlap_df.to_excel(writer, sheet_name="RC Overlap", index=False)
        assumptions_df.to_excel(writer, sheet_name="Assumptions", index=False)

    print(f"Wrote {len(df)} PO-line results (rules 1-19, NEW numbering) and {len(rc_overlap_df)} RC-overlap rows (point 20) to {out_path}")
    print(f"{len(assumptions_df)} assumption(s) logged - see 'Assumptions' sheet. These MUST be confirmed with the client.")
    print(f"DWS Rate Approval records loaded for point #8: {len(dws_by_po)} PO number(s)"
          + (" (none - point #8 will be Not Applicable for every PO; pass --dws)" if not dws_by_po else ""))

    if addpo_json_path:
        records = build_addpo_records(po_rows, ctx)
        with open(addpo_json_path, "w") as f:
            json.dump(records, f, indent=2)
        print(f"Wrote {len(records)} PO-line records (line-level: points 10-19) to {addpo_json_path} - insert with: node addpo.js {addpo_json_path}")

    if header_json_path:
        header_records = build_po_header_records(po_rows, ctx)
        with open(header_json_path, "w") as f:
            json.dump(header_records, f, indent=2)
        print(f"Wrote {len(header_records)} PO-header records (header-level: points 1-9) to {header_json_path} - insert with: node addheader.js {header_json_path}")

    if rc_json_path:
        rc_records = build_rc_overlap_records(rc_rows)
        with open(rc_json_path, "w") as f:
            json.dump(rc_records, f, indent=2)
        print(f"Wrote {len(rc_records)} RC Overlap records (point 20, purchaseGroups read directly from RC master) to {rc_json_path} - insert with: node addrc.js {rc_json_path}")

    # Save the cumulative point-#9 history LAST, so a run that crashed above
    # never leaves the history half-updated.
    if po9_history_path:
        save_po9_history(po9_history_path, history_extra + batch_po9_rows)
        print(
            f"Point #9 history: {len(batch_po9_rows)} row(s) from this batch + "
            f"{len(history_extra)} earlier row(s) saved to {po9_history_path}"
            + (f" ({len(fully_deleted_pos)} fully-deleted PO(s) purged)" if fully_deleted_pos else "")
        )
    else:
        print("Point #9 history DISABLED (--po9-history ''): point #9 only compared POs within this single file.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run the P2P PO audit rule engine")
    parser.add_argument("--poaudit", required=True, help="Path to POAUDIT (.csv or .xlsx)")
    parser.add_argument("--cnd", required=True, help="Path to POAUDITCND (.csv or .xlsx)")
    parser.add_argument(
        "--rc",
        required=True,
        help=(
            "Path to the RC master (.csv or .xlsx). MUST be the CUMULATIVE "
            "RC master, not just the latest file received - run "
            "'node scripts/merge-rc-master.js <new_rc_file>' first to merge "
            "a newly-received RC file into backend/data/rc_master_cumulative.csv, "
            "then pass that cumulative file here. Point #15 and RC Overlap "
            "both depend on this covering every RC ever received, not only "
            "the most recent extract - see merge-rc-master.js's own header "
            "comment for why."
        ),
    )
    parser.add_argument("--dws", default=None, help="Path to dws_rate_approval_for_po.csv (from dws_rate_approval_extract.js) - powers point #8")
    parser.add_argument(
        "--po9-history",
        default=DEFAULT_PO9_HISTORY_PATH,
        help=(
            "Path to the CUMULATIVE point-#9 history file (created/updated "
            "automatically on every run; default: %(default)s, relative to the "
            "folder you run engine.py from). Point #9 checks the current batch "
            "against this history PLUS the current batch. Pass an empty string "
            "('') to disable and compare only within the current file."
        ),
    )
    parser.add_argument("--out", default="audit_results.xlsx", help="Output xlsx path (for humans/client review)")
    parser.add_argument("--addpo-json", default=None, help="JSON for `node addpo.js <file>` (line-level, audit_results table)")
    parser.add_argument("--header-json", default=None, help="JSON for `node addheader.js <file>` (header-level, po_header_results table)")
    parser.add_argument("--rc-json", default=None, help="JSON for `node addrc.js <file>` (RC Overlap / point 20, rc_overlap_results table)")
    args = parser.parse_args()
    run(
        args.poaudit, args.cnd, args.rc, args.out,
        args.addpo_json, args.header_json, args.rc_json,
        args.dws, args.po9_history,
    )