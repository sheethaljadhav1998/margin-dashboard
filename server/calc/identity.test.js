import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeModel, selfCheck } from "./index.js";

describe("cost identity (overhead = 0 ⇒ total cost = total salaries)", () => {
  it("loads support-staff salary onto billable hours", () => {
    const model = computeModel({
      billableCategories: ["Projects"],
      overhead: [],
      salaries: [
        { employeeNo: "A", employeeName: "Alice", year: 2025, month: 1, amountAed: 1000 },
        { employeeNo: "B", employeeName: "Bob", year: 2025, month: 1, amountAed: 500 },
      ],
      timesheet: [
        { year: 2025, month: 1, employeeNo: "A", employeeName: "Alice", category: "Projects", refCode: "Q1", department: "Design", hours: 8 },
        { year: 2025, month: 1, employeeNo: "A", employeeName: "Alice", category: "FC - Leaves", refCode: "FC - Leaves", department: "Design", hours: 2 },
      ],
      projects: [{ refCode: "Q1", name: "One", priceAed: 3000 }],
    });

    const month = model.months[0];
    assert.equal(month.employees.get("A").directRate, 100);
    assert.equal(month.indirectPool, 700);
    assert.equal(month.indirectRate, 87.5);

    const aliceCost = model.rows.find((r) => r.refCode === "Q1").loadedCost;
    assert.equal(aliceCost, 8 * (100 + 87.5));

    const check = selfCheck(model, { year: 2025 });
    assert.equal(check.pass, true);
    assert.equal(check.totalCostAed, 1500);
    assert.equal(check.totalSalariesAed, 1500);
  });

  it("does not let missing salaries break the identity", () => {
    const model = computeModel({
      billableCategories: ["Projects"],
      overhead: [],
      salaries: [{ employeeNo: "A", employeeName: "Alice", year: 2025, month: 1, amountAed: 1000 }],
      timesheet: [
        { year: 2025, month: 1, employeeNo: "A", employeeName: "Alice", category: "Projects", refCode: "Q1", hours: 10 },
        { year: 2025, month: 1, employeeNo: "Z", employeeName: "Ghost", category: "Projects", refCode: "Q1", hours: 5 },
      ],
      projects: [{ refCode: "Q1", name: "One", priceAed: 100 }],
    });
    const check = selfCheck(model, { year: 2025 });
    assert.equal(check.pass, true);
    assert.equal(check.totalCostAed, 1000);
    assert.ok(model.issues.some((i) => i.type === "missing_salary" && i.employeeNo === "Z"));
  });
});
