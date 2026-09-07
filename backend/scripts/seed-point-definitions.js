// scripts/seed-point-definitions.js
//
// Run ONCE (and again any time this file's text is intentionally edited):
//   node scripts/seed-point-definitions.js
//
// This is the ONLY place point title/summary/logic/dataPoints/scope are
// written as source text - it upserts them into AuditPointConfig (DB).
// Runtime code (utility/point-definitions.js) only ever reads the DB, never
// this file, satisfying "point details are DB-only, not file-only".
//
// Point numbers below are the NEW numbering: header = 1-9, line = 10-19.
// severity values here are only used the first time a pointNo is created;
// after that, admins edit severity via the Risk Categorization Master page
// and this script will NOT overwrite an admin's chosen severity on re-run
// (see upsert below - severity is only set on create).

import { prisma } from "../lib/prisma.js";

const DEFINITIONS = [
  // ---------------- HEADER-LEVEL (1-9) ----------------
  {
    pointNo: 1,
    scope: "header",
    severity: "High",
    title: "Rate Contract (RC) Released",
    summary:
      "Confirms the Rate Contract referenced by this PO has actually been released in SAP.",
    logic:
      "Not Applicable if no RC assigned. Verified only if 'RC Release status' is in the released-code set.",
    dataPoints: "RC no., RC Release status",
  },
  {
    pointNo: 2,
    scope: "header",
    severity: "High",
    title: "RC Assigned Consistently Across Same-Material Lines",
    summary:
      "Confirms the same Rate Contract is used consistently across every PO line for the same PO + Material combination.",
    logic:
      "Not Applicable if no line for this PO+Material references an RC. Not Verified if more than one distinct RC number is used for the same PO+Material.",
    dataPoints: "PO number, Material Code, RC no. (across all lines of the PO)",
  },
  {
    pointNo: 3,
    scope: "header",
    severity: "Critical",
    title: "GST Tax Logic (In-State vs Out-of-State)",
    summary:
      "Confirms the tax code matches the vendor's state — SGST+CGST for Gujarat vendors, IGST for out-of-state vendors.",
    logic:
      "Manual Review if Tax code is blank or not found in the Tax Master. Tax Master category is checked FIRST: 'No GST' / 'Input Tax' / exempt-style categories (e.g. Tax Codes 0 and 48) resolve straight to Not Applicable without ever needing Vendor State. Only categories that genuinely need a Gujarat/non-Gujarat comparison then require Vendor State (falling back to the GSTIN state code if blank) - Manual Review only fires for a missing Vendor State on that remaining branch. Otherwise Verified/Not Verified based on Gujarat vs non-Gujarat vendor state against SGST+CGST vs IGST category.",
    dataPoints: "Tax code, Tax Master Category, Vendor State, GSTIN",
  },
  {
    pointNo: 4,
    scope: "header",
    severity: "Critical",
    title: "MSME Vendor Payment Term",
    summary:
      "Confirms MSME-registered vendors are on the mandated MSME payment term (Z102, ≤45 days), per the MSMED Act payment-timeline requirement.",
    logic:
      "Not Applicable if the vendor has no MSME certificate on file. Verified only if Payment Term = Z102, else Not Verified.",
    dataPoints: "Vendor MSME Status, Payment Term",
  },
  {
    pointNo: 5,
    scope: "header",
    severity: "Medium",
    title: "General Vendor Payment Term (≥21 Days)",
    summary:
      "Confirms non-MSME vendors are on a payment term of at least 21 days.",
    logic:
      "Not Applicable for MSME vendors, excluded purchase groups (P02/P43/P46), excluded payment terms (Z105/Z126/Z142), or PO types ZSER/ZCSR. Manual Review if payment days unavailable. Verified if Payment days >= 21.",
    dataPoints:
      "Vendor MSME Status, Purchase Group, Payment Term, PO Type, Payment days",
  },
  {
    pointNo: 6,
    scope: "header",
    severity: "Medium",
    title: "EYW Inco-Term Requires Freight Condition",
    summary:
      "Confirms PO lines using Inco Term EYW carry a freight condition type (ZBF1/ZBF2/ZRA3/ZRB3/ZRE3/ZFB5).",
    logic:
      'Not Applicable if Inco term isn\'t EYW. Verified if a matching freight condition exists on that PO+line in POAUDITCND, else Not Verified. The remark names the exact matched condition type (e.g. "ZRB3") and lists any other, non-freight condition types also present on the line.',
    dataPoints:
      "Inco term, PO number, PO Line item, Condition Type (POAUDITCND)",
  },
  {
    pointNo: 7,
    scope: "header",
    severity: "Medium",
    title: "EXW/FCA Must NOT Carry a Freight Condition",
    summary:
      "Confirms PO lines using Inco Term EXW or FCA do not carry a freight condition (ZBF1/ZBF2/ZRA3/ZRB3/ZRE3/ZFB5).",
    logic:
      "Not Applicable if Inco term isn't EXW/FCA. Not Verified if a freight condition exists on that PO+line, else Verified. The remark names the exact matched condition type when Not Verified, and lists any other, non-freight condition types also present on the line.",
    dataPoints:
      "Inco term, PO number, PO Line item, Condition Type (POAUDITCND)",
  },
  {
    pointNo: 8,
    scope: "header",
    severity: "Critical",
    title: "Rate Approval by Authorised Approver",
    summary:
      "Confirms a rate has an actual approval outcome on record ('DWS-APPROVED'), signed off by a recognised approver.",
    logic:
      "Not Applicable if 'Our Ref.' carries no DWS-APPROVED-style tag (a plain 'Rate Approval' workflow tag, without an approved outcome, does NOT count and is intentionally not searched for). Verified if one of the recognised approver initials (KKB/SRS/PJP/DAULAT/NHV/CVS) also appears, else Not Verified.",
    dataPoints: "Our Ref.",
  },
  {
    pointNo: 9,
    scope: "header",
    severity: "Critical",
    title: "Multiple POs to Same Vendor, Same Day",
    summary:
      "Flags possible order-splitting: the same vendor, purchasing group, plant, and purchasing date were used on more than one PO, unless a differing RFQ number on both sides explains it.",
    logic:
      "Compares Vendor Code + Purchase Group + Plant + Purchasing Date ('PO Date(Doc date)', not 'PO Created date') across POs. If another PO shares all four, it counts as a match UNLESS both POs have a non-blank RFQ no. (sourced from the 'order acknowledgement' column) and those RFQ numbers differ - a blank RFQ on either side is not treated as a differentiator. Not Verified if any other PO matches; the remark states whether the match was on the 4 core parameters (RFQ blank on one side) or all 5 (RFQ also equal). Verified if no other PO shares even the 4 core parameters, or if every PO that does share them was excluded solely because of a non-blank, differing RFQ.",
    dataPoints:
      "Vendor Code, Purchase Group, Plant, PO Date(Doc date), order acknowledgement (RFQ no.), PO number",
  },

  // ---------------- LINE-LEVEL (10-19) ----------------
  {
    pointNo: 10,
    scope: "line",
    severity: "High",
    title: "Release Verification (PR released before PO)",
    summary:
      "Confirms the Purchase Requisition linked to this PO line was released in SAP before the PO was raised.",
    logic:
      "Not applicable for PO types ZSER/ZJVW/ZJWV. Otherwise Verified only if 'PR Release Ind' equals the released code.",
    dataPoints: "PO Type, Purchase Req, PR Release Ind",
  },
  {
    pointNo: 11,
    scope: "line",
    severity: "Medium",
    title: "PR Assigned to PO Line",
    summary:
      "Confirms a Purchase Requisition number is attached to the PO line at all.",
    logic: "Verified if 'Purchase Req' is non-blank, else Not Verified.",
    dataPoints: "Purchase Req",
  },
  {
    pointNo: 12,
    scope: "line",
    severity: "Medium",
    title: "PR Creation Date Within 6 Months of PO",
    summary:
      "Confirms the PR was created within 6 months (180 days) before the PO date.",
    logic:
      "Not Applicable if no PR assigned. Manual Review if PO/PR dates are missing or unparseable. Verified if PR date >= PO date - 180 days.",
    dataPoints: "Purchase Req, PO Created date, PR Creation date",
  },
  {
    pointNo: 13,
    scope: "line",
    severity: "High",
    title: "PR Date Precedes PO Date",
    summary:
      "Confirms the PR was created on or before the PO date (PR cannot postdate the PO).",
    logic:
      "Not Applicable if no PR assigned. Manual Review if dates are missing/unparseable. Verified if PR date <= PO date.",
    dataPoints: "Purchase Req, PO Created date, PR Creation date",
  },
  {
    pointNo: 14,
    scope: "line",
    severity: "Medium",
    title: "Delivery Date After PR Date",
    summary:
      "Confirms the expected delivery date falls on or after the PR creation date.",
    logic:
      "Not Applicable if no PR assigned. Manual Review if dates missing/unparseable. Verified if Delivery Date >= PR Creation date.",
    dataPoints: "Purchase Req, PR Creation date, Delivery Date",
  },
  {
    pointNo: 15,
    scope: "line",
    severity: "High",
    title: "PO Quantity vs PR Quantity (Tolerance)",
    summary:
      "Confirms this PO line's own PR quantity sits between its PO quantity and PO quantity plus the allowed overdelivery buffer - a direct per-line check, not a cumulative one.",
    logic:
      "Not Applicable for PO types ZSER/ZCSR or when no PR is assigned. Direct single-line comparison: Not Verified if PR Qty < PO Qty (PO qty may never exceed PR qty); Verified if PO Qty <= PR Qty <= PO Qty x (1 + Overdelivery Tolerance % / 100); Not Verified if PR Qty exceeds that ceiling. 'Under Delivery tolerance' is not used by this rule. A blank Overdelivery Tolerance Limit is treated as 0% (no buffer).",
    dataPoints:
      "PO Type, Purchase Req, PR Qty., PO Qty., Overdelivery Tolerance Limit",
  },
  {
    pointNo: 16,
    scope: "line",
    severity: "Medium",
    title: "Vendor-Material Tax Code Consistency",
    summary:
      "Confirms the same vendor + material combination always uses the same tax code (within this extract).",
    logic:
      "Verified if only one distinct tax code is seen for the vendor+material pair; Not Verified if multiple different tax codes are used.",
    dataPoints: "Vendor Code, Material Code, Tax code",
  },
  {
    pointNo: 17,
    scope: "line",
    severity: "Medium",
    title: "Service PO (ZSER) Item Category",
    summary:
      "Confirms Service-type (ZSER) PO lines use the Service item category with Account Assignment K.",
    logic:
      "Not Applicable if PO Type isn't ZSER. Verified only if Item category disc = 'Service' and Account Assignment = 'K'.",
    dataPoints: "PO Type, Item category disc, Account Assignment",
  },
  {
    pointNo: 18,
    scope: "line",
    severity: "Medium",
    title: "Service PO (ZCSR) Item Category",
    summary:
      "Confirms Capital Service PO (ZCSR) lines use the correct Item Category (D) and Account Assignment (A).",
    logic:
      "Not Applicable if PO Type isn't ZCSR. Verified only if Item category is D and Account Assignment is A.",
    dataPoints: "PO Type, Item category disc, Account Assignment",
  },
  {
    pointNo: 19,
    scope: "line",
    severity: "Low",
    title: "ZLRM Must Not Use Service Item Category",
    summary:
      "Confirms Local Raw Material (ZLRM) PO lines do NOT incorrectly use the Service item category + Account Assignment K combination reserved for service POs.",
    logic:
      "Not Applicable if PO Type isn't ZLRM. Not Verified if Item category disc = 'Service' and Account Assignment = 'K', else Verified.",
    dataPoints: "PO Type, Item category disc, Account Assignment",
  },
];

async function main() {
  for (const def of DEFINITIONS) {
    await prisma.auditPointConfig.upsert({
      where: { pointNo: def.pointNo },
      create: {
        pointNo: def.pointNo,
        severity: def.severity,
        title: def.title,
        summary: def.summary,
        logic: def.logic,
        dataPoints: def.dataPoints,
        scope: def.scope,
        updatedBy: "seed-script",
      },
      update: {
        // Content fields always refreshed from source-of-truth text above.
        title: def.title,
        summary: def.summary,
        logic: def.logic,
        dataPoints: def.dataPoints,
        scope: def.scope,
        // severity intentionally NOT overwritten on update - an admin may
        // have already changed it via Risk Categorization Master.
      },
    });
  }
  console.log(`Seeded ${DEFINITIONS.length} point definitions.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
