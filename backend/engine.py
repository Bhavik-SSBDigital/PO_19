"""
P2P Purchase Order Audit Engine
================================
Implements the audit points defined in "Procurement audit points.xlsx"
(Final sheet) against the SAP extract files:

    POAUDIT_*      -> entry point, one row per PO line item
    POAUDITCND_*   -> PO condition records (freight/tax conditions)
    POAUDITRC_*    -> Rate Contract master (all RCs, not just assigned ones)

Each of the three inputs can be either .csv (the original export format) or
.xlsx (a direct Excel export) - see load_table() below.

Output:
    audit_results.xlsx
        - "PO Line Results"  : one row per PO line item, one column per rule
                                 (1-19, NEW numbering - see CHANGELOG below).
        - "RC Overlap"       : RC-level results (point 20).
        - "Assumptions"       : every assumption this script had to make.
                                 THESE MUST BE CONFIRMED WITH THE CLIENT.

    <addpo-json>    : one record per PO LINE ITEM. `results` holds only the
                       LINE-LEVEL points (10 points: NEW numbers 10-19).
                       Feeds audit_results via `node addpo.js <file>`.

    <header-json>   : one record per PO NUMBER. `results` holds only the
                       HEADER-LEVEL points (9 points: NEW numbers 1-9).
                       Feeds po_header_results via `node addheader.js <file>`.

    <rc-json>       : unchanged - RC Overlap / point 20.

===============================================================================
CHANGELOG - THIS REVISION (point renumbering, per client request)
===============================================================================

  Point numbers were reassigned so HEADER-LEVEL points are contiguous 1-9
  and LINE-LEVEL points are contiguous 10-19 (previously they were
  interleaved: header points were 7,8,9,11-15,19 and line points were
  1-6,10,16-18). ONLY the numbering changed - every rule's underlying
  logic, thresholds, columns, and behavior are byte-for-byte identical to
  the prior revision. Mapping (old -> new):

      OLD  ->  NEW   Rule
      7    ->  1     RC Released
      8    ->  2     RC Assigned Consistently
      9    ->  3     GST Tax Logic
      11   ->  4     MSME Vendor Payment Term
      12   ->  5     General Vendor Payment Term
      13   ->  6     EYW Inco-Term Requires Freight Condition
      14   ->  7     EXW/FCA Must NOT Carry Freight Condition
      15   ->  8     Rate Approval by Authorised Approver
      19   ->  9     Multiple POs to Same Vendor, Same Day
      1    ->  10    Release Verification (PR released before PO)
      2    ->  11    PR Assigned to PO Line
      3    ->  12    PR Creation Date Within 6 Months of PO
      4    ->  13    PR Date Precedes PO Date
      5    ->  14    Delivery Date After PR Date
      6    ->  15    PO Quantity vs PR Quantity (Tolerance)
      10   ->  16    Vendor-Material Tax Code Consistency
      16   ->  17    Service PO (ZSER) Item Category
      17   ->  18    Service PO (ZCSR) Item Category
      18   ->  19    ZLRM Must Not Use Service Item Category

  Concretely this touched: PO_LINE_RULES (reordered + renumbered),
  HEADER_LEVEL_RULE_NOS (now {1..9}), and the few log_assumption() calls
  that had a rule number hardcoded inline (rules 07/09/10/01/06 by their
  OLD numbers - now emit their NEW numbers: 1/3/16/10/15 respectively).
  Function names (rule_01_..., rule_07_..., etc.) were LEFT AS-IS since
  they're just internal identifiers - what matters is the pointNo each
  one now reports, wired via the PO_LINE_RULES tuples below.

  IMPORTANT: this script is the SOURCE of pointNo values written into
  audit_results / po_header_results. Once this file is deployed, every
  NEW import emits new numbers directly - no separate remapping needed
  for future data. Data already sitting in the DB from an older run of
  this script still has OLD numbers and needs a one-time DB migration
  (see scripts/migrate-point-numbers.js on the Node side) - run that
  BEFORE importing anything new with this updated engine, or you'll end
  up with a mix of old- and new-numbered records with no way to tell
  them apart.

===============================================================================
CHANGELOG - PRIOR REVISION (bug-fix pass, raised against PO 4500491554 /
PO 4500491455 line 00100) - unchanged, kept for history
===============================================================================

  1. GLOBAL EXCLUSION WAS NEVER FIRING ("Deletion Indication is not applied
     for Po line item - 10, 20" / "Return item is not applied"):
     DELETION_INDICATOR_COLUMN and RETURN_ITEM_COLUMN were pointed at column
     names that DO NOT EXIST in the real POAUDIT extract ("Deletion
     Indicator" and "Return Item"). The real headers are "Deletion
     indicator" (lowercase i) and "Returns Item" (plural). Because s(row,
     col) silently returns "" for an unknown column, _is_excluded_line()
     was ALWAYS False - the entire global-exclusion feature (added last
     revision) never actually ran on any line, for any PO, ever.
     FIX: column names corrected to match the real extract:
        DELETION_INDICATOR_COLUMN = "Deletion indicator"
        RETURN_ITEM_COLUMN        = "Returns Item"
     Impact: 169 previously-live line items (160 Deletion Indicator='L',
     9 Returns Item='X', no overlap) now correctly fall back to Not
     Applicable across all 19 points, PO 4500491554 lines 10/20 included.

  2. POINT (now #3, was #9) - "Tax Code 07 not found in Tax Master" even
     though 07 IS in the master:
     load_tax_master() read the Tax Code column with pandas' default dtype
     inference. In the master workbook that column is stored as a NUMBER,
     so "07" is stored as the number 7 and the leading zero is lost before
     Python ever sees it - the dict key becomes "7", never "07". POAUDIT's
     own "Tax code" column, by contrast, is exported as literal text and
     DOES keep the leading zero ("07"). str("07") != "7", so the lookup
     failed for every 1- or 2-digit tax code with a leading zero - which
     turns out to be ~98% of all tax codes in the extract (03, 07, 01, 00,
     09, 08, 05 - only 48/91/92/A2 were unaffected).
     FIX: added normalize_tax_code() (mirrors the normCode() leading-zero
     strip already used for vendor/plant codes elsewhere in this codebase)
     and applied it to BOTH the master's keys (at load time) and the
     PO line's tax code (at lookup time in rule_09_tax_logic), so "07" and
     "7" are always treated as the same code. Alphanumeric codes ("0A")
     are left untouched since normalize_tax_code only strips a leading
     zero when it's followed by another digit.

  3. POINT (now #8, was #15) - "No rate-approval tag found in Our Ref."
     logic tightened: the real Our Ref. data contains "DWS-APPROVED", "DWS
     APPROVED", "DWS APPROVAL" and "DWS APPROVE" as rate-approval tags. The
     token set only recognised "DWS APPROVED"/"DWS-APPROVED" (normalizes
     to DWSAPPROVED); "DWS APPROVAL" and "DWS APPROVE" (-> DWSAPPROVAL /
     DWSAPPROVE) fell through to Not Applicable instead of being evaluated.
     FIX: added "DWSAPPROVAL" and "DWSAPPROVE" to RATE_APPROVAL_TAG_TOKENS.
     NOTE: the downstream approver-initials check (KKB/SRS/PJP/DAULAT/NHV/
     CVS) inside rule_15_rate_approval is UNCHANGED in this pass - per
     client instruction, DWS-approver verification itself is out of scope
     for this fix and needs separate confirmation later.

  4. POINT (now #15, was #6) - delivery tolerance was not reading the
     over-delivery column:
     OVER_DELIVERY_TOLERANCE_COLUMN pointed at "Over Delivery tolerance",
     which doesn't exist in the extract (the real header is "Overdelivery
     Tolerance Limit" - already present in the file, not something still
     "to be added"). Every over-delivery check silently fell back to the
     UNDER-delivery tolerance column instead.
     FIX: OVER_DELIVERY_TOLERANCE_COLUMN = "Overdelivery Tolerance Limit".
     The client-confirmed Overdelivery Tolerance Limit is now genuinely
     used for the over-delivery side of this rule, as originally intended.

  5. (Retained, unaffected by either pass) Points #1-9 are HEADER-LEVEL;
     points #10-19 are LINE-LEVEL. See HEADER_LEVEL_RULE_NOS / LINE_ONLY_RULES
     below.

Usage:
    python3 engine.py --poaudit POAUDIT_x.csv --cnd POAUDITCND_x.csv \
        --rc POAUDITRC_x.csv --out audit_results.xlsx \
        --addpo-json audit_results_for_db.json \
        --header-json po_header_results_for_db.json \
        --rc-json rc_overlap_for_db.json
"""

import argparse
import csv
import json
import os
import re
from collections import defaultdict
from datetime import datetime, timedelta

import pandas as pd

VERIFIED = "Verified"
NOT_VERIFIED = "Not Verified"
NA = "Not Applicable"
MANUAL = "Data Missing"

# ---------------------------------------------------------------------------
# Config / master lists taken directly from the rule sheet (Final sheet.csv)
# ---------------------------------------------------------------------------
FREIGHT_CONDITION_TYPES = {"ZBF1", "ZBF2", "ZRA3", "ZRB3", "ZRE3"}
DWS_APPROVERS = {"KKB", "SRS", "PJP", "DAULAT", "NHV", "CVS"}

# --- Rule support: MSME payment terms (new #4, old #11) --------------------
MSME_PAYMENT_TERMS = {
    "Z100": {"days": 15, "desc": "15 DAYS CREDIT"},
    "Z101": {"days": 30, "desc": "30 DAYS CREDIT"},
    "Z102": {"days": 45, "desc": "45 DAYS CREDIT"},
    "Z146": {"days": 10, "desc": "10 DAYS CREDIT"},
    "Z148": {"days": 21, "desc": "21 DAYS CREDIT"},
    "Z105": {"days": None, "desc": "100% ADVANCE AGAINST PI"},
    "Z126": {"days": None, "desc": "PAYMENT AS PER NOTE"},
}

GENERAL_TERM_EXCLUDED_PURCHASE_GROUPS = {"P46", "P02", "P43"}
GENERAL_TERM_EXCLUDED_PAYMENT_TERMS = {"Z105", "Z126", "Z142"}
GUJARAT_STATE_CODE = "GJ"

VALID_PURCHASE_GROUPS = {
    "P02", "P09", "P13", "P14", "P15", "P16", "P43", "P46",
    "P55", "P60", "P61", "P64", "P62",
}

RC_PLACEHOLDER_PO_TYPES = {"ZTWK"}

PR_RELEASED_VALUES = {"2"}          # ASSUMPTION - confirm with client
RC_RELEASED_VALUES = {"R"}          # ASSUMPTION - confirm with client

SIX_MONTHS_DAYS = 180

# --- GLOBAL exclusion support (applies to ALL 19 points) -------------------
# These are the REAL column headers from the POAUDIT extract (confirmed
# against POAUDIT.csv). Previously "Deletion Indicator" / "Return Item" -
# neither exists in the extract, so the exclusion never fired for any line
# (see CHANGELOG - prior revision, item 1).
RETURN_ITEM_COLUMN = "Returns Item"
DELETION_INDICATOR_COLUMN = "Deletion indicator"

EXCLUDED_LINE_REMARK = (
    "Not Applicable - line item excluded from all audit points "
    "(Deletion indicator 'L' and/or Returns Item 'X')"
)

# --- Rule support: Over Delivery tolerance column (new #15, old #6) --------
# This column already exists in the extract under this exact name
# (confirmed against POAUDIT.csv) - it was NOT still "to be added" as
# previously assumed. Wires the over-delivery side of this rule to the
# client-confirmed Overdelivery Tolerance Limit instead of silently
# falling back to Under Delivery tolerance for every line.
OVER_DELIVERY_TOLERANCE_COLUMN = "Overdelivery Tolerance Limit"

# --- Rules support: PO types requiring manual check (new #6/#7, old #13/#14)
MANUAL_CHECK_PO_TYPES = {"ZIRM", "ZICP"}

# --- Rule support: GSTIN -> state code (new #3, old #9) --------------------
GSTIN_COLUMN = "Tax Number 3"       # ASSUMPTION - confirm exact header with client
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

# ---------------------------------------------------------------------------
# Item Category code -> SAP external letter, per the client-provided table
# (received 2026-07-29).
# ---------------------------------------------------------------------------
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
)  # "9"
ITEM_CATEGORY_SUBCONTRACTING_CODE = next(
    code for code, v in ITEM_CATEGORY_CODE_MAP.items() if v["letter"] == "L"
)  # "3"

# --- Rule support: normalized rate-approval tag matching (new #8, old #15) -
# Added DWSAPPROVAL / DWSAPPROVE - real Our Ref. values "DWS APPROVAL" and
# "DWS APPROVE" were falling through to Not Applicable before this, because
# only "DWS APPROVED"/"DWS-APPROVED" normalized to a recognised token.
# Approver-initials check below this is unchanged (out of scope).
RATE_APPROVAL_TAG_TOKENS = {
    "APPROVEDRATE", "APPROVERATE", "RATEAPPROVAL", "APPROVEDRAT",
    "DWSAPPROVED", "DWSAAPPROVED", "DWSAPPROVAL", "DWSAPPROVE",
}


def _is_rate_approval_tag(our_ref_raw):
    normalized = re.sub(r"[\s\-]", "", (our_ref_raw or "").upper())
    return any(token in normalized for token in RATE_APPROVAL_TAG_TOKENS)


ASSUMPTIONS = []


def log_assumption(rule_no, text):
    ASSUMPTIONS.append({"Rule": rule_no, "Assumption": text})


# ---------------------------------------------------------------------------
# Parsing helpers (SAP exports use quirky formats)
# ---------------------------------------------------------------------------
def parse_sap_date(value):
    if value is None:
        return None
    v = str(value).strip()
    if not v or v == "00000000":
        return None
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


# ---------------------------------------------------------------------------
# Tax-code normalization (used by the GST Tax Logic rule, new #3)
# ---------------------------------------------------------------------------
def normalize_tax_code(value):
    """
    FIX for "Tax Code 07 not found in Tax Master": the Tax Code column in
    the Tax Master workbook is stored as a NUMBER, so a code like "07" is
    stored as the number 7 and loses its leading zero the moment
    Excel/pandas reads it. POAUDIT's own "Tax code" column is exported as
    text and keeps the leading zero ("07"). str("07") != str(7), so a
    direct dict lookup always failed for any 1-2 digit code with a leading
    zero (which is ~98% of the codes actually in the extract: 00/01/03/05/
    07/08/09).

    Mirrors the normCode() leading-zero strip already used for vendor and
    plant codes elsewhere in this codebase: strip a leading zero only when
    it's followed by ANOTHER digit, so "07" -> "7" and "7" -> "7" (now
    equal), while alphanumeric codes like "0A" are left untouched (no
    digit follows the leading zero there).
    """
    s_ = str(value).strip().upper()
    if not s_:
        return s_
    if re.match(r"^\d+\.0$", s_):        # "7.0" -> "7" (float artifact)
        s_ = s_[:-2]
    s_ = re.sub(r"^0+(?=\d)", "", s_)    # "07" -> "7"; "0" stays "0"; "0A" stays "0A"
    return s_


# ---------------------------------------------------------------------------
# Load data
# ---------------------------------------------------------------------------
EXCEL_EXTENSIONS = {".xlsx", ".xlsm", ".xls"}
CSV_EXTENSIONS = {".csv", ".txt"}

PO_DATE_COLUMNS = ("PO Created date", "PR Creation date", "Delivery Date")
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

    # Read Tax Code as text so pandas doesn't coerce it to a number (which
    # would silently drop leading zeros before normalize_tax_code even gets
    # a chance to run). Both this key and the PO's own tax code are passed
    # through normalize_tax_code() so "07"/"7" always match - see
    # normalize_tax_code() docstring above.
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

# ---------------------------------------------------------------------------
# GLOBAL exclusion (applies to every one of the 19 points)
# ---------------------------------------------------------------------------

def _is_return_item(row):
    return s(row, RETURN_ITEM_COLUMN).strip().upper() == "X"


def _is_deleted_line(row):
    return s(row, DELETION_INDICATOR_COLUMN).strip().upper() == "L"


def _is_excluded_line(row):
    return _is_deleted_line(row) or _is_return_item(row)


def evaluate_rule(rule_no, fn, row, ctx):
    """
    Single dispatcher every rule call goes through (xlsx dump,
    build_addpo_records, build_po_header_records). If the line item is
    excluded (Deletion indicator 'L' and/or Returns Item 'X'), returns a
    uniform Not Applicable for EVERY rule without calling the rule
    function at all - this is what makes the exclusion apply identically
    across all 19 points instead of being reimplemented per rule.
    """
    if _is_excluded_line(row):
        return NA, EXCLUDED_LINE_REMARK
    return fn(row, ctx)


# ---------------------------------------------------------------------------
# Rule implementations
# Each function takes (row, ctx) and returns (status, remark)
# Exclusion (Deletion indicator / Returns Item) is handled centrally by
# evaluate_rule() above - these functions assume they're only ever called
# for an eligible (non-excluded) line item.
#
# Function names below still carry their OLD point numbers (rule_01_...,
# rule_07_..., etc.) - these are just internal identifiers and were left
# alone per the "don't change anything except numbering" instruction. The
# actual pointNo each rule reports comes from the PO_LINE_RULES list further
# down, which now uses the NEW numbers.
# ---------------------------------------------------------------------------

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


def rule_06_quantity_control(row, ctx):
    po_type = s(row, "PO Type")
    if po_type in {"ZSER", "ZCSR"}:
        return NA, f"Not applicable for PO type {po_type}"
    purchase_req = s(row, "Purchase Req")
    pr_line = s(row, "PR line Item no.")
    pr_qty = parse_sap_number(s(row, "PR Qty."))
    if not purchase_req or pr_qty is None or pr_qty == 0:
        return NA, "PR qty not available (no PR line, or unparseable)"
    cumulative_po_qty = ctx["pr_cumulative_po_qty"].get((purchase_req, pr_line), 0)
    if cumulative_po_qty <= pr_qty:
        return VERIFIED, f"Cumulative PO qty ({cumulative_po_qty}) across all POs against this PR is within PR qty ({pr_qty})"

    under_tolerance_pct = parse_sap_number(s(row, "Under Delivery tolerance")) or 0
    over_tolerance_raw = s(row, OVER_DELIVERY_TOLERANCE_COLUMN)
    if over_tolerance_raw:
        tolerance_pct = parse_sap_number(over_tolerance_raw) or under_tolerance_pct
    else:
        tolerance_pct = under_tolerance_pct
        log_assumption(
            15,
            f"'{OVER_DELIVERY_TOLERANCE_COLUMN}' was blank for this line - fell back to "
            f"'Under Delivery tolerance' for the over-delivery check.",
        )

    excess_pct = (cumulative_po_qty - pr_qty) / pr_qty * 100
    if excess_pct <= tolerance_pct:
        return VERIFIED, f"Cumulative PO qty exceeds PR qty by {excess_pct:.1f}% (across all partial POs against this PR), within tolerance {tolerance_pct}%"
    return NOT_VERIFIED, f"Cumulative PO qty exceeds PR qty by {excess_pct:.1f}% (across all partial POs against this PR), tolerance {tolerance_pct}%"


def rule_07_rc_released(row, ctx):
    """HEADER-LEVEL rule (see build_po_header_records) - reports as new point #1."""
    rc_no = s(row, "RC no.")
    if not rc_no:
        return NA, "No RC assigned to this line"
    rc_status = s(row, "RC Release status")
    log_assumption(1, "RC Release status code meaning assumed: 'R' = released. Confirm actual codes with client.")
    if rc_status in RC_RELEASED_VALUES:
        return VERIFIED, "RC is released"
    return NOT_VERIFIED, f"RC Release status = '{rc_status}' not in released set"


def rule_08_rc_consistency(row, ctx):
    """HEADER-LEVEL rule (see build_po_header_records) - reports as new point #2."""
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
    """HEADER-LEVEL rule (see build_po_header_records) - reports as new point #3."""
    vendor_state = s(row, "Vendor State").upper()
    tax_code = s(row, "Tax code")

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

    if not vendor_state or not tax_code:
        return MANUAL, "Vendor state or tax code missing (Vendor State blank and GSTIN unavailable/unrecognised)"

    tax_master = ctx.get("tax_master", {})
    tax = tax_master.get(normalize_tax_code(tax_code))  # normalize before lookup ("07" -> "7")

    if not tax:
        return MANUAL, f"Tax Code {tax_code} not found in Tax Master"

    category_token = _normalize_category_tokens(tax["category"])

    if category_token in GST_NOT_APPLICABLE_TOKENS:
        return NA, f"Tax Code {tax_code} category '{tax['category']}' is not a GST in-state/out-of-state code (VAT/CST/exempt/etc.)"

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
    """HEADER-LEVEL rule (see build_po_header_records) - reports as new point #4."""
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
        f"{sorted(MSME_PAYMENT_TERMS)} (<=45 days credit / advance / as-per-note)"
    )


def rule_12_general_payment_term(row, ctx):
    """HEADER-LEVEL rule (see build_po_header_records) - reports as new point #5."""
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


def _has_freight_condition(po_number, item_no, cnd_by_po):
    for c in cnd_by_po.get(po_number, []):
        if s(c, "Item no").lstrip("0") == str(item_no).lstrip("0") and s(c, "Condition Type") in FREIGHT_CONDITION_TYPES:
            return True
    return False


def rule_13_eyw_freight_required(row, ctx):
    """
    HEADER-LEVEL rule (see build_po_header_records) - reports as new point #6.

    PO types ZIRM/ZICP route to manual review here too (previously only
    rule 14/new #7 had this).
    """
    po_type = s(row, "PO Type")
    if po_type in MANUAL_CHECK_PO_TYPES:
        return MANUAL, (
            f"PO type {po_type} is an import PO type flagged by the client for manual "
            f"check rather than an automated EYW freight-condition verdict."
        )

    inco_term = s(row, "Inco term")
    if inco_term != "EYW":
        return NA, f"Inco term is {inco_term}, not EYW"
    po_number = s(row, "PO number")
    item_no = s(row, "PO Line item")
    if _has_freight_condition(po_number, item_no, ctx["cnd_by_po"]):
        return VERIFIED, "Freight condition present for EYW PO line"
    return NOT_VERIFIED, "EYW PO line missing a freight condition"


def rule_14_exw_fca_no_freight(row, ctx):
    """
    HEADER-LEVEL rule (see build_po_header_records) - reports as new point #7.

    PO types ZIRM/ZICP route to manual review instead of an automated
    Verified/Not-Verified outcome.
    """
    po_type = s(row, "PO Type")
    if po_type in MANUAL_CHECK_PO_TYPES:
        return MANUAL, (
            f"PO type {po_type} is an import PO type flagged by the client for manual "
            f"check rather than an automated EXW/FCA freight-condition verdict."
        )

    inco_term = s(row, "Inco term")
    if inco_term not in {"EXW", "FCA"}:
        return NA, f"Inco term is {inco_term}, not EXW/FCA"
    po_number = s(row, "PO number")
    item_no = s(row, "PO Line item")
    if _has_freight_condition(po_number, item_no, ctx["cnd_by_po"]):
        return NOT_VERIFIED, "EXW/FCA PO line has a freight condition (should be omitted)"
    return VERIFIED, "No freight condition on EXW/FCA PO line"


def rule_15_rate_approval(row, ctx):
    """HEADER-LEVEL rule (see build_po_header_records) - reports as new point #8."""
    our_ref = s(row, "Our Ref.")
    if not _is_rate_approval_tag(our_ref):
        return NA, "No rate-approval tag found in Our Ref."

    our_ref_upper = our_ref.upper()
    if any(code in our_ref_upper for code in DWS_APPROVERS):
        return VERIFIED, "Approval initials found in Our Ref."
    return NOT_VERIFIED, "Rate-approval tag present but no recognised approver initials (KKB/SRS/PJP/DAULAT/NHV/CVS) found"


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
    """HEADER-LEVEL rule (see build_po_header_records) - reports as new point #9."""
    po_number = s(row, "PO number")
    key = (s(row, "Vendor Code"), s(row, "PO Created date"), s(row, "Plant"), s(row, "Purchase Group"))
    pos_in_group = ctx["same_day_groups"].get(key, set())
    if len(pos_in_group) > 1:
        others = sorted(pos_in_group - {po_number})
        return NOT_VERIFIED, f"Multiple POs created same day/vendor/plant/group: also see {others}"
    return VERIFIED, "No other PO matches same vendor/date/plant/purchasing group"


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


# ---------------------------------------------------------------------------
# Rule registry + HEADER vs LINE classification
#
# RENUMBERED (see CHANGELOG at top): pointNo values below are the NEW
# numbers. Header points are now contiguous 1-9; line points 10-19. Each
# tuple's rule_no (first element) is what actually gets written out as
# `pointNo` - the function names are unrelated legacy identifiers.
# ---------------------------------------------------------------------------
HEADER_LEVEL_RULE_NOS = {1, 2, 3, 4, 5, 6, 7, 8, 9}

PO_LINE_RULES = [
    # ---- HEADER-LEVEL (1-9) ----
    (1, "RC released", rule_07_rc_released),
    (2, "RC assigned consistently across same-material lines", rule_08_rc_consistency),
    (3, "IGST only for non-Gujarat vendors", rule_09_tax_logic),
    (4, "MSME payment term (Z100/Z101/Z102/Z146/Z148/Z105/Z126)", rule_11_msme_payment_term),
    (5, "General payment term >=21 days", rule_12_general_payment_term),
    (6, "EYW inco-term requires freight condition", rule_13_eyw_freight_required),
    (7, "EXW/FCA must not have freight condition", rule_14_exw_fca_no_freight),
    (8, "Rate approval by authorised approver", rule_15_rate_approval),
    (9, "Multiple POs to same vendor/date/plant/purchase-group flagged", rule_19_multiple_po_same_day),
    # ---- LINE-LEVEL (10-19) ----
    (10, "Release Verification (PR released before PO)", rule_01_release_verification),
    (11, "PR assigned to each PO line", rule_02_pr_assigned),
    (12, "PR Creation date within 6 months (180 days) of PO", rule_03_pr_within_6_months),
    (13, "PR date precedes PO date", rule_04_pr_precedes_po),
    (14, "Delivery date after PR date", rule_05_delivery_after_pr),
    (15, "PO qty vs PR qty (tolerance)", rule_06_quantity_control),
    (16, "Vendor-Material tax code consistency", rule_10_vendor_material_tax_consistency),
    (17, "Service PO (ZSER) uses Item Cat D + Acct Assignment K", rule_16_zser_item_category),
    (18, "Service PO (ZCSR) uses Item Cat D + Acct Assignment A", rule_17_zcsr_item_category),
    (19, "ZLRM/ZLCP/ZIRM/ZICP must not use Item Cat L + Acct Assignment K", rule_18_lrm_no_l_category),
]

HEADER_RULES = [r for r in PO_LINE_RULES if r[0] in HEADER_LEVEL_RULE_NOS]
LINE_ONLY_RULES = [r for r in PO_LINE_RULES if r[0] not in HEADER_LEVEL_RULE_NOS]


def run_rc_overlap(rc_rows):
    results = []
    by_vendor_material = defaultdict(list)
    for r in rc_rows:
        vendor = s(r, "Vendor Code")
        material = s(r, "RC Material Code")
        valid_from = parse_sap_date(s(r, "RC valid from"))
        valid_to = parse_sap_date(s(r, "RC valid to"))
        by_vendor_material[(vendor, material)].append(
            {"RC number": s(r, "RC number"), "from": valid_from, "to": valid_to, "raw": r}
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
                    "Valid From": rc_a["from"].date() if rc_a["from"] else None,
                    "Valid To": rc_a["to"].date() if rc_a["to"] else None,
                    "RC Overlap Status": status,
                    "Remark": remark,
                }
            )
    return pd.DataFrame(results)


def build_rc_purchase_groups(po_rows):
    groups = defaultdict(set)
    for row in po_rows:
        rc_no = s(row, "RC no.")
        if not rc_no:
            continue
        vendor = s(row, "Vendor Code")
        material = s(row, "Material Code")
        purchase_group = s(row, "Purchase Group")
        if purchase_group:
            groups[(vendor, material, rc_no)].add(purchase_group)
    return groups


def build_rc_overlap_records(rc_rows, po_rows):
    rc_purchase_groups = build_rc_purchase_groups(po_rows)

    records = []
    by_vendor_material = defaultdict(list)
    skipped_incomplete = 0
    for r in rc_rows:
        vendor = s(r, "Vendor Code")
        material = s(r, "RC Material Code")
        valid_from = parse_sap_date(s(r, "RC valid from"))
        valid_to = parse_sap_date(s(r, "RC valid to"))
        rc_no = s(r, "RC number")

        if not (vendor and material and rc_no):
            skipped_incomplete += 1
            continue

        by_vendor_material[(vendor, material)].append(
            {"rc_no": rc_no, "from": valid_from, "to": valid_to}
        )

    if skipped_incomplete:
        log_assumption(
            "RC Overlap",
            f"{skipped_incomplete} row(s) in the RC master (POAUDITRC) were excluded from the "
            f"RC Overlap output because Vendor Code and/or RC Material Code and/or RC number "
            f"was blank."
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

            purchase_groups = sorted(
                rc_purchase_groups.get((vendor, material, rc_a["rc_no"]), set())
            )

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


def build_context(po_rows, cnd_by_po, rc_rows):
    po_material_groups = defaultdict(list)
    vendor_material_tax = defaultdict(set)
    same_day_groups = defaultdict(set)
    pr_cumulative_po_qty = defaultdict(float)
    rc_overlaps = {}

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

    for row in po_rows:
        po_number = s(row, "PO number")
        material = s(row, "Material Code")
        po_material_groups[(po_number, material)].append(row)

        vendor = s(row, "Vendor Code")
        tax_code = s(row, "Tax code")
        if vendor and material and tax_code:
            vendor_material_tax[(vendor, material)].add(tax_code)

        key = (vendor, s(row, "PO Created date"), s(row, "Plant"), s(row, "Purchase Group"))
        same_day_groups[key].add(po_number)

        purchase_req = s(row, "Purchase Req")
        pr_line = s(row, "PR line Item no.")
        if purchase_req:
            po_qty = parse_sap_number(s(row, "PO Qty.")) or 0
            pr_cumulative_po_qty[(purchase_req, pr_line)] += po_qty

    return {
        "po_material_groups": po_material_groups,
        "vendor_material_tax": vendor_material_tax,
        "same_day_groups": same_day_groups,
        "cnd_by_po": cnd_by_po,
        "pr_cumulative_po_qty": pr_cumulative_po_qty,
        "rc_overlaps": rc_overlaps,
    }

STATUS_TO_RESULT_FLAGS = {
    VERIFIED: {"verified": True, "not_applicable": False, "missing_data": False, "manual_verification": False},
    NOT_VERIFIED: {"verified": False, "not_applicable": False, "missing_data": False, "manual_verification": False},
    NA: {"verified": False, "not_applicable": True, "missing_data": False, "manual_verification": False},
    MANUAL: {"verified": False, "not_applicable": False, "missing_data": True, "manual_verification": True},
}


def build_addpo_records(po_rows, ctx):
    """
    One record per PO LINE ITEM. `results` contains ONLY the 10 LINE-LEVEL
    points (NEW numbers 10-19). A line item with Deletion indicator 'L'
    and/or Returns Item 'X' gets a uniform Not Applicable across all 10
    (via evaluate_rule), same as every other point.
    """
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


def build_po_header_records(po_rows, ctx):
    """
    One record per PO NUMBER. `results` contains ONLY the 9 HEADER-LEVEL
    points (NEW numbers 1-9), evaluated once per PO instead of once per
    line.

    Excluded lines (Deletion indicator 'L' / Returns Item 'X') are dropped
    from the per-PO evaluation set first.
    """
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
                    "excluded - Deletion indicator 'L' and/or Returns Item 'X')"
                )
            else:
                per_line = [
                    (s(r, "PO Line item"), evaluate_rule(rule_no, fn, r, ctx))
                    for r in eligible_rows
                ]
                statuses = {status for _li, (status, _remark) in per_line}
                if len(statuses) == 1:
                    status, remark = per_line[0][1]
                else:
                    status = MANUAL
                    detail = "; ".join(f"line {li or '?'}: {st}" for li, (st, _r) in per_line)
                    remark = (
                        f"Header-level rule returned different results across this PO's "
                        f"eligible line items - needs manual review ({detail})"
                    )
                    log_assumption(
                        rule_no,
                        f"PO {po_number}: header-level point {rule_no} disagreed across "
                        f"eligible line items and was routed to Data Missing/manual "
                        f"review instead of picking one line's answer.",
                    )
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


def run(poaudit_path, cnd_path, rc_path, out_path, addpo_json_path=None, header_json_path=None, rc_json_path=None):
    po_rows, cnd_rows, rc_rows, cnd_by_po = load_all(poaudit_path, cnd_path, rc_path)

    po_rows = filter_to_scope(po_rows)

    excluded_count = sum(1 for r in po_rows if _is_excluded_line(r))
    if excluded_count:
        log_assumption(
            "Global Exclusion",
            f"{excluded_count} of {len(po_rows)} in-scope PO line(s) were excluded from "
            f"ALL 19 audit points (marked Not Applicable on every point, line-level and "
            f"header-level alike) because they have Deletion indicator = 'L' and/or "
            f"Returns Item = 'X'.",
        )

    ctx = build_context(po_rows, cnd_by_po, rc_rows)

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
        rc_records = build_rc_overlap_records(rc_rows, po_rows)
        with open(rc_json_path, "w") as f:
            json.dump(rc_records, f, indent=2)
        print(f"Wrote {len(rc_records)} RC Overlap records (point 20, with derived purchaseGroups) to {rc_json_path} - insert with: node addrc.js {rc_json_path}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run the P2P PO audit rule engine")
    parser.add_argument("--poaudit", required=True, help="Path to POAUDIT (.csv or .xlsx)")
    parser.add_argument("--cnd", required=True, help="Path to POAUDITCND (.csv or .xlsx)")
    parser.add_argument("--rc", required=True, help="Path to POAUDITRC (.csv or .xlsx)")
    parser.add_argument("--out", default="audit_results.xlsx", help="Output xlsx path (for humans/client review)")
    parser.add_argument("--addpo-json", default=None, help="JSON for `node addpo.js <file>` (line-level, audit_results table)")
    parser.add_argument("--header-json", default=None, help="JSON for `node addheader.js <file>` (header-level, po_header_results table)")
    parser.add_argument("--rc-json", default=None, help="JSON for `node addrc.js <file>` (RC Overlap / point 20, rc_overlap_results table)")
    args = parser.parse_args()
    run(args.poaudit, args.cnd, args.rc, args.out, args.addpo_json, args.header_json, args.rc_json)