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
                                 (1-19) with Verified / Not Verified /
                                 Not Applicable / Data Missing,
                                 plus a remarks column.
        - "RC Overlap"       : RC-level results (the sheet's own point - not
                                 numbered on the client's rule sheet, but it
                                 is the 20th of the 20 total audit points -
                                 see CHANGELOG below).
        - "Assumptions"       : every assumption this script had to make.
                                 THESE MUST BE CONFIRMED WITH THE CLIENT.

CHANGELOG (this revision - 2026-07-28, rules 16/17/18 Item Category mapping confirmed):
    - Rules 16, 17, and 18 previously returned "Data Missing" for every line
      unconditionally, because the raw "Item Category" code -> SAP letter
      (D/L) mapping had not been confirmed by the client (see earlier
      CHANGELOG entry below). That mapping has now been derived directly
      from the real POAUDIT.csv extract: cross-referencing the raw "Item
      Category" column against the descriptive "Item category disc" column
      across all 1085 rows shows an unambiguous, dataset-wide mapping with
      no exceptions:
          Item Category '0' -> 'Standard'
          Item Category '3' -> 'Subcontracting'  (SAP item category 'L')
          Item Category '7' -> 'Stock transfer'
          Item Category '9' -> 'Service'          (SAP item category 'D')
      This also matches PO-type behavior in the data: every ZSER line is
      ('9','K'), every ZCSR line is ('9','A'), and every ZLRM/ZLCP/ZIRM
      line uses Item Category '0' (never '3') - i.e. exactly what points
      16/17/18 expect. Rules 16, 17, and 18 now perform the actual
      Verified/Not Verified check using ITEM_CATEGORY_SERVICE_CODE ('9')
      and ITEM_CATEGORY_SUBCONTRACTING_CODE ('3') instead of always
      returning Data Missing. This mapping is derived from this extract's
      data, not an explicit client document, so it is still logged as an
      assumption for the client to confirm holds for future extracts too -
      but it is no longer an unconfirmed guess about which raw values are
      even in use.

CHANGELOG (earlier revision - 2026-07-28, RC Overlap blank-key fix):
    - Fixed a bug in build_rc_overlap_records(): rows from POAUDITRC were
      grouped into by_vendor_material keyed on (Vendor Code, RC Material
      Code) with NO check that those two fields (or RC number) were
      actually populated. A row with a blank Vendor Code and blank RC
      Material Code (but a non-blank RC number) was still grouped under the
      key ("", "") and emitted as its own RC Overlap record - which then
      failed downstream in `node addrc.js` with "vendorCode, rcMaterialCode,
      and rcNumber are all required" (see production run, RC record 367,
      RC number 4600004714).
      build_context() (used for the in-line, per-PO-line overlap check)
      already guarded against this with
      `if vendor and material and valid_from and valid_to and rc_no:` -
      build_rc_overlap_records() was simply missing the equivalent guard.
      It now skips any POAUDITRC row missing Vendor Code, RC Material Code,
      or RC number, and logs a "RC Overlap" assumption noting how many rows
      were skipped so it can be traced back to the source data and
      confirmed/cleaned with the client, instead of silently emitting a
      record with empty keys that addrc.js then rejects one at a time.

CHANGELOG (earlier revision - 2026-07-28, full 20-point rule sheet received):
    The client has now provided the full "Procurement audit points" sheet
    with all 20 points spelled out. Comparing it line-by-line against the
    previous revision of this script surfaced a real numbering bug, not
    just a cosmetic one:

    - Point 17 ("Service PO / 64 Series" = PO type ZCSR, Item Category "D" +
      Account Assignment "A") was NEVER implemented. What the code called
      "rule_17" was actually the client's point 18 (the ZLRM check) wearing
      the wrong label. This was almost certainly the "one point was missing"
      the client mentioned earlier - NOT a gap that needed a brand-new
      invented rule.
    - Because of that, the speculative "Rule 20 - RC Assignment
      Completeness" added in the previous revision is REMOVED from the
      numbered rule set. It was a best-guess for the missing point, but now
      that the real spec is in hand, the actual 20th point is the RC
      Overlap check (already implemented, previously mis-numbered as
      "Rule 19" on its own sheet). The RC-Assignment-Completeness idea may
      still have audit value, but it is not one of the client's 20 points,
      so it no longer runs by default. The function has been deleted from
      this revision; ping if you want it reinstated as an unofficial extra.
    - Point 18 ("ZLRM must not use Item Category L + Account Assignment K")
      applies to PO types ZLRM, ZLCP, ZIRM, and ZICP per the client's
      Remarks column - the previous code only checked ZLRM. Fixed.
    - Point 19 ("multiple POs to same vendor/date/plant/purchase group") is
      renumbered from 18 -> 19 to match the client sheet, now that point 17
      is filled in correctly.
    - Rule 1 (Release Verification) now compares against the
      PR_RELEASED_VALUES constant instead of a hardcoded "2" literal - no
      behavior change today, just removes a latent inconsistency (the
      constant existed but wasn't actually used).
    - VALID_PURCHASE_GROUPS was defined (matching the sheet's header note:
      "Data based on Purchase Group ... and PO Type, For Hold PO consider
      PO date + 30 days") but was never applied anywhere - dead config.
      This revision now filters PO lines to that purchase-group set before
      auditing, and logs an assumption that the "and PO Type" part of that
      same header note is unclear (which PO types should scope the data)
      and needs client confirmation. If you don't want this filter applied,
      say so and it can be reverted to "audit every row" behavior.

    PO_LINE_RULES is now exactly rules 1-19 (19 entries). The RC Overlap
    check is the 20th point and continues to live in its own sheet/section,
    exactly as before - it is not, and per the client's own sheet was never
    meant to be, a per-PO-line rule.

CHANGELOG (earlier revision - 2026-07-28 client feedback):
    - Rule 3 / Rule 5: "6 months" is now 180 days (was 183).
    - Renamed the MANUAL status label from "Manual Review Required" to
      "Data Missing" per client request. The underlying JSON flags
      (missing_data / manual_verification) are UNCHANGED - addpo.js and the
      DB schema depend on those exact field names, only the human-facing
      label text changed.
    - Rule 9 (tax logic): "Vendor State" is blank on almost every row in the
      real extract (confirmed by client SQL: 24/24 sampled failures were
      "Vendor state or tax code missing"). Client says the real signal is
      GSTIN, in column "Tax Number 3" - NOT confirmed exact header, flagged
      as assumption. Rule 9 now falls back to deriving the state from the
      first 2 digits of the GSTIN (Tax Number 3) when "Vendor State" is
      blank, using the standard GST state-code table. Only a partial state
      code map is embedded (states seen in this dataset); an unrecognised
      code falls through to Data Missing rather than being guessed at.
    - Rule 16 / 17 (Item Category D/L, as understood at the time): client
      confirmed the previous proxy (Item category disc == "Service") is
      WRONG - it was marking ZSER lines Verified when the item category was
      not actually D. The actual code->letter mapping (what raw code means
      "D", what raw code means "L") has NOT been provided yet. Until it is,
      this script does not guess: ZSER/ZCSR/ZLRM/ZLCP/ZIRM/ZICP lines fall
      through to Data Missing (manual_verification=True) instead of being
      auto-Verified/Not-Verified. This removes the false-positive Verified
      results the client flagged, at the cost of these rules requiring
      manual review until the real code mapping is confirmed - see
      ASSUMPTION logged for rules 16/17/18.

CHANGELOG (earlier revision - RC Overlap access control):
    - RC master data (POAUDITRC) has no purchasing-group column of its own,
      but the client wants Buyers restricted to "RC Overlap rows relevant
      to me" the same way they're already restricted on the PO Data page
      (by purchase_group). To make that possible, build_rc_overlap_records()
      now also takes po_rows and cross-references POAUDIT ("RC no." +
      "Vendor Code" + "Material Code" + "Purchase Group") to derive, per RC,
      the set of purchasing groups whose PO lines actually reference it.
      That set is emitted as a new "purchaseGroups" array field on each RC
      Overlap record, feeding the new RcOverlapResult.purchaseGroups column.
      --rc-json / build_rc_overlap_records() signature changed accordingly -
      see run() below.

CHANGELOG (earlier revision - RC Overlap gets its own list/section):
    - Client requested RC Overlap be shown as its own dedicated list/section
      rather than mixed in with the other PO-line audit points. This is now
      the 20th of the 20 total audit points and lives entirely separately:
        * It does not appear in a PO line's `results` array, in the
          "PO Line Results" sheet's per-rule columns, or in the addpo-json
          records fed into audit_results (DB table `audit_results`).
        * build_rc_overlap_records() + --rc-json CLI flag produce a
          separate JSON file, one record per RC (vendor + material + RC
          number), meant for a new `node addrc.js <file>` importer feeding
          a new `rc_overlap_results` DB table - which is what backs the new
          standalone RC Overlap page/section.
        * rule_rc_overlap() and run_rc_overlap() are both left in place
          unchanged - the "RC Overlap" Excel sheet still gets written
          exactly as before - only the per-PO-line duplication of that same
          check has been removed.

CHANGELOG (earlier revision):
    - Rule 9 (tax logic) compared the Tax Master's "Category" string against
      "CGST+SGST" / "CGST/SGST" / "LOCAL". The actual master data
      (TAX code Master - Working.xlsx) uses "SGST+CGST" (opposite order) and
      never contains "LOCAL" - so the exact-string comparison always failed
      and every Gujarat-vendor line was marked Not Verified regardless of
      whether its tax code was actually correct. Comparison is now done on a
      normalized (whitespace/case/order independent) token set, and
      non-GST-regime categories (VAT, CST, Excise, "No GST", "Input Tax",
      "Out of GST", "Composit Scheme", GTA, ST, Works Contracts - all present
      in the real master) are treated as Not Applicable instead of being
      forced through a GST-only pass/fail test.
    - Rule 15 (rate approval) looked for the literal substring "DWS-APPROVED"
      / "DWS-AAPPROVED" in "Our Ref.". That literal string does not occur
      anywhere in the real POAUDIT extracts; the actual data encodes the same
      intent as "APPROVEDRATE", "ApprovedRate", "RATEAPPROVAL",
      "APPROVE RATE", "APPROVED RAT" etc. The tag match is now normalized
      (uppercased, whitespace/hyphen stripped) and matches any of these
      known rate-approval tag variants, so the rule actually evaluates
      instead of falling through to Not Applicable on every row.

Usage:
    python3 engine.py --poaudit POAUDIT_x.xlsx --cnd POAUDITCND_x.xlsx \
        --rc POAUDITRC_x.xlsx --out audit_results.xlsx \
        --addpo-json audit_results_for_db.json \
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
# Renamed from "Manual Review Required" per client request (2026-07-28).
# NOTE: only the display label changed - the JSON flags this maps to
# (missing_data / manual_verification in STATUS_TO_RESULT_FLAGS, and the
# DB columns addpo.js writes) are UNCHANGED so existing consumers keep working.
MANUAL = "Data Missing"

# ---------------------------------------------------------------------------
# Config / master lists taken directly from the rule sheet (Final sheet.csv)
# ---------------------------------------------------------------------------
FREIGHT_CONDITION_TYPES = {"ZBF1", "ZBF2", "ZRA3", "ZRB3", "ZRE3"}
DWS_APPROVERS = {"KKB", "SRS", "PJP", "DAULAT", "NHV", "CVS"}
MSME_PAYMENT_TERM = "Z102"
GENERAL_TERM_EXCLUDED_PURCHASE_GROUPS = {"P46", "P02", "P43"}
GENERAL_TERM_EXCLUDED_PAYMENT_TERMS = {"Z105", "Z126", "Z142"}
GUJARAT_STATE_CODE = "GJ"

# Sheet header note: "Data based on Purchase Group (...) and PO Type, For
# Hold PO consider PO date + 30 days". This is the master scope filter for
# the WHOLE audit, applied in run() below before any rule executes.
VALID_PURCHASE_GROUPS = {
    "P02", "P09", "P13", "P14", "P15", "P16", "P43", "P46",
    "P55", "P60", "P61", "P64", "P62",
}

# PR release indicator / RC release status codes are SAP config-dependent and
# were NOT confirmed by the client at the time of writing. See Assumptions sheet.
PR_RELEASED_VALUES = {"2"}          # ASSUMPTION - confirm with client
RC_RELEASED_VALUES = {"R"}          # ASSUMPTION - confirm with client

# 6 months, per client: "6 months = 180 days" (was 183 in the previous
# revision - do not change back without client sign-off).
SIX_MONTHS_DAYS = 180

# --- Rule 9 support: GSTIN -> state code -----------------------------------
# Standard GST state codes (first 2 digits of a 15-digit GSTIN). Only states
# actually seen so far in this client's data are populated with confidence;
# add more as they show up. An unmapped code intentionally falls through to
# Data Missing in rule_09 rather than being guessed at.
# ASSUMPTION - confirm the exact column header with the client; using
# "Tax Number 3" per their note, but this has not been verified against a
# real extract.
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


def _state_from_gstin(gstin_raw):
    """Return the state name for a GSTIN's leading 2-digit state code, or
    None if the value isn't a recognisable GSTIN / the code isn't mapped."""
    g = (gstin_raw or "").strip().upper()
    if len(g) < 2 or not g[:2].isdigit():
        return None
    return GST_STATE_CODE_MAP.get(g[:2])


# --- Rule 9 support: normalized GST-category classification -----------------
def _normalize_category_tokens(category_raw):
    """Return a canonical, order/space/case-independent token for a Tax
    Master 'Category' value, e.g. 'SGST + CGST', 'sgst+cgst', 'CGST+SGST'
    all normalize to the same token."""
    c = (category_raw or "").upper()
    c = c.replace(" ", "")
    # Strip trailing modifiers like "+TCS" - they don't change whether the
    # code is an in-state or out-of-state GST code.
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

# --- Rules 16/17/18 support: Item Category code mapping --------------------
# Confirmed against the real POAUDIT.csv extract (2026-07-28): cross-
# referencing the raw "Item Category" column against the descriptive "Item
# category disc" column across all 1085 rows shows an unambiguous mapping,
# with no exceptions anywhere in the file:
#     Item Category '0' -> 'Standard'
#     Item Category '3' -> 'Subcontracting'  (SAP item category 'L')
#     Item Category '7' -> 'Stock transfer'
#     Item Category '9' -> 'Service'          (SAP item category 'D')
# This also lines up with PO-type behavior in the data (every ZSER line is
# ('9','K'), every ZCSR line is ('9','A'), every ZLRM/ZLCP/ZIRM line uses
# '0', never '3') - i.e. exactly what the client's points 16/17/18 expect.
# Still worth confirming with the client that this mapping is stable across
# future extracts, since it's derived from data rather than an explicit
# code-list document, but it is no longer a guess about which values exist.
ITEM_CATEGORY_SERVICE_CODE = "9"           # SAP item category "D" (Service)
ITEM_CATEGORY_SUBCONTRACTING_CODE = "3"    # SAP item category "L" (Subcontracting)

# --- Rule 15 support: normalized rate-approval tag matching ------------------
RATE_APPROVAL_TAG_TOKENS = {
    "APPROVEDRATE", "APPROVERATE", "RATEAPPROVAL", "APPROVEDRAT", "DWSAPPROVED", "DWSAAPPROVED",
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
    """SAP dates come as 'YYYYMMDD' strings (sometimes '00000000' = blank).

    By the time a value reaches this function it has already been through
    normalize_sap_date() at load time (see load_all()), so it is always one
    of: a clean 'YYYYMMDD' string, or '' / None for blank.
    """
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

PO_DATE_COLUMNS = ("PO Created date", "PR Creation date", "Delivery Date")
RC_DATE_COLUMNS = ("RC valid from", "RC valid to")


def normalize_sap_date(value):
    """
    Normalize a raw date cell into the canonical 'YYYYMMDD' string that the
    rest of this script (parse_sap_date and every rule function) expects.
    """
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
    """
    Apply the rule sheet's header scope note: "Data based on Purchase Group
    (P02,P09,P13,P14,P15,P16,P43,P46,P55,P60,P61,P64,P62) and PO Type ...".
    Only the Purchase Group half of that filter is unambiguous, so only that
    part is applied here; rows outside VALID_PURCHASE_GROUPS are dropped
    from the audit entirely (not just marked Not Applicable), and a count is
    logged as an assumption for visibility.

    The "and PO Type" clause is NOT applied - it isn't clear from the sheet
    which PO types are meant to further scope the data (e.g. is it just
    ZSER/ZCSR/ZLRM/etc., or something else entirely), so this is flagged as
    an open question rather than guessed at.
    """
    in_scope = [r for r in po_rows if s(r, "Purchase Group") in VALID_PURCHASE_GROUPS]
    dropped = len(po_rows) - len(in_scope)
    if dropped:
        log_assumption(
            "Scope",
            f"{dropped} of {len(po_rows)} PO line(s) were excluded from the audit because their "
            f"Purchase Group was not in the sheet's confirmed list ({sorted(VALID_PURCHASE_GROUPS)}). "
            f"The sheet's header note also says 'and PO Type' should further scope the data, but "
            f"does not say which PO types - that half of the filter was NOT applied. Confirm with "
            f"the client whether (a) the purchase-group filter should be applied at all here, or "
            f"is already applied upstream when the extract is pulled, and (b) what the 'and PO Type' "
            f"scope is supposed to mean."
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
        return NOT_VERIFIED, "Purchase Req is blank"
    rel_ind = s(row, "PR Release Ind")
    log_assumption(1, "PR Release Ind code meaning assumed: '2' = released (PR_RELEASED_VALUES). Confirm actual codes with client.")
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

    # Client feedback: "Vendor State" is blank on almost every real row.
    # Fall back to deriving the state from the GSTIN (client says the
    # column is "Tax Number 3" - unconfirmed header, see ASSUMPTION below).
    if not vendor_state:
        gstin = s(row, GSTIN_COLUMN)
        derived_state = _state_from_gstin(gstin)
        if derived_state:
            vendor_state = derived_state
            log_assumption(
                9,
                f"'Vendor State' was blank; state was derived from the GSTIN state code in "
                f"'{GSTIN_COLUMN}' instead. Column name '{GSTIN_COLUMN}' is UNCONFIRMED - "
                f"verify against the real extract header."
            )

    if not vendor_state or not tax_code:
        return MANUAL, "Vendor state or tax code missing (Vendor State blank and GSTIN unavailable/unrecognised)"

    tax_master = ctx.get("tax_master", {})
    tax = tax_master.get(tax_code)

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
    our_ref = s(row, "Our Ref.")
    if not _is_rate_approval_tag(our_ref):
        return NA, "No rate-approval tag found in Our Ref."

    our_ref_upper = our_ref.upper()
    if any(code in our_ref_upper for code in DWS_APPROVERS):
        return VERIFIED, "Approval initials found in Our Ref."
    return NOT_VERIFIED, "Rate-approval tag present but no recognised approver initials (KKB/SRS/PJP/DAULAT/NHV/CVS) found"


def rule_16_zser_item_category(row, ctx):
    """
    Point 16: Service PO ("52 Series" = PO type ZSER) must use Item
    Category "D" and Account Assignment Category "K".

    Raw-code mapping confirmed against the real POAUDIT extract (see
    CHANGELOG / ITEM_CATEGORY_SERVICE_CODE comment): raw Item Category '9'
    corresponds to SAP item category "D" (Service).
    """
    po_type = s(row, "PO Type")
    if po_type != "ZSER":
        return NA, f"PO type is {po_type}, not ZSER"

    log_assumption(
        16,
        "Item Category 'D' is mapped to raw code '9' based on cross-referencing 'Item Category' "
        "against 'Item category disc' (== 'Service') across the full POAUDIT extract - this "
        "mapping was data-derived, not from an explicit client document. Confirm with the client "
        "that raw code '9' consistently means 'D' in future extracts too."
    )

    item_cat_raw = s(row, "Item Category")
    account_assignment = s(row, "Account Assignment")

    if item_cat_raw == ITEM_CATEGORY_SERVICE_CODE and account_assignment == "K":
        return VERIFIED, f"Item Category '{item_cat_raw}' (Service/D) with Account Assignment 'K' as required"
    return NOT_VERIFIED, (
        f"Expected Item Category '{ITEM_CATEGORY_SERVICE_CODE}' (Service/D) + Account Assignment 'K'; "
        f"found Item Category='{item_cat_raw}', Account Assignment='{account_assignment}'"
    )


def rule_17_zcsr_item_category(row, ctx):
    """
    Point 17: Service PO ("64 Series" = PO type ZCSR) must use Item
    Category "D" and Account Assignment Category "A".

    This point was MISSING from an earlier revision of this script - what
    used to be called "rule_17" was actually implementing point 18 (the
    ZLRM check) under the wrong number. This is the actual point 17.

    Raw-code mapping confirmed the same way as rule 16: raw Item Category
    '9' corresponds to SAP item category "D" (Service).
    """
    po_type = s(row, "PO Type")
    if po_type != "ZCSR":
        return NA, f"PO type is {po_type}, not ZCSR"

    log_assumption(
        17,
        "Item Category 'D' is mapped to raw code '9' (same data-derived mapping as rule 16). "
        "Confirm with the client that this mapping is stable across future extracts."
    )

    item_cat_raw = s(row, "Item Category")
    account_assignment = s(row, "Account Assignment")

    if item_cat_raw == ITEM_CATEGORY_SERVICE_CODE and account_assignment == "A":
        return VERIFIED, f"Item Category '{item_cat_raw}' (Service/D) with Account Assignment 'A' as required"
    return NOT_VERIFIED, (
        f"Expected Item Category '{ITEM_CATEGORY_SERVICE_CODE}' (Service/D) + Account Assignment 'A'; "
        f"found Item Category='{item_cat_raw}', Account Assignment='{account_assignment}'"
    )


# PO types the client's Remarks column lists for point 18: "This Point is
# not applicable for rest all PO type except ZLRM, ZLCP, ZIRM and ZICP".
RULE_18_APPLICABLE_PO_TYPES = {"ZLRM", "ZLCP", "ZIRM", "ZICP"}


def rule_18_lrm_no_l_category(row, ctx):
    """
    Point 18: PO types ZLRM / ZLCP / ZIRM / ZICP must NOT use Item Category
    "L" together with Account Assignment Category "K". (Note: unlike points
    16/17, this is a "must NOT be present" check - Verified means the L+K
    combination was NOT found, Not Verified means it WAS found.)

    Raw-code mapping confirmed against the real POAUDIT extract: raw Item
    Category '3' corresponds to SAP item category "L" (Subcontracting) -
    see ITEM_CATEGORY_SUBCONTRACTING_CODE comment.
    """
    po_type = s(row, "PO Type")
    if po_type not in RULE_18_APPLICABLE_PO_TYPES:
        return NA, f"PO type is {po_type}, not one of {sorted(RULE_18_APPLICABLE_PO_TYPES)}"

    log_assumption(
        18,
        "Item Category 'L' is mapped to raw code '3' based on cross-referencing 'Item Category' "
        "against 'Item category disc' (== 'Subcontracting') across the full POAUDIT extract - "
        "data-derived, not from an explicit client document. Confirm with the client that raw "
        "code '3' consistently means 'L' in future extracts too."
    )

    item_cat_raw = s(row, "Item Category")
    account_assignment = s(row, "Account Assignment")

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
    key = (s(row, "Vendor Code"), s(row, "PO Created date"), s(row, "Plant"), s(row, "Purchase Group"))
    pos_in_group = ctx["same_day_groups"].get(key, set())
    if len(pos_in_group) > 1:
        others = sorted(pos_in_group - {po_number})
        return NOT_VERIFIED, f"Multiple POs created same day/vendor/plant/group: also see {others}"
    return VERIFIED, "No other PO matches same vendor/date/plant/purchasing group"


def rule_rc_overlap(row, ctx):
    """
    Kept for reference / for anyone who wants a row-level lookup of this
    check, but NOT included in PO_LINE_RULES (see CHANGELOG at top of
    file) - it is the 20th, RC-level audit point and lives entirely in its
    own list - see build_rc_overlap_records() and run_rc_overlap() below.
    """
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
# The single, authoritative list of PO-line rules (points 1-19). The RC
# Overlap check (point 20) is intentionally NOT in this list - it is an
# RC-level check, not a PO-line check, and lives entirely in its own
# list/section (see build_rc_overlap_records() / run_rc_overlap() /
# --rc-json).
# ---------------------------------------------------------------------------
PO_LINE_RULES = [
    (1, "Release Verification (PR released before PO)", rule_01_release_verification),
    (2, "PR assigned to each PO line", rule_02_pr_assigned),
    (3, "PR Creation date within 6 months (180 days) of PO", rule_03_pr_within_6_months),
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
    (16, "Service PO (ZSER) uses Item Cat D + Acct Assignment K", rule_16_zser_item_category),
    (17, "Service PO (ZCSR) uses Item Cat D + Acct Assignment A", rule_17_zcsr_item_category),
    (18, "ZLRM/ZLCP/ZIRM/ZICP must not use Item Cat L + Acct Assignment K", rule_18_lrm_no_l_category),
    (19, "Multiple POs to same vendor/date/plant/purchase-group flagged", rule_19_multiple_po_same_day),
    # RC Overlap (point 20) is NOT a PO-line rule - see CHANGELOG. It is its
    # own section - see run_rc_overlap() / build_rc_overlap_records().
]


# ---------------------------------------------------------------------------
# Point 20 - Rate Contract overlap (operates on POAUDITRC, not POAUDIT)
# Still used for the "RC Overlap" sheet in the human-facing xlsx.
# ---------------------------------------------------------------------------
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


# ---------------------------------------------------------------------------
# which purchasing groups' PO lines actually reference each RC.
#
# RC master data (POAUDITRC) has no purchasing-group column at all - only
# POAUDIT (the PO line extract) does. So "which buyers/purchasing groups
# care about this RC" has to be derived by scanning PO lines and noting,
# for every (vendor, material, RC no.) combo referenced there, which
# purchasing group that PO line belongs to.
# ---------------------------------------------------------------------------
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


# ---------------------------------------------------------------------------
# RC Overlap records for the standalone RC Overlap DB table / section.
# One record per (vendor, RC material code, RC number) - matches the
# RcOverlapResult Prisma model, including the derived `purchaseGroups` list
# used to scope a Buyer's access. Feed the output into:
#     node addrc.js <this_file>.json
#
# NOTE (2026-07-28 fix): rows from POAUDITRC with a blank Vendor Code
# and/or blank RC Material Code (regardless of whether RC number itself is
# populated) are skipped here - see CHANGELOG at top of file. Without this
# guard such rows get grouped under the key ("", "") and are emitted as a
# record with empty vendorCode/rcMaterialCode, which `node addrc.js` then
# rejects at insert time ("vendorCode, rcMaterialCode, and rcNumber are all
# required"). build_context() already has the equivalent guard for the
# in-line per-PO-line overlap check; this brings build_rc_overlap_records()
# in line with that.
# ---------------------------------------------------------------------------
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
            f"was blank. These rows would otherwise have been grouped under an empty key and "
            f"rejected by the 'node addrc.js' importer ('vendorCode, rcMaterialCode, and "
            f"rcNumber are all required'). Confirm with the client whether these RC master rows "
            f"are expected to be incomplete, or should be cleaned upstream before the next run."
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


# ---------------------------------------------------------------------------
# Build context (grouping / lookups needed by multiple rules)
# ---------------------------------------------------------------------------
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
    Build one JSON record per PO line item, in the exact shape addpo.js
    expects (same field names as prisma/schema.prisma's AuditResult model).
    Feed the output straight into: node addpo.js <this_file>.json

    `results` contains rules 1-19 - RC Overlap (point 20) is emitted
    separately by build_rc_overlap_records() / --rc-json, for
    `node addrc.js <file>.json`.
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


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def run(poaudit_path, cnd_path, rc_path, out_path, addpo_json_path=None, rc_json_path=None):
    po_rows, cnd_rows, rc_rows, cnd_by_po = load_all(poaudit_path, cnd_path, rc_path)

    po_rows = filter_to_scope(po_rows)
    # cnd_by_po was built from the unfiltered cnd_rows/po_rows above - that's
    # fine, it's keyed by PO number and only consulted for PO numbers that
    # remain in scope.

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
    rc_overlap_df = run_rc_overlap(rc_rows)
    assumptions_df = pd.DataFrame(ASSUMPTIONS).drop_duplicates()

    with pd.ExcelWriter(out_path, engine="openpyxl") as writer:
        df.to_excel(writer, sheet_name="PO Line Results", index=False)
        rc_overlap_df.to_excel(writer, sheet_name="RC Overlap", index=False)
        assumptions_df.to_excel(writer, sheet_name="Assumptions", index=False)

    print(f"Wrote {len(df)} PO-line results (rules 1-19) and {len(rc_overlap_df)} RC-overlap rows (point 20) to {out_path}")
    print(f"{len(assumptions_df)} assumption(s) logged - see 'Assumptions' sheet. These MUST be confirmed with the client.")

    if addpo_json_path:
        records = build_addpo_records(po_rows, ctx)
        with open(addpo_json_path, "w") as f:
            json.dump(records, f, indent=2)
        print(f"Wrote {len(records)} PO-line records (rules 1-19) to {addpo_json_path} - insert with: node addpo.js {addpo_json_path}")

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
    parser.add_argument("--addpo-json", default=None, help="JSON for `node addpo.js <file>` (rules 1-19, audit_results table)")
    parser.add_argument("--rc-json", default=None, help="JSON for `node addrc.js <file>` (RC Overlap / point 20, rc_overlap_results table)")
    args = parser.parse_args()
    run(args.poaudit, args.cnd, args.rc, args.out, args.addpo_json, args.rc_json)