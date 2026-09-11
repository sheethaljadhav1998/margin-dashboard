import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseYearMonth, yearFromText } from "./dates.js";
import { asEmployeeNo, isBlank } from "./blanks.js";

describe("date parsing", () => {
  it("reads the three formats the brief warns about plus the sample files", () => {
    assert.deepEqual(parseYearMonth("January 2025"), { year: 2025, month: 1 });
    assert.deepEqual(parseYearMonth("January '25"), { year: 2025, month: 1 });
    assert.deepEqual(parseYearMonth("May '25"), { year: 2025, month: 5 });
    assert.deepEqual(parseYearMonth("January 2026"), { year: 2026, month: 1 });
    assert.deepEqual(parseYearMonth("January", 2025), { year: 2025, month: 1 });
    assert.deepEqual(parseYearMonth("Nov '25"), { year: 2025, month: 11 });
  });

  it("pulls a year out of a salary title or filename", () => {
    assert.equal(yearFromText("Salary Overview 2025 (AED)"), 2025);
    assert.equal(yearFromText("salaries-2025.xlsx"), 2025);
  });
});

describe("blanks", () => {
  it("treats dashes as empty", () => {
    assert.equal(isBlank("-"), true);
    assert.equal(isBlank("–"), true);
    assert.equal(isBlank("  "), true);
    assert.equal(isBlank("18000"), false);
  });

  it("keeps leading zeros on employee numbers", () => {
    assert.equal(asEmployeeNo("00101"), "00101");
    assert.equal(asEmployeeNo(10201), "10201");
  });
});
