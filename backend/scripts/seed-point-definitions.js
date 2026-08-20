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
      "Manual Review if vendor state or tax code missing, or if Tax Code isn't found in the Tax Master. Not Applicable for non-GST-regime categories. Otherwise Verified/Not Verified based on Gujarat vs non-Gujarat vendor state against SGST+CGST vs IGST category.",
    dataPoints: "Vendor State, Tax code, Tax Master Category",
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
      "Confirms PO lines using Inco Term EYW carry a freight condition type (ZBF1/ZBF2/ZRA3/ZRB3/ZRE3).",
    logic:
      "Not Applicable if Inco term isn't EYW. Verified if a matching freight condition exists on that PO+line in POAUDITCND, else Not Verified.",
    dataPoints:
      "Inco term, PO number, PO Line item, Condition Type (POAUDITCND)",
  },
  {
    pointNo: 7,
    scope: "header",
    severity: "Medium",
    title: "EXW/FCA Must NOT Carry a Freight Condition",
    summary:
      "Confirms PO lines using Inco Term EXW or FCA do not carry a freight condition.",
    logic:
      "Not Applicable if Inco term isn't EXW/FCA. Not Verified if a freight condition exists on that PO+line, else Verified.",
    dataPoints:
      "Inco term, PO number, PO Line item, Condition Type (POAUDITCND)",
  },
  {
    pointNo: 8,
    scope: "header",
    severity: "Critical",
    title: "Rate Approval by Authorised Approver",
    summary:
      "Confirms a rate has an approval tag on record, signed off by a recognised approver.",
    logic:
      "Not Applicable if no rate-approval tag is found in 'Our Ref.'. Verified if the recognised approver initials also appear, else Not Verified.",
    dataPoints: "Our Ref.",
  },
  {
    pointNo: 9,
    scope: "header",
    severity: "Critical",
    title: "Multiple POs to Same Vendor, Same Day",
    summary:
      "Flags possible order-splitting: the same vendor, plant, and purchasing group issued more than one PO on the same date.",
    logic:
      "Not Verified if other PO numbers share the same Vendor Code + PO Created date + Plant + Purchase Group; Verified otherwise.",
    dataPoints:
      "Vendor Code, PO Created date, Plant, Purchase Group, PO number",
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
      "Confirms cumulative PO quantity raised against a PR line does not exceed the PR quantity beyond the allowed tolerance.",
    logic:
      "Not Applicable for PO types ZSER/ZCSR or when PR qty is unavailable. Sums PO Qty across every PO line referencing the same PR+PR-line, compares against PR Qty, and allows the % in tolerance limits.",
    dataPoints:
      "PO Type, Purchase Req, PR line Item no., PR Qty., PO Qty., Under Delivery tolerance, Overdelivery Tolerance Limit",
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
