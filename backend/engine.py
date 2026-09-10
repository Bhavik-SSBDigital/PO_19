"""
P2P Purchase Order Audit Engine
================================
Implements the audit points defined in "Procurement audit points.xlsx"
(Final sheet) against the SAP extract files:

    POAUDIT_*      -> entry point, one row per PO line item
    POAUDITCND_*   -> PO condition records (freight/tax conditions)
    POAUDITRC_*    -> Rate Contract master (all RCs, not just assigned ones)
    DWS extract    -> NEW (this revision): one row per PO number, produced by
                       dws_rate_approval_extract.js against the DWS backend -
                       see CHANGELOG "THIS REVISION" below.

Each of the three SAP inputs can be either .csv (the original export format) or
.xlsx (a direct Excel export) - see load_table() below. The DWS extract is a
.csv produced by dws_rate_approval_extract.js.

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
CHANGELOG - THIS REVISION (Point #8 rewritten to join DWS by PO number instead
of text-searching "Our Ref."; new --dws input)
===============================================================================

  ROOT CAUSE (confirmed by reading the real DWS backend source, plus the real
  POAUDIT.csv): "Our Ref." in the SAP extract only ever contains a bare tag
  like "DWS-APPROVED" / "DWS APPROVE" - it NEVER contains the approver's
  initials anywhere in the same field. The previous implementation searched
  for KKB/SRS/PJP/DAULAT/NHV/CVS INSIDE "Our Ref." itself, which can never
  match anything - every applicable row was silently coming back Not
  Verified, which is a false negative, not a real audit result. The
  approver identity and the DWS "Tag" (category) both live in DWS's own
  Postgres DB (ProcessInstance.tags / ProcessInstance.poNumbers /
  ProcessStepInstance.assignedTo+status), joined on PO NUMBER (via DWS's
  own POST /process/attach-po) - not on any text inside "Our Ref.".

  FIX: a new pre-step, dws_rate_approval_extract.js, calls the DWS API
  directly (GET /api/processes/admin-all?tag=..., GET /viewProcess/:id,
  GET /getUsers) and writes one CSV row per PO number:
  dws_rate_approval_for_po.csv (columns: po_number, dws_process_id,
  dws_tag, dws_process_status, dws_approver_username,
  dws_approver_is_manager, dws_decision_at, dws_decision_comment). This
  file is now loaded here via a new --dws CLI argument and joined into
  ctx["dws_by_po"] purely on PO number.

  rule_15_rate_approval (reports as point #8) no longer reads "Our Ref."
  or RATE_APPROVAL_TAG_TOKENS/_is_rate_approval_tag() at all. It now:
    - Not Applicable, if no DWS record exists for this PO number (no
      Rate-Approval-tagged DWS process was ever attached to it).
    - Verified, if the DWS record shows an approved step whose assignee
      holds the DWS "Manager" role (dws_approver_is_manager == True).
    - Not Verified, if a DWS record/approver exists but that approver does
      NOT hold the Manager role, or no approved step was recorded at all.

  _is_rate_approval_tag() and RATE_APPROVAL_TAG_TOKENS are LEFT IN PLACE
  below (unused by rule_15_rate_approval any more) only for reference /
  in case a fallback text-check is ever wanted again - they are dead code
  as of this revision.

  Everything else in this file (Points 1-7, 9-19, RC Overlap, header/line
  scoping, exclusion handling, point renumbering) is unchanged - see the
  CHANGELOG entries below for that history.

===============================================================================
CHANGELOG - PRIOR REVISION (Point #9 rewritten: PO Type is now the primary
differentiator, and the point no longer produces a Manual Verify / Data
Missing outcome, per direct client feedback)
===============================================================================

  Client feedback: "Remove Manual verify - it should be either verified or
  not verified. Add PO Type - if it is same then not verified and it is
  different then it should be verified. Reason of verified whether PO
  type/RFQ is different."

  1. PO TYPE IS NOW THE PRIMARY DIFFERENTIATOR FOR POINT #9. Previously,
     two POs sharing the 4-parameter core key (Vendor, Purchasing Group,
     Plant, Purchasing Date = "PO Date(Doc date)") were compared using
     RFQ ("order acknowledgement") alone to decide Verified vs Not
     Verified. Per this feedback, PO Type is now checked FIRST, ahead of
     RFQ:
       - If PO Type is the SAME as another PO sharing the 4 core
         parameters, that pair is a candidate duplicate and RFQ is then
         consulted (same blank-handling rule as before: both blank, or
         both non-blank and equal, means "still matching" -> Not
         Verified; anything else -> Verified against that specific PO).
       - If PO Type is DIFFERENT from that other PO, the pair is NOT
         treated as a duplicate at all - Verified, regardless of RFQ -
         because a different PO Type means it's a different kind of
         purchasing event even if raised the same day to the same
         vendor/plant/purchasing group.
     A PO is only Not Verified if at least one other PO shares the 4 core
     parameters AND has the same PO Type AND does not get separated out
     by RFQ.

  2. MANUAL VERIFY REMOVED. rule_19_multiple_po_same_day now only ever
     returns Verified or Not Verified for this point - there is no
     Manual Verify / Data Missing branch. A blank PO Type or blank RFQ is
     compared as a value in its own right (blank == blank still counts
     as "the same"), so a missing PO Type/RFQ can never push the result
     into a manual/missing-data outcome; it always resolves to one of the
     two binary results.

  3. REMARK NOW NAMES THE REASON FOR "VERIFIED" EXPLICITLY. When a PO is
     Verified, the remark states whether it is because PO Type is
     different, RFQ no. is different, or both - naming the specific
     other PO(s) each reason applies to, per the client's "Reason of
     verified whether PO type/RFQ is different" instruction. When a PO is
     Not Verified, the remark states that Vendor, Purchasing Group,
     Plant, Purchasing Date AND PO Type all match, and RFQ did not
     differentiate it.

  Supporting change: build_context() now also builds a per-PO
  representative PO Type ("po9_po_type_by_po"), the same way it already
  built a per-PO representative RFQ ("po9_rfq_by_po") - see the function
  for details. Nothing else about point #9's grouping (the 4-parameter
  core key, or the "PO Date(Doc date)" / "order acknowledgement" source
  columns) changed in this revision.

  (Older CHANGELOG history omitted here for length - unchanged from the
  version reviewed with the client; nothing else in this file changed.)
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
# Distinct from MANUAL/"Data Missing": used ONLY for the ZIRM/ZICP
# manual-check routing on points #6/#7 (import PO types the client wants
# a human to check), never for genuinely missing/unparseable data. See
# CHANGELOG "THIS REVISION".
MANUAL_CHECK = "Manual Check"

# ---------------------------------------------------------------------------
# Config / master lists taken directly from the rule sheet (Final sheet.csv)
# ---------------------------------------------------------------------------
# ZFB5 added per client request (points #6/#7) - see CHANGELOG.
FREIGHT_CONDITION_TYPES = {"ZBF1", "ZBF2", "ZRA3", "ZRB3", "ZRE3", "ZFB5"}

# Reference-only (does not affect any logic): ordinary pricing/tax condition
# types the client flagged as "why is this showing verified?" for EYW lines
# (points #6/#7).
NON_FREIGHT_REFERENCE_CONDITION_TYPES = {
    "R000", "NAVM", "PBXX", "NAVS", "JEXS", "ZPB0", "R001", "ZIB2", "ZPB1",
}
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
RETURN_ITEM_COLUMN = "Returns Item"
DELETION_INDICATOR_COLUMN = "Deletion indicator"

EXCLUDED_LINE_REMARK = (
    "Not Applicable - line item excluded from all audit points "
    "(Deletion indicator 'L' and/or Returns Item 'X')"
)

# --- Rule support: Over Delivery tolerance column (new #15, old #6) --------
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

# --- Rule support: point #9 grouping dimensions -----------------------------
PURCHASING_DATE_COLUMN = "PO Date(Doc date)"
RFQ_NO_COLUMN = "order acknowledgement"


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

# --- Rule support (DEAD CODE as of THIS REVISION - see CHANGELOG) ----------
# _is_rate_approval_tag()/RATE_APPROVAL_TAG_TOKENS are no longer called by
# rule_15_rate_approval, which now joins DWS data by PO number instead of
# text-searching "Our Ref.". Left in place only for reference.
RATE_APPROVAL_TAG_TOKENS = {
    "DWSAPPROVED", "DWSAAPPROVED", "DWSAPPROVAL", "DWSAPPROVE",
}


def _is_rate_approval_tag(our_ref_raw):
    normalized = re.sub(r"[\s\-]", "", (our_ref_raw or "").upper())
    return any(token in normalized for token in RATE_APPROVAL_TAG_TOKENS)


# --- Rule support: DWS Rate Approval extract (new #8, THIS REVISION) -------
# Column names expected in the CSV produced by dws_rate_approval_extract.js.
DWS_PO_NUMBER_COLUMN = "po_number"
DWS_APPROVER_USERNAME_COLUMN = "dws_approver_username"
DWS_APPROVER_IS_MANAGER_COLUMN = "dws_approver_is_manager"
DWS_DECISION_AT_COLUMN = "dws_decision_at"
DWS_PROCESS_STATUS_COLUMN = "dws_process_status"


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
    """
    NEW (THIS REVISION). Loads the CSV produced by dws_rate_approval_extract.js
    (one row per PO number - dws_process_id, dws_tag, dws_process_status,
    dws_approver_username, dws_approver_is_manager, dws_decision_at,
    dws_decision_comment) and returns a dict keyed by PO number.

    Returns {} if path is None/blank - point #8 then falls back to Not
    Applicable for every PO (no DWS data available at all), rather than
    crashing the whole run.
    """
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

# ---------------------------------------------------------------------------
# GLOBAL exclusion (applies to every one of the 19 points)
# ---------------------------------------------------------------------------

def _is_return_item(row):
    return s(row, RETURN_ITEM_COLUMN).strip().upper() == "X"


def _is_deleted_line(row):
    return s(row, DELETION_INDICATOR_COLUMN).strip().upper() == "L"


def _is_excluded_line(row):
    return _is_deleted_line(row) or _is_return_item(row)


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
        return NA, EXCLUDED_LINE_REMARK
    return fn(row, ctx)


def _po9_four_key(row):
    return (
        s(row, "Vendor Code"),
        s(row, "Purchase Group"),
        s(row, "Plant"),
        s(row, PURCHASING_DATE_COLUMN),
    )


def _po9_core_key(row):
    return (
        s(row, "Vendor Code"),
        s(row, "Purchase Group"),
        s(row, "Plant"),
    )


def _format_po_list(pos, limit=5):
    pos = sorted(pos)
    shown = ", ".join(pos[:limit])
    if len(pos) > limit:
        shown += f", and {len(pos) - limit} more"
    return shown


# ---------------------------------------------------------------------------
# Rule implementations
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
    if not purchase_req:
        return NA, "No PR assigned to this PO line"

    po_qty = parse_sap_number(s(row, "PO Qty."))
    pr_qty = parse_sap_number(s(row, "PR Qty."))
    if po_qty is None or pr_qty is None:
        return MANUAL, "PO Qty. and/or PR Qty. missing or unparseable"

    over_tolerance_raw = s(row, OVER_DELIVERY_TOLERANCE_COLUMN)
    tolerance_pct = parse_sap_number(over_tolerance_raw)
    if tolerance_pct is None:
        tolerance_pct = 0
        log_assumption(
            15,
            f"'{OVER_DELIVERY_TOLERANCE_COLUMN}' was blank for this line - treated as 0% "
            f"Overdelivery Tolerance (no buffer above PO Qty allowed).",
        )

    ceiling = po_qty * (1 + tolerance_pct / 100)

    if pr_qty < po_qty:
        return NOT_VERIFIED, (
            f"PR Qty ({pr_qty}) is less than PO Qty ({po_qty}) - PO quantity cannot "
            f"exceed PR quantity"
        )
    if pr_qty <= ceiling:
        return VERIFIED, (
            f"PR Qty ({pr_qty}) is within the allowed range: PO Qty ({po_qty}) <= PR Qty "
            f"<= PO Qty + Overdelivery Tolerance {tolerance_pct}% ({ceiling})"
        )
    return NOT_VERIFIED, (
        f"PR Qty ({pr_qty}) exceeds PO Qty ({po_qty}) + Overdelivery Tolerance "
        f"{tolerance_pct}% ({ceiling})"
    )


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
        f"{sorted(MSME_PAYMENT_TERMS)} (<=45 days credit / advance / as-per-note)"
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
    item_no = s(row, "PO Line item")
    matched_type, all_types = _freight_condition_match(po_number, item_no, ctx["cnd_by_po"])
    if matched_type:
        return VERIFIED, (
            f"Freight condition '{matched_type}' present for EYW PO line"
            f"{_other_condition_types_note(matched_type, all_types)}"
        )
    if all_types:
        return NOT_VERIFIED, (
            f"EYW PO line missing a freight condition (condition type(s) present: "
            f"{sorted(set(all_types))}, none recognised as freight)"
        )
    return NOT_VERIFIED, "EYW PO line missing a freight condition (no condition records found for this line)"


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
    """
    HEADER-LEVEL rule (see build_po_header_records) - reports as new point #8.

    THIS REVISION: no longer reads "Our Ref." at all. Joins the DWS Rate
    Approval extract (ctx["dws_by_po"], loaded from --dws, produced by
    dws_rate_approval_extract.js) purely on PO number - the real link, per
    DWS's own schema (ProcessInstance.poNumbers). See CHANGELOG.
    """
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


# ---------------------------------------------------------------------------
# Rule registry + HEADER vs LINE classification
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
    (8, "Rate approval by authorised approver (DWS, joined by PO number)", rule_15_rate_approval),
    (9, "Multiple POs to same Vendor/Purchasing Group/Plant/Purchasing Date - PO Type is the primary differentiator, RFQ secondary; always Verified/Not Verified", rule_19_multiple_po_same_day),
    # ---- LINE-LEVEL (10-19) ----
    (10, "Release Verification (PR released before PO)", rule_01_release_verification),
    (11, "PR assigned to each PO line", rule_02_pr_assigned),
    (12, "PR Creation date within 6 months (180 days) of PO", rule_03_pr_within_6_months),
    (13, "PR date precedes PO date", rule_04_pr_precedes_po),
    (14, "Delivery date after PR date", rule_05_delivery_after_pr),
    (15, "PO Qty <= PR Qty <= PO Qty x (1 + Overdelivery Tolerance %) - per PO line, not cumulative", rule_06_quantity_control),
    (16, "Vendor-Material tax code consistency (all lines count, including deleted/returned)", rule_10_vendor_material_tax_consistency),
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


def build_context(po_rows, cnd_by_po, rc_rows, dws_by_po=None):
    po_material_groups = defaultdict(list)
    vendor_material_tax = defaultdict(set)
    po9_four_groups = defaultdict(set)
    po9_core_groups = defaultdict(set)
    po9_rfq_by_po = {}
    po9_po_type_by_po = {}
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
        f"Point #9 slices on Vendor + Purchasing Group + Plant + Purchasing Date "
        f"('{PURCHASING_DATE_COLUMN}'), then decides Verified/Not Verified using PO "
        f"Type as the PRIMARY differentiator and, only when PO Type matches, RFQ "
        f"(sourced from '{RFQ_NO_COLUMN}') as the SECONDARY differentiator. This "
        f"point never produces a Manual Verify / Data Missing result.",
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
                    "excluded - Deletion indicator 'L' and/or Returns Item 'X')"
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
                    if NOT_VERIFIED in statuses:
                        status = NOT_VERIFIED
                        remark = next(r for _li, (st, r) in per_line if st == NOT_VERIFIED)
                    elif VERIFIED in statuses:
                        status = VERIFIED
                        remark = next(r for _li, (st, r) in per_line if st == VERIFIED)
                    elif NA in statuses:
                        status = NA
                        remark = next(r for _li, (st, r) in per_line if st == NA)
                    else:
                        status = per_line[0][1][0]
                        remark = per_line[0][1][1]

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

def run(poaudit_path, cnd_path, rc_path, out_path, addpo_json_path=None, header_json_path=None, rc_json_path=None, dws_path=None):
    po_rows, cnd_rows, rc_rows, cnd_by_po = load_all(poaudit_path, cnd_path, rc_path)
    dws_by_po = load_dws_rate_approvals(dws_path)

    po_rows = filter_to_scope(po_rows)
    po_rows = drop_lines_with_deletion_indicator(po_rows)

    excluded_count = sum(1 for r in po_rows if _is_excluded_line(r))
    if excluded_count:
        log_assumption(
            "Global Exclusion - Returns Item (line-level)",
            f"{excluded_count} of {len(po_rows)} remaining in-scope PO line(s) were "
            f"excluded from ALL 19 audit points (marked Not Applicable on every point, "
            f"line-level and header-level alike) because they have Returns Item = 'X'.",
        )

    ctx = build_context(po_rows, cnd_by_po, rc_rows, dws_by_po)

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
        rc_records = build_rc_overlap_records(rc_rows, po_rows)
        with open(rc_json_path, "w") as f:
            json.dump(rc_records, f, indent=2)
        print(f"Wrote {len(rc_records)} RC Overlap records (point 20, with derived purchaseGroups) to {rc_json_path} - insert with: node addrc.js {rc_json_path}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run the P2P PO audit rule engine")
    parser.add_argument("--poaudit", required=True, help="Path to POAUDIT (.csv or .xlsx)")
    parser.add_argument("--cnd", required=True, help="Path to POAUDITCND (.csv or .xlsx)")
    parser.add_argument("--rc", required=True, help="Path to POAUDITRC (.csv or .xlsx)")
    parser.add_argument("--dws", default=None, help="Path to dws_rate_approval_for_po.csv (from dws_rate_approval_extract.js) - powers point #8")
    parser.add_argument("--out", default="audit_results.xlsx", help="Output xlsx path (for humans/client review)")
    parser.add_argument("--addpo-json", default=None, help="JSON for `node addpo.js <file>` (line-level, audit_results table)")
    parser.add_argument("--header-json", default=None, help="JSON for `node addheader.js <file>` (header-level, po_header_results table)")
    parser.add_argument("--rc-json", default=None, help="JSON for `node addrc.js <file>` (RC Overlap / point 20, rc_overlap_results table)")
    args = parser.parse_args()
    run(args.poaudit, args.cnd, args.rc, args.out, args.addpo_json, args.header_json, args.rc_json, args.dws)