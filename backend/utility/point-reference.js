/**
 * point-reference.js
 * ===================
 * The FIXED, non-editable description of every audit point (1-19), sourced
 * directly from audit_engine.py's PO_LINE_RULES / rule_XX_* functions.
 *
 * IMPORTANT: this file intentionally does NOT contain severity/criticality
 * any more. Severity is admin-editable and lives in the AuditPointConfig
 * DB table (see utility/severity.js + controller/risk-categorization-controller.js).
 * Point number, title, summary, logic, and dataPoints are permanent and are
 * shown read-only on the Risk Categorization Master page - an admin can
 * change criticality there and nothing else.
 */

export const POINT_DEFINITIONS = [
  {
    pointNo: "1",
    title: "Release Verification (PR released before PO)",
    summary:
      "Confirms the Purchase Requisition linked to this PO line was released in SAP before the PO was raised.",
    logic:
      "Not applicable for PO types ZSER/ZJVW/ZJWV, or when no PR is linked to the line. Otherwise Verified only if 'PR Release Ind' equals the released code.",
    dataPoints: "PO Type, Purchase Req, PR Release Ind",
  },
  {
    pointNo: "2",
    title: "PR Assigned to PO Line",
    summary:
      "Confirms a Purchase Requisition number is attached to the PO line at all.",
    logic: "Verified if 'Purchase Req' is non-blank, else Not Verified.",
    dataPoints: "Purchase Req",
  },
  {
    pointNo: "3",
    title: "PR Creation Date Within 6 Months of PO",
    summary:
      "Confirms the PR was created within 6 months (183 days) before the PO date.",
    logic:
      "Not Applicable if no PR assigned. Manual Review if PO/PR dates are missing or unparseable. Verified if PR date >= PO date - 183 days.",
    dataPoints: "Purchase Req, PO Created date, PR Creation date",
  },
  {
    pointNo: "4",
    title: "PR Date Precedes PO Date",
    summary:
      "Confirms the PR was created on or before the PO date (PR cannot postdate the PO).",
    logic:
      "Not Applicable if no PR assigned. Manual Review if dates are missing/unparseable. Verified if PR date <= PO date.",
    dataPoints: "Purchase Req, PO Created date, PR Creation date",
  },
  {
    pointNo: "5",
    title: "Delivery Date After PR Date",
    summary:
      "Confirms the expected delivery date falls on or after the PR creation date.",
    logic:
      "Not Applicable if no PR assigned. Manual Review if dates missing/unparseable. Verified if Delivery Date >= PR Creation date.",
    dataPoints: "Purchase Req, PR Creation date, Delivery Date",
  },
  {
    pointNo: "6",
    title: "PO Quantity vs PR Quantity (Tolerance)",
    summary:
      "Confirms cumulative PO quantity raised against a PR line (across every partial PO, not just this one) does not exceed the PR quantity beyond the allowed under-delivery tolerance.",
    logic:
      "Not Applicable for PO types ZSER/ZCSR or when PR qty is unavailable. Sums PO Qty across every PO line referencing the same PR+PR-line, compares against PR Qty, and allows the % in 'Under Delivery tolerance'.",
    dataPoints:
      "PO Type, Purchase Req, PR line Item no., PR Qty., PO Qty., Under Delivery tolerance",
  },
  {
    pointNo: "7",
    title: "Rate Contract (RC) Released",
    summary:
      "Confirms the Rate Contract referenced by this PO line has actually been released in SAP.",
    logic:
      "Not Applicable if no RC assigned. Verified only if 'RC Release status' is in the released-code set.",
    dataPoints: "RC no., RC Release status",
  },
  {
    pointNo: "8",
    title: "RC Assigned Consistently Across Same-Material Lines",
    summary:
      "Confirms the same Rate Contract is used consistently across every PO line for the same PO + Material combination.",
    logic:
      "Not Applicable if no line for this PO+Material references an RC. Not Verified if more than one distinct RC number is used for the same PO+Material, or if this line's RC doesn't match the expected one.",
    dataPoints: "PO number, Material Code, RC no. (across all lines of the PO)",
  },
  {
    pointNo: "9",
    title: "GST Tax Logic (In-State vs Out-of-State)",
    summary:
      "Confirms the tax code matches the vendor's state — SGST+CGST for Gujarat vendors, IGST for out-of-state vendors.",
    logic:
      "Manual Review if vendor state or tax code missing, or if Tax Code isn't found in the Tax Master. Not Applicable for non-GST-regime categories (VAT/CST/Excise/Works Contract/exempt/etc.). Otherwise Verified/Not Verified based on Gujarat vs non-Gujarat vendor state against SGST+CGST vs IGST category.",
    dataPoints: "Vendor State, Tax code, Tax Master Category",
  },
  {
    pointNo: "10",
    title: "Vendor-Material Tax Code Consistency",
    summary:
      "Confirms the same vendor + material combination always uses the same tax code (within this extract).",
    logic:
      "Verified if only one distinct tax code is seen for the vendor+material pair; Not Verified if multiple different tax codes are used.",
    dataPoints: "Vendor Code, Material Code, Tax code",
  },
  {
    pointNo: "11",
    title: "MSME Vendor Payment Term",
    summary:
      "Confirms MSME-registered vendors are on the mandated MSME payment term (Z102, ≤45 days), per the MSMED Act payment-timeline requirement.",
    logic:
      "Not Applicable if the vendor has no MSME certificate on file. Verified only if Payment Term = Z102, else Not Verified.",
    dataPoints: "Vendor MSME Status, Payment Term",
  },
  {
    pointNo: "12",
    title: "General Vendor Payment Term (≥21 Days)",
    summary:
      "Confirms non-MSME vendors are on a payment term of at least 21 days.",
    logic:
      "Not Applicable for MSME vendors (covered by rule 11), excluded purchase groups (P02/P43/P46), excluded payment terms (Z105/Z126/Z142), or PO types ZSER/ZCSR. Manual Review if payment days unavailable. Verified if Payment days >= 21.",
    dataPoints:
      "Vendor MSME Status, Purchase Group, Payment Term, PO Type, Payment days",
  },
  {
    pointNo: "13",
    title: "EYW Inco-Term Requires Freight Condition",
    summary:
      "Confirms PO lines using Inco Term EYW carry a freight condition type (ZBF1/ZBF2/ZRA3/ZRB3/ZRE3).",
    logic:
      "Not Applicable if Inco term isn't EYW. Verified if a matching freight condition exists on that PO+line in POAUDITCND, else Not Verified.",
    dataPoints:
      "Inco term, PO number, PO Line item, Condition Type (POAUDITCND)",
  },
  {
    pointNo: "14",
    title: "EXW/FCA Must NOT Carry a Freight Condition",
    summary:
      "Confirms PO lines using Inco Term EXW or FCA do not carry a freight condition (freight is the buyer's responsibility, not billed via the PO).",
    logic:
      "Not Applicable if Inco term isn't EXW/FCA. Not Verified if a freight condition exists on that PO+line, else Verified.",
    dataPoints:
      "Inco term, PO number, PO Line item, Condition Type (POAUDITCND)",
  },
  {
    pointNo: "15",
    title: "Rate Approval by Authorised Approver",
    summary:
      "Confirms a rate has an approval tag on record, signed off by a recognised approver.",
    logic:
      "Not Applicable if no rate-approval tag is found in 'Our Ref.'. Verified if the recognised approver initials (KKB/SRS/PJP/DAULAT/NHV/CVS) also appear, else Not Verified.",
    dataPoints: "Our Ref.",
  },
  {
    pointNo: "16",
    title: "Service PO (ZSER) Item Category",
    summary:
      "Confirms Service-type (ZSER) PO lines use the Service item category with Account Assignment K.",
    logic:
      "Not Applicable if PO Type isn't ZSER. Verified only if Item category disc = 'Service' and Account Assignment = 'K'.",
    dataPoints: "PO Type, Item category disc, Account Assignment",
  },
  {
    pointNo: "17",
    title: "ZLRM Must Not Use Service Item Category",
    summary:
      "Confirms Local Raw Material (ZLRM) PO lines do NOT incorrectly use the Service item category + Account Assignment K combination reserved for service POs.",
    logic:
      "Not Applicable if PO Type isn't ZLRM. Not Verified if Item category disc = 'Service' and Account Assignment = 'K', else Verified.",
    dataPoints: "PO Type, Item category disc, Account Assignment",
  },
  {
    pointNo: "18",
    title: "Multiple POs to Same Vendor, Same Day",
    summary:
      "Flags possible order-splitting: the same vendor, plant, and purchasing group issued more than one PO on the same date.",
    logic:
      "Not Verified if other PO numbers share the same Vendor Code + PO Created date + Plant + Purchase Group; Verified otherwise.",
    dataPoints:
      "Vendor Code, PO Created date, Plant, Purchase Group, PO number",
  },
  {
    pointNo: "19",
    title: "Rate Contract (RC) Overlap Validation",
    summary:
      "Confirms a vendor + material's Rate Contract validity window doesn't overlap another RC for the same vendor + material.",
    logic:
      "Not Applicable if no RC assigned. Not Verified if this RC's [valid-from, valid-to] window overlaps another RC's window for the same vendor+material, else Verified.",
    dataPoints:
      "Vendor Code, RC Material Code, RC number, RC valid from, RC valid to (POAUDITRC)",
  },
];

export const POINT_DEFINITIONS_BY_NO = Object.fromEntries(
  POINT_DEFINITIONS.map((p) => [p.pointNo, p]),
);

export const KPI_DEFINITIONS = {
  totalPOCount:
    "Count of distinct PO numbers in the currently filtered extract.",
  totalPOLineItems:
    "Count of individual PO line items (one PO can have many lines).",
  totalPRCount:
    "Count of distinct Purchase Requisition numbers referenced by the filtered PO lines.",
  holdPOCount:
    "Count of distinct POs currently on SAP status 'Hold' (po_status = H).",
  exceptionValueExposure:
    "Sum of Net Value across every PO line that failed at least one audit point.",
  verifiedCount:
    "Total count of individual point-checks (across all lines) that came back Verified.",
  notVerifiedCount:
    "Total count of individual point-checks (across all lines) that came back Not Verified — i.e. exceptions.",
  notApplicableCount:
    "Total count of individual point-checks that were Not Applicable to that line (e.g. rule 11 for a non-MSME vendor).",
  manualReviewCount:
    "Total count of individual point-checks that need a human to review (data missing/unparseable, or ambiguous classification).",
  highRiskExceptions:
    "Count of Not Verified point-checks whose audit point is currently set to Critical or High criticality (see Risk Categorization Master).",
  overallComplianceScore:
    "Verified ÷ (Verified + Not Verified), across every applicable point-check in the filtered extract.",
};

export const CHART_DEFINITIONS = {
  controlWiseCompliance:
    "For each of the 19 audit points, the % of applicable checks that came back Verified. Bar color reflects that point's current criticality.",
  exceptionBySeverity:
    "All Not Verified point-checks grouped by the criticality currently assigned to their audit point (Risk Categorization Master).",
  poTypeWiseCompliance:
    "Verified vs Not Verified point-checks, grouped by PO Type.",
  monthlyExceptionTrend:
    "Count and value exposure of PO lines with at least one exception, by the PO's creation month.",
  plantWiseExceptions:
    "Top 10 plants by count of PO lines with at least one exception.",
  vendorWiseTopExceptions:
    "Top 10 vendors by count of PO lines with at least one exception.",
  holdPoAgeing:
    "Hold POs bucketed by whether they're still inside or past the 30-day-from-PO-date hold window.",
  poNumberWiseExceptions:
    "Top 15 PO numbers by count of Not Verified point-checks across their line items.",
};
