import fs from "fs";
import db, { prisma } from "./lib/prisma.js";
import dotenv from "dotenv";

dotenv.config();

const fileName = process.argv[2];
const pruneDisabled = process.argv.includes("--no-prune");

if (!fileName) {
  console.error(
    "Please provide a filename: node addrc.js <filename> [--no-prune]",
  );
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

function rcKey(vendorCode, rcMaterialCode, rcNumber) {
  return `${vendorCode}\u0000${rcMaterialCode}\u0000${rcNumber}`;
}

/* ----------------------------------------------------------------------
 * pruneStaleRcOverlapRecords
 * ============================
 * engine.py's build_rc_overlap_records() reflects the FULL current RC
 * master (POAUDITRC) plus whichever PO lines currently reference each RC.
 * If an RC (or a vendor/material/RC combination) no longer appears in a
 * fresh run - e.g. because the PO lines that referenced it were removed
 * by drop_lines_with_deletion_indicator(), or the RC master itself
 * changed - the OLD rc_overlap_results row from a prior run would
 * otherwise stay in the database forever, same problem as addpo.js /
 * addheader.js.
 *
 * Deletes every rc_overlap_results row whose (vendorCode, rcMaterialCode,
 * rcNumber) composite key is not in currentKeys (the set present in the
 * JSON file just imported).
 *
 * IMPORTANT ASSUMPTION: this treats the JSON file as the FULL, current
 * RC Overlap output - which is what engine.py's --rc-json always
 * produces (it's not incremental/delta output). If you ever need to
 * import a deliberately partial file, run with --no-prune.
 * ------------------------------------------------------------------- */
async function pruneStaleRcOverlapRecords(currentKeys) {
  const existing = await prisma.rcOverlapResult.findMany({
    select: {
      id: true,
      vendorCode: true,
      rcMaterialCode: true,
      rcNumber: true,
    },
  });

  const staleIds = existing
    .filter(
      (row) =>
        !currentKeys.has(
          rcKey(row.vendorCode, row.rcMaterialCode, row.rcNumber),
        ),
    )
    .map((row) => row.id);

  if (staleIds.length === 0) {
    console.log("🧹 No stale RC overlap records to prune.");
    return;
  }

  const { count } = await prisma.rcOverlapResult.deleteMany({
    where: { id: { in: staleIds } },
  });

  console.log(
    `🗑️  Pruned ${count} stale RC overlap record(s) - vendor/material/RC ` +
      `combination(s) no longer present in the latest extract.`,
  );
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
    const currentKeys = new Set();

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

        currentKeys.add(
          rcKey(rcData.vendorCode, rcData.rcMaterialCode, rcData.rcNumber),
        );

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

    if (pruneDisabled) {
      console.log("⏭️  Skipping prune step (--no-prune passed).");
    } else {
      try {
        await pruneStaleRcOverlapRecords(currentKeys);
      } catch (err) {
        console.error(
          "⚠️  Prune step failed (upserts above already succeeded):",
          err.message,
        );
      }
    }

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
