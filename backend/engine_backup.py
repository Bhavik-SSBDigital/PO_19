"""
P2P Purchase Order Audit Engine
================================
Implements the 19 audit points defined in "Procurement audit points.xlsx"
(Final sheet) against the SAP extract files:

    POAUDIT_*.csv      -> entry point, one row per PO line item
    POAUDITCND_*.csv   -> PO condition records (freight/tax conditions)
    POAUDITRC_*.csv    -> Rate Contract master (all RCs, not just assigned ones)

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
    python audit_engine.py --poaudit POAUDIT_x.csv --cnd POAUDITCND_x.csv --rc POAUDITRC_x.csv --out audit_results.xlsx
"""

import argparse
import csv
import json
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
# Parsing helpers (SAP CSV exports use quirky formats)
# ---------------------------------------------------------------------------
def parse_sap_date(value):
    """SAP dates come as 'YYYYMMDD' strings (sometimes '00000000' = blank)."""
    if value is None:
        return None
    v = str(value).strip()
    if not v or v == "00000000":
        return None
    try:
        return datetime.strptime(v, "%Y%m%d")
    except ValueError:
        return None


def parse_sap_number(value):
    """SAP numbers export like '2.000 ' or '9630.00-' (trailing minus)."""
    if value is None:
        return None
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
def load_csv(path):
    with open(path, encoding="latin-1") as f:
        return list(csv.DictReader(f))


def load_all(poaudit_path, cnd_path, rc_path):
    po_rows = load_csv(poaudit_path)
    cnd_rows = load_csv(cnd_path)
    rc_rows = load_csv(rc_path)

    # index conditions by PO number (POAUDITCND uses "PO NO")
    cnd_by_po = defaultdict(list)
    for r in cnd_rows:
        cnd_by_po[s(r, "PO NO")].append(r)

    return po_rows, cnd_rows, rc_rows, cnd_by_po


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
    log_assumption(1, "PR Release Ind code meaning assumed: '2' = released. Confirm actual release-strategy codes with client.")
    if rel_ind in PR_RELEASED_VALUES:
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
    return NOT_VERIFIED, f"PR date {pr_date.date()} is after PO date {po_date.date()}"


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
    has_any_rc = any(s(r, "RC no.") for r in group)
    if not has_any_rc:
        return NA, "RC not applicable to any line for this PO+material"
    rc_no = s(row, "RC no.")
    if rc_no:
        return VERIFIED, "RC assigned to this line"
    return NOT_VERIFIED, "Other line(s) with same PO+material have an RC, this line does not"


def rule_09_tax_logic(row, ctx):
    vendor_state = s(row, "Vendor State")
    tax_code = s(row, "Tax code")
    if not vendor_state or not tax_code:
        return MANUAL, "Vendor state or tax code missing"
    log_assumption(9, "IGST-vs-CGST/SGST determination requires the Tax Code Master (Tax code -> GST type mapping), "
                      "which was not provided in the uploaded files. This script cannot classify a tax code as IGST/CGST/SGST on its own.")
    return MANUAL, f"Vendor state={vendor_state}, tax code={tax_code}. Needs Tax Code Master to classify IGST vs local tax."


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


def _has_freight_condition(po_number, item_no, cnd_by_po, freight_types):
    for c in cnd_by_po.get(po_number, []):
        if s(c, "Item no").lstrip("0") == str(item_no).lstrip("0") and s(c, "Condition Type") in freight_types:
            return True
    return False


def rule_13_eyw_freight_required(row, ctx):
    inco_term = s(row, "Inco term")
    if inco_term != "EYW":
        return NA, f"Inco term is {inco_term}, not EYW"
    po_number = s(row, "PO number")
    item_no = s(row, "PO Line item")
    if _has_freight_condition(po_number, item_no, ctx["cnd_by_po"], ctx["freight_condition_types"]):
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
    if "DWS-APPROVED" not in our_ref and "DWS-AAPPROVED" not in our_ref:
        return NA, "'DWS-APPROVED' tag not found in Our Ref."
    log_assumption(15, "No separate 'DWS Tag' / 'Rate Approval' category column was present in the extract; this script only checks "
                       "for the literal text 'DWS-APPROVED' in Our Ref. and an approver initial from the approved list in the same field.")
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
    (19, "RC validity does not overlap another RC for same vendor+material", rule_19_rc_overlap),
]


# ---------------------------------------------------------------------------
# Rule 19 - Rate Contract overlap (operates on POAUDITRC, not POAUDIT)
# ---------------------------------------------------------------------------
def run_rule_19(rc_rows, overlap_map=None):
    if overlap_map is None:
        overlap_map = build_rc_overlap_map(rc_rows)
    results = []
    for r in rc_rows:
        rc_no = s(r, "RC number")
        info = overlap_map.get(rc_no, {"overlaps": [], "vendor": s(r, "Vendor Code"), "material": s(r, "RC Material Code")})
        valid_from = parse_sap_date(s(r, "RC valid from"))
        valid_to = parse_sap_date(s(r, "RC valid to"))
        status = NOT_VERIFIED if info["overlaps"] else VERIFIED
        remark = f"Overlaps with RC(s): {info['overlaps']}" if info["overlaps"] else "No overlapping RC validity found"
        results.append({
            "Vendor Code": info["vendor"], "RC Material Code": info["material"], "RC number": rc_no,
            "Valid From": valid_from.date() if valid_from else None,
            "Valid To": valid_to.date() if valid_to else None,
            "Rule 19 Status": status, "Remark": remark,
        })
    return pd.DataFrame(results)

# ---------------------------------------------------------------------------
# Build context (grouping / lookups needed by multiple rules)
# ---------------------------------------------------------------------------
def build_context(po_rows, cnd_by_po, rc_rows):
    po_material_groups = defaultdict(list)
    vendor_material_tax = defaultdict(set)
    same_day_groups = defaultdict(set)
    pr_cumulative_po_qty = defaultdict(float)

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
def run(poaudit_path, cnd_path, rc_path, out_path, addpo_json_path=None, tax_master_path=None, condition_master_path=None):
    po_rows, cnd_rows, rc_rows, cnd_by_po = load_all(poaudit_path, cnd_path, rc_path)

    ctx = build_context(po_rows, cnd_by_po, rc_rows)
    ctx["tax_master"] = load_tax_master(tax_master_path)
    ctx["freight_condition_types"] = load_condition_master(condition_master_path)

    if not ctx["tax_master"]:
        print(f"WARNING: Tax Master not loaded (path: {tax_master_path}). Rule 9 will be Manual Review for all lines.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run the P2P PO audit rule engine")
    parser.add_argument("--poaudit", required=True, help="Path to POAUDIT_*.csv")
    parser.add_argument("--cnd", required=True, help="Path to POAUDITCND_*.csv")
    parser.add_argument("--rc", required=True, help="Path to POAUDITRC_*.csv")
    parser.add_argument("--out", default="audit_results.xlsx", help="Output xlsx path (for humans/client review)")
    parser.add_argument("--addpo-json", default=None, help="Also write a JSON file shaped for `node addpo.js <file>` (DB insert)")
    parser.add_argument("--tax-master", default=None, help="Path to 'TAX code Master - Working.xlsx'")
    parser.add_argument("--condition-master", default=None, help="Path to 'Condition_type_Master.xlsx'")
    args = parser.parse_args()
    run(args.poaudit, args.cnd, args.rc, args.out, args.addpo_json, args.tax_master, args.condition_master)
