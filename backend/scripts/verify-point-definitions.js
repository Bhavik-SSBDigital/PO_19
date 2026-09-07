// scripts/verify-point-definitions.js
//
// Run this after ANY of the following:
//   - editing engine.py's rule logic
//   - editing the DEFINITIONS array in scripts/seed-point-definitions.js
//   - running scripts/seed-point-definitions.js
//
//     node scripts/verify-point-definitions.js
//
// It is a safety net, not a substitute for judgement: it catches the
// mechanical ways point content drifts (a point missing from the DB, a
// scope that disagrees with point-scope.js, a freight-condition-type list
// that fell out of sync between engine.py and the DB text) so a change in
// ONE place gets caught automatically instead of surfacing later as a
// silent, hard-to-notice discrepancy on the frontend.
//
// Exit code is non-zero if anything is wrong - wire this into your
// deploy/CI step right after the seed script so a bad content change never
// reaches production unnoticed.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

import { prisma } from "../lib/prisma.js";
import {
  HEADER_LEVEL_RULE_NOS,
  LINE_LEVEL_RULE_NOS,
} from "../utility/point-scope.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENGINE_PATH = path.join(__dirname, "..", "engine.py");

const ALL_POINT_NOS = [...HEADER_LEVEL_RULE_NOS, ...LINE_LEVEL_RULE_NOS].sort(
  (a, b) => a - b,
);

let failures = 0;
let warnings = 0;

function fail(msg) {
  failures++;
  console.error(`❌ ${msg}`);
}

function warn(msg) {
  warnings++;
  console.warn(`⚠️  ${msg}`);
}

function ok(msg) {
  console.log(`✅ ${msg}`);
}

function readEngineSource() {
  if (!fs.existsSync(ENGINE_PATH)) {
    fail(
      `Could not find engine.py at ${ENGINE_PATH} - skipping engine-vs-DB checks.`,
    );
    return null;
  }
  return fs.readFileSync(ENGINE_PATH, "utf8");
}

// Pulls the (pointNo, title) pairs straight out of engine.py's PO_LINE_RULES
// table via regex. This is intentionally dumb text-scraping, not a Python
// parser - if engine.py's PO_LINE_RULES block is reformatted beyond simple
// tuple-per-line, update the regex below rather than the assumptions.
function extractEnginePointNos(src) {
  const block = src.match(/PO_LINE_RULES\s*=\s*\[([\s\S]*?)\n\]/);
  if (!block) {
    fail(
      "Could not find PO_LINE_RULES table in engine.py - regex needs updating.",
    );
    return new Set();
  }
  const nos = new Set();
  const tupleRe = /\(\s*(\d+)\s*,\s*"([^"]*)"/g;
  let m;
  while ((m = tupleRe.exec(block[1]))) {
    nos.add(Number(m[1]));
  }
  return nos;
}

// Extracts the FREIGHT_CONDITION_TYPES = {"A", "B", ...} set from engine.py
// so points #6/#7's DB text can be checked for staleness against it - this
// is exactly the class of bug that motivated this script (ZFB5 was added
// to the engine set but the DB text kept the old 5-item list).
function extractFreightConditionTypes(src) {
  const m = src.match(/FREIGHT_CONDITION_TYPES\s*=\s*\{([^}]*)\}/);
  if (!m) {
    warn(
      "Could not find FREIGHT_CONDITION_TYPES in engine.py - skipping freight-token check.",
    );
    return [];
  }
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
}

async function main() {
  const src = readEngineSource();

  const engineNos = src ? extractEnginePointNos(src) : new Set();
  if (src) {
    const missingFromEngine = ALL_POINT_NOS.filter((n) => !engineNos.has(n));
    const extraInEngine = [...engineNos].filter(
      (n) => !ALL_POINT_NOS.includes(n),
    );
    if (missingFromEngine.length) {
      fail(
        `point-scope.js expects points [${missingFromEngine.join(", ")}] but engine.py's PO_LINE_RULES doesn't emit them.`,
      );
    }
    if (extraInEngine.length) {
      fail(
        `engine.py's PO_LINE_RULES emits pointNo(s) [${extraInEngine.join(", ")}] that aren't in point-scope.js's 1-19 ranges.`,
      );
    }
    if (!missingFromEngine.length && !extraInEngine.length) {
      ok(`engine.py emits exactly the 19 expected point numbers.`);
    }
  }

  const rows = await prisma.auditPointConfig.findMany();
  const byNo = new Map(rows.map((r) => [r.pointNo, r]));

  const missingFromDb = ALL_POINT_NOS.filter((n) => !byNo.has(n));
  if (missingFromDb.length) {
    fail(
      `AuditPointConfig is missing point(s) [${missingFromDb.join(", ")}] - run scripts/seed-point-definitions.js.`,
    );
  } else {
    ok(`AuditPointConfig has all 19 expected points.`);
  }

  for (const n of ALL_POINT_NOS) {
    const row = byNo.get(n);
    if (!row) continue;

    const expectedScope = HEADER_LEVEL_RULE_NOS.includes(n) ? "header" : "line";
    if (row.scope !== expectedScope) {
      fail(
        `Point #${n}: DB scope is "${row.scope}" but point-scope.js says it should be "${expectedScope}".`,
      );
    }
    if (!row.title?.trim()) fail(`Point #${n}: title is empty.`);
    if (!row.logic?.trim()) fail(`Point #${n}: logic is empty.`);
    if (!row.summary?.trim()) warn(`Point #${n}: summary is empty.`);
  }

  if (src) {
    const freightTypes = extractFreightConditionTypes(src);
    if (freightTypes.length) {
      const p6 = byNo.get(6);
      const p7 = byNo.get(7);
      for (const [label, row] of [
        ["#6", p6],
        ["#7", p7],
      ]) {
        if (!row) continue;
        const text = `${row.summary} ${row.logic} ${row.dataPoints}`;
        const missingTokens = freightTypes.filter((t) => !text.includes(t));
        if (missingTokens.length) {
          fail(
            `Point ${label}: engine.py's FREIGHT_CONDITION_TYPES includes [${missingTokens.join(", ")}] ` +
              `that aren't mentioned anywhere in the DB text - update scripts/seed-point-definitions.js and re-seed.`,
          );
        }
      }
      if (p6 && p7)
        ok(
          `Freight condition types mentioned in engine.py are all reflected in points #6/#7 text.`,
        );
    }
  }

  console.log("");
  if (failures) {
    console.error(
      `${failures} problem(s) found, ${warnings} warning(s). Fix before trusting the frontend's point text.`,
    );
    process.exitCode = 1;
  } else {
    console.log(`All checks passed (${warnings} warning(s)).`);
  }
}

main()
  .catch((e) => {
    console.error("verify-point-definitions.js crashed:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
