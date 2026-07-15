"""
P2P Purchase Order Audit Engine
================================
Implements the 19 audit points defined in "Procurement audit points.xlsx"
(Final sheet) against the SAP extract files:

    POAUDIT_*      -> entry point, one row per PO line item
    POAUDITCND_*   -> PO condition records (freight/tax conditions)
    POAUDITRC_*    -> Rate Contract master (all RCs, not just assigned ones)

Each of the three inputs can be either .csv (the original export format) or
.xlsx (a direct Excel export) - see load_table() below.

Output:
    audit_results.xlsx
        - "PO Line Results"  : one row per PO line item, one column per rule (1-18)
                                 with Verified / Not Verified / Not Applicable /
                                 Manual Review Required, plus a remarks column.
        - "Rule 19 - RC Overlap" : RC-level results (rule 19 is not a PO-line rule).
        - "Assumptions"       : every assumption this script had to make, because
                                 some rules depend on master data / config that
                                 was not present in the uploaded files. THESE MUST
                                 BE CONFIRMED WITH THE CLIENT (see accompanying
                                 Word document).

Usage:
    python audit_engine.py --poaudit POAUDIT_x.xlsx --cnd POAUDITCND_x.xlsx --rc POAUDITRC_x.xlsx --out audit_results.xlsx
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
MANUAL = "Manual Review Required"

# ---------------------------------------------------------------------------
# Config / master lists taken directly from the rule sheet (Final sheet.csv)
# ---------------------------------------------------------------------------
FREIGHT_CONDITION_TYPES = {"ZBF1", "ZBF2", "ZRA3", "ZRB3", "ZRE3"}
DWS_APPROVERS = {"KKB", "SRS", "PJP", "DAULAT", "NHV", "CVS"}
MSME_PAYMENT_TERM = "Z102"
GENERAL_TERM_EXCLUDED_PURCHASE_GROUPS = {"P46", "P02", "P43"}
GENERAL_TERM_EXCLUDED_PAYMENT_TERMS = {"Z105", "Z126", "Z142"}
GUJARAT_STATE_CODE = "GJ"
VALID_PURCHASE_GROUPS = {
    "P02", "P09", "P13", "P14", "P15", "P16", "P43", "P46",
    "P55", "P60", "P61", "P64", "P62",
}

# PR release indicator / RC release status codes are SAP config-dependent and
# were NOT confirmed by the client at the time of writing. See Assumptions sheet.
PR_RELEASED_VALUES = {"2"}          # ASSUMPTION - confirm with client
RC_RELEASED_VALUES = {"R"}          # ASSUMPTION - confirm with client

ASSUMPTIONS = []


def log_assumption(rule_no, text):
    ASSUMPTIONS.append({"Rule": rule_no, "Assumption": text})


# ---------------------------------------------------------------------------
# Parsing helpers (SAP exports use quirky formats)
# ---------------------------------------------------------------------------
def parse_sap_date(value):
    """SAP dates come as 'YYYYMMDD' strings (sometimes '00000000' = blank).

    By the time a value reaches this function it has already been through
    normalize_sap_date() at load time (see load_all()), so it is always one
    of: a clean 'YYYYMMDD' string, or '' / None for blank. This function is
    kept simple and only has to deal with that canonical form - all the
    messy format-detection work lives in normalize_sap_date().
    """
    if value is None:
        return None

    v = str(value).strip()
    if not v or v == "00000000":
        return None

    try:
        return datetime.strptime(v, "%Y%m%d")
    except ValueError:
        # Shouldn't normally happen post-normalization, but fall back to a
        # permissive parse rather than crashing the whole run over one bad cell.
        try:
            return datetime.fromisoformat(v.split(" ")[0])
        except ValueError:
            return None


def parse_sap_number(value):
    """SAP numbers export like '2.000 ' or '9630.00-' (trailing minus)."""
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
# Load data
# ---------------------------------------------------------------------------
EXCEL_EXTENSIONS = {".xlsx", ".xlsm", ".xls"}
CSV_EXTENSIONS = {".csv", ".txt"}

# Date columns that need normalizing right after load - see normalize_sap_date().
PO_DATE_COLUMNS = ("PO Created date", "PR Creation date", "Delivery Date")
RC_DATE_COLUMNS = ("RC valid from", "RC valid to")


def normalize_sap_date(value):
    """
    Normalize a raw date cell into the canonical 'YYYYMMDD' string that the
    rest of this script (parse_sap_date and every rule function) expects.

    This wasn't needed when the only input format was CSV, where SAP always
    exports dates as plain 'YYYYMMDD' text. Now that .xlsx exports are also
    accepted, the same column can arrive as a handful of different shapes
    depending on how Excel/openpyxl/pandas read the cell:
        - a native datetime.datetime / pandas.Timestamp (Excel cell formatted
          as a date)
        - a bare Excel serial number (cell not formatted as a date)
        - plain text in 'YYYYMMDD', 'YYYY-MM-DD', 'DD.MM.YYYY',
          'DD-MM-YYYY', or 'MM/DD/YYYY' form
        - blank / NaN / SAP's '00000000' "no date" sentinel

    Doing this once, at load time, means parse_sap_date and every rule
    function downstream keep working exactly as before, on a plain
    'YYYYMMDD' string, regardless of which file format the value came from.
    """
    if value is None:
        return ""

    # pandas/numpy NaN (blank Excel cells read with dtype=object can still
    # surface as float('nan') even after an upstream fillna in some pandas
    # versions, so this check stays as a safety net)
    if isinstance(value, float):
        try:
            if pd.isna(value):
                return ""
        except Exception:
            pass

    # Native datetime / pandas Timestamp - what openpyxl/pandas hand back for
    # a properly-formatted Excel date cell.
    if isinstance(value, datetime):
        return value.strftime("%Y%m%d")
    if hasattr(value, "to_pydatetime"):
        try:
            return value.to_pydatetime().strftime("%Y%m%d")
        except Exception:
            pass

    # Bare Excel serial date number (only reached if the cell wasn't
    # formatted as a date in Excel). An 8-digit 'YYYYMMDD' encoded as a raw
    # number (e.g. 20260623) is far larger than any realistic Excel serial
    # (Excel day 1 = 1900-01-01; serials for the 2020s are in the ~45000s),
    # so the two ranges don't collide.
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        ival = int(value)
        if ival == 0:
            return ""
        if 1 <= ival <= 100000:
            try:
                return (datetime(1899, 12, 30) + timedelta(days=ival)).strftime("%Y%m%d")
            except Exception:
                return ""
        value = str(ival)  # e.g. 20260623 read in as a plain number - fall through to string handling

    v = str(value).strip()
    if not v or v in {"00000000", "nan", "NaT", "None"}:
        return ""

    if re.match(r"^\d{8}$", v):
        return v

    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})", v)  # ISO, optionally with a time part
    if m:
        return f"{m.group(1)}{m.group(2)}{m.group(3)}"

    m = re.match(r"^(\d{1,2})[.\-](\d{1,2})[.\-](\d{4})$", v)  # SAP/European D.M.Y
    if m:
        day, month, year = m.groups()
        return f"{year}{int(month):02d}{int(day):02d}"

    m = re.match(r"^(\d{1,2})/(\d{1,2})/(\d{4})$", v)  # US M/D/Y
    if m:
        month, day, year = m.groups()
        return f"{year}{int(month):02d}{int(day):02d}"

    try:
        return datetime.fromisoformat(v.split(" ")[0]).strftime("%Y%m%d")
    except Exception:
        return v  # unrecognised format - parse_sap_date's own fallback will catch it downstream


def load_table(path):
    """
    Load a SAP extract as a list of dicts, whether it's the older .csv export
    or a direct .xlsx export. Every value comes back as a string (or, for
    .xlsx, occasionally a native date/number type that the rest of this
    module already knows how to handle); blank cells are normalized to "" in
    both cases, so rule functions and the s()/parse_sap_number() helpers
    don't need to care which format the file arrived in.
    """
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

    # Normalize every known date column to a canonical 'YYYYMMDD' string right
    # at load time - see normalize_sap_date() for why this is needed now that
    # .xlsx is a supported input format alongside .csv.
    for row in po_rows:
        for col in PO_DATE_COLUMNS:
            if col in row:
                row[col] = normalize_sap_date(row[col])

    for row in rc_rows:
        for col in RC_DATE_COLUMNS:
            if col in row:
                row[col] = normalize_sap_date(row[col])

    # index conditions by PO number (POAUDITCND uses "PO NO")
    cnd_by_po = defaultdict(list)
    for r in cnd_rows:
        cnd_by_po[s(r, "PO NO")].append(r)

    return po_rows, cnd_rows, rc_rows, cnd_by_po



def load_tax_master(base_folder):
    # base_folder is "Batch 1". We need to look one folder up in the parent directory to find "Masters"
    parent_dir = os.path.dirname(base_folder)
    path = os.path.join(parent_dir, "Masters", "TAX code Master - Working.xlsx")

    # Fallback just in case it's in the current folder
    if not os.path.exists(path):
        path = os.path.join(base_folder, "Masters", "TAX code Master - Working.xlsx")

    if not os.path.exists(path):
        print(f"⚠️ WARNING: Tax Master not found! Checked {path}")
        return {}

    df = pd.read_excel(path).fillna("")
    mapping = {}
    for _, r in df.iterrows():
        mapping[str(r["Tax Code"]).strip()] = {
            "category": str(r["Category"]).strip().upper(),
            "description": str(r["Tax Description"]).strip(),
        }
    return mapping

# ---------------------------------------------------------------------------
# Rule implementations
# Each function takes (row, ctx) and returns (status, remark)
# ---------------------------------------------------------------------------

def rule_01_release_verification(row, ctx):
    po_type = s(row, "PO Type")
    purchase_req = s(row, "Purchase Req")
    if po_type in {"ZSER", "ZJVW", "ZJWV"}:
        return NA, f"Not applicable for PO type {po_type}"
    if not purchase_req:
        return NA, "Purchase Req is blank"
    rel_ind = s(row, "PR Release Ind")
    if rel_ind == "2":
        return VERIFIED, "PR is released"
    return NOT_VERIFIED, f"PR Release Ind = '{rel_ind}' not in released set"

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
    if pr_date >= po_date - timedelta(days=183):
        return VERIFIED, "PR within 6 months of PO"
    return NOT_VERIFIED, f"PR date {pr_date.date()} is more than 6 months before PO date {po_date.date()}"


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
    # Per the spec note ("SSBD should cumulate the qty to check PO Qty. against
    # PR" / dashboard doc's partial-PO example), this compares the SUM of PO
    # qty across every PO line referencing this PR line - not just this one
    # PO line - against the PR qty.
    cumulative_po_qty = ctx["pr_cumulative_po_qty"].get((purchase_req, pr_line), 0)
    if cumulative_po_qty <= pr_qty:
        return VERIFIED, f"Cumulative PO qty ({cumulative_po_qty}) across all POs against this PR is within PR qty ({pr_qty})"
    tolerance_raw = s(row, "Under Delivery tolerance")
    tolerance_pct = parse_sap_number(tolerance_raw) or 0
    log_assumption(6, "Tolerance % is read from 'Under Delivery tolerance' column and applied as "
                      "(cumulative PO qty across all partial POs against a PR - PR qty)/PR qty <= tolerance%. "
                      "The rule sheet notes 'Policy will be provided by Utpalbhai' for the tolerance figure itself - "
                      "confirm the actual tolerance policy with the client; this script only cumulates correctly, "
                      "it doesn't know the intended tolerance %.")
    excess_pct = (cumulative_po_qty - pr_qty) / pr_qty * 100
    if excess_pct <= tolerance_pct:
        return VERIFIED, f"Cumulative PO qty exceeds PR qty by {excess_pct:.1f}% (across all partial POs against this PR), within tolerance {tolerance_pct}%"
    return NOT_VERIFIED, f"Cumulative PO qty exceeds PR qty by {excess_pct:.1f}% (across all partial POs against this PR), tolerance {tolerance_pct}%"


def rule_07_rc_released(row, ctx):
    rc_no = s(row, "RC no.")
    if not rc_no:
        return NA, "No RC assigned to this line"
    rc_status = s(row, "RC Release status")
    log_assumption(7, "RC Release status code meaning assumed: 'R' = released. Confirm actual codes with client.")
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
    vendor_state = s(row, "Vendor State").upper()
    tax_code = s(row, "Tax code")

    if not vendor_state or not tax_code:
        return MANUAL, "Vendor state or tax code missing"

    tax_master = ctx.get("tax_master", {})
    tax = tax_master.get(tax_code)

    if not tax:
        return MANUAL, f"Tax Code {tax_code} not found in Tax Master"

    gst_type = tax["category"]

    if vendor_state == "GUJARAT" or vendor_state == "GJ":
        if gst_type in ("CGST+SGST", "CGST/SGST", "LOCAL"):
            return VERIFIED, f"Local vendor. Tax code {tax_code} is {gst_type}."
        return NOT_VERIFIED, f"Vendor is in Gujarat but Tax Code {tax_code} is {gst_type}."

    else:
        if gst_type == "IGST":
            return VERIFIED, f"Outside Gujarat. Tax code {tax_code} is IGST."
        return NOT_VERIFIED, f"Vendor is outside Gujarat but Tax Code {tax_code} is {gst_type}."
    
      
def rule_10_vendor_material_tax_consistency(row, ctx):
    vendor = s(row, "Vendor Code")
    material = s(row, "Material Code")
    tax_codes = ctx["vendor_material_tax"].get((vendor, material), set())
    if len(tax_codes) <= 1:
        return VERIFIED, "Consistent tax code for this vendor-material combination (within this extract)"
    log_assumption(10, "This rule is described as needing 'historical data' across all past POs. This script only checks consistency "
                       "within the single extract provided; a production run should compare against the full transaction history.")
    return NOT_VERIFIED, f"Multiple tax codes found for vendor {vendor} / material {material}: {sorted(tax_codes)}"


def rule_11_msme_payment_term(row, ctx):
    msme_status = s(row, "Vendor MSME Status")
    if not msme_status:
        return NA, "Vendor has no MSME certificate on file"
    payment_term = s(row, "Payment Term")
    if payment_term == MSME_PAYMENT_TERM:
        return VERIFIED, f"MSME vendor with payment term {MSME_PAYMENT_TERM} (<=45 days)"
    return NOT_VERIFIED, f"MSME vendor with payment term {payment_term}, expected {MSME_PAYMENT_TERM}"


def rule_12_general_payment_term(row, ctx):
    msme_status = s(row, "Vendor MSME Status")
    purchase_group = s(row, "Purchase Group")
    payment_term = s(row, "Payment Term")
    po_type = s(row, "PO Type")
    if msme_status:
        return NA, "MSME vendor (covered by rule 11)"
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
    inco_term = s(row, "Inco term")
    if inco_term != "EYW":
        return NA, f"Inco term is {inco_term}, not EYW"
    po_number = s(row, "PO number")
    item_no = s(row, "PO Line item")
    if _has_freight_condition(po_number, item_no, ctx["cnd_by_po"]):
        return VERIFIED, "Freight condition present for EYW PO line"
    return NOT_VERIFIED, "EYW PO line missing a freight condition"


def rule_14_exw_fca_no_freight(row, ctx):
    inco_term = s(row, "Inco term")
    if inco_term not in {"EXW", "FCA"}:
        return NA, f"Inco term is {inco_term}, not EXW/FCA"
    po_number = s(row, "PO number")
    item_no = s(row, "PO Line item")
    if _has_freight_condition(po_number, item_no, ctx["cnd_by_po"]):
        return NOT_VERIFIED, "EXW/FCA PO line has a freight condition (should be omitted)"
    return VERIFIED, "No freight condition on EXW/FCA PO line"


def rule_15_rate_approval(row, ctx):
    our_ref = s(row, "Our Ref.").upper()
    # Reverting to NA. If the tag is missing, it skips the check instead of failing it.
    if "DWS-APPROVED" not in our_ref and "DWS-AAPPROVED" not in our_ref:
        return NA, "'DWS-APPROVED' tag not found in Our Ref."
        
    if any(code in our_ref for code in DWS_APPROVERS):
        return VERIFIED, "Approval initials found in Our Ref."
    return NOT_VERIFIED, "DWS-APPROVED tag present but no recognised approver initials found"


def rule_16_service_po_item_category(row, ctx):
    po_type = s(row, "PO Type")
    if po_type != "ZSER":
        return NA, f"PO type is {po_type}, not ZSER"
    item_cat_disc = s(row, "Item category disc")
    account_assignment = s(row, "Account Assignment")
    log_assumption(16, "The raw 'Item Category' column in this extract contains internal numeric codes (e.g. 0, 3, 7, 9), not the "
                       "letters 'D'/'L' referenced in the rule text. This script instead matches on 'Item category disc' == 'Service' "
                       "as a proxy for category D. Confirm the correct Item Category code for 'D' with the client / SAP config.")
    if item_cat_disc == "Service" and account_assignment == "K":
        return VERIFIED, "Service item category and account assignment K present"
    return NOT_VERIFIED, f"Item category disc={item_cat_disc}, Account Assignment={account_assignment}"


def rule_17_zlrm_no_service_category(row, ctx):
    po_type = s(row, "PO Type")
    if po_type != "ZLRM":
        return NA, f"PO type is {po_type}, not ZLRM"
    item_cat_disc = s(row, "Item category disc")
    account_assignment = s(row, "Account Assignment")
    if item_cat_disc == "Service" and account_assignment == "K":
        return NOT_VERIFIED, "ZLRM PO line incorrectly uses Service item category + account assignment K"
    return VERIFIED, "ZLRM PO line does not use Service/K combination"


def rule_18_multiple_po_same_day(row, ctx):
    po_number = s(row, "PO number")
    key = (s(row, "Vendor Code"), s(row, "PO Created date"), s(row, "Plant"), s(row, "Purchase Group"))
    pos_in_group = ctx["same_day_groups"].get(key, set())
    if len(pos_in_group) > 1:
        others = sorted(pos_in_group - {po_number})
        return NOT_VERIFIED, f"Multiple POs created same day/vendor/plant/group: also see {others}"
    return VERIFIED, "No other PO matches same vendor/date/plant/purchasing group"


def rule_19_rc_overlap(row, ctx):
    rc_no = s(row, "RC no.")
    if not rc_no:
        return NA, "No RC assigned to this line"
    
    vendor = s(row, "Vendor Code")
    material = s(row, "Material Code")
    
    overlaps = ctx.get("rc_overlaps", {}).get((vendor, material, rc_no))
    if overlaps:
        return NOT_VERIFIED, f"RC {rc_no} overlaps with other RC(s): {overlaps}"
    return VERIFIED, "No overlapping RC validity found"

PO_LINE_RULES = [
    (1, "Release Verification (PR released before PO)", rule_01_release_verification),
    (2, "PR assigned to each PO line", rule_02_pr_assigned),
    (3, "PR Creation date within 6 months of PO", rule_03_pr_within_6_months),
    (4, "PR date precedes PO date", rule_04_pr_precedes_po),
    (5, "Delivery date after PR date", rule_05_delivery_after_pr),
    (6, "PO qty vs PR qty (tolerance)", rule_06_quantity_control),
    (7, "RC released", rule_07_rc_released),
    (8, "RC assigned consistently across same-material lines", rule_08_rc_consistency),
    (9, "IGST only for non-Gujarat vendors", rule_09_tax_logic),
    (10, "Vendor-Material tax code consistency", rule_10_vendor_material_tax_consistency),
    (11, "MSME payment term <=45 days (Z102)", rule_11_msme_payment_term),
    (12, "General payment term >=21 days", rule_12_general_payment_term),
    (13, "EYW inco-term requires freight condition", rule_13_eyw_freight_required),
    (14, "EXW/FCA must not have freight condition", rule_14_exw_fca_no_freight),
    (15, "Rate approval by authorised approver", rule_15_rate_approval),
    (16, "Service PO (ZSER) uses Item Cat D + Acct Assignment K", rule_16_service_po_item_category),
    (17, "ZLRM must not use Item Cat D + Acct Assignment K", rule_17_zlrm_no_service_category),
    (18, "Multiple POs to same vendor on same day flagged", rule_18_multiple_po_same_day),
    (19, "RC Overlap Validation", rule_19_rc_overlap),
]
PO_LINE_RULES = [
    (1, "Release Verification (PR released before PO)", rule_01_release_verification),
    (2, "PR assigned to each PO line", rule_02_pr_assigned),
    (3, "PR Creation date within 6 months of PO", rule_03_pr_within_6_months),
    (4, "PR date precedes PO date", rule_04_pr_precedes_po),
    (5, "Delivery date after PR date", rule_05_delivery_after_pr),
    (6, "PO qty vs PR qty (tolerance)", rule_06_quantity_control),
    (7, "RC released", rule_07_rc_released),
    (8, "RC assigned consistently across same-material lines", rule_08_rc_consistency),
    (9, "IGST only for non-Gujarat vendors", rule_09_tax_logic),
    (10, "Vendor-Material tax code consistency", rule_10_vendor_material_tax_consistency),
    (11, "MSME payment term <=45 days (Z102)", rule_11_msme_payment_term),
    (12, "General payment term >=21 days", rule_12_general_payment_term),
    (13, "EYW inco-term requires freight condition", rule_13_eyw_freight_required),
    (14, "EXW/FCA must not have freight condition", rule_14_exw_fca_no_freight),
    (15, "Rate approval by authorised approver", rule_15_rate_approval),
    (16, "Service PO (ZSER) uses Item Cat D + Acct Assignment K", rule_16_service_po_item_category),
    (17, "ZLRM must not use Item Cat D + Acct Assignment K", rule_17_zlrm_no_service_category),
    (18, "Multiple POs to same vendor on same day flagged", rule_18_multiple_po_same_day),
    (19, "RC Overlap Validation", rule_19_rc_overlap),
]

PO_LINE_RULES = [
    (1, "Release Verification (PR released before PO)", rule_01_release_verification),
    (2, "PR assigned to each PO line", rule_02_pr_assigned),
    (3, "PR Creation date within 6 months of PO", rule_03_pr_within_6_months),
    (4, "PR date precedes PO date", rule_04_pr_precedes_po),
    (5, "Delivery date after PR date", rule_05_delivery_after_pr),
    (6, "PO qty vs PR qty (tolerance)", rule_06_quantity_control),
    (7, "RC released", rule_07_rc_released),
    (8, "RC assigned consistently across same-material lines", rule_08_rc_consistency),
    (9, "IGST only for non-Gujarat vendors", rule_09_tax_logic),
    (10, "Vendor-Material tax code consistency", rule_10_vendor_material_tax_consistency),
    (11, "MSME payment term <=45 days (Z102)", rule_11_msme_payment_term),
    (12, "General payment term >=21 days", rule_12_general_payment_term),
    (13, "EYW inco-term requires freight condition", rule_13_eyw_freight_required),
    (14, "EXW/FCA must not have freight condition", rule_14_exw_fca_no_freight),
    (15, "Rate approval by authorised approver", rule_15_rate_approval),
    (16, "Service PO (ZSER) uses Item Cat D + Acct Assignment K", rule_16_service_po_item_category),
    (17, "ZLRM must not use Item Cat D + Acct Assignment K", rule_17_zlrm_no_service_category),
    (18, "Multiple POs to same vendor on same day flagged", rule_18_multiple_po_same_day),
]



# ---------------------------------------------------------------------------
# Rule 19 - Rate Contract overlap (operates on POAUDITRC, not POAUDIT)
# ---------------------------------------------------------------------------
def run_rule_19(rc_rows):
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
                    "Rule 19 Status": status,
                    "Remark": remark,
                }
            )
    return pd.DataFrame(results)


# ---------------------------------------------------------------------------
# Build context (grouping / lookups needed by multiple rules)
# ---------------------------------------------------------------------------
def build_context(po_rows, cnd_by_po, rc_rows):
    po_material_groups = defaultdict(list)
    vendor_material_tax = defaultdict(set)
    same_day_groups = defaultdict(set)
    pr_cumulative_po_qty = defaultdict(float)
    rc_overlaps = {}

    # Pre-calculate RC overlaps for rule 19
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
    Build one JSON record per PO line item, in the exact shape addpo.js
    expects (same field names as prisma/schema.prisma's AuditResult model).
    Feed the output straight into: node addpo.js <this_file>.json
    """
    records = []
    for row in po_rows:
        po_number = s(row, "PO number")
        line_item = s(row, "PO Line item")

        results = []
        for rule_no, _title, fn in PO_LINE_RULES:
            status, remark = fn(row, ctx)
            flags = STATUS_TO_RESULT_FLAGS[status]
            results.append({"pointNo": str(rule_no), "remarks": [remark], **flags})

        po_created_date = parse_sap_date(s(row, "PO Created date"))
        po_delivery_date = parse_sap_date(s(row, "Delivery Date"))
        pr_create_date = parse_sap_date(s(row, "PR Creation date"))
        po_status = s(row, "PO status")

        record = {
            "type": "PO",
            "po_number": po_number,
            "po_material_number": f"{po_number}-{line_item}",
            "po_type": s(row, "PO Type"),
            "po_status": po_status,
            # Per the spec: "Hold PO Due Date = PO date + 30 days"
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
            # ASSUMPTION: the SAP extract has no fiscal-year column; using the
            # PO created year as a stand-in. Confirm with client whether SAP's
            # fiscal year (which may not equal calendar year) should be used instead.
            "fiscalYear": str(po_created_date.year) if po_created_date else None,
            "auditedOn": datetime.now().strftime("%Y-%m-%d"),
            "results": results,
        }
        records.append(record)
    return records


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def run(poaudit_path, cnd_path, rc_path, out_path, addpo_json_path=None):
    po_rows, cnd_rows, rc_rows, cnd_by_po = load_all(poaudit_path, cnd_path, rc_path)

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
            status, remark = fn(row, ctx)
            record[f"Rule {rule_no}"] = status
            record[f"Rule {rule_no} Remark"] = remark
        output_rows.append(record)

    df = pd.DataFrame(output_rows)
    rule19_df = run_rule_19(rc_rows)
    assumptions_df = pd.DataFrame(ASSUMPTIONS).drop_duplicates()

    with pd.ExcelWriter(out_path, engine="openpyxl") as writer:
        df.to_excel(writer, sheet_name="PO Line Results", index=False)
        rule19_df.to_excel(writer, sheet_name="Rule 19 - RC Overlap", index=False)
        assumptions_df.to_excel(writer, sheet_name="Assumptions", index=False)

    print(f"Wrote {len(df)} PO-line results and {len(rule19_df)} RC-overlap rows to {out_path}")
    print(f"{len(assumptions_df)} assumption(s) logged - see 'Assumptions' sheet. These MUST be confirmed with the client.")

    if addpo_json_path:
        records = build_addpo_records(po_rows, ctx)
        with open(addpo_json_path, "w") as f:
            json.dump(records, f, indent=2)
        print(f"Wrote {len(records)} records to {addpo_json_path} - insert with: node addpo.js {addpo_json_path}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run the P2P PO audit rule engine")
    parser.add_argument("--poaudit", required=True, help="Path to POAUDIT (.csv or .xlsx)")
    parser.add_argument("--cnd", required=True, help="Path to POAUDITCND (.csv or .xlsx)")
    parser.add_argument("--rc", required=True, help="Path to POAUDITRC (.csv or .xlsx)")
    parser.add_argument("--out", default="audit_results.xlsx", help="Output xlsx path (for humans/client review)")
    parser.add_argument("--addpo-json", default=None, help="Also write a JSON file shaped for `node addpo.js <file>` (DB insert)")
    args = parser.parse_args()
    run(args.poaudit, args.cnd, args.rc, args.out, args.addpo_json)