# Margin Dashboard

A local app that turns three messy agency spreadsheets — timesheet, salary overview, and project prices — into a Monday-morning view of **whether a project actually made money**.

## Tech Stack
- Backend: Node.js + Express
- Database: SQLite (better-sqlite3)
- Excel parsing: xlsx (SheetJS)
- Frontend: React + Vite, Tailwind CSS

```bash
cd margin-dashboard
npm install
npm run install:all
npm run build
npm start
```
Open [http://localhost:3001](http://localhost:3001).

On first launch the API creates `data/margin.db` and loads `data/sample/` (2025 timesheet, salaries, project prices). The dashboard is populated immediately — you should see **AED 2,400,000** cost equal to total salaries, and 11 projects.

To develop the UI with hot reload (API on 3001, Vite on 5173):

```bash
npm run install:all
npm run dev
```

If port 3001 is already taken, stop the other process or set `PORT=3002`.

### Useful commands

| Command | What it does |
| --- | --- |
| `npm run self-check` | Ingest the sample year in memory and assert cost = salaries when overhead is 0 |
| `npm test` | Date-parser and cost-identity fixtures |
| `npm run inspect` | Print the raw spreadsheet structure |

## What you are looking at

- **Dashboard** — hours, billable hours, loaded cost, revenue, margin; click a project
- **Project** — price, hours by department, cost, profit, per-employee profitability
- **Departments** — click Design (etc.) for every person in it
- **Productivity** — billable ÷ total hours per employee
- **Categories** — where the time went
- **Settings** — which categories are billable, and a monthly overhead figure
- Header **Upload** — drop a corrected month; other months are left alone

Year and month filters sit in the header and stick to the URL.

## Assumptions

1. **Billable categories** default to `Projects`, `Enhancements`, `Hosting`. `Tentwenty` and every `FC - *` bucket are internal and feed the indirect pool.
2. **Direct rate** is that person's month salary ÷ hours they logged that month. People with a salary and **zero** hours are support staff: their whole salary goes into the indirect pool. IDL staff who *do* log hours (Hana, Omar) get a direct rate like everyone else.
3. **Indirect rate** is the month's pool ÷ billable hours of people who have a salary. Missing-salary hours are shown but do not dilute the rate.
4. **Period revenue** is `project price × (hours in the filter ÷ all hours we have on that project)`. Price is not dumped entirely into the sales month.
5. **Re-upload** of a timesheet or salary file replaces only the year-month pairs present in that file. Project prices upsert by ref code and never delete other projects.
6. **`Employee No.` is text** (`00101` stays `00101`). Join key is employee number + year + month, not name.
7. **`-` / blank salary cells** mean “not paid that month”, not zero. Zero would inflate the indirect pool.
8. **Money is AED.** The self-check rounds to the dirham.

## Layout

```
client/          Vite + React + Tailwind UI
server/calc/     Pure cost functions
server/ingest/   Spreadsheet parsers + month-scoped upsert
server/src/      SQLite + Express
data/sample/     The three workbooks
docs/            Phase 1 findings and NOTES.md
```
