# Margin Dashboard

Local app that turns three messy agency spreadsheets (timesheet, salary overview, project prices) into a project-margin dashboard.

## Status

**Phase 1 — data inspection.** Schema proposed from the real sample files. No ingestion, calculations, or UI yet.

## Run the inspection script

Requires Node.js 18+.

```bash
npm run install:server
npm run inspect
```

Or from `server/`:

```bash
npm install
npm run inspect
```

Sample workbooks live in `data/sample/`. Inspection findings and the proposed SQLite schema are in [`docs/phase-1-findings.md`](docs/phase-1-findings.md). The last full script printout is in [`docs/phase-1-inspect-output.txt`](docs/phase-1-inspect-output.txt).

## Layout

```
client/    frontend (not started)
server/    Node scripts and, later, the API
data/      sample workbooks
docs/      notes and schema
```
