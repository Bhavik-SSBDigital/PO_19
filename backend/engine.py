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
CHANGELOG - THIS REVISION (Point 15 formula rewrite + Point 9/16 aggregate
fix, per client request against the "before_after_verification" workbook)
===============================================================================

  Client supplied a manually-verified "before/after" workbook with a
  ground-truth Verified/Not-Verified column for a sample of PO lines on
  points #9 and #16, plus an explicit formula + worked examples for point
  #15. This script was checked line-by-line against that ground truth
  (all 14 manually-verified point #9 rows and the 1 manually-verified
  point #16 row now match exactly - see verification notes below each
  change). Three changes were required:

  1. POINT #15 (PO Qty vs PR Qty) - RULE REPLACED, not just re-tuned.
     The old rule compared a CUMULATIVE PO quantity (summed across every
     live PO raised against the same PR line) to the PR's quantity, with
     tolerance applied only to the overage. The client's actual rule is
     much simpler and is NOT cumulative - it is a straight per-PO-line
     comparison of that line's own PO Qty against that line's own linked
     PR Qty:

         PO Quantity <= PR Quantity <= PO Quantity x (1 + Overdelivery Tolerance % / 100)

     i.e. the PR quantity must sit between the PO quantity (no shortfall
     allowed - PO qty may never exceed PR qty) and the PO quantity plus
     the line's Overdelivery Tolerance % (no more than that much extra
     PR quantity is tolerated). Confirmed against the client's worked
     example: PO Qty 1,000 / Overdelivery Tolerance 5% (=50 units) ->
     allowed PR range 1,000-1,050. PR 1,020 -> Verified (within ceiling).
     PR 1,060 -> Not Verified (exceeds the 5% buffer). PR 950 -> Not
     Verified (PO qty cannot exceed PR qty).
     FIX: rule_06_quantity_control rewritten to do a direct per-line
     comparison of "PO Qty." vs "PR Qty." on the SAME row, bounded by
     "Overdelivery Tolerance Limit" %. No PR-level cumulative aggregation
     across multiple POs is performed any more - ctx["pr_cumulative_po_qty"]
     and the accumulator that built it in build_context() have been
     removed as dead code. "Under Delivery tolerance" is no longer
     consulted for this rule (the client's formula only references
     Overdelivery Tolerance) - if "Overdelivery Tolerance Limit" is blank,
     the rule now falls back to 0% and logs an assumption, instead of
     silently borrowing the Under-Delivery percentage as before.

  2. POINT #9 (Multiple POs to same vendor/date/plant/purchase-group) -
     TWO bugs found and fixed against the client's 14 manually-verified
     rows (all 14 now match; see test evidence in PR/commit notes):

       a) WRONG DATE COLUMN: the rule grouped on "PO Created date", but
          the client's "Purchasing Date" is "PO Date(Doc date)" - a
          different column that can differ from PO Created date by a day
          or more (e.g. PO 4500491648 vs PO 4500491587: same vendor/
          plant/purchase-group and the SAME "PO Created date"
          (2026-04-04), but a DIFFERENT "PO Date(Doc date)" (2026-04-04
          vs 2026-04-03) - the client's ground truth says these are
          correctly Verified/not-a-duplicate, which only lines up with
          "PO Date(Doc date)" as the comparison field, not "PO Created
          date").
          FIX: point #9's grouping key now uses "PO Date(Doc date)"
          (new constant PURCHASING_DATE_COLUMN) instead of "PO Created
          date". "PO Date(Doc date)" was added to PO_DATE_COLUMNS so it
          gets the same SAP-date normalization as the other date columns
          when the input is a direct .xlsx export.

       b) GLOBAL EXCLUSION WAS WRONGLY APPLIED TO THIS AGGREGATE: last
          revision's fix intentionally made same_day_groups (and
          vendor_material_tax, see #3 below) skip Deletion indicator='L'
          / Returns Item='X' rows when aggregating, on the theory that a
          cancelled/returned line shouldn't count as a "real" duplicate
          PO. The client's ground truth proves this is wrong for point
          #9: e.g. PO 4500492165 vs PO 4500492159 (BOTH of 4500492159's
          lines are Deletion indicator='L') - client's ground truth is
          still Not Verified. PO 4500493355 vs PO 4500493343 (both
          4500493343 lines are Returns Item='X') - still Not Verified.
          The duplicate-PO-creation behaviour is real and worth flagging
          even if one of the two POs was later cancelled or returned -
          the audit point is about the buyer's *creation* pattern, not
          the PO's current status.
          FIX: same_day_groups-equivalent aggregation for point #9 no
          longer skips excluded rows - ALL rows (including Deletion
          indicator='L' / Returns Item='X') now contribute to the
          duplicate-PO comparison. This does NOT change the excluded
          row's OWN result, which is still forced to Not Applicable by
          evaluate_rule()'s central dispatch regardless of this change -
          it only changes what excluded rows contribute to OTHER, live
          rows' comparisons (same distinction as last revision's fix,
          just reaching the opposite conclusion once checked against
          real ground truth).

       c) REMARKS REWRITTEN per explicit client wording: Not Verified
          now states plainly that all five parameters (Vendor, Purchasing
          Group, Plant, Purchasing Date, RFQ no.) are the same. Verified
          now names which specific parameter differs (RFQ number is
          different / Purchasing Date is different / etc.) instead of
          the old generic "no other PO matches" text, by comparing
          against other POs that already share Vendor + Purchasing Group
          + Plant (the natural "this looks like it could be the same
          purchasing event" population) and reporting whether the
          differentiator is Purchasing Date and/or RFQ no. When no other
          PO shares Vendor+Purchasing Group+Plant at all, the remark
          says so generically instead of manufacturing a claim about a
          field that was never actually compared against anything close.

       d) RFQ no. (5th dimension, added two revisions ago) is unchanged
          in behaviour and caveat: RFQ_NO_COLUMN ("RFQ no.") still does
          not exist in the real POAUDIT extract as of this revision (AIA
          IT has not added it yet), so it still resolves to "" for every
          row and does not currently affect grouping. No code changes
          will be needed once the column is added under this name.

  3. POINT #16 (Vendor-Material tax code consistency) - SAME bug as #9(b):
     vendor_material_tax was skipping excluded rows when aggregating,
     which is wrong per the client's ground truth: PO 4500493241 (tax
     code 01, live) vs PO 4500492489 (tax code 03, Returns Item='X') for
     the same vendor/material - client's ground truth is Not Verified
     (the two tax codes ARE inconsistent), which only holds if the
     Returns-Item line still counts towards the tax-code set being
     compared.
     FIX: vendor_material_tax aggregation no longer skips excluded rows
     either - same reasoning and same non-impact on the excluded row's
     own (still Not Applicable) result as #9(b) above.

  VERIFICATION: engine.py was run against the client's real POAUDIT.csv /
  POAUDITCND.csv / POAUDITRC.csv and the point #9 / point #16 outputs for
  every PO+line pair present in the client's manually-verified
  "before_after_verification" workbook were diffed against that
  workbook's Verified/Not-Verified column - all 14 point #9 rows and the
  1 point #16 row match after this fix (none matched before it, on
  either the "Before" or the previous "After" column in that workbook).

===============================================================================
CHANGELOG - PRIOR REVISION (5 engine-level fixes, per client request against
PO 4500493194 and follow-up instructions)
===============================================================================

  1. POINT #15 (PO Qty vs PR Qty tolerance) - cumulative PO quantity was
     counting DELETED/RETURNED PO lines:
     build_context()'s pr_cumulative_po_qty accumulator summed "PO Qty."
     for every row sharing a (Purchase Req, PR line Item no.) key, with NO
     check for _is_excluded_line() first. A cancelled PO line (Deletion
     indicator = 'L') still added its quantity to the pool.
     Example: PO 4500493194-00010 (PO Qty 1000) is the only LIVE PO
     against PR 6900288564/00010 (PR Qty 1000) - it should be exactly
     Verified. But PO 4500493244-00020 (Deletion indicator = 'L', PO Qty
     1000) against the SAME PR line was still being added, making the
     cumulative total 2000 vs a PR Qty of 1000 - a false 100% overage at
     0% tolerance, so PO 4500493194-00010 came back Not Verified.
     FIX: pr_cumulative_po_qty now skips any row where _is_excluded_line()
     is True, matching the exclusion that already applies everywhere else.
     SUPERSEDED THIS REVISION: point #15 no longer uses a cumulative
     accumulator at all - see item 1 in the CHANGELOG section above. This
     entry is kept for history only.

  2. POINT #9 (Multiple POs to same vendor/date/plant/purchase-group) -
     same_day_groups had the identical class of bug: it aggregated PO
     numbers into the same_day_groups dict for EVERY row, including
     deleted/returned lines, so a cancelled PO could still make an
     otherwise-clean PO look like a same-day duplicate.
     FIX: same_day_groups now also skips excluded rows when aggregating.
     SUPERSEDED THIS REVISION: proven wrong against client ground truth -
     see item 2(b) in the CHANGELOG section above. This entry is kept for
     history only.

  3. POINT #16 (Vendor-Material tax code consistency) - vendor_material_tax
     had the same bug: tax codes from deleted/returned lines were being
     folded into the per-(vendor, material) tax-code set, which could
     make a vendor/material combination look inconsistent (or hide a real
     inconsistency) based on a line that shouldn't count at all.
     FIX: vendor_material_tax now also skips excluded rows when
     aggregating.
     SUPERSEDED THIS REVISION: proven wrong against client ground truth -
     see item 3 in the CHANGELOG section above. This entry is kept for
     history only.

     NOTE ON 1-3: all three accumulators live in build_context() and are
     built from the SAME po_rows loop; the fix in each case is the same
     shape - add `and not _is_excluded_line(row)` to the row's admission
     check before it contributes to the accumulator. This does NOT change
     what evaluate_rule() returns for an excluded row itself (still a
     uniform Not Applicable via the existing central dispatch) - it only
     stops excluded rows from POLLUTING the aggregates that OTHER, live
     rows get compared against.

  4. POINTS #6/#7 (EYW inco-term requires freight condition / EXW-FCA must
     NOT carry freight condition) - added ZFB5 as a recognised freight
     condition type, per client request. FREIGHT_CONDITION_TYPES was
     {ZBF1, ZBF2, ZRA3, ZRB3, ZRE3}; now also includes ZFB5. This is the
     only set _has_freight_condition() checks against, so both rules pick
     the change up automatically.

  5. POINT #9 (Multiple POs to same vendor/date/plant/purchase-group) -
     added RFQ no. as a 5th dimension of the duplicate-PO grouping key,
     per client request ("Same RFQ no. logic needs to be added for point
     no. 9"). Two POs are now only flagged as same-day duplicates if they
     ALSO share the same RFQ no., in addition to vendor/date/plant/
     purchase-group.
     IMPORTANT CAVEAT: the client's own instruction says the RFQ no.
     column still needs to be ADDED to the POAUDIT extract by AIA IT - it
     does not exist yet as of this revision. RFQ_NO_COLUMN below is an
     ASSUMED header name ("RFQ no.") and must be confirmed against the
     real extract once AIA IT adds it. Until the column exists, s(row,
     RFQ_NO_COLUMN) resolves to "" for every row (same fallback behavior
     as any other unknown column - see s() below), so every PO's RFQ
     component is equal and point #9 behaves EXACTLY as it did before
     this change (grouped by vendor+date+plant+purchase-group only). No
     code changes will be needed on this side once the column shows up in
     the extract with the assumed name - if AIA IT uses a different
     header, only RFQ_NO_COLUMN needs updating.
     Implementation note: the grouping key was previously built separately
     (and identically, by hand) in both build_context() and
     rule_19_multiple_po_same_day(). Both now call one shared
     _same_day_key(row) helper so the two can never drift out of sync
     again.

===============================================================================
CHANGELOG - PRIOR REVISION (point renumbering, per client request)
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
     SUPERSEDED THIS REVISION: point #15 no longer does a tolerance-banded
     comparison against a cumulative quantity - see item 1 in the
     CHANGELOG section above. This entry is kept for history only.

  5. (Retained, unaffected by either pass) Points #1-9 are HEADER-LEVEL;
     points #10-19 are LINE-LEVEL. See HEADER_LEVEL_RULE_NOS / LINE_ONLY_RULES
     below.

===============================================================================
OUT OF SCOPE FOR THIS FILE (tracked here for visibility only - NOT
implemented in engine.py, see accompanying Node/Prisma + frontend changes)
===============================================================================

  - Buyer remarks must propagate and be visible at manager level: this is
    PoRemark / PoHeaderRemark (schema.prisma) plus the Node API/UI layer.
    engine.py never reads or writes remarks - it only produces the
    Verified/Not Verified/NA/Data Missing results those remarks attach to.
  - "Exception PO" graph and trend: dashboard/reporting work on top of
    AuditResult / PoHeaderResult. engine.py has no charting responsibility.

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
# ZFB5 added this revision (points #6/#7) per client request - see CHANGELOG.
FREIGHT_CONDITION_TYPES = {"ZBF1", "ZBF2", "ZRA3", "ZRB3", "ZRE3", "ZFB5"}
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
# client-confirmed Overdelivery Tolerance Limit.
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
# "Purchasing Date" for point #9 is "PO Date(Doc date)", NOT "PO Created
# date" - confirmed this revision against the client's ground truth (see
# CHANGELOG item 2(a) above). PO_DATE_COLUMNS below includes it so it gets
# the same normalize_sap_date() treatment as the other date columns when
# the input file is a direct .xlsx export.
PURCHASING_DATE_COLUMN = "PO Date(Doc date)"

# ASSUMPTION - the client has confirmed an RFQ no. column still needs to be
# ADDED to the POAUDIT extract by AIA IT; it does not exist yet. This is the
# ASSUMED header name it will be added under - confirm/update once AIA IT
# actually adds the column. Until then s(row, RFQ_NO_COLUMN) resolves to ""
# for every row (same fallback as any other unknown column), so point #9's
# grouping is completely unaffected by this dimension until the real column
# shows up in the extract.
RFQ_NO_COLUMN = "RFQ no."


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

# "PO Date(Doc date)" added this revision - point #9's "Purchasing Date"
# uses this column, not "PO Created date" - see CHANGELOG item 2(a). It
# needs the same SAP-date normalization treatment when the source file is
# a direct .xlsx export.
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

    NOTE: this ONLY governs an excluded row's OWN result. It has nothing
    to do with whether an excluded row's data is still counted when
    building the cross-row aggregates other (live) rows get compared
    against in build_context() - see the point #9 / #16 CHANGELOG entries
    above for why those two aggregates deliberately do NOT drop excluded
    rows (point #15 no longer uses a cross-row aggregate at all).
    """
    if _is_excluded_line(row):
        return NA, EXCLUDED_LINE_REMARK
    return fn(row, ctx)


# ---------------------------------------------------------------------------
# Point #9 grouping helpers (Multiple POs to same vendor/purchase-group/
# plant/Purchasing Date/RFQ). Used by BOTH build_context() (to build the
# aggregates) and rule_19_multiple_po_same_day() (to look a PO up in them)
# so the two can never define a key differently and silently disagree.
#
# Two keys are used:
#   - _po9_full_key(row):  all five dimensions - an exact match here means
#                           Not Verified ("all five parameters are the same").
#   - _po9_core_key(row):  Vendor + Purchasing Group + Plant only - the
#                           natural "this could plausibly be the same
#                           purchasing event" population used to explain a
#                           Verified result (which single remaining
#                           dimension - Purchasing Date and/or RFQ no. -
#                           is what actually differs).
#
# "Purchasing Date" = PURCHASING_DATE_COLUMN = "PO Date(Doc date)", NOT
# "PO Created date" - see CHANGELOG item 2(a).
#
# Neither key filters out excluded (Deletion indicator='L' / Returns
# Item='X') rows - see CHANGELOG item 2(b) for why that exclusion was
# proven wrong for this specific point against the client's ground truth.
# An excluded row's OWN result is still forced to Not Applicable
# separately, by evaluate_rule() above.
# ---------------------------------------------------------------------------
def _po9_full_key(row):
    return (
        s(row, "Vendor Code"),
        s(row, "Purchase Group"),
        s(row, "Plant"),
        s(row, PURCHASING_DATE_COLUMN),
        s(row, RFQ_NO_COLUMN),
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
    """
    POINT #15 - REWRITTEN THIS REVISION (see CHANGELOG item 1).

    Client's formula (confirmed with worked examples):

        PO Quantity <= PR Quantity <= PO Quantity x (1 + Overdelivery Tolerance % / 100)

    This is a direct, single-line comparison of THIS row's own "PO Qty."
    against THIS row's own linked "PR Qty." - there is no cross-PO
    cumulative aggregation any more (ctx["pr_cumulative_po_qty"] and its
    accumulator in build_context() have been removed as dead code).

    - PR Qty < PO Qty            -> Not Verified (PO qty cannot exceed PR qty)
    - PO Qty <= PR Qty <= ceiling -> Verified
    - PR Qty > ceiling            -> Not Verified (exceeds the overdelivery buffer)

    where ceiling = PO Qty x (1 + Overdelivery Tolerance % / 100).
    "Under Delivery tolerance" is intentionally NOT consulted for this
    rule any more - the client's formula only references Overdelivery
    Tolerance. If "Overdelivery Tolerance Limit" is blank, this falls
    back to 0% (no allowed buffer) and logs an assumption.
    """
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
    """
    POINT #16. Aggregation FIX this revision (see CHANGELOG item 3): the
    vendor_material_tax set built in build_context() no longer skips
    excluded (Deletion indicator='L' / Returns Item='X') rows - confirmed
    against the client's ground truth on PO 4500493241 (tax 01, live) vs
    PO 4500492489 (tax 03, Returns Item='X'), same vendor/material, which
    the client's manual audit says IS Not Verified (the two tax codes
    still conflict even though one line was returned).
    """
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
    """
    HEADER-LEVEL rule (see build_po_header_records) - reports as new point #9.

    REWRITTEN THIS REVISION - see CHANGELOG item 2 for the full rationale
    and the ground-truth verification (14/14 client-checked rows match).

    Logic:
      1. Exact match on all five dimensions (Vendor, Purchasing Group,
         Plant, Purchasing Date = "PO Date(Doc date)", RFQ no.) against
         >=1 other PO number -> Not Verified, remark states all five
         parameters are the same and names the other PO(s).
      2. Otherwise, look among other POs that already share Vendor +
         Purchasing Group + Plant (the "core" population - the only POs
         where a difference in Purchasing Date/RFQ is actually a
         meaningful audit signal) and report which of those two remaining
         dimensions differs.
      3. If no other PO shares even Vendor + Purchasing Group + Plant,
         Verified with a generic "no comparable PO" remark.

    Grouping keys come from _po9_full_key()/_po9_core_key() (shared with
    build_context()) so this can never disagree with how the aggregates
    were built. Neither key filters out excluded rows for this point -
    see CHANGELOG item 2(b).
    """
    po_number = s(row, "PO number")

    full_key = _po9_full_key(row)
    others_full = ctx["po9_full_groups"].get(full_key, set()) - {po_number}
    if others_full:
        return NOT_VERIFIED, (
            f"Same Vendor, Purchasing Group, Plant, Purchasing Date and RFQ no. as "
            f"PO(s) {_format_po_list(others_full)} - all five parameters are the same"
        )

    core_key = _po9_core_key(row)
    others_core = ctx["po9_core_groups"].get(core_key, set()) - {po_number}
    if not others_core:
        return VERIFIED, "No other PO found with the same Vendor, Purchasing Group and Plant"

    self_date = s(row, PURCHASING_DATE_COLUMN)
    self_rfq = s(row, RFQ_NO_COLUMN)
    rep = ctx["po9_core_rep"]

    rfq_diff = {po for po in others_core if rep.get((core_key, po), (None, None))[1] != self_rfq}
    date_diff = {po for po in others_core if rep.get((core_key, po), (None, None))[0] != self_date}

    reasons = []
    if rfq_diff:
        reasons.append(f"RFQ number is different (also see PO(s) {_format_po_list(rfq_diff)})")
    if date_diff:
        reasons.append(f"Purchasing Date is different (also see PO(s) {_format_po_list(date_diff)})")

    if reasons:
        return VERIFIED, "; ".join(reasons)
    return VERIFIED, (
        "No other PO found with the same Vendor, Purchasing Group, Plant, "
        "Purchasing Date and RFQ no."
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
    (9, "Multiple POs to same Vendor/Purchasing Group/Plant/Purchasing Date/RFQ (all five must match for Not Verified)", rule_19_multiple_po_same_day),
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


def build_context(po_rows, cnd_by_po, rc_rows):
    """
    Builds every cross-row aggregate the rule functions look up via ctx.

    IMPORTANT (this revision):
      - Point #9's aggregates (po9_full_groups / po9_core_groups /
        po9_core_rep) and point #16's aggregate (vendor_material_tax) NO
        LONGER skip excluded (Deletion indicator='L' / Returns Item='X')
        rows when aggregating - the opposite of last revision's fix. This
        was proven against the client's ground-truth "before/after"
        workbook: a cancelled or returned PO/line must still count as a
        real duplicate-creation event (point #9) or a real conflicting
        tax code (point #16), even though its OWN result is still forced
        to Not Applicable by evaluate_rule(). See CHANGELOG items 2(b)
        and 3 at the top of this file.
      - Point #15 no longer has an aggregate here at all - it was
        rewritten to a direct per-line comparison (see rule_06). The old
        pr_cumulative_po_qty accumulator has been removed.
    """
    po_material_groups = defaultdict(list)
    vendor_material_tax = defaultdict(set)
    po9_full_groups = defaultdict(set)
    po9_core_groups = defaultdict(set)
    po9_core_rep = {}
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
        # po_material_groups intentionally still includes excluded rows:
        # rule_08_rc_consistency (point #2) needs to see every line
        # (excluded or not) sharing a PO+Material to detect an
        # inconsistent RC assignment; evaluate_rule() already forces any
        # excluded row's OWN result to Not Applicable regardless of what
        # this group contains, so leaving this one unfiltered is safe and
        # was not part of the reported bug.
        po_material_groups[(po_number, material)].append(row)

        # Point #16: tax codes from EVERY row (including excluded ones)
        # feed the per-(vendor, material) tax-code set - see CHANGELOG
        # item 3.
        vendor = s(row, "Vendor Code")
        tax_code = s(row, "Tax code")
        if vendor and material and tax_code:
            vendor_material_tax[(vendor, material)].add(tax_code)

        # Point #9: every row (including excluded ones) feeds the
        # duplicate-PO aggregates - see CHANGELOG item 2(b).
        full_key = _po9_full_key(row)
        po9_full_groups[full_key].add(po_number)

        core_key = _po9_core_key(row)
        po9_core_groups[core_key].add(po_number)
        po9_core_rep.setdefault(
            (core_key, po_number),
            (s(row, PURCHASING_DATE_COLUMN), s(row, RFQ_NO_COLUMN)),
        )

    log_assumption(
        9,
        f"Point #9's RFQ dimension (column '{RFQ_NO_COLUMN}') still does not exist in the "
        f"POAUDIT extract - the client has confirmed AIA IT still needs to add it. Until it "
        f"does, every row's RFQ no. resolves to blank, so grouping is effectively driven by "
        f"Vendor + Purchasing Group + Plant + Purchasing Date (PO Date(Doc date)) only. "
        f"Confirm the column name (assumed: '{RFQ_NO_COLUMN}') once it is added.",
    )

    return {
        "po_material_groups": po_material_groups,
        "vendor_material_tax": vendor_material_tax,
        "po9_full_groups": po9_full_groups,
        "po9_core_groups": po9_core_groups,
        "po9_core_rep": po9_core_rep,
        "cnd_by_po": cnd_by_po,
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
            f"Returns Item = 'X'. This ONLY affects each such row's OWN result. This "
            f"revision, these same excluded lines are DELIBERATELY still counted when "
            f"building the point #9 (duplicate-PO) and point #16 (vendor/material tax "
            f"consistency) aggregates, i.e. they still affect the results of OTHER, live "
            f"line items where relevant - confirmed against the client's manually-verified "
            f"ground truth (see CHANGELOG items 2(b) and 3). Point #15 no longer uses a "
            f"cross-row aggregate at all, so exclusion there simply means the excluded "
            f"line's own result is Not Applicable, with no effect on any other line.",
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