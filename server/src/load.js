export function loadCalcInput(db) {
  const timesheet = db
    .prepare(
      `SELECT year, month, employee_no AS employeeNo, employee_name AS employeeName,
              expense_type AS expenseType, department, designation, category,
              ref_code AS refCode, task_name AS taskName, company, description, hours
       FROM timesheet_entries
       ORDER BY year, month, id`,
    )
    .all();

  const salaries = db
    .prepare(
      `SELECT s.employee_no AS employeeNo, e.name AS employeeName,
              s.year, s.month, s.amount_aed AS amountAed
       FROM salaries s
       JOIN employees e ON e.employee_no = s.employee_no
       ORDER BY s.year, s.month, s.employee_no`,
    )
    .all();

  const projects = db
    .prepare(
      `SELECT ref_code AS refCode, name, price_aed AS priceAed,
              sales_year AS salesYear, sales_month AS salesMonth, category, status
       FROM projects
       ORDER BY ref_code`,
    )
    .all();

  const billableCategories = db
    .prepare("SELECT category FROM billable_categories WHERE is_billable = 1 ORDER BY category")
    .all()
    .map((r) => r.category);

  const overhead = db
    .prepare(
      "SELECT year, month, amount_aed AS amountAed FROM monthly_overhead ORDER BY year, month",
    )
    .all();

  return { timesheet, salaries, projects, billableCategories, overhead };
}

export function loadSettings(db) {
  const billableCategories = db
    .prepare("SELECT category, is_billable AS isBillable FROM billable_categories ORDER BY category")
    .all()
    .map((r) => ({ category: r.category, isBillable: Boolean(r.isBillable) }));

  const overhead = db
    .prepare(
      "SELECT year, month, amount_aed AS amountAed FROM monthly_overhead ORDER BY year, month",
    )
    .all();

  const knownCategories = db
    .prepare("SELECT DISTINCT category FROM timesheet_entries ORDER BY category")
    .all()
    .map((r) => r.category);

  return { billableCategories, overhead, knownCategories };
}

export function saveSettings(db, { billableCategories, overhead } = {}) {
  db.exec("BEGIN");
  try {
    if (Array.isArray(billableCategories)) {
      db.exec("DELETE FROM billable_categories");
      const ins = db.prepare("INSERT INTO billable_categories (category, is_billable) VALUES (?, 1)");
      for (const category of billableCategories) {
        if (category) ins.run(String(category));
      }
    }
    if (Array.isArray(overhead)) {
      const upsert = db.prepare(
        `INSERT INTO monthly_overhead (year, month, amount_aed) VALUES (?, ?, ?)
         ON CONFLICT(year, month) DO UPDATE SET amount_aed = excluded.amount_aed`,
      );
      for (const row of overhead) {
        if (row.year == null || row.month == null) continue;
        upsert.run(Number(row.year), Number(row.month), Number(row.amountAed ?? row.amount ?? 0));
      }
    }
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
  return loadSettings(db);
}
