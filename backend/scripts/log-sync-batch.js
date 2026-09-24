#!/usr/bin/env node
/**
 * scripts/log-sync-batch.js
 * ==========================
 * Processing History (item 1) — writes one SyncBatchLog row for a batch
 * that sync_and_run.py just finished importing (addpo.js -> addheader.js
 * -> addrc.js all succeeded). This is the ground-truth source for the
 * "Processing History" list pages: one row per batch, with counts of how
 * many records of each entity type that run touched, written even when a
 * count is zero.
 *
 * Called from sync/sync_and_run.py's run_batch(), right after addrc.js,
 * as just another step in the same `_run_or_raise` chain:
 *
 *   node scripts/log-sync-batch.js <batch_id> \
 *     --po-json <addpo_json path> \
 *     --header-json <header_json path> \
 *     --rc-json <rc_json path> \
 *     [--rc-cached]
 *
 * Counts are read directly from the same JSON files addpo.js/addheader.js/
 * addrc.js were just given — the array length in each — rather than
 * re-querying the DB, so this reflects exactly what that run's engine.py
 * output contained, independent of anything the import step itself may
 * have pruned or skipped for individual rows.
 *
 * Upserts on batch_id, so re-running a batch (e.g. after a prior partial
 * failure) updates the same row instead of duplicating it.
 */
import fs from "fs";
import db, { prisma } from "../lib/prisma.js";
import dotenv from "dotenv";

dotenv.config();

const args = process.argv.slice(2);
const batchId = args[0];

if (!batchId || batchId.startsWith("--")) {
  console.error(
    "Usage: node scripts/log-sync-batch.js <batch_id> --po-json <path> --header-json <path> --rc-json <path> [--rc-cached]",
  );
  process.exit(1);
}

function flagValue(name) {
  const i = args.indexOf(name);
  return i !== -1 ? args[i + 1] : null;
}

const poJsonPath = flagValue("--po-json");
const headerJsonPath = flagValue("--header-json");
const rcJsonPath = flagValue("--rc-json");
const rcCached = args.includes("--rc-cached");

function countRows(jsonPath) {
  if (!jsonPath) return 0;
  try {
    if (!fs.existsSync(jsonPath)) return 0;
    const parsed = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch (err) {
    console.error(
      `  Could not read/parse ${jsonPath} for row count:`,
      err.message,
    );
    return 0;
  }
}

async function main() {
  const lineItemCount = countRows(poJsonPath);
  const headerCount = countRows(headerJsonPath);
  const rcCount = countRows(rcJsonPath);

  await prisma.syncBatchLog.upsert({
    where: { batchId },
    update: {
      lineItemCount,
      headerCount,
      rcCount,
      rcCached,
      processedAt: new Date(),
    },
    create: {
      batchId,
      lineItemCount,
      headerCount,
      rcCount,
      rcCached,
    },
  });

  console.log(
    `✅ Logged batch ${batchId}: ${lineItemCount} line item(s), ${headerCount} header(s), ${rcCount} RC record(s)${rcCached ? " (RC cached)" : ""}.`,
  );
  process.exit(0);
}

db()
  .then(main)
  .catch((err) => {
    console.error("DB error:", err.message);
    process.exit(1);
  });
