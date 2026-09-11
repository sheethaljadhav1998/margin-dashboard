# Notes for the follow-up call

Half a page: what I'd build next, what I cut, and what I'm not happy with.

## What I'd do next

- **Employee × category matrix** — the pivot finance currently builds by hand. The data is already in `timesheet_entries`; it is a grouped query and a dense table.
- **Audit view of monthly rates** — show each person's salary, hours, direct rate, the indirect pool composition (support salaries / non-billable value / overhead), and the indirect rate. Useful when someone challenges a project cost.
- **Multi-year compare** — the schema is already `year` + `month`. The UI currently defaults to 2025; a year-vs-year strip on the dashboard would be small.
- **A fixture that *has* a missing salary and a missing price** — the real sample is a perfect join. The UI for those gaps is built but you cannot see it without uploading a broken file.
- **Playwright pass** over the four must-have pages so a clean checkout cannot silently ship a blank dashboard.

## What I cut, and why

The brief asked for sixty percent done well. Stretch goals stayed out of the main path:

| Cut | Why |
| --- | --- |
| Employee × category matrix | Stretch; the category page already answers “where does the time go” |
| Rate-audit page | Stretch; the identity self-check is the stronger proof for this time budget |
| Multi-year side-by-side | Stretch; one year of sample data |
| CSV on every on-screen table | Stretch, though `GET /api/export/:resource` covers the main lists |

Must-haves and should-haves are in: upload with month-scoped replace, dashboard, project, productivity, categories, department drill-down, per-employee profitability, configurable billable categories and overhead, honest empty/error states.

## Known issues / things I'm not happy with

- **`xlsx` (SheetJS community)** has a high npm advisory. It is still the practical parser for these workbooks; a later swap to ExcelJS would be mechanical.
- **`node:sqlite` prints an ExperimentalWarning** on Node 22/24. No native addon to compile, which is the trade.
- **Management loaded cost is AED 0.** That is the model, not a bug: they have no billable hours, so their salary sits in the indirect pool and is recovered on everyone else's billable work. The department page shows **direct cost** so they don't look free.
- **Enhancements and hosting look like heavy losses** (E2025050a margin about −112%). Full-year loaded cost includes a share of the whole agency's internal time. That is what the formula does; a sales-month cash view would tell a different story.
- **Period revenue uses hours-in-period / lifetime-hours.** If you only load 2025, “lifetime” is 2025. That is correct for this dataset and would shift if 2024 hours were added later.
- **The sample has no `-` cells and no orphan employees.** Parsers handle them; the UI banners for missing salary/price will stay quiet until you feed a gappy file (or drop the salary sheet into the timesheet slot — that error *is* easy to see).
- **`npm run dev` fails if something is already bound to 3001.** Stop the leftover API, or use `npm start` after `npm run build`.
- **No auth, no multi-user, no tests on the React layer.** Acceptable for a local leadership tool; not for a hosted one.

## Self-check (2025, overhead = 0)

```
total hours:           19815.2
billable hours:        15265.6
total salaries (AED):  2400000.00
total cost (AED):      2400000.00
difference:            0.00
```
