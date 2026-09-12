import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import XLSX from "xlsx";
import { ingestFile, ingestSampleDir } from "../ingest/index.js";
import { closeDb, openDb } from "./db.js";
import { createApp } from "./app.js";
import { parsePeriod, toCsv } from "./http.js";

const SAMPLE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../data/sample");

function listen(app) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ server, base: `http://127.0.0.1:${port}` });
    });
    server.on("error", reject);
  });
}

async function json(base, pathAndQuery, options = {}) {
  const res = await fetch(`${base}${pathAndQuery}`, options);
  const body = await res.json().catch(() => ({}));
  return { res, body };
}

function marchTimesheetBuffer() {
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

describe("parsePeriod", () => {
  it("treats missing or 'all' as no filter", () => {
    assert.deepEqual(parsePeriod({}), { year: null, month: null });
    assert.deepEqual(parsePeriod({ year: "all", month: "all" }), { year: null, month: null });
    assert.deepEqual(parsePeriod({ year: "2025", month: "3" }), { year: 2025, month: 3 });
  });

  it("rejects an impossible month", () => {
    assert.throws(() => parsePeriod({ month: "13" }), { status: 400 });
  });
});

describe("toCsv", () => {
  it("quotes commas and quotes", () => {
    const csv = toCsv(
      [
        { key: "name", label: "Name" },
        { key: "value", label: "Value" },
      ],
      [{ name: 'Harbourline, "Ports"', value: 1 }],
    );
    assert.match(csv, /"Harbourline, ""Ports"""/);
  });
});

describe("API endpoints (sample 2025)", () => {
  let db;
  let server;
  let base;

  before(async () => {
    db = openDb(":memory:");
    ingestSampleDir(db, SAMPLE);
    ({ server, base } = await listen(createApp(db)));
  });

  after(() => {
    server.close();
    closeDb(db);
  });

  it("GET /api/health", async () => {
    const { res, body } = await json(base, "/api/health");
    assert.equal(res.status, 200);
    assert.equal(body.ok, true);
  });

  it("GET /api/dashboard?year=2025 reconciles cost to salaries", async () => {
    const { res, body } = await json(base, "/api/dashboard?year=2025");
    assert.equal(res.status, 200);
    assert.equal(body.year, 2025);
    assert.equal(body.totalHours, 19815.2);
    assert.equal(body.billableHours, 15265.6);
    assert.equal(body.costAed, 2400000);
    assert.equal(body.totalSalaries, 2400000);
    assert.equal(body.projects.length, 11);
    assert.equal(body.issues.length, 0);
    assert.deepEqual(body.filters.years, [2025]);
  });

  it("GET /api/dashboard?year=2025&month=1 is January only", async () => {
    const { body } = await json(base, "/api/dashboard?year=2025&month=1");
    assert.equal(body.month, 1);
    assert.equal(body.totalSalaries, 197000);
    assert.equal(body.costAed, 197000);
    assert.ok(body.totalHours < 19815.2);
  });

  it("GET /api/dashboard rejects month=13", async () => {
    const { res, body } = await json(base, "/api/dashboard?month=13");
    assert.equal(res.status, 400);
    assert.match(body.error, /month/);
  });

  it("GET /api/projects lists priced work", async () => {
    const { res, body } = await json(base, "/api/projects?year=2025");
    assert.equal(res.status, 200);
    assert.equal(body.length, 11);
    assert.ok(body.every((p) => p.refCode && "costAed" in p && "margin" in p));
    const meridian = body.find((p) => p.refCode === "Q2025001a");
    assert.equal(meridian.priceAed, 560000);
    assert.equal(meridian.missingPrice, false);
  });

  it("GET /api/projects/:refCode returns department and employee tables", async () => {
    const { res, body } = await json(base, "/api/projects/Q2025001a");
    assert.equal(res.status, 200);
    assert.equal(body.refCode, "Q2025001a");
    assert.equal(body.priceAed, 560000);
    assert.ok(body.hoursByDepartment.length);
    assert.ok(body.employees.length);
    const emp = body.employees[0];
    assert.ok("revenueShareAed" in emp);
    assert.ok("profitability" in emp);
    const shares = body.employees.reduce((n, e) => n + (e.revenueShareAed ?? 0), 0);
    assert.ok(Math.abs(shares - body.priceAed) < 1);
  });

  it("GET /api/projects/:refCode 404s for an unknown code", async () => {
    const { res, body } = await json(base, "/api/projects/NOPE");
    assert.equal(res.status, 404);
    assert.match(body.error, /NOPE/);
  });

  it("GET /api/productivity is billable ÷ total per employee", async () => {
    const { res, body } = await json(base, "/api/productivity?year=2025");
    assert.equal(res.status, 200);
    assert.equal(body.length, 12);
    assert.ok(body.every((e) => e.employeeNo && e.totalHours >= 0));
    const hana = body.find((e) => e.employeeNo === "00101");
    assert.equal(hana.employeeName, "Hana Yousef");
    assert.equal(hana.billableHours, 0);
    assert.equal(hana.productivity, 0);
    const ayesha = body.find((e) => e.employeeNo === "10201");
    assert.ok(ayesha.productivity > 0 && ayesha.productivity <= 1);
    assert.equal(ayesha.employeeNo, "10201");
  });

  it("GET /api/categories includes billable and FC buckets", async () => {
    const { body } = await json(base, "/api/categories?year=2025");
    const names = body.map((c) => c.category);
    assert.ok(names.includes("Projects"));
    assert.ok(names.includes("FC - Leaves"));
    assert.ok(names.includes("Tentwenty"));
    const projects = body.find((c) => c.category === "Projects");
    assert.equal(projects.isBillable, true);
    const shares = body.reduce((n, c) => n + c.share, 0);
    assert.ok(Math.abs(shares - 1) < 0.01);
  });

  it("GET /api/departments and drill-down", async () => {
    const { body: list } = await json(base, "/api/departments?year=2025");
    assert.ok(list.find((d) => d.department === "Design"));
    const management = list.find((d) => d.department === "Management");
    assert.equal(management.billableHours, 0);
    assert.equal(management.costAed, 0);
    assert.ok(management.directCostAed > 0);

    const { res, body } = await json(base, "/api/departments/Design?year=2025");
    assert.equal(res.status, 200);
    assert.equal(body.department, "Design");
    assert.ok(body.employees.length >= 2);
    assert.ok(body.employees.every((e) => e.employeeName));
  });

  it("GET /api/settings returns defaults", async () => {
    const { body } = await json(base, "/api/settings");
    const billable = body.billableCategories.filter((c) => c.isBillable).map((c) => c.category);
    assert.deepEqual(billable.sort(), ["Enhancements", "Hosting", "Projects"]);
    assert.ok(body.knownCategories.includes("FC - Meetings"));
  });

  it("GET /api/export/projects.csv is a CSV of projects", async () => {
    const res = await fetch(`${base}/api/export/projects?year=2025`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type"), /csv/);
    const text = await res.text();
    assert.match(text, /Ref Code/);
    assert.match(text, /Q2025001a/);
  });

  it("GET /api/export/unknown is 404", async () => {
    const { res } = await json(base, "/api/export/nope");
    assert.equal(res.status, 404);
  });
});

describe("API settings write", () => {
  let db;
  let server;
  let base;

  before(async () => {
    db = openDb(":memory:");
    ingestSampleDir(db, SAMPLE);
    ({ server, base } = await listen(createApp(db)));
  });

  after(() => {
    server.close();
    closeDb(db);
  });

  it("PUT /api/settings updates billable categories and overhead", async () => {
    const { res, body } = await json(base, "/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        billableCategories: ["Projects"],
        overhead: [{ year: 2025, month: 1, amountAed: 1000 }],
      }),
    });
    assert.equal(res.status, 200);
    assert.deepEqual(
      body.billableCategories.filter((c) => c.isBillable).map((c) => c.category),
      ["Projects"],
    );
    assert.equal(body.overhead[0].amountAed, 1000);

    const dash = await json(base, "/api/dashboard?year=2025&month=1");
    assert.equal(dash.body.overheadAed, 1000);
    assert.equal(dash.body.costAed, dash.body.totalSalaries + 1000);
  });
});

describe("API upload", () => {
  let db;
  let server;
  let base;

  before(async () => {
    db = openDb(":memory:");
    ingestSampleDir(db, SAMPLE);
    ({ server, base } = await listen(createApp(db)));
  });

  after(() => {
    server.close();
    closeDb(db);
  });

  it("POST /api/upload with no files is 400", async () => {
    const form = new FormData();
    const res = await fetch(`${base}/api/upload`, { method: "POST", body: form });
    assert.equal(res.status, 400);
  });

  it("rejects a salary workbook in the timesheet slot", async () => {
    const form = new FormData();
    const buf = fs.readFileSync(path.join(SAMPLE, "salaries-2025.xlsx"));
    form.append("timesheet", new Blob([buf]), "salaries-2025.xlsx");
    const res = await fetch(`${base}/api/upload`, { method: "POST", body: form });
    const body = await res.json();
    assert.equal(res.status, 400);
    assert.equal(body.detected, "salary");
    assert.equal(body.expected, "timesheet");
  });

  it("re-uploads March without touching January", async () => {
    const before = await json(base, "/api/dashboard?year=2025&month=1");
    const janHours = before.body.totalHours;

    const form = new FormData();
    form.append("timesheet", new Blob([marchTimesheetBuffer()]), "march-correction.xlsx");
    const res = await fetch(`${base}/api/upload`, { method: "POST", body: form });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.ingested[0].kind, "timesheet");
    assert.equal(body.ingested[0].rows, 1);

    const jan = await json(base, "/api/dashboard?year=2025&month=1");
    assert.equal(jan.body.totalHours, janHours);

    const mar = await json(base, "/api/dashboard?year=2025&month=3");
    assert.equal(mar.body.totalHours, 40);
  });
});
