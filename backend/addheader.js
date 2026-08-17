import fs from "fs";
import db, { prisma } from "./lib/prisma.js";
import dotenv from "dotenv";

dotenv.config();

const fileName = process.argv[2];

if (!fileName) {
  console.error("Please provide a filename: node addheader.js <filename>");
  process.exit(1);
}

/* ----------------------------------------------------------------------
 * addheader.js
 * ============
 * Loads engine.py's --header-json output into the po_header_results table
 * (one row per PO NUMBER, holding only the header-level audit points:
 * 7, 8, 9, 11, 12, 13, 14, 15, 19).
 *
 * This is the header-level counterpart to addpo.js: addpo.js writes
 * line-item records whose `results` array holds only the 10 line-level
 * points (1-6, 10, 16-18); this script writes the 9 header-level points
 * once per PO, matching the architecture where a header rule is
 * evaluated/stored/displayed once for the whole PO instead of being
 * duplicated on every line item.
 *
 * Does NOT touch remarksLocked/remarksLockedBy/remarksLockedAt on an
 * existing row - the PO-level "checked" status is a user action (see
 * po-header-controller.js's setPoHeaderCheckedStatus), not something a
 * re-import should ever reset. Re-running this script against a fresh
 * extract updates `results` in place without reopening a PO a buyer has
 * already closed.
 * ------------------------------------------------------------------- */

const HEADER_FIELDS = [
  "po_number",
  "vendor_code",
  "purchase_group",
  "po_type",
  "results",
  "auditedOn",
];

function pickHeaderFields(obj) {
  const out = {};
  for (const key of HEADER_FIELDS) {
    if (obj[key] !== undefined) out[key] = obj[key];
  }
  return out;
}

/* Same shape as addpo.js's normalizeResult - kept identical so any shared
 * frontend rendering logic (severity lookup, classifyPoint, etc.) works
 * unchanged against header-level results too. */
function normalizeResult(r) {
  return {
    pointNo: String(r.pointNo),
    remarks: r.remarks || [],
    verified: r.verified === true,
    missing_data: r.missing_data === true || r.data_missing === true,
    not_applicable: r.not_applicable === true,
    manual_verification: r.manual_verification === true,
  };
}

function parseDate(value) {
  if (!value) return new Date();
  const date = new Date(value);
  return isNaN(date.getTime()) ? new Date() : date;
}

async function processRecords() {
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
        const doc = parsedData[i];

        if (!doc.po_number) {
          throw new Error("po_number is required");
        }

        if (Array.isArray(doc.results)) {
          doc.results = doc.results.map(normalizeResult);
        }
        doc.auditedOn = parseDate(doc.auditedOn);
        doc.po_number = String(doc.po_number);
        doc.vendor_code = doc.vendor_code ? String(doc.vendor_code) : "";
        doc.purchase_group = doc.purchase_group
          ? String(doc.purchase_group)
          : "";
        doc.po_type = doc.po_type ? String(doc.po_type) : "";

        const data = pickHeaderFields(doc);

        const existing = await prisma.poHeaderResult.findUnique({
          where: { po_number: data.po_number },
        });

        if (existing) {
          // Only touch results/vendor_code/purchase_group/po_type/auditedOn -
          // never remarksLocked/By/At, which is exclusively user-controlled.
          await prisma.poHeaderResult.update({
            where: { id: existing.id },
            data,
          });
          updatedCount++;
          console.log(`✅ Updated header record: ${data.po_number}`);
        } else {
          await prisma.poHeaderResult.create({ data });
          insertedCount++;
          console.log(`✅ Inserted header record: ${data.po_number}`);
        }
      } catch (err) {
        console.error(`Error in record ${i + 1}:`, err.message);
        console.error(JSON.stringify(parsedData[i], null, 2));
      }
    }

    console.log(
      `✅ ${insertedCount} PO header records inserted, ${updatedCount} updated`,
    );
    process.exit(0);
  } catch (err) {
    console.error("Fatal error:", err.message);
    process.exit(1);
  }
}

db()
  .then(processRecords)
  .catch((err) => {
    console.error("DB error:", err.message);
    process.exit(1);
  });
