# Margin Dashboard

Local app that turns three messy agency spreadsheets (timesheet, salary overview, project prices) into a project-margin dashboard.

Requires Node.js 22+ (uses the built-in `node:sqlite` module).

## Commands

```bash
cd server
npm install
npm test             # date parser + cost-identity fixtures
npm run self-check   # ingest sample 2025, assert total cost == total salaries
npm start            # API on http://localhost:3001 (seeds data/sample if the DB is empty)
```

From the repo root: `npm run self-check` and `npm start`.

## What the self-check proves

With monthly overhead set to 0, company-wide loaded cost equals total salaries — **AED 2,400,000.00** for 2025. Re-uploading a March-only timesheet replaces March and leaves January untouched.

## Layout

```
client/          frontend (not started)
server/calc/     pure cost-allocation functions (no DB/HTTP)
server/ingest/   xlsx parsers + month-scoped upsert
server/src/      SQLite + Express API
data/sample/     the three workbooks
docs/            Phase 1 notes
```
