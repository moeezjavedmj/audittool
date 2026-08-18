# Access Ledger — HR/IT Reconciliation Tool

Next.js + Tailwind frontend with **two interchangeable backend engines**
for the reconciliation logic:

- **`api/reconcile.py`** — a real Python function (stdlib + `openpyxl`),
  deployed natively via **Vercel's Python runtime**. Genuine Python code
  runs in production when this is deployed on Vercel.
- **`app/api/process/route.ts`** — the identical logic ported to
  TypeScript (`lib/reconcile.ts`, using `exceljs`), running as a normal
  Next.js API route. Works everywhere Node runs — Netlify, Vercel,
  localhost, a plain server.

The frontend tries the Python endpoint first and automatically falls back
to the Node engine if that route doesn't exist on the current deployment
(e.g. on Netlify, whose Functions runtime only supports JS/TS, Go, and
Rust — it can't execute a `.py` file as a request handler at all). Either
way you get the same, verified-identical result — the app just uses real
Python when the platform can run it, and the Node port when it can't.

A small badge on the results panel ("Python engine" / "Node engine")
shows which one actually served that request.

## What it does

Two modes, picked with a button in the UI:

- **Active User Check** — upload HR's active-users file + a department
  roster. Flags department accounts missing from HR's active list. If the
  HR file has a status column, it's auto-detected and used to filter to
  active rows first (recognizes `Active`, `A`, `Working`, `Y`, `1`, etc.).
- **Resignation Check** — upload HR's resigned-employees file + a
  department roster. Flags employees who resigned but are still listed in
  the department.

Both modes auto-detect the employee ID column (`Employee ID`, `Emp No`,
`Staff ID`, `User ID`, …). File content is sniffed by its actual bytes,
not its extension, so a `.xlsx` renamed to `.csv` (or vice versa) is
still read correctly or fails with a clear message.

## Setup

```bash
npm install
npm run dev
```

Open http://localhost:3000. On localhost the Python route needs a real
Python 3 process to serve it (Vercel's `vercel dev` handles this; plain
`next dev` does not run `api/*.py`) — if it's not being served locally,
the app just falls back to the Node engine automatically, so the app
still works either way.

Python dependency (only needed if you're running/deploying with the
Python route active):

```bash
pip install -r requirements.txt
```

## Deploying

- **Vercel**: zero config. Push the repo — Vercel detects both the
  Next.js app and `api/reconcile.py` (via `requirements.txt` at the
  project root) and deploys them together. Real Python runs in
  production.
- **Netlify**: also zero config. Netlify builds the Next.js app normally;
  `api/reconcile.py` is simply not picked up as a function (Netlify
  doesn't run Python as a function runtime), so every request
  automatically uses the Node engine instead. No errors, no dead ends —
  just a different backend serving the same logic.

## Project structure

```
api/
  reconcile.py            Real Python backend (Vercel Python Function)
app/
  page.tsx                 UI: mode toggle, uploads, results, engine badge
  api/process/route.ts      Node backend (works on any Node host)
lib/
  reconcile.ts              Node port of the reconciliation logic
requirements.txt            Python deps for api/reconcile.py (Vercel only)
```

## Notes

- Nothing is written to disk on either engine — files are held in memory
  for the duration of the request and the report comes back as base64 in
  the same response (important for serverless, where a second request can
  land on a different instance).
- Accepts `.xlsx`, `.xlsm`, and `.csv`. Legacy `.xls` isn't supported —
  re-save as `.xlsx` first if needed.
