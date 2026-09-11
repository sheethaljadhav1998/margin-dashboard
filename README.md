# Margin Dashboard

Local app that turns three messy agency spreadsheets (timesheet, salary overview, project prices) into a project-margin dashboard.

Requires Node.js 22+ (uses the built-in `node:sqlite` module).

## Status

**Phase 2 — ingestion and cost model.** Sample year loads into SQLite, rates follow the brief exactly, and the self-check holds to the dirham. API and UI are next.

## Commands

```bash
cd server
npm install
npm run inspect      # Phase 1: print workbook structure
npm test             # date parser + cost-identity fixtures
npm run self-check   # ingest sample 2025, assert total cost == total salaries
```

From the repo root:

```bash
npm run inspect
npm run self-check
```

Sample workbooks: `data/sample/`. Findings: [`docs/phase-1-findings.md`](docs/phase-1-findings.md).

## What the self-check proves

With monthly overhead set to 0, company-wide loaded cost equals total salaries — AED 2,400,000.00 for 2025. Re-uploading a March-only timesheet replaces March and leaves January untouched.

## Layout

```
client/    frontend (not started)
server/    ingest, SQLite, calc, scripts
  calc/    pure cost-allocation functions (no DB/HTTP)
  ingest/  xlsx parsers + month-scoped upsert
data/sample/
docs/
```
