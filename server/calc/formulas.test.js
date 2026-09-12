import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  categoriesView,
  computeModel,
  dashboardView,
  departmentView,
  departmentsView,
  productivityView,
  projectView,
  selfCheck,
} from "./index.js";
import { aedEqual, roundAed } from "./round.js";

/**
 * Worked example (January 2025):
 *   Alice  2000 salary · 10h Projects Q1 + 5h leave     direct = 2000/15
 *   Bob    1000 salary · 0h  (support)                  whole salary → pool
 *   Carol  1500 salary · 10h Projects Q1                direct = 150
 *   overhead 300
 *
 *   non-billable value = 5 × (2000/15) = 2000/3
 *   pool = 1000 + 2000/3 + 300 = 5900/3
 *   billable hours = 20
 *   indirect = 295/3
 *   loaded cost = 4800 = salaries 4500 + overhead 300
 */
function fixture(overrides = {}) {
  return computeModel({
    billableCategories: ["Projects"],
    overhead: [{ year: 2025, month: 1, amountAed: 300 }],
    salaries: [
      { employeeNo: "A", employeeName: "Alice", year: 2025, month: 1, amountAed: 2000 },
      { employeeNo: "B", employeeName: "Bob", year: 2025, month: 1, amountAed: 1000 },
      { employeeNo: "C", employeeName: "Carol", year: 2025, month: 1, amountAed: 1500 },
    ],
    timesheet: [
      {
        year: 2025,
        month: 1,
        employeeNo: "A",
        employeeName: "Alice",
        department: "Design",
        designation: "Designer",
        category: "Projects",
        refCode: "Q1",
        hours: 10,
      },
      {
        year: 2025,
        month: 1,
        employeeNo: "A",
        employeeName: "Alice",
        department: "Design",
        designation: "Designer",
        category: "FC - Leaves",
        refCode: "FC - Leaves",
        hours: 5,
      },
      {
        year: 2025,
        month: 1,
        employeeNo: "C",
        employeeName: "Carol",
        department: "Backend",
        designation: "Engineer",
        category: "Projects",
        refCode: "Q1",
        hours: 10,
      },
    ],
    projects: [{ refCode: "Q1", name: "One", priceAed: 10000, category: "Projects", status: "in progress" }],
    ...overrides,
  });
}

describe("cost formulas", () => {
  it("computes direct rate as salary ÷ hours that month", () => {
    const month = fixture().months[0];
    assert.equal(month.employees.get("A").directRate, 2000 / 15);
    assert.equal(month.employees.get("C").directRate, 150);
    assert.equal(month.employees.get("B").directRate, null);
    assert.equal(month.employees.get("B").support, true);
  });

  it("builds the indirect pool from support salaries + non-billable time + overhead", () => {
    const month = fixture().months[0];
    assert.equal(month.supportSalaries, 1000);
    assert.equal(month.nonBillableValue, 5 * (2000 / 15));
    assert.equal(month.overheadAed, 300);
    assert.equal(
      month.indirectPool,
      month.supportSalaries + month.nonBillableValue + month.overheadAed,
    );
    assert.ok(aedEqual(month.indirectPool, 1000 + 5 * (2000 / 15) + 300));
  });

  it("computes indirect rate as pool ÷ costable billable hours", () => {
    const month = fixture().months[0];
    assert.equal(month.costableBillableHours, 20);
    assert.equal(month.indirectRate, month.indirectPool / month.costableBillableHours);
    assert.ok(aedEqual(month.indirectRate, (1000 + 5 * (2000 / 15) + 300) / 20));
  });

  it("costs a project hour as hours × (direct + indirect)", () => {
    const alice = fixture().rows.find((r) => r.employeeNo === "A" && r.refCode === "Q1");
    const carol = fixture().rows.find((r) => r.employeeNo === "C" && r.refCode === "Q1");
    assert.equal(alice.loadedCost, 10 * (alice.directRate + alice.indirectRate));
    assert.equal(carol.loadedCost, 10 * (carol.directRate + carol.indirectRate));
    assert.ok(aedEqual(alice.loadedCost, 10 * (2000 / 15 + (1000 + 5 * (2000 / 15) + 300) / 20)));
    assert.ok(aedEqual(carol.loadedCost, 10 * (150 + (1000 + 5 * (2000 / 15) + 300) / 20)));
  });

  it("adds overhead into company cost (cost = salaries + overhead)", () => {
    const check = selfCheck(fixture(), { year: 2025 });
    assert.equal(check.pass, true);
    assert.equal(check.totalSalariesAed, 4500);
    assert.equal(check.overheadAed, 300);
    assert.equal(check.totalCostAed, 4800);
  });

  it("still equals salaries alone when overhead is 0", () => {
    const model = fixture({ overhead: [] });
    const check = selfCheck(model, { year: 2025 });
    assert.equal(check.pass, true);
    assert.equal(check.totalCostAed, 4500);
    assert.equal(check.overheadAed, 0);
  });

  it("splits project revenue by hours and computes employee profitability", () => {
    const proj = projectView(fixture(), "Q1");
    assert.ok(proj);
    const alice = proj.employees.find((e) => e.employeeNo === "A");
    const carol = proj.employees.find((e) => e.employeeNo === "C");
    assert.equal(alice.hours, 10);
    assert.equal(carol.hours, 10);
    assert.equal(alice.revenueShareAed, 5000);
    assert.equal(carol.revenueShareAed, 5000);

    const aliceCost = 10 * (2000 / 15 + 295 / 3);
    const carolCost = 10 * (150 + 295 / 3);
    assert.ok(aedEqual(alice.costAed, aliceCost));
    assert.ok(aedEqual(carol.costAed, carolCost));
    assert.ok(aedEqual(alice.profitAed, 5000 - aliceCost));
    assert.ok(aedEqual(alice.profitability, (5000 - aliceCost) / 5000));
  });

  it("computes project profitability as (price − cost) ÷ price", () => {
    const proj = projectView(fixture(), "Q1");
    const cost = 10 * (2000 / 15 + 295 / 3) + 10 * (150 + 295 / 3);
    assert.ok(aedEqual(proj.costAed, cost));
    assert.equal(proj.priceAed, 10000);
    assert.ok(aedEqual(proj.profitAed, 10000 - cost));
    assert.ok(aedEqual(proj.margin, (10000 - cost) / 10000));
  });

  it("computes productivity as billable ÷ total hours", () => {
    const rows = productivityView(fixture(), { year: 2025, month: 1 });
    const byNo = Object.fromEntries(rows.map((r) => [r.employeeNo, r]));
    assert.equal(byNo.A.productivity, 10 / 15);
    assert.equal(byNo.C.productivity, 1);
    assert.equal(byNo.B.totalHours, 0);
    assert.equal(byNo.B.productivity, null);
  });

  it("flags a missing salary without inventing a rate", () => {
    const model = computeModel({
      billableCategories: ["Projects"],
      overhead: [],
      salaries: [{ employeeNo: "A", employeeName: "Alice", year: 2025, month: 1, amountAed: 900 }],
      timesheet: [
        { year: 2025, month: 1, employeeNo: "A", employeeName: "Alice", category: "Projects", refCode: "Q1", hours: 9 },
        { year: 2025, month: 1, employeeNo: "Z", employeeName: "Ghost", category: "Projects", refCode: "Q1", hours: 3 },
      ],
      projects: [{ refCode: "Q1", name: "One", priceAed: 100 }],
    });
    assert.equal(model.months[0].employees.get("Z").directRate, null);
    assert.ok(model.issues.some((i) => i.type === "missing_salary" && i.employeeNo === "Z"));
    assert.equal(selfCheck(model, { year: 2025 }).pass, true);
    assert.equal(selfCheck(model, { year: 2025 }).totalCostAed, 900);
  });

  it("flags billable hours on a ref code with no price", () => {
    const model = computeModel({
      billableCategories: ["Projects"],
      overhead: [],
      salaries: [{ employeeNo: "A", employeeName: "Alice", year: 2025, month: 1, amountAed: 1000 }],
      timesheet: [
        {
          year: 2025,
          month: 1,
          employeeNo: "A",
          employeeName: "Alice",
          category: "Projects",
          refCode: "Q-MISSING",
          hours: 10,
        },
      ],
      projects: [],
    });
    assert.ok(model.issues.some((i) => i.type === "missing_price" && i.refCode === "Q-MISSING"));
    const proj = projectView(model, "Q-MISSING");
    assert.equal(proj.missingPrice, true);
    assert.equal(proj.priceAed, null);
    assert.equal(proj.margin, null);
  });

  it("does not treat FC / Tentwenty ref codes as unpriced projects", () => {
    const model = fixture();
    assert.equal(
      model.issues.some((i) => i.type === "missing_price" && String(i.refCode).startsWith("FC")),
      false,
    );
  });
});

describe("filtered views", () => {
  it("dashboard period revenue is price × (period hours / lifetime hours)", () => {
    const twoMonths = computeModel({
      billableCategories: ["Projects"],
      overhead: [],
      salaries: [
        { employeeNo: "A", employeeName: "Alice", year: 2025, month: 1, amountAed: 1000 },
        { employeeNo: "A", employeeName: "Alice", year: 2025, month: 2, amountAed: 1000 },
      ],
      timesheet: [
        { year: 2025, month: 1, employeeNo: "A", employeeName: "Alice", category: "Projects", refCode: "Q1", hours: 10 },
        { year: 2025, month: 2, employeeNo: "A", employeeName: "Alice", category: "Projects", refCode: "Q1", hours: 30 },
      ],
      projects: [{ refCode: "Q1", name: "One", priceAed: 4000 }],
    });
    const jan = dashboardView(twoMonths, { year: 2025, month: 1 });
    const q1 = jan.projects.find((p) => p.refCode === "Q1");
    assert.equal(q1.hours, 10);
    assert.equal(q1.revenueAed, 4000 * (10 / 40));
    assert.ok(aedEqual(jan.costAed, 1000));
  });

  it("rolls hours and cost by category and department", () => {
    const model = fixture();
    const cats = categoriesView(model, { year: 2025, month: 1 });
    const projects = cats.find((c) => c.category === "Projects");
    const leave = cats.find((c) => c.category === "FC - Leaves");
    assert.equal(projects.hours, 20);
    assert.equal(projects.isBillable, true);
    assert.equal(leave.hours, 5);
    assert.equal(leave.isBillable, false);
    assert.ok(aedEqual(projects.share, 20 / 25));

    const depts = departmentsView(model, { year: 2025, month: 1 });
    const design = depts.find((d) => d.department === "Design");
    assert.equal(design.hours, 15);
    assert.equal(design.billableHours, 10);
    assert.ok(aedEqual(design.directCostAed, 15 * (2000 / 15)));

    const people = departmentView(model, "Design", { year: 2025, month: 1 });
    assert.equal(people.employees.length, 1);
    assert.equal(people.employees[0].employeeNo, "A");
    assert.equal(people.employees[0].productivity, 10 / 15);
  });

  it("returns null for an unknown project", () => {
    assert.equal(projectView(fixture(), "NOPE"), null);
  });
});

describe("rounding", () => {
  it("compares money to the dirham", () => {
    assert.equal(roundAed(1.234), 1.23);
    assert.equal(roundAed(-0), 0);
    assert.equal(aedEqual(2400000.001, 2400000), true);
    assert.equal(aedEqual(10, 11), false);
  });
});
