How I approached this

I worked in four phases: 

1. inspected the raw files first to figure out header positions, date formats, and blank-cell handling before touching the schema; 
2. built ingestion and the calc engine as an isolated module, and ran a self-check — total cost must equal total salaries when overhead is 0 — before building anything on top of it; 
3. built the API, then the frontend pages one at a time, finishing each before starting the next;
4. handled edge cases, empty states, and docs last.

What I'd build next
1. Employee × category matrix (data's already there, just needs a grouped query + table)
2. An audit view showing how each month's rates were derived
3. Multi-year comparison (schema already supports it, UI doesn't yet)
4. A fixture with a genuinely missing salary/price, so the gap-handling UI actually gets exercised
5. A Playwright pass over the core pages

What I cut, and why
Cut	Why
Employee × category matrix	Stretch — category page already covers "where time goes"
Rate-audit page	Stretch — self-check felt like stronger proof given the time budget
Multi-year side-by-side	Stretch — only one year of sample data to test
CSV export everywhere	Stretch — main lists already covered by /api/export/:resource

Not fully happy with
1. xlsx (SheetJS) has a known high advisory — still the practical choice here; ExcelJS swap would be mechanical
2. Management shows AED 0 loaded cost by design — no billable hours, so their salary sits in the indirect pool instead
3. Some projects show large negative margins (e.g. −112%) because full-year loaded cost includes a share of internal time — correct per the formula, but a cash view would tell a different story
4. Sample data has no gaps, so missing-salary/price banners are untested against real data