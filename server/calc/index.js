import { aedEqual, ratio, roundAed } from "./round.js";
import { computeAllMonthRates, monthKey } from "./rates.js";
import { annotateRows, inPeriod, rollupProjects } from "./allocate.js";

function projectMapFrom(projects) {
  return new Map((projects ?? []).map((p) => [p.refCode, p]));
}

export function computeModel(input) {
  const { months, billableSet } = computeAllMonthRates(input);
  const projectMap = projectMapFrom(input.projects);
  const rows = annotateRows(input.timesheet ?? [], months, billableSet, projectMap);
  const projects = rollupProjects(rows, input.projects ?? [], billableSet);
  const issues = [
    ...months.flatMap((m) => m.issues),
    ...uniqueIssues(rows.filter((r) => r.missingPrice).map((r) => ({
      type: "missing_price",
      refCode: r.refCode,
      category: r.category,
    }))),
  ];
  return { months, rows, projects, billableSet, issues };
}

function uniqueIssues(list) {
  const seen = new Set();
  const out = [];
  for (const item of list) {
    const key = `${item.type}:${item.refCode}:${item.employeeNo ?? ""}:${item.year ?? ""}:${item.month ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function selectedMonths(model, year, month) {
  return model.months.filter((m) => {
    if (year != null && m.year !== year) return false;
    if (month != null && m.month !== month) return false;
    return true;
  });
}

function selectedRows(model, year, month) {
  return model.rows.filter((r) => inPeriod(r, year, month));
}

function sum(rows, key) {
  return rows.reduce((n, r) => n + (r[key] || 0), 0);
}

export function periodTotals(model, { year, month } = {}) {
  const months = selectedMonths(model, year, month);
  const rows = selectedRows(model, year, month);
  const loadedCost = rows.reduce((n, r) => n + (r.loadedCost ?? 0), 0);
  const unallocatedPool = months.reduce((n, m) => n + m.unallocatedPool, 0);
  const costAed = loadedCost + unallocatedPool;
  const totalSalaries = months.reduce((n, m) => n + m.totalSalaries, 0);
  const overheadAed = months.reduce((n, m) => n + m.overheadAed, 0);
  const totalHours = months.reduce((n, m) => n + m.totalHours, 0);
  const billableHours = months.reduce((n, m) => n + m.billableHours, 0);

  const lifetimeByRef = new Map(model.projects.map((p) => [p.refCode, p.hours]));
  let revenueAed = 0;
  let revenueKnown = false;
  for (const proj of model.projects) {
    if (proj.priceAed == null || !proj.hours) continue;
    const periodHours = rows.filter((r) => r.refCode === proj.refCode).reduce((n, r) => n + r.hours, 0);
    const lifetimeHours = lifetimeByRef.get(proj.refCode) || 0;
    const share = ratio(periodHours, lifetimeHours);
    if (share == null) continue;
    revenueAed += share * proj.priceAed;
    revenueKnown = true;
  }

  const profitAed = revenueKnown ? revenueAed - costAed : null;
  return {
    year: year ?? null,
    month: month ?? null,
    totalHours,
    billableHours,
    costAed,
    totalSalaries,
    overheadAed,
    revenueAed: revenueKnown ? revenueAed : null,
    profitAed,
    margin: ratio(profitAed, revenueKnown ? revenueAed : null),
    issues: model.issues.filter((i) => {
      if (i.year != null && year != null && i.year !== year) return false;
      if (i.month != null && month != null && i.month !== month) return false;
      return true;
    }),
  };
}

export function dashboardView(model, period = {}) {
  const totals = periodTotals(model, period);
  const rows = selectedRows(model, period.year, period.month);
  const projects = model.projects
    .map((proj) => {
      const periodHours = rows.filter((r) => r.refCode === proj.refCode).reduce((n, r) => n + r.hours, 0);
      const periodCost = rows
        .filter((r) => r.refCode === proj.refCode)
        .reduce((n, r) => n + (r.loadedCost ?? 0), 0);
      if (period.year != null && periodHours === 0 && (proj.salesYear !== period.year || (period.month != null && proj.salesMonth !== period.month))) {
        return null;
      }
      const share = ratio(periodHours, proj.hours);
      const revenueAed = proj.priceAed != null && share != null ? share * proj.priceAed : null;
      const profitAed = revenueAed != null ? revenueAed - periodCost : null;
      return {
        refCode: proj.refCode,
        name: proj.name,
        category: proj.category,
        status: proj.status,
        priceAed: proj.priceAed,
        missingPrice: proj.missingPrice,
        hours: periodHours,
        costAed: periodCost,
        revenueAed,
        profitAed,
        margin: ratio(profitAed, revenueAed),
      };
    })
    .filter(Boolean)
    .sort((a, b) => (b.profitAed ?? -Infinity) - (a.profitAed ?? -Infinity));

  return { ...totals, projects };
}

export function projectsView(model, period = {}) {
  return dashboardView(model, period).projects;
}

export function projectView(model, refCode, period = {}) {
  const proj = model.projects.find((p) => p.refCode === refCode);
  if (!proj) return null;
  const rows = selectedRows(model, period.year, period.month).filter((r) => r.refCode === refCode);
  if (period.year == null && period.month == null) {
    return proj;
  }
  const hours = sum(rows, "hours");
  const costAed = rows.reduce((n, r) => n + (r.loadedCost ?? 0), 0);
  const share = ratio(hours, proj.hours);
  const revenueAed = proj.priceAed != null && share != null ? share * proj.priceAed : null;
  const byDept = new Map();
  const byEmp = new Map();
  for (const row of rows) {
    const dept = row.department || "Unspecified";
    const d = byDept.get(dept) ?? { department: dept, hours: 0, costAed: 0 };
    d.hours += row.hours;
    d.costAed += row.loadedCost ?? 0;
    byDept.set(dept, d);

    const e = byEmp.get(row.employeeNo) ?? {
      employeeNo: row.employeeNo,
      employeeName: row.employeeName,
      department: row.department,
      designation: row.designation,
      hours: 0,
      billableHours: 0,
      costAed: 0,
      missingSalary: false,
    };
    e.hours += row.hours;
    if (row.isBillable) e.billableHours += row.hours;
    e.costAed += row.loadedCost ?? 0;
    e.missingSalary = e.missingSalary || row.missingSalary;
    byEmp.set(row.employeeNo, e);
  }
  const employees = [...byEmp.values()].map((emp) => {
    const empShare = ratio(emp.hours, hours);
    const revenueShareAed = revenueAed != null && empShare != null ? empShare * revenueAed : null;
    const profitAed = revenueShareAed != null ? revenueShareAed - emp.costAed : null;
    return { ...emp, revenueShareAed, profitAed, profitability: ratio(profitAed, revenueShareAed) };
  });
  return {
    ...proj,
    period: { year: period.year ?? null, month: period.month ?? null, hours, costAed, revenueAed },
    hoursByDepartment: [...byDept.values()].sort((a, b) => b.hours - a.hours),
    employees: employees.sort((a, b) => b.hours - a.hours),
  };
}

export function productivityView(model, period = {}) {
  const months = selectedMonths(model, period.year, period.month);
  const byEmp = new Map();
  for (const month of months) {
    for (const emp of month.employees.values()) {
      const row = byEmp.get(emp.employeeNo) ?? {
        employeeNo: emp.employeeNo,
        employeeName: emp.name,
        department: emp.department,
        designation: emp.designation,
        expenseType: emp.expenseType,
        totalHours: 0,
        billableHours: 0,
        missingSalary: false,
      };
      row.totalHours += emp.hours;
      row.billableHours += emp.billableHours;
      row.missingSalary = row.missingSalary || emp.missingSalary;
      byEmp.set(emp.employeeNo, row);
    }
  }
  return [...byEmp.values()]
    .map((e) => ({ ...e, productivity: ratio(e.billableHours, e.totalHours) }))
    .sort((a, b) => (a.productivity ?? 0) - (b.productivity ?? 0));
}

export function categoriesView(model, period = {}) {
  const rows = selectedRows(model, period.year, period.month);
  const byCat = new Map();
  for (const row of rows) {
    const bucket = byCat.get(row.category) ?? {
      category: row.category,
      isBillable: row.isBillable,
      hours: 0,
      costAed: 0,
    };
    bucket.hours += row.hours;
    bucket.costAed += row.loadedCost ?? 0;
    byCat.set(row.category, bucket);
  }
  const totalHours = sum(rows, "hours");
  return [...byCat.values()]
    .map((c) => ({ ...c, share: ratio(c.hours, totalHours) }))
    .sort((a, b) => b.hours - a.hours);
}

export function departmentsView(model, period = {}) {
  const rows = selectedRows(model, period.year, period.month);
  const byDept = new Map();
  for (const row of rows) {
    const dept = row.department || "Unspecified";
    const bucket = byDept.get(dept) ?? { department: dept, hours: 0, billableHours: 0, costAed: 0 };
    bucket.hours += row.hours;
    if (row.isBillable) bucket.billableHours += row.hours;
    bucket.costAed += row.loadedCost ?? 0;
    byDept.set(dept, bucket);
  }
  return [...byDept.values()].sort((a, b) => b.hours - a.hours);
}

export function departmentView(model, department, period = {}) {
  const rows = selectedRows(model, period.year, period.month).filter(
    (r) => (r.department || "Unspecified") === department,
  );
  const byEmp = new Map();
  for (const row of rows) {
    const e = byEmp.get(row.employeeNo) ?? {
      employeeNo: row.employeeNo,
      employeeName: row.employeeName,
      designation: row.designation,
      hours: 0,
      billableHours: 0,
      costAed: 0,
      missingSalary: false,
    };
    e.hours += row.hours;
    if (row.isBillable) e.billableHours += row.hours;
    e.costAed += row.loadedCost ?? 0;
    e.missingSalary = e.missingSalary || row.missingSalary;
    byEmp.set(row.employeeNo, e);
  }
  const summary = departmentsView(model, period).find((d) => d.department === department) ?? {
    department,
    hours: 0,
    billableHours: 0,
    costAed: 0,
  };
  return {
    ...summary,
    employees: [...byEmp.values()]
      .map((e) => ({ ...e, productivity: ratio(e.billableHours, e.totalHours ?? e.hours) }))
      .sort((a, b) => b.hours - a.hours),
  };
}

export function selfCheck(model, { year } = {}) {
  const totals = periodTotals(model, { year, month: null });
  const pass = aedEqual(totals.costAed, totals.totalSalaries + totals.overheadAed);
  return {
    pass,
    year: year ?? null,
    totalCostAed: roundAed(totals.costAed),
    totalSalariesAed: roundAed(totals.totalSalaries),
    overheadAed: roundAed(totals.overheadAed),
    expectedCostAed: roundAed(totals.totalSalaries + totals.overheadAed),
    differenceAed: roundAed(totals.costAed - (totals.totalSalaries + totals.overheadAed)),
    totalHours: totals.totalHours,
    billableHours: totals.billableHours,
  };
}

export { aedEqual, monthKey, roundAed };
