function monthKey(year, month) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function sumHours(rows) {
  return rows.reduce((n, r) => n + (r.hours || 0), 0);
}

/**
 * Direct rate, indirect pool and indirect rate for a single calendar month.
 * Pure: no I/O. People with hours but no salary are flagged and excluded from
 * the rate math so they cannot dilute the pool.
 */
export function computeMonthRates({
  year,
  month,
  entries = [],
  salaries = [],
  billableCategories,
  overheadAed = 0,
}) {
  const billableSet = billableCategories instanceof Set ? billableCategories : new Set(billableCategories);
  const byEmp = new Map();
  for (const row of entries) {
    if (!byEmp.has(row.employeeNo)) byEmp.set(row.employeeNo, []);
    byEmp.get(row.employeeNo).push(row);
  }

  const salaryByEmp = new Map();
  for (const row of salaries) {
    salaryByEmp.set(row.employeeNo, row);
  }

  const ids = new Set([...byEmp.keys(), ...salaryByEmp.keys()]);
  const employees = new Map();
  const issues = [];

  let totalHours = 0;
  let billableHoursAll = 0;
  let costableBillableHours = 0;
  let totalSalaries = 0;
  let supportSalaries = 0;
  let nonBillableValue = 0;

  for (const employeeNo of ids) {
    const rows = byEmp.get(employeeNo) ?? [];
    const salaryRow = salaryByEmp.get(employeeNo);
    const hours = sumHours(rows);
    const billableHours = sumHours(rows.filter((r) => billableSet.has(r.category)));
    const nonBillableHours = hours - billableHours;
    const name = rows[0]?.employeeName ?? salaryRow?.employeeName ?? employeeNo;
    const department = rows[0]?.department ?? null;
    const designation = rows[0]?.designation ?? null;
    const expenseType = rows[0]?.expenseType ?? null;
    const amount = salaryRow?.amountAed;
    const hasSalary = amount != null && Number.isFinite(amount);

    totalHours += hours;
    billableHoursAll += billableHours;

    if (!hasSalary) {
      if (hours > 0) {
        issues.push({
          type: "missing_salary",
          employeeNo,
          employeeName: name,
          year,
          month,
        });
      }
      employees.set(employeeNo, {
        employeeNo,
        name,
        department,
        designation,
        expenseType,
        hours,
        billableHours,
        nonBillableHours,
        salaryAed: null,
        directRate: null,
        support: false,
        missingSalary: hours > 0,
      });
      continue;
    }

    totalSalaries += amount;

    if (hours === 0) {
      supportSalaries += amount;
      employees.set(employeeNo, {
        employeeNo,
        name,
        department,
        designation,
        expenseType,
        hours: 0,
        billableHours: 0,
        nonBillableHours: 0,
        salaryAed: amount,
        directRate: null,
        support: true,
        missingSalary: false,
      });
      continue;
    }

    const directRate = amount / hours;
    nonBillableValue += nonBillableHours * directRate;
    costableBillableHours += billableHours;

    employees.set(employeeNo, {
      employeeNo,
      name,
      department,
      designation,
      expenseType,
      hours,
      billableHours,
      nonBillableHours,
      salaryAed: amount,
      directRate,
      support: false,
      missingSalary: false,
    });
  }

  const overheadAmount = Number.isFinite(overheadAed) ? overheadAed : 0;
  const indirectPool = supportSalaries + nonBillableValue + overheadAmount;
  const indirectRate = costableBillableHours > 0 ? indirectPool / costableBillableHours : null;
  const unallocatedPool = costableBillableHours > 0 ? 0 : indirectPool;

  return {
    year,
    month,
    key: monthKey(year, month),
    employees,
    totalHours,
    billableHours: billableHoursAll,
    costableBillableHours,
    totalSalaries,
    supportSalaries,
    nonBillableValue,
    overheadAed: overheadAmount,
    indirectPool,
    indirectRate,
    unallocatedPool,
    issues,
  };
}

export function computeAllMonthRates(input) {
  const billableSet = new Set(input.billableCategories ?? []);
  const overheadMap = new Map();
  for (const row of input.overhead ?? []) {
    overheadMap.set(monthKey(row.year, row.month), row.amountAed ?? 0);
  }

  const buckets = new Map();
  const ensure = (year, month) => {
    const key = monthKey(year, month);
    if (!buckets.has(key)) buckets.set(key, { year, month, entries: [], salaries: [] });
    return buckets.get(key);
  };

  for (const row of input.timesheet ?? []) ensure(row.year, row.month).entries.push(row);
  for (const row of input.salaries ?? []) ensure(row.year, row.month).salaries.push(row);

  const months = [...buckets.values()]
    .sort((a, b) => a.year - b.year || a.month - b.month)
    .map((b) =>
      computeMonthRates({
        year: b.year,
        month: b.month,
        entries: b.entries,
        salaries: b.salaries,
        billableCategories: billableSet,
        overheadAed: overheadMap.get(monthKey(b.year, b.month)) ?? 0,
      }),
    );

  return { months, billableSet };
}

export { monthKey };
