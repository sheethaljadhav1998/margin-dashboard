import XLSX from "xlsx";
import { asEmployeeNo, asNumber, asText, isBlank, normalizeHeader } from "./blanks.js";
import { monthFromName, parseYearMonth, yearFromText } from "./dates.js";

const TIMESHEET_HINTS = ["month", "hours", "employee name", "ref code", "type of expense"];
const SALARY_HINTS = ["employee name", "january", "february", "december"];
const PROJECT_HINTS = ["ref code", "project price", "sales month"];

export class ParseError extends Error {
  constructor(message, extras = {}) {
    super(message);
    this.name = "ParseError";
    this.extras = extras;
  }
}

function sheetMatrix(sheet) {
  return XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: undefined });
}

function headerScore(cells, hints) {
  const labels = cells.map(normalizeHeader).filter(Boolean);
  let score = labels.length;
  for (const hint of hints) {
    if (labels.some((h) => h.includes(hint))) score += 10;
  }
  return score;
}

function findHeaderRow(matrix, hints) {
  let best = { row: 0, score: -1 };
  const scan = Math.min(matrix.length, 20);
  for (let i = 0; i < scan; i++) {
    const score = headerScore(matrix[i] ?? [], hints);
    if (score > best.score) best = { row: i, score };
  }
  return best;
}

function headerIndex(headerCells) {
  const map = new Map();
  headerCells.forEach((cell, i) => {
    const key = normalizeHeader(cell);
    if (key) map.set(key, i);
  });
  const pick = (...needles) => {
    for (const needle of needles) {
      for (const [key, idx] of map) {
        if (key === needle || key.includes(needle)) return idx;
      }
    }
    return -1;
  };
  return { map, pick };
}

function detectKind(matrix) {
  const asTimesheet = findHeaderRow(matrix, TIMESHEET_HINTS);
  const asSalary = findHeaderRow(matrix, SALARY_HINTS);
  const asProjects = findHeaderRow(matrix, PROJECT_HINTS);
  const ranked = [
    { kind: "timesheet", ...asTimesheet },
    { kind: "salary", ...asSalary },
    { kind: "projects", ...asProjects },
  ].sort((a, b) => b.score - a.score);
  return ranked[0];
}

function titleYear(matrix, headerRow, filename) {
  const before = matrix.slice(0, headerRow).flat();
  return yearFromText(...before.map(asText), filename);
}

export function parseWorkbook(bufferOrPath, { filename = "", expectedKind = null } = {}) {
  const workbook =
    Buffer.isBuffer(bufferOrPath) || bufferOrPath instanceof Uint8Array
      ? XLSX.read(bufferOrPath, { type: "buffer", cellDates: false, raw: true })
      : XLSX.readFile(bufferOrPath, { cellDates: false, raw: true });

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new ParseError("Workbook has no sheets", { filename });
  const matrix = sheetMatrix(workbook.Sheets[sheetName]);
  if (!matrix.length) throw new ParseError("Sheet is empty", { filename, sheetName });

  const detected = detectKind(matrix);
  if (detected.score < 15) {
    throw new ParseError("Could not recognise this as a timesheet, salary overview, or project-price file", {
      filename,
      sheetName,
    });
  }
  if (expectedKind && detected.kind !== expectedKind) {
    throw new ParseError(
      `This file looks like a ${detected.kind} spreadsheet, not a ${expectedKind} file`,
      { filename, detected: detected.kind, expected: expectedKind },
    );
  }

  const parsed =
    detected.kind === "timesheet"
      ? parseTimesheet(matrix, detected.row, filename)
      : detected.kind === "salary"
        ? parseSalary(matrix, detected.row, filename)
        : parseProjects(matrix, detected.row, filename);

  return { kind: detected.kind, sheetName, headerRow: detected.row + 1, filename, ...parsed };
}

function parseTimesheet(matrix, headerRow, filename) {
  const { pick } = headerIndex(matrix[headerRow] ?? []);
  const col = {
    month: pick("month"),
    employeeNo: pick("employee no"),
    employeeName: pick("employee name"),
    expenseType: pick("type of expense"),
    department: pick("department"),
    designation: pick("designation"),
    category: pick("category"),
    refCode: pick("ref code"),
    taskName: pick("project (billable) / task", "project / task", "task name", "project name"),
    company: pick("company name", "company"),
    description: pick("description"),
    hours: pick("hours"),
  };
  if (col.month < 0 || col.hours < 0) {
    throw new ParseError("Timesheet is missing Month or Hours columns", { filename });
  }

  const fallbackYear = yearFromText(filename);
  const rows = [];
  const warnings = [];
  const months = new Set();

  for (let r = headerRow + 1; r < matrix.length; r++) {
    const line = matrix[r] ?? [];
    if (line.every(isBlank)) continue;
    const ym = parseYearMonth(line[col.month], fallbackYear);
    const hours = asNumber(line[col.hours]);
    const employeeNo = asEmployeeNo(col.employeeNo >= 0 ? line[col.employeeNo] : null);
    const employeeName = asText(col.employeeName >= 0 ? line[col.employeeName] : null);
    if (!ym) {
      warnings.push({ row: r + 1, message: `Unreadable month: ${asText(line[col.month]) ?? "(blank)"}` });
      continue;
    }
    if (hours == null) {
      warnings.push({ row: r + 1, message: "Missing hours — row skipped" });
      continue;
    }
    if (!employeeNo && !employeeName) {
      warnings.push({ row: r + 1, message: "Missing employee — row skipped" });
      continue;
    }
    months.add(`${ym.year}-${ym.month}`);
    rows.push({
      year: ym.year,
      month: ym.month,
      employeeNo: employeeNo ?? `name:${employeeName}`,
      employeeName: employeeName ?? employeeNo,
      expenseType: asText(col.expenseType >= 0 ? line[col.expenseType] : null) ?? "DL",
      department: asText(col.department >= 0 ? line[col.department] : null),
      designation: asText(col.designation >= 0 ? line[col.designation] : null),
      category: asText(col.category >= 0 ? line[col.category] : null) ?? "Uncategorised",
      refCode: asText(col.refCode >= 0 ? line[col.refCode] : null) ?? "",
      taskName: asText(col.taskName >= 0 ? line[col.taskName] : null),
      company: asText(col.company >= 0 ? line[col.company] : null),
      description: asText(col.description >= 0 ? line[col.description] : null),
      hours,
      sourceRow: r + 1,
    });
  }

  return {
    rows,
    warnings,
    monthsTouched: [...months].map((k) => {
      const [year, month] = k.split("-").map(Number);
      return { year, month };
    }),
  };
}

function parseSalary(matrix, headerRow, filename) {
  const headers = matrix[headerRow] ?? [];
  const { pick } = headerIndex(headers);
  const employeeNoCol = pick("employee no");
  const employeeNameCol = pick("employee name");
  const monthCols = [];
  headers.forEach((cell, i) => {
    const month = monthFromName(cell);
    if (month) monthCols.push({ index: i, month });
  });
  if (employeeNameCol < 0 && employeeNoCol < 0) {
    throw new ParseError("Salary sheet is missing Employee Name / Employee No.", { filename });
  }
  if (!monthCols.length) {
    throw new ParseError("Salary sheet has no month columns", { filename });
  }

  const year = titleYear(matrix, headerRow, filename);
  if (!year) {
    throw new ParseError("Could not tell which year this salary sheet covers", { filename });
  }

  const rows = [];
  const warnings = [];
  const employees = [];

  for (let r = headerRow + 1; r < matrix.length; r++) {
    const line = matrix[r] ?? [];
    if (line.every(isBlank)) continue;
    const employeeNo = asEmployeeNo(employeeNoCol >= 0 ? line[employeeNoCol] : null);
    const employeeName = asText(employeeNameCol >= 0 ? line[employeeNameCol] : null);
    if (!employeeNo && !employeeName) {
      warnings.push({ row: r + 1, message: "Missing employee — row skipped" });
      continue;
    }
    const no = employeeNo ?? `name:${employeeName}`;
    employees.push({ employeeNo: no, name: employeeName ?? no });
    for (const col of monthCols) {
      rows.push({
        employeeNo: no,
        employeeName: employeeName ?? no,
        year,
        month: col.month,
        amountAed: asNumber(line[col.index]),
        sourceRow: r + 1,
      });
    }
  }

  return {
    year,
    rows,
    employees,
    warnings,
    monthsTouched: monthCols.map((c) => ({ year, month: c.month })),
  };
}

function parseProjects(matrix, headerRow, filename) {
  const { pick } = headerIndex(matrix[headerRow] ?? []);
  const col = {
    refCode: pick("ref code"),
    name: pick("project (billable) name", "project name", "name"),
    price: pick("project price", "price"),
    salesMonth: pick("sales month"),
    category: pick("category"),
    status: pick("status"),
  };
  if (col.refCode < 0) throw new ParseError("Project sheet is missing Ref Code", { filename });

  const fallbackYear = yearFromText(filename);
  const rows = [];
  const warnings = [];
  const months = new Set();

  for (let r = headerRow + 1; r < matrix.length; r++) {
    const line = matrix[r] ?? [];
    if (line.every(isBlank)) continue;
    const refCode = asText(line[col.refCode]);
    if (!refCode) {
      warnings.push({ row: r + 1, message: "Missing ref code — row skipped" });
      continue;
    }
    const ym = col.salesMonth >= 0 ? parseYearMonth(line[col.salesMonth], fallbackYear) : null;
    if (col.salesMonth >= 0 && line[col.salesMonth] != null && !isBlank(line[col.salesMonth]) && !ym) {
      warnings.push({ row: r + 1, message: `Unreadable sales month: ${asText(line[col.salesMonth])}` });
    }
    if (ym) months.add(`${ym.year}-${ym.month}`);
    rows.push({
      refCode,
      name: asText(col.name >= 0 ? line[col.name] : null) ?? refCode,
      priceAed: asNumber(col.price >= 0 ? line[col.price] : null),
      salesYear: ym?.year ?? null,
      salesMonth: ym?.month ?? null,
      category: asText(col.category >= 0 ? line[col.category] : null),
      status: asText(col.status >= 0 ? line[col.status] : null),
      sourceRow: r + 1,
    });
  }

  return {
    rows,
    warnings,
    monthsTouched: [...months].map((k) => {
      const [year, month] = k.split("-").map(Number);
      return { year, month };
    }),
  };
}
