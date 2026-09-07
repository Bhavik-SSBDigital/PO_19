import fs from "fs";
import db, { prisma } from "./lib/prisma.js";
import dotenv from "dotenv";

dotenv.config();

const fileName = process.argv[2];
const pruneDisabled = process.argv.includes("--no-prune");

if (!fileName) {
  console.error(
    "Please provide a filename: node addheader.js <filename> [--no-prune]",
  );
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
 *
 * ------------------------------------------------------------------------
 * PRUNING (added): engine.py can now remove a PO from its output ENTIRELY
 * - not mark it Not Applicable, but drop it - when every one of its line
 * items carries Deletion indicator = 'L' (see engine.py's
 * drop_lines_with_deletion_indicator()). Before this addition, this
 * script only ever INSERTED or UPDATED rows present in the new JSON; a PO
 * that disappeared from a fresh export because it's now fully excluded
 * was simply never touched, so its OLD po_header_results row (inserted by
 * a prior, older run) stayed in the database forever and kept being
 * served by the API.
 *
 * After the normal upsert loop, this script now also deletes any
 * po_header_results row whose po_number is NOT present in the JSON file
 * just imported.
 *
 * IMPORTANT ASSUMPTION: this treats the JSON file as the FULL, current
 * set of header-eligible POs from the latest extract - which is what
 * engine.py's --header-json always produces (it's not incremental/delta
 * output). If you ever need to import a deliberately partial file, run
 * with --no-prune, or every PO missing from that partial file will be
 * deleted from the database.
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

/* ----------------------------------------------------------------------
 * pruneStaleHeaderRecords
 * ========================
 * Deletes every po_header_results row whose po_number is not in
 * currentPoNumbers (the set of PO numbers present in the JSON file just
 * imported). Wrapped in try/catch so a pruning failure (e.g. a foreign
 * key constraint from another table referencing po_header_results) is
 * reported but does NOT undo or fail the upserts that already succeeded
 * above.
 * ------------------------------------------------------------------- */
async function pruneStaleHeaderRecords(currentPoNumbers) {
  const existing = await prisma.poHeaderResult.findMany({
    select: { id: true, po_number: true },
  });

  const staleIds = existing
    .filter((row) => !currentPoNumbers.has(row.po_number))
    .map((row) => row.id);

  if (staleIds.length === 0) {
    console.log("🧹 No stale PO header records to prune.");
    return;
  }

  const { count } = await prisma.poHeaderResult.deleteMany({
    where: { id: { in: staleIds } },
  });

  console.log(
    `🗑️  Pruned ${count} stale PO header record(s) - PO(s) no longer present ` +
      `in the latest extract (fully excluded, e.g. every line item now carries ` +
      `Deletion indicator = 'L').`,
  );
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
    const currentPoNumbers = new Set();

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
        currentPoNumbers.add(data.po_number);

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

    if (pruneDisabled) {
      console.log("⏭️  Skipping prune step (--no-prune passed).");
    } else {
      try {
        await pruneStaleHeaderRecords(currentPoNumbers);
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

db()
  .then(processRecords)
  .catch((err) => {
    console.error("DB error:", err.message);
    process.exit(1);
  });
