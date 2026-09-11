export function persistParsed(db, parsed, { filename = "upload.xlsx" } = {}) {
  db.exec("BEGIN");
  try {
    const result =
      parsed.kind === "timesheet"
        ? persistTimesheet(db, parsed, filename)
        : parsed.kind === "salary"
          ? persistSalary(db, parsed, filename)
          : persistProjects(db, parsed, filename);
    db.exec("COMMIT");
    return result;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

function insertUpload(db, kind, filename, fileYear) {
  const info = db.prepare(
    "INSERT INTO uploads (kind, original_filename, file_year) VALUES (?, ?, ?)",
  ).run(kind, filename, fileYear ?? null);
  return Number(info.lastInsertRowid);
}

function upsertEmployee(db, { employeeNo, name, department, designation, expenseType }) {
  db.prepare(
    `INSERT INTO employees (employee_no, name, department, designation, expense_type)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(employee_no) DO UPDATE SET
       name = excluded.name,
       department = COALESCE(excluded.department, employees.department),
       designation = COALESCE(excluded.designation, employees.designation),
       expense_type = COALESCE(excluded.expense_type, employees.expense_type)`,
  ).run(employeeNo, name || employeeNo, department ?? null, designation ?? null, expenseType ?? null);
}

function persistTimesheet(db, parsed, filename) {
  const uploadId = insertUpload(db, "timesheet", filename, parsed.rows[0]?.year ?? null);
  const months = parsed.monthsTouched ?? [];

  for (const row of parsed.rows) {
    upsertEmployee(db, {
      employeeNo: row.employeeNo,
      name: row.employeeName,
      department: row.department,
      designation: row.designation,
      expenseType: row.expenseType,
    });
  }

  const del = db.prepare("DELETE FROM timesheet_entries WHERE year = ? AND month = ?");
  for (const { year, month } of months) del.run(year, month);

  const ins = db.prepare(
    `INSERT INTO timesheet_entries (
       year, month, employee_no, employee_name, expense_type, department, designation,
       category, ref_code, task_name, company, description, hours, source_upload_id, source_row
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const row of parsed.rows) {
    ins.run(
      row.year,
      row.month,
      row.employeeNo,
      row.employeeName,
      row.expenseType,
      row.department,
      row.designation,
      row.category,
      row.refCode,
      row.taskName,
      row.company,
      row.description,
      row.hours,
      uploadId,
      row.sourceRow,
    );
  }

  return {
    kind: "timesheet",
    uploadId,
    rows: parsed.rows.length,
    monthsTouched: months,
    warnings: parsed.warnings ?? [],
  };
}

function persistSalary(db, parsed, filename) {
  const uploadId = insertUpload(db, "salary", filename, parsed.year ?? null);
  const months = parsed.monthsTouched ?? [];

  for (const row of parsed.rows) {
    upsertEmployee(db, { employeeNo: row.employeeNo, name: row.employeeName });
  }

  const del = db.prepare("DELETE FROM salaries WHERE year = ? AND month = ?");
  for (const { year, month } of months) del.run(year, month);

  const ins = db.prepare(
    `INSERT INTO salaries (employee_no, year, month, amount_aed, source_upload_id)
     VALUES (?, ?, ?, ?, ?)`,
  );
  for (const row of parsed.rows) {
    ins.run(row.employeeNo, row.year, row.month, row.amountAed, uploadId);
  }

  return {
    kind: "salary",
    uploadId,
    rows: parsed.rows.length,
    monthsTouched: months,
    warnings: parsed.warnings ?? [],
  };
}

function persistProjects(db, parsed, filename) {
  const uploadId = insertUpload(db, "projects", filename, parsed.rows[0]?.salesYear ?? null);
  const ins = db.prepare(
    `INSERT INTO projects (ref_code, name, price_aed, sales_year, sales_month, category, status, source_upload_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(ref_code) DO UPDATE SET
       name = excluded.name,
       price_aed = excluded.price_aed,
       sales_year = excluded.sales_year,
       sales_month = excluded.sales_month,
       category = excluded.category,
       status = excluded.status,
       source_upload_id = excluded.source_upload_id`,
  );
  for (const row of parsed.rows) {
    ins.run(
      row.refCode,
      row.name,
      row.priceAed,
      row.salesYear,
      row.salesMonth,
      row.category,
      row.status,
      uploadId,
    );
  }
  return {
    kind: "projects",
    uploadId,
    rows: parsed.rows.length,
    monthsTouched: parsed.monthsTouched ?? [],
    warnings: parsed.warnings ?? [],
  };
}
