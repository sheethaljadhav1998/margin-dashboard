import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

export const SCHEMA = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS uploads (
  id                INTEGER PRIMARY KEY,
  kind              TEXT NOT NULL CHECK (kind IN ('timesheet', 'salary', 'projects')),
  original_filename TEXT NOT NULL,
  file_year         INTEGER,
  uploaded_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS employees (
  employee_no  TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  department   TEXT,
  designation  TEXT,
  expense_type TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS salaries (
  employee_no      TEXT NOT NULL REFERENCES employees(employee_no),
  year             INTEGER NOT NULL,
  month            INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  amount_aed       REAL,
  source_upload_id INTEGER REFERENCES uploads(id),
  PRIMARY KEY (employee_no, year, month)
);

CREATE TABLE IF NOT EXISTS projects (
  ref_code         TEXT PRIMARY KEY,
  name             TEXT NOT NULL,
  price_aed        REAL,
  sales_year       INTEGER,
  sales_month      INTEGER,
  category         TEXT,
  status           TEXT,
  source_upload_id INTEGER REFERENCES uploads(id)
);

CREATE TABLE IF NOT EXISTS timesheet_entries (
  id               INTEGER PRIMARY KEY,
  year             INTEGER NOT NULL,
  month            INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  employee_no      TEXT NOT NULL REFERENCES employees(employee_no),
  employee_name    TEXT NOT NULL,
  expense_type     TEXT,
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

CREATE INDEX IF NOT EXISTS idx_ts_month    ON timesheet_entries (year, month);
CREATE INDEX IF NOT EXISTS idx_ts_employee ON timesheet_entries (employee_no, year, month);
CREATE INDEX IF NOT EXISTS idx_ts_ref      ON timesheet_entries (ref_code);
CREATE INDEX IF NOT EXISTS idx_ts_category ON timesheet_entries (category);
CREATE INDEX IF NOT EXISTS idx_ts_dept     ON timesheet_entries (department);

CREATE TABLE IF NOT EXISTS billable_categories (
  category    TEXT PRIMARY KEY,
  is_billable INTEGER NOT NULL DEFAULT 1 CHECK (is_billable IN (0, 1))
);

CREATE TABLE IF NOT EXISTS monthly_overhead (
  year       INTEGER NOT NULL,
  month      INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  amount_aed REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (year, month)
);
`;

const DEFAULT_BILLABLE = ["Projects", "Enhancements", "Hosting"];

export function defaultDbPath() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../data/margin.db");
}

export function openDb(dbPath = defaultDbPath()) {
  if (dbPath !== ":memory:") mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(SCHEMA);
  const insert = db.prepare(
    "INSERT OR IGNORE INTO billable_categories (category, is_billable) VALUES (?, 1)",
  );
  for (const category of DEFAULT_BILLABLE) insert.run(category);
  return db;
}

export function closeDb(db) {
  db.close();
}
