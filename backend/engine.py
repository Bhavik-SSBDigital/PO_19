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
CHANGELOG - THIS REVISION (Deletion Indicator exclusion corrected back to
LINE level, per client clarification)
===============================================================================

  CORRECTION to the immediately preceding revision. That revision read the
  client's feedback ("if delete indicator for any po is found then dont
  enter that po any where in software") as meaning a Deletion indicator =
  'L' anywhere on a PO should drop the ENTIRE PO - every line item under
  that PO number, including lines that are NOT themselves marked 'L'.

  Client clarified this is NOT what was wanted:
    - PO with 5 line items, 2 marked 'L' and 3 not -> the 3 non-'L' line
      items must NOT be dropped. Only the 2 'L' line items are removed;
      the other 3 are audited normally and appear everywhere as usual.
    - PO with a single line item, and that one line is marked 'L' -> that
      line is removed, and (simply because nothing is left under that PO
      number) the PO ends up not appearing anywhere - but this is a
      CONSEQUENCE of removing the one deleted line, not a rule that
      inspects or removes the PO as a whole.
    - General principle: "we must have what doesn't have delete
      indicator" - i.e. only ever remove the specific line item(s) that
      carry Deletion indicator = 'L'; every other line item, on any PO,
      stays in scope and is audited exactly as before.

  FIX: find_pos_with_deletion_indicator() / drop_pos_with_deletion_
  indicator() (the whole-PO-removal functions from the immediately
  preceding revision) have been REPLACED with a single
  drop_lines_with_deletion_indicator(), which removes ONLY the individual
  line items that carry Deletion indicator = 'L' from po_rows - not their
  PO-mates. This is still a full removal (not a per-row Not Applicable):
  a dropped line produces no row in "PO Line Results", no addpo/header
  JSON record, and does not contribute to any cross-row aggregate. It is
  still called in run() immediately after filter_to_scope() and before
  build_context()/any output, so the effect is identical in spirit to the
  previous revision (deleted lines vanish completely, not just marked
  NA) - the only thing that changed is the GRANULARITY: per LINE ITEM,
  not per PO. A PO's non-'L' line items are therefore never affected
  by another line item on the same PO being marked 'L'.

  SCOPE (unchanged from previous revision): this still only applies to
  Deletion indicator = 'L'. Returns Item = 'X' continues to be handled
  the old way - via the existing _is_excluded_line()/EXCLUDED_LINE_REMARK
  path inside evaluate_rule(), which marks just that one line Not
  Applicable rather than dropping it, while every other line on that PO
  (deleted-indicator or not) continues to be audited normally.

  CONSEQUENCE FOR POINT #9 / #16: because Deletion-indicator lines are
  now dropped before build_context() ever runs (same as the previous
  revision), they still do NOT contribute to the point #9 (duplicate-PO)
  or point #16 (vendor-material tax) aggregates - only Returns-Item lines
  do, per the older CHANGELOG entries further down. This part is
  unchanged from the immediately preceding revision; only the "does this
  drop the whole PO or just the flagged line" behavior changed.

===============================================================================
CHANGELOG - PRIOR REVISION (PO-level Deletion Indicator exclusion - SUPERSEDED
THIS REVISION, corrected back to line-level - kept for history only)
===============================================================================

  PROBLEM: the GLOBAL exclusion (see the older "Deletion Indication is not
  applied" CHANGELOG entry further down) only ever excluded the ONE line
  item that itself carried Deletion indicator = 'L' - via evaluate_rule()
  returning a uniform Not Applicable for that row, on every one of the 19
  points. Every OTHER line item on the SAME PO number (i.e. not itself
  marked 'L') was still fully audited and still appeared in every output:
  the PO Line Results sheet, the addpo/header JSON exports, and every
  cross-row aggregate (RC consistency, vendor-material tax consistency,
  multiple-PO-same-day, etc.).

  Client feedback (at the time): "if delete indicator for any po is found
  then dont enter that po any where in software" / "if in deleted po,
  there are multiple line items then those line items also should not be
  included." This was implemented as: a Deletion indicator = 'L' anywhere
  on a PO drops the ENTIRE PO - every line item under that PO number,
  including lines that are NOT themselves marked 'L'.

  SUPERSEDED THIS REVISION: the client clarified that non-'L' line items
  on a PO that also has an 'L' line must NOT be dropped - only the
  specific 'L' line(s) should be removed. See the "THIS REVISION" entry
  above for the corrected, line-level behavior. This entry is kept for
  history only; find_pos_with_deletion_indicator()/drop_pos_with_deletion_
  indicator() no longer exist in this file.

===============================================================================
CHANGELOG - PRIOR REVISION (Point 3 tax-code 0/48 ordering fix + Point 6/7
freight-remark transparency fix, per direct client feedback)
===============================================================================

  1. POINT #3 (GST Tax Logic) - TAX CODE 0/48 WRONGLY SHOWED "DATA MISSING"
     INSTEAD OF "NOT APPLICABLE". Client feedback: "If tax code is 0, 48 -
     then no gst and data missing of Vendor state." Tax Codes '0' and '48'
     already map, via the Tax Master, to categories 'No GST' and
     'Input Tax' respectively - both of which normalize into
     GST_NOT_APPLICABLE_TOKENS and are supposed to resolve straight to Not
     Applicable ("no GST"). The bug was ORDERING: the function checked
     Vendor State FIRST and returned Data Missing whenever Vendor State was
     blank, before the Tax Master lookup (and therefore the
     GST_NOT_APPLICABLE_TOKENS check) ever ran. So a line with Tax Code 0
     or 48 but a blank Vendor State incorrectly showed Data Missing instead
     of Not Applicable.
     FIX: rule_09_tax_logic now looks up the Tax Code in the Tax Master
     FIRST. If its category is one of the not-applicable/"no GST" tokens
     (which covers Tax Codes 0 and 48, and any other exempt-style code),
     it returns Not Applicable immediately - Vendor State is never
     consulted for this branch. Vendor State is now only looked up (with
     the existing GSTIN-derivation fallback) for the remaining categories
     that genuinely need a Gujarat/non-Gujarat (SGST+CGST vs IGST)
     comparison; Data Missing for a blank Vendor State still fires, but
     only there - it can no longer block a Tax-Code-0/48-style
     not-applicable determination that doesn't need Vendor State at all.

  2. POINTS #6/#7 (EYW freight required / EXW-FCA must not have freight) -
     REMARK NOW NAMES THE MATCHED CONDITION TYPE. Client feedback: "If
     inco term is EYW and condition types are
     R000,NAVM,PBXX,NAVS,JEXS,ZPB0,R001,ZIB2,ZPB1 - on these condition
     types - why it is showing verified?" These listed codes are ordinary
     pricing/tax conditions (gross price, non-deductible tax, etc.), NOT
     freight - and were confirmed (against the real POAUDITCND extract)
     to never by themselves cause a Verified result; every EYW line whose
     ONLY condition types are from this list is correctly Not Verified.
     What was actually happening: these codes routinely co-occur on the
     SAME PO line alongside a genuine freight condition (e.g. ZRA3/ZRB3),
     and the old remark just said "Freight condition present for EYW PO
     line" without naming which condition type triggered it - so a
     reviewer looking at a line with condition types
     ['ZRB3','NAVM','PBXX','NAVS','JEXS'] had no way to see, from the
     remark alone, that 'ZRB3' (not the other four) was what made it
     Verified.
     FIX: added _condition_types_for_item() / _freight_condition_match(),
     which return the SPECIFIC matched freight condition type (or None)
     plus the full list of condition types present. rule_13/rule_14 now
     name the exact matched type in the remark (e.g. "Freight condition
     'ZRB3' present...") and separately list any other, non-freight
     condition types also present on the line, so it's immediately clear
     from the remark alone why a line was Verified or Not Verified. No
     pass/fail behavior changed - this is a transparency fix only,
     confirmed against the real POAUDITCND data (0 lines had their status
     change).

===============================================================================
CHANGELOG - PRIOR REVISION (Point 8 rate-approval tag fix + Point 9
RFQ-source and blank-RFQ fix, per the "Final sheet" / "Changes to be done"
column)
===============================================================================

  1. POINT #8 (Rate Approval by authorised approver) - WRONG TAG WAS BEING
     SEARCHED. The "Changes to be done" column for this point is explicit:
     "In Our Ref., search for 'DWS-APPROVED' / 'DWS-Approved'. Do not search
     for 'Rate Approval', as 'Rate Approval' is the tag used for the Digital
     Workflow Solution [itself, not for a rate-approval event]." The previous
     RATE_APPROVAL_TAG_TOKENS set included "RATEAPPROVAL", "APPROVEDRATE",
     "APPROVERATE" and "APPROVEDRAT" - i.e. it WAS matching on "Rate
     Approval"-shaped text, exactly what the client says must NOT be
     searched for, because that phrase is the generic DWS workflow tag and
     doesn't mean a rate was actually approved. This meant any PO whose Our
     Ref. carried a plain DWS "Rate Approval" workflow tag (without an
     actual "DWS-APPROVED" outcome) was being incorrectly treated as
     eligible for this point / evaluated as if approval had been confirmed.
     FIX: RATE_APPROVAL_TAG_TOKENS now contains ONLY the DWS-APPROVED-style
     tokens ("DWSAPPROVED", "DWSAAPPROVED", "DWSAPPROVAL", "DWSAPPROVE") -
     the "RATEAPPROVAL"/"APPROVEDRATE"/"APPROVERATE"/"APPROVEDRAT" tokens
     have been removed. _is_rate_approval_tag() (and therefore rule
     #8/rule_15_rate_approval) now only fires on an actual "DWS-APPROVED"
     (or the DWS "APPROVAL"/"APPROVE" spelling variants already confirmed
     in a prior revision), never on a bare "Rate Approval" tag.

  2. POINT #9 (Multiple POs to same vendor/date/plant/purchase-group, +RFQ)
     - TWO issues fixed per the "Changes to be done" / notes columns for
     this point:

       a) RFQ SOURCE COLUMN WAS WRONG: the "Changes to be done" notes say
          "Add RFQ number = order acknowledgement" - i.e. the RFQ number
          this point needs is the extract's "order acknowledgement" column,
          not a not-yet-added "RFQ no." column. RFQ_NO_COLUMN is now
          "order acknowledgement". This column DOES exist in the real
          extract (confirmed by the client's own worked example against PO
          4500496148/4500496147/4500496155 - see below), so the previous
          "column doesn't exist yet, AIA IT still needs to add it" caveat
          no longer applies and has been removed.

       b) BLANK-RFQ HANDLING: the "Changes to be done" text for this point
          says: "Check all 5 parameters to verify whether they are verified
          or not. If the RFQ No. is blank, check only the remaining 4
          parameters for verification." The previous implementation
          effectively required an EXACT match on all 5 dimensions
          (including RFQ) to flag Not Verified, with no special handling
          for a blank RFQ on either side. Per the client's own worked
          example (I column note): PO 4500496148 (RFQ "RFQ-26-1215") and PO
          4500496147 (RFQ "RFQ-26-1246") share Vendor/Purchasing Group/
          Plant/Purchasing Date but have genuinely DIFFERENT RFQ numbers -
          the client confirms these must NOT be flagged against each other.
          PO 4500496155 shares the same Vendor/Purchasing Group/Plant/
          Purchasing Date but has a BLANK RFQ - per the "blank -> compare
          only 4 parameters" rule, 4500496155 must still be compared (and
          matched) against BOTH of the other two POs on the remaining 4
          parameters alone, regardless of what their RFQ values are.
          FIX: rule_19_multiple_po_same_day (and its supporting aggregates
          in build_context) were rewritten around a single 4-parameter key
          (Vendor, Purchasing Group, Plant, Purchasing Date) plus a
          per-PO representative RFQ value. Two POs sharing the 4-parameter
          key are now treated as a match (-> Not Verified) UNLESS both
          sides have a non-blank RFQ AND those RFQ values differ. In other
          words: if either side's RFQ is blank, the RFQ dimension is
          skipped and only the 4 core parameters decide the match; if both
          sides have a non-blank RFQ, it must also match. This replaces the
          old "_po9_full_key"/"po9_full_groups" exact-5-dimension-match
          machinery entirely (it could never express "ignore RFQ when
          blank" and always required a literal 5-way tuple match), and
          reproduces the client's worked example exactly: PO 4500496148 is
          NOT matched against PO 4500496147 (different, non-blank RFQs) but
          IS matched against PO 4500496155 (blank RFQ) - net result Not
          Verified for 4500496148 (and 4500496147), driven by 4500496155's
          blank RFQ, not by a false match against each other's RFQs.

  Everything else in this file (Points 1-7, 10-19, RC Overlap, header/line
  scoping, exclusion handling, point renumbering) is unchanged from the
  prior revision - see the CHANGELOG entries below for that history.

===============================================================================
CHANGELOG - PRIOR REVISION (Point 15 formula rewrite + Point 9/16 aggregate
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

     NOTE: the Final sheet's own "Changes to be done" column for this
     point still describes an older CUMULATIVE-PO-Qty formula, but its
     "Testing" column marks that entry "ON HOLD" - so that (older, still
     cumulative) formula is deliberately NOT applied here. The rule below
     implements the newer, client-confirmed, non-cumulative formula from
     this CHANGELOG entry instead, per the client's later explicit
     instruction (worked examples above).

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
          row's OWN result, which is still forced to Not Applicable
          regardless of this change - it only changes what excluded rows
          contribute to OTHER, live rows' comparisons.

       c) REMARKS REWRITTEN per explicit client wording: Not Verified
          now states plainly that the matched parameters are the same.
          Verified now names which specific parameter differs (RFQ
          number is different / Purchasing Date is different / etc.)
          instead of the old generic "no other PO matches" text, by
          comparing against other POs that already share Vendor +
          Purchasing Group + Plant (the natural "this looks like it
          could be the same purchasing event" population) and reporting
          whether the differentiator is Purchasing Date and/or RFQ no.
          When no other PO shares Vendor+Purchasing Group+Plant at all,
          the remark says so generically instead of manufacturing a
          claim about a field that was never actually compared against
          anything close.

       d) RFQ no. (5th dimension, added two revisions ago) - SUPERSEDED
          THIS REVISION: see the "THIS REVISION" CHANGELOG entry above
          for the corrected RFQ source column ("order acknowledgement")
          and the blank-RFQ 4-parameter fallback rule. This entry is kept
          for history only.

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
     SUPERSEDED: point #15 no longer uses a cumulative accumulator at all
     - see the "PRIOR REVISION" CHANGELOG entry above. This entry is kept
     for history only.

  2. POINT #9 (Multiple POs to same vendor/date/plant/purchase-group) -
     same_day_groups had the identical class of bug: it aggregated PO
     numbers into the same_day_groups dict for EVERY row, including
     deleted/returned lines, so a cancelled PO could still make an
     otherwise-clean PO look like a same-day duplicate.
     FIX: same_day_groups now also skips excluded rows when aggregating.
     SUPERSEDED: proven wrong against client ground truth - see the
     "PRIOR REVISION" CHANGELOG entry above. This entry is kept for
     history only.

  3. POINT #16 (Vendor-Material tax code consistency) - vendor_material_tax
     had the same bug: tax codes from deleted/returned lines were being
     folded into the per-(vendor, material) tax-code set, which could
     make a vendor/material combination look inconsistent (or hide a real
     inconsistency) based on a line that shouldn't count at all.
     FIX: vendor_material_tax now also skips excluded rows when
     aggregating.
     SUPERSEDED: proven wrong against client ground truth - see the
     "PRIOR REVISION" CHANGELOG entry above. This entry is kept for
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
     no. 9"). SUPERSEDED THIS REVISION by the "order acknowledgement"
     source column + blank-RFQ handling described in the "THIS REVISION"
     CHANGELOG entry above. This entry is kept for history only.

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
     for this fix and needs separate confirmation later. SEE ALSO the
     "THIS REVISION" CHANGELOG entry above, which removes the separate
     "RATEAPPROVAL"/"Rate Approval"-shaped tokens that had also crept into
     this same set and were wrong per the client's explicit instruction.

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
     SUPERSEDED: point #15 no longer does a tolerance-banded comparison
     against a cumulative quantity - see the "PRIOR REVISION" CHANGELOG
     entry above. This entry is kept for history only.

  5. (Retained, unaffected by any pass) Points #1-9 are HEADER-LEVEL;
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
# (points #6/#7). Confirmed against real POAUDITCND data that these are NOT
# in FREIGHT_CONDITION_TYPES and were never being counted as freight - they
# routinely co-occur on the SAME PO line alongside a genuine freight
# condition (e.g. ZRA3/ZRB3), which is what was actually driving Verified.
# See _freight_condition_match()/_other_condition_types_note() below, which
# now names the exact matched freight type in the remark so this is no
# longer ambiguous to a reviewer.
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
# date" - confirmed against the client's ground truth (see CHANGELOG,
# "PRIOR REVISION" item 2(a)). PO_DATE_COLUMNS below includes it so it gets
# the same normalize_sap_date() treatment as the other date columns when
# the input file is a direct .xlsx export.
PURCHASING_DATE_COLUMN = "PO Date(Doc date)"

# RFQ number source column for point #9's 5th dimension. Per the Final
# sheet's "Changes to be done" notes: "Add RFQ number = order
# acknowledgement" - i.e. the RFQ number is sourced from the extract's
# "order acknowledgement" column, NOT a separate "RFQ no." column (that
# earlier assumption is now known to be wrong and has been replaced). This
# column is present in the real extract - confirmed via the client's own
# worked example on PO 4500496148 / 4500496147 / 4500496155 (see CHANGELOG,
# "THIS REVISION", item 2).
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

# --- Rule support: normalized rate-approval tag matching (new #8, old #15) -
# FIXED THIS REVISION per the Final sheet's explicit "Changes to be done"
# instruction: "In Our Ref., search for 'DWS-APPROVED' / 'DWS-Approved'. Do
# not search for 'Rate Approval', as 'Rate Approval' is the tag used for
# the Digital Workflow Solution." Only the DWS-APPROVED-style tokens are
# kept below; the previous "RATEAPPROVAL"/"APPROVEDRATE"/"APPROVERATE"/
# "APPROVEDRAT" tokens have been REMOVED because they matched on the
# generic "Rate Approval" DWS workflow tag the client says must be ignored.
RATE_APPROVAL_TAG_TOKENS = {
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

# "PO Date(Doc date)" - point #9's "Purchasing Date" uses this column, not
# "PO Created date" - see CHANGELOG. It needs the same SAP-date
# normalization treatment when the source file is a direct .xlsx export.
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
    """
    NOTE: the Deletion-indicator branch here is now effectively a
    defensive fallback only. In normal operation, ANY po_row that carries
    Deletion indicator = 'L' has already been dropped from po_rows -
    entirely, on its own, WITHOUT touching any other line item on the
    same PO number - by drop_lines_with_deletion_indicator() before
    evaluate_rule() (which calls this) is ever reached. See the "Deletion
    Indicator exclusion corrected back to LINE level" CHANGELOG entry at
    the top of this file. Returns Item = 'X' is handled differently and
    is NOT dropped upstream - a returned line still only excludes itself
    here, via this same per-row check, exactly as before.
    """
    return _is_deleted_line(row) or _is_return_item(row)


# ---------------------------------------------------------------------------
# LINE-level exclusion for Deletion indicator (see CHANGELOG "THIS
# REVISION"). Removes ONLY the specific line item(s) that carry Deletion
# indicator = 'L' - never their PO-mates. A PO with 5 line items where 2
# carry 'L' keeps its other 3 line items fully in scope; a PO whose ONLY
# line item carries 'L' simply ends up with nothing left under that PO
# number (a consequence of removing the one line, not a PO-level rule).
# ---------------------------------------------------------------------------
def drop_lines_with_deletion_indicator(po_rows):
    """
    Removes every line item that itself carries Deletion indicator = 'L'
    from po_rows - completely (not marked Not Applicable) - before
    build_context() or any output/JSON is generated, so a dropped line
    contributes to nothing downstream: no row in "PO Line Results", no
    addpo/header JSON record, no cross-row aggregate.

    Other line items on the SAME PO number that do NOT carry 'L' are left
    untouched in po_rows and continue to be audited exactly as normal -
    this function never looks at or removes a line based on what its
    PO-mates contain.

    Returns Item = 'X' is intentionally NOT part of this filter - see the
    module-level CHANGELOG entry and _is_excluded_line() above; a Returns
    Item line is still only marked Not Applicable in place, not dropped.
    """
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
            f"audited and appear in every output as normal. If every line item under a "
            f"given PO number happens to carry 'L', that PO will not appear anywhere in "
            f"the audit at all - simply because none of its line items remain, not "
            f"because of any PO-level rule. This is separate from Returns Item = 'X' "
            f"handling, which still marks just the flagged line Not Applicable in place "
            f"rather than dropping it."
        )
    return kept


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
# plant/Purchasing Date, +RFQ). Used by BOTH build_context() (to build the
# aggregates) and rule_19_multiple_po_same_day() (to look a PO up in them)
# so the two can never define a key differently and silently disagree.
#
# _po9_four_key(row) is the CORE 4-dimension key: Vendor + Purchasing Group
# + Plant + Purchasing Date ("PO Date(Doc date)", NOT "PO Created date" -
# see CHANGELOG). This is what decides a match WHENEVER either side's RFQ
# is blank (per the Final sheet's "Changes to be done" instruction for this
# point: "If the RFQ No. is blank, check only the remaining 4 parameters
# for verification").
#
# RFQ (RFQ_NO_COLUMN = "order acknowledgement") is layered on top in
# rule_19_multiple_po_same_day() / build_context() rather than being baked
# into a single 5-part tuple key, because a blank RFQ on EITHER side must
# make the two POs comparable on the 4-parameter key alone - a plain tuple
# match can't express "ignore this field when it's blank".
#
# _po9_core_key(row) (Vendor + Purchasing Group + Plant only, no date) is
# used purely to build the "Verified" explanation - the population of
# other POs sharing vendor/group/plant, so the remark can say which
# remaining dimension (Purchasing Date and/or RFQ) is what differs.
#
# Neither key filters out excluded (Deletion indicator='L' / Returns
# Item='X') rows - see CHANGELOG for why that exclusion was proven wrong
# for this specific point against the client's ground truth. An excluded
# row's OWN result is still forced to Not Applicable separately, by
# evaluate_rule() above.
# ---------------------------------------------------------------------------
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


def _po9_rfq_matches(own_rfq, other_rfq):
    """
    RFQ comparison logic:
    - If BOTH sides are blank: treated as a match on 4 parameters (RFQ not compared).
    - If BOTH sides are non-blank and equal: treated as a match on all 5 parameters.
    - If RFQ is blank on one side and populated on the other, or both are different:
      treated as a mismatch (not a duplicate).
    """
    if own_rfq == "" and other_rfq == "":
        return True
    if own_rfq != "" and other_rfq != "":
        return own_rfq == other_rfq
    return False

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
    POINT #15.

    Client's formula (confirmed with worked examples):

        PO Quantity <= PR Quantity <= PO Quantity x (1 + Overdelivery Tolerance % / 100)

    This is a direct, single-line comparison of THIS row's own "PO Qty."
    against THIS row's own linked "PR Qty." - there is no cross-PO
    cumulative aggregation.

    - PR Qty < PO Qty            -> Not Verified (PO qty cannot exceed PR qty)
    - PO Qty <= PR Qty <= ceiling -> Verified
    - PR Qty > ceiling            -> Not Verified (exceeds the overdelivery buffer)

    where ceiling = PO Qty x (1 + Overdelivery Tolerance % / 100).
    "Under Delivery tolerance" is intentionally NOT consulted for this
    rule - the client's formula only references Overdelivery Tolerance.
    If "Overdelivery Tolerance Limit" is blank, this falls back to 0%
    (no allowed buffer) and logs an assumption.

    NOTE: the Final sheet's own "Changes to be done" column for this point
    describes a different, CUMULATIVE-PO-Qty formula, but its "Testing"
    column marks that entry "ON HOLD" - so it is deliberately NOT applied
    here. This function implements the newer, non-cumulative, client-
    confirmed formula above instead (see CHANGELOG).
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
    """
    HEADER-LEVEL rule (see build_po_header_records) - reports as new point #3.

    FIXED THIS REVISION per client feedback: "If tax code is 0, 48 - then no
    gst and data missing of Vendor state." Tax Codes '0' and '48' map (via
    the Tax Master) to categories 'No GST' and 'Input Tax' respectively -
    both of which already fall under GST_NOT_APPLICABLE_TOKENS and should
    resolve straight to Not Applicable ("no GST"). The PREVIOUS ordering
    checked Vendor State FIRST and returned Data Missing whenever Vendor
    State was blank, before the Tax Master lookup ever ran - so a line with
    Tax Code 0/48 but a blank Vendor State incorrectly showed "Data Missing"
    instead of "Not Applicable". A Vendor State is only actually needed to
    decide the Gujarat/non-Gujarat (SGST+CGST vs IGST) comparison, so it is
    now looked up AFTER the Tax Master / GST-not-applicable check, not
    before it. Vendor State blank still correctly produces Data Missing,
    but only for tax codes that genuinely require the Gujarat comparison -
    no longer for tax codes like 0/48 whose category already says GST does
    not apply, and no longer blocks that determination.
    """
    tax_code = s(row, "Tax code")

    if not tax_code:
        return MANUAL, "Tax code is missing/blank"

    tax_master = ctx.get("tax_master", {})
    tax = tax_master.get(normalize_tax_code(tax_code))  # normalize before lookup ("07" -> "7")

    if not tax:
        return MANUAL, f"Tax Code {tax_code} not found in Tax Master"

    category_token = _normalize_category_tokens(tax["category"])

    # No-GST / not-applicable categories (e.g. Tax Code 0 -> "No GST", Tax
    # Code 48 -> "Input Tax") are decided straight from the Tax Master -
    # Vendor State is irrelevant here and is NOT required for this branch.
    if category_token in GST_NOT_APPLICABLE_TOKENS:
        return NA, f"Tax Code {tax_code} category '{tax['category']}' is not a GST in-state/out-of-state code (VAT/CST/exempt/Input Tax/No GST/etc.)"

    # Only categories that actually need a Gujarat/non-Gujarat comparison
    # (SGST+CGST vs IGST) require Vendor State from here on.
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
    """
    POINT #16. The vendor_material_tax set built in build_context() does
    NOT skip excluded (Deletion indicator='L' / Returns Item='X') rows -
    confirmed against the client's ground truth on PO 4500493241 (tax 01,
    live) vs PO 4500492489 (tax 03, Returns Item='X'), same vendor/
    material, which the client's manual audit says IS Not Verified (the
    two tax codes still conflict even though one line was returned).
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


def _condition_types_for_item(po_number, item_no, cnd_by_po):
    """All Condition Type values recorded against this PO+item (order preserved)."""
    item_s = str(item_no).lstrip("0")
    return [
        s(c, "Condition Type")
        for c in cnd_by_po.get(po_number, [])
        if s(c, "Item no").lstrip("0") == item_s and s(c, "Condition Type")
    ]


def _freight_condition_match(po_number, item_no, cnd_by_po):
    """
    Returns (matched_freight_type_or_None, all_condition_types_present).

    FIXED THIS REVISION per client feedback ("If inco term is EYW and
    condition types are R000,NAVM,PBXX,NAVS,JEXS,ZPB0,R001,ZIB2,ZPB1 - on
    these condition types - why it is showing verified?"): these listed
    codes are ordinary pricing/tax conditions (gross price, non-deductible
    tax, etc.) that legitimately co-occur ALONGSIDE a real freight
    condition (e.g. ZRA3/ZRB3) on the same PO line - they are NOT
    themselves in FREIGHT_CONDITION_TYPES and were never being matched as
    freight (verified against the real POAUDITCND data: every line whose
    ONLY condition types are from this list is correctly Not Verified).
    The actual problem was that the remark only said "Freight condition
    present" without naming which condition type triggered it, so a
    reviewer scanning a line with types like
    ['ZRB3','NAVM','PBXX','NAVS','JEXS'] had no way to see - without
    re-deriving it themselves - that 'ZRB3' (not the other four) was what
    made it Verified. This helper now surfaces the actual matched type (or
    confirms none matched) so rule_13/rule_14 can say so explicitly.
    """
    all_types = _condition_types_for_item(po_number, item_no, cnd_by_po)
    for t in all_types:
        if t in FREIGHT_CONDITION_TYPES:
            return t, all_types
    return None, all_types


def _other_condition_types_note(matched_type, all_types):
    """Formats the non-freight condition types also present, for remark transparency."""
    others = sorted({t for t in all_types if t != matched_type})
    if not others:
        return ""
    return f" (other condition type(s) on this line, not freight: {others})"


def rule_13_eyw_freight_required(row, ctx):
    """
    HEADER-LEVEL rule (see build_po_header_records) - reports as new point #6.

    PO types ZIRM/ZICP route to manual review here too (previously only
    rule 14/new #7 had this).
    """
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
    """
    HEADER-LEVEL rule (see build_po_header_records) - reports as new point #7.

    PO types ZIRM/ZICP route to manual review instead of an automated
    Verified/Not-Verified outcome.
    """
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

    Logic:
      1. Slices on the 4-parameter core key (Vendor, Purchasing Group, Plant,
         Purchasing Date = "PO Date(Doc date)").
      2. Compares RFQ (from "order acknowledgement"):
         - Both blank: matched on 4 parameters ("RFQ no. should be blank for all pos side").
         - Both non-blank and identical: matched on all 5 parameters.
         - One blank and one populated, or different non-blank values: not a duplicate.
      3. Returns Not Verified if duplicate match exists; otherwise Verified.
    """
    po_number = s(row, "PO number")
    four_key = _po9_four_key(row)
    
    # Use representative RFQ for this PO to keep lines consistent
    own_rfq = ctx["po9_rfq_by_po"].get((four_key, po_number), s(row, RFQ_NO_COLUMN))

    others_four = ctx["po9_four_groups"].get(four_key, set()) - {po_number}

    matched_4_only = set()
    matched_5 = set()
    rfq_only_diff = set()

    for other_po in others_four:
        other_rfq = ctx["po9_rfq_by_po"].get((four_key, other_po), "")
        
        # Condition 1: Both sides have blank RFQ -> matched on 4 parameters
        if own_rfq == "" and other_rfq == "":
            matched_4_only.add(other_po)
        # Condition 2: Both sides have non-blank identical RFQ -> matched on 5 parameters
        elif own_rfq != "" and other_rfq != "" and own_rfq == other_rfq:
            matched_5.add(other_po)
        # Condition 3: One is blank while other has value, OR both have differing RFQs
        else:
            rfq_only_diff.add(other_po)

    if matched_4_only or matched_5:
        parts = []
        if matched_4_only:
            parts.append(
                f"4 parameters (Vendor, Purchasing Group, Plant, Purchasing Date) are "
                f"the same as PO(s) {_format_po_list(matched_4_only)} - RFQ no. should be blank "
                f"for all pos side so it was not compared"
            )
        if matched_5:
            parts.append(
                f"all 5 parameters (Vendor, Purchasing Group, Plant, Purchasing Date and "
                f"RFQ no.) are the same as PO(s) {_format_po_list(matched_5)}"
            )
        return NOT_VERIFIED, "; ".join(parts)

    if not others_four:
        return VERIFIED, "No other PO found with the same Vendor, Purchasing Group, Plant and Purchasing Date"

    if rfq_only_diff:
        return VERIFIED, (
            f"Same Vendor, Purchasing Group, Plant and Purchasing Date as "
            f"PO(s) {_format_po_list(rfq_only_diff)}, but RFQ no. is different on both "
            f"sides - not treated as a duplicate"
        )

    return VERIFIED, "No other PO found with the same Vendor, Purchasing Group, Plant and Purchasing Date"

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
# pointNo values below are the NEW numbers (see CHANGELOG). Header points
# are contiguous 1-9; line points 10-19. Each tuple's rule_no (first
# element) is what actually gets written out as `pointNo` - the function
# names are unrelated legacy identifiers.
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
    (9, "Multiple POs to same Vendor/Purchasing Group/Plant/Purchasing Date (RFQ used to distinguish when both non-blank)", rule_19_multiple_po_same_day),
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

    - Point #9's aggregates (po9_four_groups / po9_rfq_by_po / po9_core_groups)
      and point #16's aggregate (vendor_material_tax) do NOT skip excluded
      (Deletion indicator='L' / Returns Item='X') rows when aggregating -
      confirmed against the client's ground-truth "before/after" workbook:
      a cancelled or returned PO/line must still count as a real
      duplicate-creation event (point #9) or a real conflicting tax code
      (point #16), even though its OWN result is still forced to Not
      Applicable by evaluate_rule(). See CHANGELOG.
    - Point #9's RFQ handling uses a 4-parameter core key
      (_po9_four_key: Vendor/Purchasing Group/Plant/Purchasing Date) plus
      a separate per-(four_key, po_number) representative RFQ value
      (po9_rfq_by_po), rather than baking RFQ into the grouping tuple
      itself - this is what lets rule_19 treat a blank RFQ on either side
      as "skip the RFQ dimension" per the client's instruction (see
      CHANGELOG, "THIS REVISION").
    - Point #15 has no aggregate here at all - it is a direct per-line
      comparison (see rule_06_quantity_control).
    """
    po_material_groups = defaultdict(list)
    vendor_material_tax = defaultdict(set)
    po9_four_groups = defaultdict(set)
    po9_core_groups = defaultdict(set)
    po9_rfq_by_po = {}
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
        # feed the per-(vendor, material) tax-code set - see CHANGELOG.
        vendor = s(row, "Vendor Code")
        tax_code = s(row, "Tax code")
        if vendor and material and tax_code:
            vendor_material_tax[(vendor, material)].add(tax_code)

        # Point #9: every row (including excluded ones) feeds the
        # duplicate-PO aggregates - see CHANGELOG.
        four_key = _po9_four_key(row)
        po9_four_groups[four_key].add(po_number)
        # First RFQ value seen for this (four_key, po_number) is treated as
        # the PO's representative RFQ. Assumption: a single PO's lines all
        # share the same order-acknowledgement/RFQ value; if they don't,
        # only the first-seen value is used (logged below).
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

        core_key = _po9_core_key(row)
        po9_core_groups[core_key].add(po_number)

    log_assumption(
        9,
        f"Point #9's RFQ dimension is sourced from the '{RFQ_NO_COLUMN}' column (per the "
        f"Final sheet's 'Add RFQ number = order acknowledgement' instruction). Two POs "
        f"sharing Vendor + Purchasing Group + Plant + Purchasing Date ('{PURCHASING_DATE_COLUMN}') "
        f"are flagged Not Verified unless BOTH have a non-blank RFQ and those RFQ values "
        f"differ - i.e. a blank RFQ on either side means only the 4 core parameters are "
        f"checked, per the client's instruction.",
    )

    return {
        "po_material_groups": po_material_groups,
        "vendor_material_tax": vendor_material_tax,
        "po9_four_groups": po9_four_groups,
        "po9_rfq_by_po": po9_rfq_by_po,
        "po9_core_groups": po9_core_groups,
        "cnd_by_po": cnd_by_po,
        "rc_overlaps": rc_overlaps,
    }

STATUS_TO_RESULT_FLAGS = {
    VERIFIED: {"verified": True, "not_applicable": False, "missing_data": False, "manual_verification": False},
    NOT_VERIFIED: {"verified": False, "not_applicable": False, "missing_data": False, "manual_verification": False},
    NA: {"verified": False, "not_applicable": True, "missing_data": False, "manual_verification": False},
    MANUAL: {"verified": False, "not_applicable": False, "missing_data": True, "manual_verification": True},
    # ZIRM/ZICP routing on points #6/#7: a deliberate "human must check
    # this" outcome, NOT a data-quality problem - missing_data stays
    # False so it isn't confused with genuinely missing/unparseable data.
    MANUAL_CHECK: {"verified": False, "not_applicable": False, "missing_data": False, "manual_verification": True},
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
    points (NEW numbers 1-9), evaluated once per PO instead of once per line.

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
                statuses = {st for _li, (st, _remark) in per_line}
                
                if len(statuses) == 1:
                    status, remark = per_line[0][1]
                else:
                    # If lines have mixed outcomes, prioritize Not Verified > Verified > NA
                    # to prevent defaulting to "Manual Verification" / "Data Missing".
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

def run(poaudit_path, cnd_path, rc_path, out_path, addpo_json_path=None, header_json_path=None, rc_json_path=None):
    po_rows, cnd_rows, rc_rows, cnd_by_po = load_all(poaudit_path, cnd_path, rc_path)

    po_rows = filter_to_scope(po_rows)

    # LINE-level Deletion Indicator exclusion - MUST run before
    # build_context() and before anything else touches po_rows, so a
    # line item carrying 'L' is fully gone before any output, JSON export,
    # or cross-row aggregate is built. Only the flagged line itself is
    # removed - its PO-mates are untouched. See CHANGELOG "THIS REVISION".
    # Logs its own assumption entry internally when it drops anything.
    po_rows = drop_lines_with_deletion_indicator(po_rows)

    # Everything remaining in po_rows by this point has no Deletion
    # indicator = 'L' line at all (those were already removed above,
    # individually, without affecting their PO-mates). The only thing
    # _is_excluded_line() can still match here is a per-line Returns Item
    # = 'X', which is intentionally still handled the old way (marked Not
    # Applicable in place, not dropped).
    excluded_count = sum(1 for r in po_rows if _is_excluded_line(r))
    if excluded_count:
        log_assumption(
            "Global Exclusion - Returns Item (line-level)",
            f"{excluded_count} of {len(po_rows)} remaining in-scope PO line(s) were "
            f"excluded from ALL 19 audit points (marked Not Applicable on every point, "
            f"line-level and header-level alike) because they have Returns Item = 'X'. "
            f"This ONLY affects each such row's OWN result - the rest of that PO's line "
            f"items are still fully audited. (Any line item with Deletion indicator = 'L' "
            f"was already removed COMPLETELY above, before this count, without affecting "
            f"its PO-mates - see the 'Global Exclusion - Deletion Indicator (line-level)' "
            f"assumption if any were dropped.) These Returns-Item lines are DELIBERATELY "
            f"still counted when building the point #9 (duplicate-PO) and point #16 "
            f"(vendor/material tax consistency) aggregates, i.e. they still affect the "
            f"results of OTHER, live line items where relevant - confirmed against the "
            f"client's manually-verified ground truth (see CHANGELOG). Point #15 no "
            f"longer uses a cross-row aggregate at all, so exclusion there simply means "
            f"the excluded line's own result is Not Applicable, with no effect on any "
            f"other line.",
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