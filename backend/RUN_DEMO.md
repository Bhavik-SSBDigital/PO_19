# Running the demo

This is the exact command sequence to get the backend + one frontend page
running end-to-end. Run everything from inside the unzipped
`postgres_migration` folder unless noted.

## 0. What was actually wrong with your last run

`api.js` imports `./routes.js`, and your real `routes.js` wires up ~15
controllers I never converted. I'm now including a **trimmed-down**
`routes.js` + `controller/` folder that only wires up what's actually been
converted to Prisma: PO audit results (`getPOAuditResults`,
`getPOAuditResult`) and minimal auth (`signup`, `signin`, `logout`) so the
frontend's login screen works. Hitting any other endpoint from your real
frontend (dashboard analytics, users, issue tracker, etc.) will 404 against
this backend — that's expected at this stage, not a bug.

## 1. Prerequisites

- Node.js 18+ (you have 20.17.0 — fine)
- A Postgres database reachable from your machine. Easiest path if you don't
  have one already, using Docker:

  ```bash
  docker run --name aia-p2p-postgres \
    -e POSTGRES_USER=aia -e POSTGRES_PASSWORD=aia -e POSTGRES_DB=AIA_P2P_AUDIT \
    -p 5432:5432 -d postgres:16
  ```

  (No Docker? Postgres.app on Mac, or any managed Postgres — just get a
  connection string.)

## 2. Backend setup

```bash
cd backend               # or wherever you unzipped postgres_migration
npm install
cp .env.example .env
```

Edit `.env` — if you used the Docker command above:

```
DATABASE_URL=postgresql://aia:aia@localhost:5432/AIA_P2P_AUDIT
PORT=8000
```

```bash
npx prisma generate       # generates Prisma Client from prisma/schema.prisma
npx prisma db push        # creates all tables in Postgres
node createAdmin.js       # creates role "admin" + user admin/admin123
node seed.js              # inserts one demo PO audit result you can see in the UI
npm start
```

You should see:
```
Connected to PostgreSQL (Prisma)
Listening on 8000
```

## 3. Smoke-test the API directly (before touching the frontend)

```bash
# log in
curl -s -X POST http://localhost:8000/api/signin \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' | python3 -m json.tool

# list PO audit results (paste the accessToken from the response above)
curl -s -X POST http://localhost:8000/api/getPOAuditResults \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <accessToken>" \
  -d '{"page":1,"pageSize":25}' | python3 -m json.tool
```

You should get back the one PO (`4500123456`) that `seed.js` inserted. If
this works, the backend half of the demo is done — the rest is just the
frontend calling the same two endpoints.

## 4. Frontend setup

```bash
cd Frontend                # your existing React project (Frontend.zip)
npm install
```

Create/edit `.env` in the Frontend folder:
```
VITE_APP_BACKEND_URL=http://localhost:8000/api
```

Drop the new page in:
```bash
cp -r ../frontend_po_audit_page/src/pages/po-audit-results src/pages/
```

Wire it into the router — add these two lines to
`src/routes/MainRoutes.jsx` (it already lazy-loads pages the same way):

```jsx
const PoAuditResults = Loadable(lazy(() => import("pages/po-audit-results")));
// ...inside MainRoutes.children:
{ path: "po-audit-results", element: <PoAuditResults /> },
```

Then:
```bash
npm run dev
```

Open the printed local URL, log in with `admin` / `admin123`, then navigate
to `/po-audit-results` (add a sidebar link if you want it in the menu —
that's in `src/layout`, I haven't touched that file).

## If something breaks

- `Cannot find module '.../routes.js'` — you're running an older unzip
  without `routes.js`/`controller/`/`utility` in it; re-download this
  package.
- `@prisma/client did not initialize yet` — you skipped `npx prisma
  generate`.
- `P1001: Can't reach database server` — Postgres isn't running or
  `DATABASE_URL` is wrong; re-check step 1/2.
- Frontend login succeeds but the PO list page is blank — check the browser
  console/network tab; most likely `VITE_APP_BACKEND_URL` doesn't match
  where the backend is actually listening.
