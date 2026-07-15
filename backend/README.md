# AIA P2P audit backend — Postgres + Prisma

A worked example of migrating the existing Mongo/Mongoose backend to
Postgres via **Prisma**, using your uploaded project (`models.zip`,
`routes.js`, `api.js`, `db.js`, `createAdmin.js`, `addpo.js`,
`file-controller.js`, `visibility-settings-handler.js`) as the reference.
Per your request, only **one controller** is fully converted
(`controllers/po-controller.js`) as a template — the same pattern
(Prisma model -> controller function -> route) applies to every other
controller in `routes.js`.

## What's here

```
prisma/
  schema.prisma        -- canonical schema for every Mongoose model in models.zip
db/
  schema.sql            -- plain-SQL mirror of schema.prisma, for review only (see note in the file)
lib/
  prisma.js             -- Prisma Client singleton (replaces the old mongoose db.js)
controllers/
  po-controller.js      -- converted example: get_po_audit_results, get_po_audit_result
addpo.js                -- your "add PO" ingestion script, same parsing logic, Prisma persistence
createAdmin.js           -- same bootstrap logic, Prisma persistence
api.js                   -- unchanged Express app, just points at lib/prisma.js
package.json
.env.example
```

Only the tables `po-controller.js`, `addpo.js`, and `createAdmin.js` actually
touch (`Role`, `User`, `AuditResult`, `VerificationWorkflow`,
`VerificationWorkflowStep`) are wired into working code. `schema.prisma`
defines the **full** schema (tokens, logs, points, manual_verifications,
audit_result_analytics, po_process_details) so your DB is complete on day
one — write the equivalent controller for each as you migrate the rest,
using Prisma Client the same way `po-controller.js` does
(`prisma.<model>.findMany/findFirst/create/update`).

## Setup

```bash
npm install
cp .env.example .env        # fill in DATABASE_URL
npx prisma generate         # generates the Prisma Client from schema.prisma
npx prisma db push          # creates the tables in Postgres from schema.prisma
npm run create-admin        # creates the admin role + user, same as before
npm start                   # starts the API on PORT (same as api.js today)
```

To load a batch of PO audit JSON (same input format your existing `addpo.js`
expects):

```bash
npm run add-po -- path/to/pos.json
```

I could not run `prisma generate`/`prisma validate` myself in this
environment — the Prisma CLI needs to download its query-engine binary from
`binaries.prisma.sh`, which isn't reachable from here. I reviewed the schema
by hand instead (field-by-field against every Mongoose model) and syntax-
checked every `.js` file with Node, but please run `npx prisma generate`
yourself as the first real check before relying on this.

## Design decisions / what changed vs. the Mongo schema

- **Mongo `_id` (ObjectId) -> Postgres `String` (UUID)**, via `@default(uuid())`.
- **Embedded sub-documents that are read/written as a blob and never queried
  independently** (`processDocuments`, `results`, `product_details_per_grr`,
  the `conversation` array inside `manual_verifications.results`,
  `documents` on `po_process_details`) are stored as **`Json`** columns.
  This keeps `addpo.js`'s "cast a plain object and save it" logic almost
  unchanged, and Postgres `jsonb` still supports indexing/filtering later if
  you need to query inside `results` without a full relational rebuild.
- **`verificationWorkflow.workflowSteps`** is the one embedded array broken
  out into its own table, because those steps are an append-only audit trail
  with a real foreign key to `users` that your UI likely lists/filters.
- **The `verificationWorkflow` link is one-directional now**: in Mongo,
  `AuditResult.verificationWorkflow` held the ref. In Postgres, the FK lives
  on `verification_workflows.audit_result_id` (unique) instead, and
  `AuditResult` reaches it via a reverse relation/include. `addpo.js` no
  longer needs to "re-attach" the workflow reference on every update (see
  the comment in that file) — it's a structural non-issue in the relational
  design, not something the app has to defend against.
- **Enums** (`type`, `current_status`, `action`, etc.) are plain `String`
  fields with a comment listing the allowed values, not Prisma's native
  `enum` type — this mirrors the Mongoose `enum` validators (app-level
  constraint) while keeping "add a new PO type" a one-line code change
  instead of a migration. Swap to native `enum` blocks in `schema.prisma` if
  you'd rather have Postgres enforce it at the DB level.
- **Array fields** (`allowedAuditors`, `allowedModules`, `documentNames`,
  `condition_type`, etc.) map to native Postgres `String[]` — no join table
  needed, same shape as Mongo's `[String]`.
- **Field naming**: every field name matches the original Mongoose schema
  exactly (including its inconsistencies — e.g. `taxCode` vs. `tax_code` are
  two *different*, real fields in the original model; `GSTInOfVendor`'s odd
  casing is preserved) so that any code you haven't shown me that reads
  `doc.fieldName` continues to work unmodified.

## A bug I almost shipped, in case it's useful

The original schema has both a generic `taxCode` (BPV/PJV) and a
PO-specific `tax_code` field — two separate columns. My first pass
collided them into a single `tax_code` column. Fixed by mapping the generic
one to its own column (`tax_code_bpv`) while keeping the JS-facing field
name `taxCode` unchanged. Also: Prisma throws on any field passed to
`create`/`update` that isn't in the schema (Mongoose silently drops unknown
keys) — `addpo.js` now explicitly whitelists which fields get forwarded to
the DB (see `AUDIT_RESULT_FIELDS` near the top of that file) instead of
blindly spreading the incoming JSON.

## Frontend

No changes needed. I checked `Frontend.zip` (`src/utils/axiosApi.js` /
`src/api/api-client.js`) — the React app only talks to the backend over
`axios` HTTP calls to `/api/...` routes with a bearer token, with zero
direct knowledge of Mongo vs. Postgres. The one thing worth double-checking
per controller you convert: Mongo ids serialize as `_id`, Prisma ids
serialize as `id` — grep the frontend for `result._id` and either update
those call sites or alias `id` as `_id` in the controller response.

A new page/component (`PoAuditResultsPage`) that calls the converted
`po-controller.js` endpoints is included separately in
`frontend_po_audit_page.zip`, built to match your existing MUI +
`utils/axiosApi` conventions (see `src/pages/invoice-po-list` in your
project for the pattern it follows).

## Not converted yet — same pattern applies

Every other controller referenced in `routes.js` (audit-controller,
non-po-controller, bpv-controller, user-controller, role-controller,
dashboard-controller, report-controller, points-controller, etc.) still
needs its own Prisma-based conversion, following the shape of
`po-controller.js`. `file-controller.js` and `visibility-settings-handler.js`
barely touch the DB (one lookup call each) and are the easiest to convert
next.
