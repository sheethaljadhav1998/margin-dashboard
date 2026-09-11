import { ratio } from "./round.js";
import { monthKey } from "./rates.js";

function looksLikePricedWork(refCode, category, billableSet, projectMap) {
  if (projectMap.has(refCode)) return true;
  if (billableSet.has(category)) return true;
  return false;
}

/**
 * Stamp each timesheet row with that month's rates, then roll up projects.
 */
export function annotateRows(timesheet, months, billableSet, projectMap) {
  const byKey = new Map(months.map((m) => [m.key, m]));
  return timesheet.map((row) => {
    const month = byKey.get(monthKey(row.year, row.month));
    const emp = month?.employees.get(row.employeeNo);
    const isBillable = billableSet.has(row.category);
    const directRate = emp?.directRate ?? null;
    const indirectRate = month?.indirectRate ?? null;
    const missingSalary = Boolean(emp?.missingSalary) || (emp == null && month != null);
    const hasProject = projectMap.has(row.refCode);
    const missingPrice =
      isBillable && !hasProject && looksLikePricedWork(row.refCode, row.category, billableSet, projectMap);

    let loadedCost = null;
    if (isBillable && directRate != null && indirectRate != null) {
      loadedCost = row.hours * (directRate + indirectRate);
    } else if (!isBillable) {
      loadedCost = 0;
    }

    return {
      ...row,
      isBillable,
      directRate,
      indirectRate,
      loadedCost,
      missingSalary,
      missingPrice,
      employeeName: row.employeeName ?? emp?.name ?? row.employeeNo,
    };
  });
}

export function rollupProjects(annotatedRows, projectList, billableSet) {
  const projectMap = new Map((projectList ?? []).map((p) => [p.refCode, p]));
  const buckets = new Map();

  const ensure = (refCode, row) => {
    if (!buckets.has(refCode)) {
      const meta = projectMap.get(refCode);
      buckets.set(refCode, {
        refCode,
        name: meta?.name ?? row?.taskName ?? refCode,
        priceAed: meta?.priceAed ?? null,
        salesYear: meta?.salesYear ?? null,
        salesMonth: meta?.salesMonth ?? null,
        category: meta?.category ?? row?.category ?? null,
        status: meta?.status ?? null,
        missingPrice: !meta || meta.priceAed == null,
        hours: 0,
        billableHours: 0,
        costAed: 0,
        costKnown: true,
        hoursByDepartment: new Map(),
        hoursByMonth: new Map(),
        employees: new Map(),
      });
    }
    return buckets.get(refCode);
  };

  for (const row of annotatedRows) {
    if (!looksLikePricedWork(row.refCode, row.category, billableSet, projectMap)) continue;
    const proj = ensure(row.refCode, row);
    const mk = monthKey(row.year, row.month);
    proj.hours += row.hours;
    if (row.isBillable) proj.billableHours += row.hours;
    if (row.loadedCost == null && row.isBillable) proj.costKnown = false;
    else proj.costAed += row.loadedCost ?? 0;

    const dept = row.department || "Unspecified";
    const deptBucket = proj.hoursByDepartment.get(dept) ?? { department: dept, hours: 0, costAed: 0 };
    deptBucket.hours += row.hours;
    deptBucket.costAed += row.loadedCost ?? 0;
    proj.hoursByDepartment.set(dept, deptBucket);

    const monthBucket = proj.hoursByMonth.get(mk) ?? { year: row.year, month: row.month, hours: 0, costAed: 0 };
    monthBucket.hours += row.hours;
    monthBucket.costAed += row.loadedCost ?? 0;
    proj.hoursByMonth.set(mk, monthBucket);

    const emp = proj.employees.get(row.employeeNo) ?? {
      employeeNo: row.employeeNo,
      employeeName: row.employeeName,
      department: row.department,
      designation: row.designation,
      hours: 0,
      billableHours: 0,
      costAed: 0,
      costKnown: true,
      missingSalary: false,
    };
    emp.hours += row.hours;
    if (row.isBillable) emp.billableHours += row.hours;
    if (row.loadedCost == null && row.isBillable) emp.costKnown = false;
    else emp.costAed += row.loadedCost ?? 0;
    emp.missingSalary = emp.missingSalary || row.missingSalary;
    proj.employees.set(row.employeeNo, emp);
  }

  // Priced projects with no timesheet rows still appear.
  for (const meta of projectList ?? []) {
    ensure(meta.refCode, { taskName: meta.name, category: meta.category });
  }

  return [...buckets.values()].map((proj) => {
    const employees = [...proj.employees.values()].map((emp) => {
      const share = ratio(emp.hours, proj.hours);
      const revenueShare = proj.priceAed != null && share != null ? share * proj.priceAed : null;
      const profit = revenueShare != null && emp.costKnown ? revenueShare - emp.costAed : null;
      const profitability = ratio(profit, revenueShare);
      return {
        ...emp,
        revenueShareAed: revenueShare,
        profitAed: profit,
        profitability,
      };
    });
    employees.sort((a, b) => b.hours - a.hours);

    const profitAed = proj.priceAed != null && proj.costKnown ? proj.priceAed - proj.costAed : null;
    const margin = ratio(profitAed, proj.priceAed);

    return {
      refCode: proj.refCode,
      name: proj.name,
      priceAed: proj.priceAed,
      salesYear: proj.salesYear,
      salesMonth: proj.salesMonth,
      category: proj.category,
      status: proj.status,
      missingPrice: proj.missingPrice,
      hours: proj.hours,
      billableHours: proj.billableHours,
      costAed: proj.costKnown ? proj.costAed : null,
      profitAed,
      margin,
      hoursByDepartment: [...proj.hoursByDepartment.values()].sort((a, b) => b.hours - a.hours),
      hoursByMonth: [...proj.hoursByMonth.values()].sort((a, b) => a.year - b.year || a.month - b.month),
      employees,
    };
  });
}

export function inPeriod(row, year, month) {
  if (year != null && row.year !== year) return false;
  if (month != null && row.month !== month) return false;
  return true;
}
