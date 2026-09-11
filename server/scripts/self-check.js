#!/usr/bin/env node
/**
 * Load the sample year, compute with overhead = 0, and assert
 * company-wide total cost equals total salaries to the dirham.
 */
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import XLSX from "xlsx";
import { computeModel, selfCheck } from "../calc/index.js";
import { ingestFile, ingestSampleDir } from "../ingest/index.js";
import { closeDb, openDb } from "../src/db.js";
import { loadCalcInput } from "../src/load.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const SAMPLE = path.join(ROOT, "data/sample");

function banner(title) {
  const line = "=".repeat(72);
  return `\n${line}\n${title}\n${line}`;
}

function buildMarchOnlyTimesheet() {
  const wb = XLSX.utils.book_new();
  const aoa = [
    [
      "Month",
      "Employee No.",
      "Employee Name",
      "Type of Expense",
      "Department",
      "Designation",
      "Category",
      "Ref Code",
      "Project (Billable) / Task (Unbillable) Name",
      "Company Name (Billable)/ Fixed Costs (Unbillable)",
      "Description",
      "Hours",
    ],
    [
      "March 2025",
      "10201",
      "Ayesha Rahman",
      "DL",
      "Design",
      "Senior UI/UX Designer",
      "Projects",
      "Q2025001a",
      "Meridian",
      "Meridian Group",
      "correction",
      40,
    ],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "Timesheet");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

function main() {
  console.log(banner("MARGIN DASHBOARD — SELF-CHECK"));

  const db = openDb(":memory:");
  const ingested = ingestSampleDir(db, SAMPLE);
  for (const item of ingested) {
    console.log(
      `ingested ${item.kind}: ${item.rows} rows, header row ${item.headerRow}, months ${item.monthsTouched.map((m) => `${m.year}-${String(m.month).padStart(2, "0")}`).join(", ") || "—"}`,
    );
    for (const w of item.warnings) console.log(`  warning r${w.row}: ${w.message}`);
  }

  const input = loadCalcInput(db);
  console.log(
    `\nloaded  timesheet=${input.timesheet.length}  salaries=${input.salaries.length}  projects=${input.projects.length}`,
  );
  console.log(`billable categories: ${input.billableCategories.join(", ")}`);
  console.log("overhead: all months 0 (none stored)");

  const model = computeModel(input);
  const check = selfCheck(model, { year: 2025 });

  console.log(banner("2025 TOTALS (overhead = 0)"));
  console.log(`total hours:           ${check.totalHours}`);
  console.log(`billable hours:        ${check.billableHours}`);
  console.log(`total salaries (AED):  ${check.totalSalariesAed.toFixed(2)}`);
  console.log(`overhead (AED):        ${check.overheadAed.toFixed(2)}`);
  console.log(`total cost (AED):      ${check.totalCostAed.toFixed(2)}`);
  console.log(`expected cost (AED):   ${check.expectedCostAed.toFixed(2)}`);
  console.log(`difference (AED):      ${check.differenceAed.toFixed(2)}`);
  console.log(`identity holds:        ${check.pass ? "YES" : "NO"}`);

  console.log("\nPer-month identity:");
  for (const month of model.months) {
    const loaded = model.rows
      .filter((r) => r.year === month.year && r.month === month.month)
      .reduce((n, r) => n + (r.loadedCost ?? 0), 0);
    const cost = loaded + month.unallocatedPool;
    const diff = cost - month.totalSalaries;
    const ok = Math.abs(Math.round(diff * 100) / 100) < 0.005;
    console.log(
      `  ${month.key}  salaries=${month.totalSalaries.toFixed(2)}  cost=${cost.toFixed(2)}  billableH=${month.billableHours}  indirectRate=${month.indirectRate == null ? "n/a" : month.indirectRate.toFixed(4)}  ${ok ? "ok" : "FAIL"}`,
    );
  }

  console.log("\nProjects:");
  for (const p of model.projects) {
    const marginPct = p.margin == null ? "n/a" : `${(p.margin * 100).toFixed(1)}%`;
    console.log(
      `  ${p.refCode.padEnd(12)}  price=${String(p.priceAed ?? "—").padStart(8)}  cost=${p.costAed == null ? "—" : p.costAed.toFixed(0).padStart(8)}  hours=${String(p.hours).padStart(7)}  margin=${marginPct}${p.missingPrice ? "  MISSING PRICE" : ""}`,
    );
  }

  if (model.issues.length) {
    console.log(`\nIssues (${model.issues.length}):`);
    for (const issue of model.issues.slice(0, 20)) {
      console.log(`  ${issue.type}  ${issue.employeeNo ?? issue.refCode}  ${issue.year ?? ""}-${issue.month ?? ""}`);
    }
  } else {
    console.log("\nIssues: none");
  }

  const janBefore = db.prepare("SELECT COUNT(*) AS n FROM timesheet_entries WHERE year=2025 AND month=1").get().n;
  const marBefore = db.prepare("SELECT COUNT(*) AS n FROM timesheet_entries WHERE year=2025 AND month=3").get().n;
  ingestFile(db, buildMarchOnlyTimesheet(), { expectedKind: "timesheet", filename: "march-correction.xlsx" });
  const janAfter = db.prepare("SELECT COUNT(*) AS n FROM timesheet_entries WHERE year=2025 AND month=1").get().n;
  const marAfter = db.prepare("SELECT COUNT(*) AS n FROM timesheet_entries WHERE year=2025 AND month=3").get().n;
  console.log(banner("RE-UPLOAD (March only)"));
  console.log(`January rows before/after: ${janBefore} / ${janAfter}`);
  console.log(`March rows before/after:   ${marBefore} / ${marAfter}`);

  assert.equal(janAfter, janBefore, "January must be untouched by a March re-upload");
  assert.equal(marAfter, 1, "March must be replaced by the corrected file");
  assert.equal(check.pass, true, "total cost must equal total salaries when overhead is 0");
  assert.ok(Math.abs(check.differenceAed) < 0.005);

  closeDb(db);
  console.log(banner("SELF-CHECK PASSED"));
}

main();
