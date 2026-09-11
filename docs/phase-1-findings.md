# Phase 1 — data inspection findings and proposed schema

Source: `data/sample/*.xlsx`, inspected by `server/scripts/inspect-data.js`.
Full printed transcript: [`phase-1-inspect-output.txt`](phase-1-inspect-output.txt).

No ingestion, calculation, or UI code in this phase.

## What the three files actually look like

### `project-prices-2025.xlsx` — sheet `Projects`

- Headers start on **row 1**. Used range `A1:F12` (11 data rows).
- Columns: `Ref Code` · `Project (Billable) Name` · `Project Price` · `Sales month` · `Category` · `Status`
- `Ref Code` and names are Excel strings (`t=s`). Prices are numbers (`t=n`), format `General` (not currency).
- Project names are commercial-proposal filenames, some ending in `.pdf`.
- Categories: Projects (8), Enhancements (2), Hosting (1). Status: `in progress` / `completed`.
- No merged cells, formulas, blanks, or dashes.

### `salaries-2025.xlsx` — sheet `Salary`

- **Row 1 is a title**, in column B not A: `Salary Overview 2025 (AED)`. Year and currency live here, not in the month headers.
- Headers start on **row 2**: `Employee No.` · `Employee Name` · `January` … `December`.
- 12 people. `Employee No.` is a **string**, not a number — management IDs keep leading zeros (`00101`, `00102` vs delivery `10201`).
- Every month cell in this sample is a number. Across-the-board +500 AED bump from July.
- No merged cells, formulas, blanks, or dashes in this sample.

### `timesheet-2025.xlsx` — sheet `Timesheet`

- Headers start on **row 1**. Used range `A1:L563` (562 data rows).
- Columns: `Month` · `Employee No.` · `Employee Name` · `Type of Expense` · `Department` · `Designation` · `Category` · `Ref Code` · `Project (Billable) / Task (Unbillable) Name` · `Company Name (Billable)/ Fixed Costs (Unbillable)` · `Description` · `Hours`
- Hours are numbers, including tenths (`7.1`, `135.9`).
- `Type of Expense`: `DL` (503) and `IDL` (59). The 59 IDL rows are exactly Hana Yousef and Omar Zayed (Management). They **do** log hours — they are not the “salary but zero hours” case.
- Departments: Design, Backend, Frontend, Management, QA, App.
- 11 categories. Billable-looking: `Projects`, `Enhancements`, `Hosting`. Internal: `FC - *`, plus `Tentwenty` (internal product, no price row).

## Date formats encountered

None of the date columns are Excel serials. They are plain strings, and **the two files disagree**.

| Column | File | Distinct shapes in this sample |
| --- | --- | --- |
| `Sales month` | project prices | `January '25` … `November '25` (full month name, apostrophe, two-digit year). No December row. |
| `Month` | timesheet | `January 2025` … `December 2025` (full month name, four-digit year). |
| Salary months | salary | Not values — they are **column headers**. Year comes from the title `2025`. |

The brief also warns about `May '25`, `January 2026`, and bare `January`. Those shapes are **not in this sample**; the parser still has to accept them.

Canonical store: `year INTEGER` + `month INTEGER` (1–12). Never store the raw display string as the join key.

## How `-` and blanks appear

**They do not appear in these three sample files.** Every data cell is a real value (`emptiness.value` = 100% of the used range).

The brief still says empty cells are written as `-`. Ingestion (Phase 2) must treat all of these as SQL `NULL`:

- missing cell (`t=z` / absent)
- `""` and whitespace
- `"-"` and unicode dashes `–` `—`

A `NULL` salary for a month means “not employed / not paid that month”, not zero. Zero would distort the indirect pool.

## Other structural oddities the schema has to absorb

1. Header row is not always row 1 (salary title row).
2. `Employee No.` must stay `TEXT`. Coercing to integer drops `00101` → `101`.
3. Two ID namespaces: delivery `102xx` and management `001xx`.
4. Timesheet `Ref Code` is overloaded: project codes (`Q2025001a`, `E2025050a`, `H2025060c`) **and** internal labels (`FC - Leaves`, `Tentwenty`). Only the former join to prices.
5. `Kevin D'Souza` — apostrophe in names; join on employee number, not name.
6. Salary is wide (one column per month) and must be unpivoted. Timesheet is already long.
7. No December sales-month in project prices; timesheet still has December hours on earlier projects.
8. `xlsx` `General` format on money — no fils/currency metadata in the file. Unit is AED from the salary title.

## Join keys

```
timesheet.employee_no  =  salaries.employee_no
timesheet.year/month   =  salaries.year/month

timesheet.ref_code     =  projects.ref_code     -- LEFT JOIN; expected miss on FC-* / Tentwenty
```

This sample is a perfect person match: 12 names and 12 numbers on both sides, zero orphans.

Ref codes: 11/11 project prices appear in the timesheet. 8 timesheet ref codes have **no** price, and they are exactly the internal buckets:

`FC - Leaves`, `FC - Meetings`, `FC - Learning`, `FC - Bug Fixes`, `FC - SEO/Marketing`, `FC - Others`, `FC - Idle`, `Tentwenty`.

Those must not be flagged as “unpriced projects”. A missing price on a `Q`/`E`/`H` code should.

Do **not** put a foreign key from `timesheet_entries.ref_code` to `projects.ref_code`.

Fallback if a future file drops employee numbers: match `LOWER(TRIM(employee_name))`, and surface the gap. Primary key remains `employee_no`.

## Proposed SQLite schema

Money and hours: `REAL`. Months: `INTEGER` 1–12. IDs: `TEXT`. Booleans: `INTEGER` 0/1.

```sql
PRAGMA foreign_keys = ON;

-- Re-upload audit. Replacing a corrected month deletes timesheet rows for
-- only the (year, month) pairs present in the new file, then inserts.
CREATE TABLE uploads (
  id                INTEGER PRIMARY KEY,
  kind              TEXT NOT NULL CHECK (kind IN ('timesheet', 'salary', 'projects')),
  original_filename TEXT NOT NULL,
  file_year         INTEGER,
  uploaded_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE employees (
  employee_no  TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  department   TEXT,
  designation  TEXT,
  expense_type TEXT CHECK (expense_type IN ('DL', 'IDL')),
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Unpivoted from the salary wide sheet. amount_aed NULL = dash/blank.
CREATE TABLE salaries (
  employee_no      TEXT NOT NULL REFERENCES employees(employee_no),
  year             INTEGER NOT NULL,
  month            INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  amount_aed       REAL,
  source_upload_id INTEGER REFERENCES uploads(id),
  PRIMARY KEY (employee_no, year, month)
);

CREATE TABLE projects (
  ref_code         TEXT PRIMARY KEY,
  name             TEXT NOT NULL,
  price_aed        REAL,
  sales_year       INTEGER,
  sales_month      INTEGER CHECK (sales_month BETWEEN 1 AND 12),
  category         TEXT,
  status           TEXT,
  source_upload_id INTEGER REFERENCES uploads(id)
);

-- One row per timesheet line. No FK on ref_code (internal codes are not projects).
CREATE TABLE timesheet_entries (
  id               INTEGER PRIMARY KEY,
  year             INTEGER NOT NULL,
  month            INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  employee_no      TEXT NOT NULL REFERENCES employees(employee_no),
  employee_name    TEXT NOT NULL,
  expense_type     TEXT NOT NULL CHECK (expense_type IN ('DL', 'IDL')),
  department       TEXT,
  designation      TEXT,
  category         TEXT NOT NULL,
  ref_code         TEXT NOT NULL,
  task_name        TEXT,
  company          TEXT,
  description      TEXT,
  hours            REAL NOT NULL,
  source_upload_id INTEGER REFERENCES uploads(id),
  source_row       INTEGER
);

CREATE INDEX idx_ts_month     ON timesheet_entries (year, month);
CREATE INDEX idx_ts_employee  ON timesheet_entries (employee_no, year, month);
CREATE INDEX idx_ts_ref       ON timesheet_entries (ref_code);
CREATE INDEX idx_ts_category  ON timesheet_entries (category);
CREATE INDEX idx_ts_dept      ON timesheet_entries (department);

-- Configurable: which categories count as billable. Defaults below.
CREATE TABLE billable_categories (
  category    TEXT PRIMARY KEY,
  is_billable INTEGER NOT NULL DEFAULT 1 CHECK (is_billable IN (0, 1))
);

INSERT INTO billable_categories (category, is_billable) VALUES
  ('Projects', 1),
  ('Enhancements', 1),
  ('Hosting', 1);

-- Per-month overhead entered by the user (not in the spreadsheets).
CREATE TABLE monthly_overhead (
  year       INTEGER NOT NULL,
  month      INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  amount_aed REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (year, month)
);
```

Derived monthly rates (direct rate per person, indirect rate per month) are **not** tables yet. They belong in the calculation layer in Phase 2 so the “overhead = 0 ⇒ total cost = total salaries” self-check stays a pure function of these source tables.

## How the cost model will use these joins (not implemented)

Per person per month:

`direct_rate = salaries.amount_aed / SUM(timesheet_entries.hours)` for that person-month.

People with a salary row and **zero** timesheet hours that month contribute their whole salary to the indirect pool (support staff). People who logged hours contribute `direct_rate × non_billable_hours` instead. Billable hours = rows whose `category` is in `billable_categories`. `monthly_overhead.amount_aed` is added to the pool.

`indirect_rate = indirect_pool / billable_hours` that month.

`employee_cost_on_project = hours × (direct_rate + indirect_rate)`.

Gaps the UI must surface later: timesheet employee with no salary row; `Q`/`E`/`H` ref code with hours but no `projects` row; salary with no hours (legitimate, not an error).

## Parser rules for Phase 2 (not written yet)

- Detect the header row; do not assume row 1.
- Keep `Employee No.` as text.
- Unpivot salary month columns; read year from the title / filename.
- Parse month strings with at least: `MMMM YYYY`, `MMMM 'YY`, `MMM 'YY`, and bare `MMMM` (year from file).
- Accept Excel date serials if they show up later (`t=n` + date number format).
- Map `-` / blank → `NULL`.
- Re-upload unit = `(kind, year, month)` for timesheet and salary; `ref_code` upsert for projects.
