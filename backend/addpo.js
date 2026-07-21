import fs from "fs";
import db, { prisma } from "./lib/prisma.js";
import dotenv from "dotenv";

dotenv.config();

const fileName = process.argv[2];

if (!fileName) {
  console.error("Please provide a filename: node addpo.js <filename>");
  process.exit(1);
}

/* ---------------- DATE PARSER ---------------- */
function parseDeliveryDate(dateString, fieldName) {
  if (!dateString) return null;

  // Already a Date instance (e.g. if a caller passes one in directly)
  if (dateString instanceof Date) {
    if (isNaN(dateString.getTime())) {
      throw new Error(`Invalid date for ${fieldName}: ${dateString}`);
    }
    return dateString;
  }

  const raw = String(dateString).trim();

  // Blank / SAP's "no date" sentinel
  if (!raw || raw === "00000000") return null;

  // Clean ISO date (this is what audit_engine.py's --addpo-json emits)
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const date = new Date(raw);
    if (isNaN(date.getTime())) {
      throw new Error(`Invalid date for ${fieldName}: ${dateString}`);
    }
    return date;
  }

  // Raw SAP export format: YYYYMMDD with no separators
  if (/^\d{8}$/.test(raw)) {
    const iso = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
    const date = new Date(iso);
    if (isNaN(date.getTime())) {
      throw new Error(`Invalid date for ${fieldName}: ${dateString}`);
    }
    return date;
  }

  // SAP/European "DD.MM.YYYY" or "DD-MM-YYYY"
  const euMatch = raw.match(/^(\d{1,2})[.\-](\d{1,2})[.\-](\d{4})$/);
  if (euMatch) {
    const [, day, month, year] = euMatch;
    const iso = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    const date = new Date(iso);
    if (isNaN(date.getTime())) {
      throw new Error(`Invalid date for ${fieldName}: ${dateString}`);
    }
    return date;
  }

  // Fallback: anything else JS's own Date parser can make sense of
  // (e.g. a full ISO timestamp with time/timezone)
  const date = new Date(raw);
  if (isNaN(date.getTime())) {
    throw new Error(`Unparseable date for ${fieldName}: ${dateString}`);
  }

  return date;
}

/* ---------------- NUMBER PARSER ---------------- (unchanged) */
function parseNumberString(value) {
  if (value === null || value === undefined) return null;

  if (typeof value === "string") {
    const cleaned = value.replace(/,/g, "");
    const num = Number(cleaned);
    if (isNaN(num)) throw new Error(`Invalid number: ${value}`);
    return num;
  }

  return Number(value);
}

/* ---------------- NORMALIZE RESULTS ---------------- (unchanged - still stored as JSONB) */
function normalizeResult(r) {
  return {
    pointNo: String(r.pointNo),
    remarks: r.remarks || [],
    verified: r.verified === true,

    // ✅ handle both data_missing (JSON) and missing_data (DB) formats
    missing_data: r.missing_data === true || r.data_missing === true,

    not_applicable: r.not_applicable === true,
    manual_verification: r.manual_verification === true,
    advance: r.advance === true,
  };
}

/* ---------------- FIELD WHITELIST ----------------
 * IMPORTANT DIFFERENCE FROM THE MONGO VERSION: Mongoose silently drops any
 * incoming JSON key that isn't part of the schema. Prisma does NOT - passing
 * an unrecognised key to prisma.auditResult.create()/update() throws. So
 * unlike the original addpo.js, we explicitly whitelist which fields get
 * forwarded to the DB, matching prisma/schema.prisma's AuditResult model.
 *
 * Added: "po_line_item" - the raw PO line-item number (e.g. "10"), now
 * stored as its own column instead of only existing inside the composite
 * "po_material_number" string. This is what lets the frontend show a real
 * "PO Number / Line Item" column instead of one opaque PO number that hides
 * multiple line entries.
 * ------------------------------------------------------------------------ */
const AUDIT_RESULT_FIELDS = [
  "documentDate",
  "type",
  "reference",
  "objectKey",
  "documentNumber",
  "processDocuments",
  "vendorTitle",
  "documentName",
  "documentNames",
  "vendor",
  "advance",
  "amount",
  "amount_currency",
  "taxCode",
  "GSTInOfVendor",
  "nameOfVendor",
  "fiscalYear",
  "grr_nos_against_invoice",
  "product_details_per_grr",
  "procurement_data",
  "imported",
  "results",
  "auditedOn",
  "po_number",
  "po_line_item",
  "po_type",
  "po_status",
  "hold_due_date",
  "purchase_req",
  "pr_create_date",
  "po_created_date",
  "po_delivery_date",
  "vendor_code",
  "purchase_group",
  "vendor_msme_status",
  "name",
  "gstin",
  "tax_code",
  "tax_code_description",
  "payment_term",
  "payt_terms_description",
  "special_payment_terms",
  "train_station",
  "pr_quantity",
  "po_qty",
  "under_delivery_tolerance_other_than_ea",
  "unit_of_measure",
  "material_code",
  "material_disc",
  "plant",
  "net_value",
  "hsn_code",
  "inco_term",
  "doc_cond_no",
  "condition_type",
  "condition_value",
  "po_material_number",
  "manual",
  "invoiceType",
  "bpvPo",
  "dumpFiles",
  "pjvInvoiceRefDoc",
  "pjvInvoiceRefDocs",
  "withHoldingTaxRate",
  "specialGlIndicator",
];

function pickAuditResultFields(obj) {
  const out = {};
  for (const key of AUDIT_RESULT_FIELDS) {
    if (obj[key] !== undefined) out[key] = obj[key];
  }
  return out;
}

/* ---------------- MAIN PROCESS ---------------- */
async function processDocuments() {
  try {
    const jsonData = fs.readFileSync(fileName, "utf8");
    const parsedData = JSON.parse(jsonData);

    if (!Array.isArray(parsedData)) {
      throw new Error("Input JSON must be an array");
    }

    let insertedCount = 0;
    let updatedCount = 0;

    for (let i = 0; i < parsedData.length; i++) {
      try {
        console.log(`Processing document ${i + 1}`);

        const doc = parsedData[i];

        /* ---------- DATE FIELDS ---------- */
        const dateFields = [
          "pr_create_date",
          "po_created_date",
          "po_delivery_date",
          "hold_due_date",
          "auditedOn",
          "documentDate",
        ];

        for (const field of dateFields) {
          doc[field] = doc[field] ? parseDeliveryDate(doc[field], field) : null;
        }

        /* ---------- NUMERIC FIELDS ---------- */
        const numericFields = ["po_qty", "pr_quantity"];

        for (const field of numericFields) {
          if (doc[field] !== undefined && doc[field] !== null) {
            doc[field] = parseNumberString(doc[field]);
          }
        }

        /* ---------- CONDITION ARRAYS ---------- */
        if (Array.isArray(doc.condition_type)) {
          doc.condition_type = doc.condition_type.filter(Boolean);
        }

        if (Array.isArray(doc.condition_value)) {
          doc.condition_value = doc.condition_value.filter(Boolean);
        }

        /* ---------- NORMALIZE RESULTS ---------- */
        if (Array.isArray(doc.results)) {
          doc.results = doc.results.map(normalizeResult);
        }

        /* ---------- ENSURE po_line_item / po_material_number ----------
         * If an older JSON file (pre-fix) is fed in without po_line_item,
         * derive it from po_material_number ("PO-LINE") as a fallback so
         * this importer never regresses on older exports.
         * -------------------------------------------------------------- */
        if (!doc.po_line_item && doc.po_material_number) {
          const parts = String(doc.po_material_number).split("-");
          if (parts.length > 1) doc.po_line_item = parts[parts.length - 1];
        }

        /* ---------- MAP FIELDS ----------
         * ✅ Cast all string schema fields explicitly, same as the Mongo
         *    version, then whitelist to the columns Prisma actually knows about.
         * -------------------------------------------------------- */
        const auditData = pickAuditResultFields({
          ...doc,
          documentNumber: String(doc.po_number || doc.documentNumber || ""),
          vendor: String(doc.vendor_code || doc.vendor || ""),
          nameOfVendor: doc.vendor_name || doc.nameOfVendor || "",
          GSTInOfVendor: doc.vendor_gstin || doc.GSTInOfVendor || "",
          po_number: String(doc.po_number || ""),
          po_line_item: doc.po_line_item ? String(doc.po_line_item) : "",
          vendor_code: String(doc.vendor_code || ""),
          tax_code: String(doc.tax_code || ""),
          hsn_code: String(doc.hsn_code || ""),
          doc_cond_no: String(doc.doc_cond_no || ""),
          plant: String(doc.plant || ""),
        });

        /* ---------- CHECK EXISTING DOC ---------- */
        const existingQuery = { po_material_number: doc.po_material_number };
        if (doc.fiscalYear) existingQuery.fiscalYear = doc.fiscalYear;

        const existingDoc = await prisma.auditResult.findFirst({
          where: existingQuery,
        });

        // NOTE: the original Mongo version re-fetched the VerificationWorkflow
        // here and re-assigned it onto auditData before updating, to guard
        // against a bare `$set` wiping the workflow ref. That's unnecessary
        // here: verification_workflows.audit_result_id is the single source
        // of truth for that link and audit_results never stores it, so an
        // update to audit_results can never touch it.
        if (existingDoc) {
          await prisma.auditResult.update({
            where: { id: existingDoc.id },
            data: auditData,
          });

          updatedCount++;
          console.log(`✅ Updated: ${doc.po_material_number}`);
        } else {
          await prisma.auditResult.create({ data: auditData });
          insertedCount++;
          console.log(`✅ Inserted: ${doc.po_material_number}`);
        }
      } catch (err) {
        console.error(`Error in doc ${i + 1}:`, err.message);
        console.error(JSON.stringify(parsedData[i], null, 2));
      }
    }

    console.log(
      `✅ ${insertedCount} documents inserted, ${updatedCount} updated`,
    );
    process.exit(0);
  } catch (err) {
    console.error("Fatal error:", err.message);
    process.exit(1);
  }
}

/* ---------------- DB CONNECT ---------------- */
db()
  .then(processDocuments)
  .catch((err) => {
    console.error("DB error:", err.message);
    process.exit(1);
  });
