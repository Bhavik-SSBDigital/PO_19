# What to do whenever an audit point's logic changes

There are only **two places** point content can live, and they must always move together:

| What                                                                                                | Lives in                                                            | Who reads it                                            |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------- |
| The actual pass/fail **logic**                                                                      | `engine.py` (`PO_LINE_RULES`, `rule_XX_...` functions)              | The Python engine, when you run an import               |
| The **English description** of that logic (title/summary/logic/dataPoints/severity) shown on screen | `scripts/seed-point-definitions.js` → `AuditPointConfig` table (DB) | Every frontend page, via `utility/point-definitions.js` |

`engine.py` computes results silently — it never talks to the DB or the frontend directly. If you change a rule in `engine.py` and don't also update the matching entry in `seed-point-definitions.js`, the frontend keeps showing the **old** description forever, next to results computed by the **new** logic. That's the exact class of bug this doc exists to prevent (and the one already found in points #6/#7/#8/#9/#15 — now fixed).

## The one workflow, every time

1. **Change the logic** in `engine.py` (the relevant `rule_XX_...` function and/or its constants, e.g. `FREIGHT_CONDITION_TYPES`).
   Add a short CHANGELOG entry at the top of `engine.py` — this file's own changelog is what makes future audits like this one possible.

2. **In the same change**, update the matching object in the `DEFINITIONS` array inside `scripts/seed-point-definitions.js` (`title` / `summary` / `logic` / `dataPoints`). Write it so it describes what the code _actually does now_, not what it used to do. If a rule references a specific set of codes/columns (like `FREIGHT_CONDITION_TYPES` or `RFQ_NO_COLUMN`), spell those out in `dataPoints`/`logic` so the verify script (step 4) can catch future drift automatically.

3. **Run the seed script** to push the new text into the DB:

   ```
   npm run seed-points
   # or: node scripts/seed-point-definitions.js
   ```

   This is safe to re-run — `severity` is only set on first insert (an admin's manual severity choice via Risk Categorization Master is never overwritten), everything else is refreshed from the array every time.

4. **Run the verifier** to catch mechanical drift before anyone sees it:

   ```
   npm run verify-points
   # or: node scripts/verify-point-definitions.js
   ```

   This checks: all 19 points exist in the DB, header/line `scope` matches `utility/point-scope.js`, no empty title/logic, and (specifically, because it already happened once) that every token in `engine.py`'s `FREIGHT_CONDITION_TYPES` is mentioned somewhere in points #6/#7's DB text. Non-zero exit code = something's wrong, fix it before deploying.

5. **Make the change live without a full redeploy**, if the backend is already running:

   ```
   POST /risk-categorization/reload-point-config   (admin only)
   ```

   This drops the in-process cache in `utility/point-definitions.js` / `utility/severity.js` and re-reads `AuditPointConfig` immediately. The seed script writes straight to Postgres and has no way to reach an already-running Node process on its own — without this step (or a restart), a running server keeps serving the old text out of memory even though the DB has the new text.
   **If you run more than one backend instance** (PM2 cluster, multiple containers), call this against every instance, or just restart the fleet — each process has its own independent cache.

6. **Spot-check** the Risk Categorization Master page (`GET /reports/audit-point-config`) and the PO Remarks Report page — both read through the same `point-definitions.js` cache, so if one looks right the other will too.

## If you're only changing severity (criticality), not logic

Use the existing admin UI (Risk Categorization Master) or `POST /risk-categorization/update-severity`. That endpoint already invalidates and reloads both caches for you — no need to touch `seed-point-definitions.js` or re-run anything by hand.

## If you're renumbering points again (don't, unless truly necessary)

That's a different, much riskier operation — it touches `engine.py`'s `PO_LINE_RULES`, `utility/point-scope.js`, `utility/point-number-map.js`, and requires running `scripts/migrate-point-numbers.js` against **already-stored** `AuditResult.results` / `PoHeaderResult.results` / `PoRemark.pointNo` / `PoHeaderRemark.pointNo` rows exactly once. The last renumbering (documented at the top of `engine.py` and `prisma/schema.prisma`) is the reason points 1–19 look the way they do today. Don't do this casually — if it's ever needed again, budget a full pass through all four of those tables plus this same seed/verify/reload workflow afterward.

## Why this is safe against "changing it in 4 places"

There is exactly **one** file with point logic (`engine.py`) and exactly **one** file with point English text (`scripts/seed-point-definitions.js`) and exactly **one** table it writes to (`AuditPointConfig`). Every controller and every frontend page reads that same table through the same two cached helpers (`utility/point-definitions.js`, `utility/severity.js`) — nothing else in the codebase is allowed to hardcode a point title, description, or logic string. (`po-remarks-report-controller.js` was the one place that had drifted from this and read a frozen, empty snapshot instead — that's now fixed to go through the same helper as everything else.) As long as new code keeps importing from `point-definitions.js`/`severity.js` instead of writing its own copy, one edit + reseed + reload is genuinely the only change needed.
