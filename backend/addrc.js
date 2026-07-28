import fs from "fs";
import db, { prisma } from "./lib/prisma.js";
import dotenv from "dotenv";

dotenv.config();

const fileName = process.argv[2];

if (!fileName) {
  console.error("Please provide a filename: node addrc.js <filename>");
  process.exit(1);
}

/* ---------------- DATE PARSER ----------------
 * engine.py's build_rc_overlap_records() already emits clean ISO
 * 'YYYY-MM-DD' strings (or null), so unlike addpo.js/addpo's SAP-date
 * juggling, this only needs to turn that into a JS Date (or null).
 * -------------------------------------------------------------- */
function parseIsoDate(value, fieldName) {
  if (!value) return null;
  const date = new Date(value);
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid date for ${fieldName}: ${value}`);
  }
  return date;
}

/* ---------------- FIELD WHITELIST ----------------
 * Matches prisma/schema.prisma's RcOverlapResult model exactly. Added
 * "purchaseGroups" - the derived set of purchasing groups whose PO lines
 * reference this RC (computed by engine.py's build_rc_purchase_groups()),
 * used to scope a Buyer's view down to "RCs relevant to my group".
 * ------------------------------------------------------------------------ */
const RC_OVERLAP_FIELDS = [
  "vendorCode",
  "rcMaterialCode",
  "rcNumber",
  "validFrom",
  "validTo",
  "status",
  "overlappingRcs",
  "remark",
  "purchaseGroups",
];

function pickRcOverlapFields(obj) {
  const out = {};
  for (const key of RC_OVERLAP_FIELDS) {
    if (obj[key] !== undefined) out[key] = obj[key];
  }
  return out;
}

/* ---------------- MAIN PROCESS ---------------- */
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
        console.log(`Processing RC record ${i + 1}`);

        const doc = parsedData[i];

        if (!doc.vendorCode || !doc.rcMaterialCode || !doc.rcNumber) {
          throw new Error(
            "vendorCode, rcMaterialCode, and rcNumber are all required",
          );
        }

        doc.validFrom = parseIsoDate(doc.validFrom, "validFrom");
        doc.validTo = parseIsoDate(doc.validTo, "validTo");

        if (!Array.isArray(doc.overlappingRcs)) {
          doc.overlappingRcs = doc.overlappingRcs ? [doc.overlappingRcs] : [];
        }
        if (!Array.isArray(doc.purchaseGroups)) {
          doc.purchaseGroups = doc.purchaseGroups ? [doc.purchaseGroups] : [];
        }

        const rcData = pickRcOverlapFields({
          ...doc,
          vendorCode: String(doc.vendorCode),
          rcMaterialCode: String(doc.rcMaterialCode),
          rcNumber: String(doc.rcNumber),
        });

        /* ---------- CHECK EXISTING RECORD ----------
         * One row per (vendorCode, rcMaterialCode, rcNumber) - matches the
         * @@unique constraint on RcOverlapResult, so re-running the engine
         * on refreshed data updates the same row instead of duplicating it.
         * -------------------------------------------------------------- */
        const existingDoc = await prisma.rcOverlapResult.findUnique({
          where: {
            vendorCode_rcMaterialCode_rcNumber: {
              vendorCode: rcData.vendorCode,
              rcMaterialCode: rcData.rcMaterialCode,
              rcNumber: rcData.rcNumber,
            },
          },
        });

        if (existingDoc) {
          await prisma.rcOverlapResult.update({
            where: { id: existingDoc.id },
            data: rcData,
          });
          updatedCount++;
          console.log(
            `✅ Updated: ${rcData.vendorCode}-${rcData.rcMaterialCode}-${rcData.rcNumber}`,
          );
        } else {
          await prisma.rcOverlapResult.create({ data: rcData });
          insertedCount++;
          console.log(
            `✅ Inserted: ${rcData.vendorCode}-${rcData.rcMaterialCode}-${rcData.rcNumber}`,
          );
        }
      } catch (err) {
        console.error(`Error in record ${i + 1}:`, err.message);
        console.error(JSON.stringify(parsedData[i], null, 2));
      }
    }

    console.log(
      `✅ ${insertedCount} RC overlap records inserted, ${updatedCount} updated`,
    );
    process.exit(0);
  } catch (err) {
    console.error("Fatal error:", err.message);
    process.exit(1);
  }
}

/* ---------------- DB CONNECT ---------------- */
db()
  .then(processRecords)
  .catch((err) => {
    console.error("DB error:", err.message);
    process.exit(1);
  });
