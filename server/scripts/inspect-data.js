#!/usr/bin/env node
/**
 * Phase 1 data inspection — load the three sample workbooks and print
 * structure, headers, date formats, blank/"-" handling, and join-key stats.
 * No ingestion, no calculations, no persistence.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import XLSX from "xlsx";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE_DIR = path.resolve(__dirname, "../../data/sample");

const HEADER_HINTS = [
  "month",
  "employee no",
  "employee no.",
  "employee name",
  "type of expense",
  "department",
  "designation",
  "category",
  "ref code",
  "project / task name",
  "project name",
  "project price",
  "sales month",
  "hours",
  "status",
  "company",
  "january",
];

const DATE_HEADER_HINTS = ["month", "sales month"];

const MONTH_NAME =
  /^(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/i;

function banner(title) {
  const line = "=".repeat(78);
  return `\n${line}\n${title}\n${line}`;
}

function subBanner(title) {
  return `\n--- ${title} ${"-".repeat(Math.max(0, 70 - title.length))}`;
}

function cellAddress(r, c) {
  return XLSX.utils.encode_cell({ r, c });
}

function preview(value, max = 80) {
  if (value === undefined) return "<undefined>";
  if (value === null) return "<null>";
  const text =
    typeof value === "string"
      ? JSON.stringify(value)
      : value instanceof Date
        ? value.toISOString()
        : typeof value === "number"
          ? String(value)
          : JSON.stringify(value);
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function classifyEmpty(value) {
  if (value === undefined || value === null) return "missing";
  if (typeof value === "string") {
    if (value === "") return "empty-string";
    if (value.trim() === "") return "whitespace";
    if (value.trim() === "-") return "dash";
    if (value.trim() === "–" || value.trim() === "—") return "dash-unicode";
    return "value";
  }
  return "value";
}

function isLikelyDateHeader(header) {
  const h = String(header ?? "")
    .trim()
    .toLowerCase();
  // Only actual date *values* (Month / Sales month). Salary sheets use
  // month names as column headers for amounts — those are not dates.
  return DATE_HEADER_HINTS.includes(h);
}

function normalizeHeader(value) {
  if (value === undefined || value === null) return "";
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  return String(value).trim();
}

function detectHeaderRow(sheet, range) {
  let best = { row: range.s.r, score: -1, headers: [] };
  const scanTo = Math.min(range.s.r + 15, range.e.r);

  for (let r = range.s.r; r <= scanTo; r++) {
    const values = [];
    let nonEmpty = 0;
    let hintHits = 0;
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = sheet[cellAddress(r, c)];
      const raw = cell?.w ?? cell?.v;
      const header = normalizeHeader(raw);
      values.push(header);
      if (header) {
        nonEmpty += 1;
        const lower = header.toLowerCase();
        if (HEADER_HINTS.some((hint) => lower.includes(hint))) hintHits += 2;
      }
    }
    const score = hintHits * 10 + nonEmpty;
    if (score > best.score) {
      best = { row: r, score, headers: values };
    }
  }
  return best;
}

function sheetMeta(sheet) {
  const ref = sheet["!ref"] ?? "A1";
  const range = XLSX.utils.decode_range(ref);
  const merges = sheet["!merges"] ?? [];
  const cols = sheet["!cols"] ?? [];
  const rows = sheet["!rows"] ?? [];
  return { ref, range, merges, cols, rows };
}

function collectColumnStats(sheet, range, headerRow, headers) {
  const stats = headers.map((header, idx) => ({
    index: idx,
    letter: XLSX.utils.encode_col(range.s.c + idx),
    header: header || `(blank col ${idx + 1})`,
    types: {},
    emptiness: {},
    numberFormats: {},
    unique: new Map(),
    formulaCount: 0,
    sampleValues: [],
    isDateLike: isLikelyDateHeader(header),
  }));

  for (let r = headerRow + 1; r <= range.e.r; r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const col = stats[c - range.s.c];
      if (!col) continue;
      const addr = cellAddress(r, c);
      const cell = sheet[addr];
      const type = cell?.t ?? "z";
      col.types[type] = (col.types[type] ?? 0) + 1;
      const emptiness = classifyEmpty(cell?.v);
      col.emptiness[emptiness] = (col.emptiness[emptiness] ?? 0) + 1;
      if (cell?.z) {
        col.numberFormats[cell.z] = (col.numberFormats[cell.z] ?? 0) + 1;
      }
      if (cell?.f) col.formulaCount += 1;

      const raw = cell?.v;
      const formatted = cell?.w;
      const key = JSON.stringify({
        t: type,
        v: raw instanceof Date ? raw.toISOString() : raw,
        w: formatted,
        z: cell?.z,
      });
      if (!col.unique.has(key)) {
        col.unique.set(key, {
          count: 0,
          row: r + 1,
          type,
          raw,
          formatted,
          numberFormat: cell?.z,
          formula: cell?.f,
        });
      }
      col.unique.get(key).count += 1;

      if (col.sampleValues.length < 8 && emptiness === "value") {
        col.sampleValues.push({
          row: r + 1,
          type,
          raw,
          formatted,
          numberFormat: cell?.z,
        });
      }
    }
  }
  return stats;
}

function printWorkbook(filePath) {
  const name = path.basename(filePath);
  const size = fs.statSync(filePath).size;
  console.log(banner(`FILE: ${name}`));
  console.log(`path: ${filePath}`);
  console.log(`size: ${size} bytes`);

  const workbook = XLSX.readFile(filePath, {
    cellDates: false,
    cellNF: true,
    cellText: true,
    raw: true,
  });

  const hidden = new Set(workbook.Workbook?.Sheets?.filter((s) => s.Hidden).map((s) => s.name) ?? []);
  console.log(`sheets: ${workbook.SheetNames.join(" | ")}`);
  if (hidden.size) console.log(`hidden sheets: ${[...hidden].join(", ")}`);

  const props = workbook.Props;
  if (props) {
    const interesting = ["Title", "Author", "CreatedDate", "ModifiedDate", "LastAuthor"];
    for (const key of interesting) {
      if (props[key]) console.log(`workbook.${key}: ${props[key]}`);
    }
  }

  const findings = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const { ref, range, merges, cols, rows } = sheetMeta(sheet);
    const headerInfo = detectHeaderRow(sheet, range);
    const width = range.e.c - range.s.c + 1;
    const height = range.e.r - range.s.r + 1;

    console.log(subBanner(`Sheet "${sheetName}"`));
    console.log(`used range: ${ref}  (${height} rows × ${width} cols, 0-based ${range.s.r}:${range.e.r} × ${range.s.c}:${range.e.c})`);
    console.log(`detected header row: Excel row ${headerInfo.row + 1} (0-based ${headerInfo.row}), score ${headerInfo.score}`);
    console.log(`merged regions: ${merges.length}`);
    if (merges.length) {
      for (const m of merges.slice(0, 20)) {
        console.log(`  merge ${XLSX.utils.encode_range(m)}`);
      }
      if (merges.length > 20) console.log(`  … ${merges.length - 20} more`);
    }
    const hiddenCols = cols.filter((c) => c?.hidden).length;
    const hiddenRows = rows.filter((r) => r?.hidden).length;
    if (hiddenCols) console.log(`hidden columns: ${hiddenCols}`);
    if (hiddenRows) console.log(`hidden rows: ${hiddenRows}`);

    console.log("\nColumn headers:");
    headerInfo.headers.forEach((header, i) => {
      const letter = XLSX.utils.encode_col(range.s.c + i);
      const empty = header ? "" : "  [EMPTY]";
      console.log(`  ${letter}${headerInfo.row + 1}: ${header || "(blank)"}${empty}`);
    });

    console.log("\nRaw first 16 rows (including any title / blank rows before the header):");
    const previewTo = Math.min(range.s.r + 15, range.e.r);
    for (let r = range.s.r; r <= previewTo; r++) {
      const cells = [];
      for (let c = range.s.c; c <= Math.min(range.s.c + 14, range.e.c); c++) {
        const cell = sheet[cellAddress(r, c)];
        if (!cell) {
          cells.push("·");
          continue;
        }
        const shown = cell.w ?? cell.v;
        cells.push(`${cell.t}:${preview(shown, 28)}`);
      }
      const marker = r === headerInfo.row ? "  << HEADER" : "";
      console.log(`  r${r + 1}: [${cells.join(" | ")}]${marker}`);
    }

    const stats = collectColumnStats(sheet, range, headerInfo.row, headerInfo.headers);
    const dataRowCount = range.e.r - headerInfo.row;

    console.log(`\nData rows below header: ${dataRowCount}`);

    const emptyKinds = ["missing", "empty-string", "whitespace", "dash", "dash-unicode"];
    console.log("\nHow blanks and dashes appear (counts over data rows):");
    for (const col of stats) {
      const parts = emptyKinds
        .filter((k) => col.emptiness[k])
        .map((k) => `${k}=${col.emptiness[k]}`);
      const values = col.emptiness.value ?? 0;
      console.log(
        `  ${col.letter} "${col.header}": values=${values}${parts.length ? `, ${parts.join(", ")}` : ", no blanks/dashes"}`,
      );
    }

    console.log("\nPer-column types, number formats, formulas, samples:");
    for (const col of stats) {
      console.log(`\n  ${col.letter} "${col.header}"`);
      console.log(`    excel types: ${JSON.stringify(col.types)}`);
      console.log(`    emptiness:   ${JSON.stringify(col.emptiness)}`);
      if (Object.keys(col.numberFormats).length) {
        console.log(`    number formats: ${JSON.stringify(col.numberFormats)}`);
      }
      if (col.formulaCount) console.log(`    formulas: ${col.formulaCount}`);
      console.log(`    distinct value-shapes: ${col.unique.size}`);
      for (const sample of col.sampleValues.slice(0, 5)) {
        console.log(
          `    sample r${sample.row}: t=${sample.type} v=${preview(sample.raw)} w=${preview(sample.formatted)} z=${preview(sample.numberFormat)}`,
        );
      }
    }

    const categorical = stats.filter((col) => {
      const h = col.header.toLowerCase();
      if (col.isDateLike) return false;
      if (h === "hours" || h.includes("price") || h.includes("employee no")) return false;
      if (MONTH_NAME.test(col.header) && !col.isDateLike) return false;
      return (col.emptiness.value ?? 0) > 0 && col.unique.size <= 40;
    });
    if (categorical.length) {
      console.log(subBanner(`Distinct values (categorical columns) in "${sheetName}"`));
      for (const col of categorical) {
        const ranked = [...col.unique.values()]
          .filter((s) => classifyEmpty(s.raw) === "value")
          .sort((a, b) => b.count - a.count);
        console.log(`\n  ${col.letter} "${col.header}" (${ranked.length} distinct):`);
        for (const shape of ranked) {
          console.log(`    ${preview(shape.formatted ?? shape.raw, 90)}  ×${shape.count}`);
        }
      }
    }

    console.log(subBanner(`Date-like columns in "${sheetName}"`));
    const dateCols = stats.filter((col) => col.isDateLike);
    if (!dateCols.length) {
      console.log("  (none — this sheet has no Month / Sales month value column)");
    }
    for (const col of dateCols) {
      console.log(`\n  Distinct Month/date shapes in ${col.letter} "${col.header}":`);
      const shapes = [...col.unique.values()].sort((a, b) => b.count - a.count);
      for (const shape of shapes) {
        const emptiness = classifyEmpty(shape.raw);
        if (emptiness !== "value") {
          console.log(
            `    [${emptiness}] count=${shape.count}  t=${shape.type} v=${preview(shape.raw)} w=${preview(shape.formatted)}`,
          );
          continue;
        }
        const asDate =
          typeof shape.raw === "number" && shape.raw > 20000 && shape.raw < 80000
            ? (() => {
                try {
                  return XLSX.SSF.format("yyyy-mm-dd", shape.raw);
                } catch {
                  return null;
                }
              })()
            : null;
        console.log(
          `    t=${shape.type} v=${preview(shape.raw)} w=${preview(shape.formatted)} z=${preview(shape.numberFormat)} excelSerialAs=${asDate ?? "n/a"} count=${shape.count} e.g. row ${shape.row}`,
        );
      }
    }

    const oddities = [];
    if (headerInfo.row > range.s.r) {
      oddities.push(`headers start on row ${headerInfo.row + 1}, not row 1`);
    }
    if (merges.length) oddities.push(`${merges.length} merged cell region(s)`);
    const trailingEmptyHeaders = headerInfo.headers.filter((h) => !h).length;
    if (trailingEmptyHeaders) oddities.push(`${trailingEmptyHeaders} blank header cell(s) inside the used range`);
    const dashCols = stats.filter((c) => c.emptiness.dash || c.emptiness["dash-unicode"]);
    if (dashCols.length) {
      oddities.push(
        `"-" used as a missing-value marker in: ${dashCols.map((c) => c.header).join(", ")}`,
      );
    }
    const mixedTypes = stats.filter((c) => Object.keys(c.types).filter((t) => t !== "z").length > 1);
    if (mixedTypes.length) {
      oddities.push(
        `mixed Excel types in: ${mixedTypes.map((c) => `${c.header} (${Object.keys(c.types).join("/")})`).join("; ")}`,
      );
    }
    const formulaCols = stats.filter((c) => c.formulaCount);
    if (formulaCols.length) {
      oddities.push(`formulas present in: ${formulaCols.map((c) => c.header).join(", ")}`);
    }

    console.log(subBanner(`Structural oddities in "${sheetName}"`));
    if (!oddities.length) console.log("  none flagged beyond normal tabular data");
    else oddities.forEach((o) => console.log(`  • ${o}`));

    findings.push({
      file: name,
      sheet: sheetName,
      headerRow: headerInfo.row + 1,
      headers: headerInfo.headers,
      stats,
    });
  }

  return findings;
}

function columnByHint(findings, fileHint, headerHint) {
  for (const f of findings) {
    if (!f.file.toLowerCase().includes(fileHint)) continue;
    const col = f.stats.find((s) => s.header.toLowerCase().includes(headerHint));
    if (col) return { finding: f, col };
  }
  return null;
}

function uniqueNonEmpty(col) {
  const values = new Set();
  for (const shape of col.unique.values()) {
    if (classifyEmpty(shape.raw) !== "value") continue;
    const text = String(shape.formatted ?? shape.raw).trim();
    if (text) values.add(text);
  }
  return values;
}

function printJoinPreview(allFindings) {
  console.log(banner("JOIN-KEY PREVIEW (from distinct values, not ingested)"));

  const tsEmp = columnByHint(allFindings, "timesheet", "employee name");
  const tsNo = columnByHint(allFindings, "timesheet", "employee no");
  const salEmp = columnByHint(allFindings, "salar", "employee name");
  const tsRef = columnByHint(allFindings, "timesheet", "ref code");
  const prRef = columnByHint(allFindings, "price", "ref code");
  const tsCat = columnByHint(allFindings, "timesheet", "category");
  const prCat = columnByHint(allFindings, "price", "category");

  const pairs = [
    ["timesheet employee names", tsEmp],
    ["timesheet employee numbers", tsNo],
    ["salary employee names", salEmp],
    ["timesheet ref codes", tsRef],
    ["project-price ref codes", prRef],
    ["timesheet categories", tsCat],
    ["project-price categories", prCat],
  ];

  const sets = {};
  for (const [label, hit] of pairs) {
    if (!hit) {
      console.log(`${label}: column not found`);
      continue;
    }
    const set = uniqueNonEmpty(hit.col);
    sets[label] = set;
    console.log(`${label}: ${set.size} distinct`);
  }

  if (sets["timesheet employee names"] && sets["salary employee names"]) {
    const ts = sets["timesheet employee names"];
    const sal = sets["salary employee names"];
    const onlyTs = [...ts].filter((x) => !sal.has(x));
    const onlySal = [...sal].filter((x) => !ts.has(x));
    console.log(`\nEmployee Name overlap (timesheet ∩ salary): ${[...ts].filter((x) => sal.has(x)).length}`);
    console.log(`  in timesheet but not salary (${onlyTs.length}): ${onlyTs.slice(0, 20).join(" | ") || "—"}`);
    console.log(`  in salary but not timesheet (${onlySal.length}): ${onlySal.slice(0, 20).join(" | ") || "—"}`);
  }

  if (sets["timesheet ref codes"] && sets["project-price ref codes"]) {
    const ts = sets["timesheet ref codes"];
    const pr = sets["project-price ref codes"];
    const onlyTs = [...ts].filter((x) => !pr.has(x));
    const onlyPr = [...pr].filter((x) => !ts.has(x));
    console.log(`\nRef Code overlap (timesheet ∩ project prices): ${[...ts].filter((x) => pr.has(x)).length}`);
    console.log(`  in timesheet but not prices (${onlyTs.length}): ${onlyTs.slice(0, 30).join(" | ") || "—"}`);
    console.log(`  in prices but not timesheet (${onlyPr.length}): ${onlyPr.slice(0, 30).join(" | ") || "—"}`);
  }

  if (sets["timesheet categories"]) {
    console.log(`\nTimesheet categories:\n  ${[...sets["timesheet categories"]].sort().join("\n  ")}`);
  }
}

function main() {
  if (!fs.existsSync(SAMPLE_DIR)) {
    console.error(`Sample directory not found: ${SAMPLE_DIR}`);
    process.exit(1);
  }

  const files = fs
    .readdirSync(SAMPLE_DIR)
    .filter((f) => f.toLowerCase().endsWith(".xlsx") && !f.startsWith("~$"))
    .sort()
    .map((f) => path.join(SAMPLE_DIR, f));

  if (!files.length) {
    console.error(`No .xlsx files in ${SAMPLE_DIR}`);
    process.exit(1);
  }

  console.log(banner("MARGIN DASHBOARD — PHASE 1 DATA INSPECTION"));
  console.log(`sample dir: ${SAMPLE_DIR}`);
  console.log(`files: ${files.map((f) => path.basename(f)).join(", ")}`);
  console.log("xlsx read options: cellDates=false, cellNF=true, cellText=true");
  console.log("type legend: n=number, s=string, b=boolean, d=date, e=error, z=blank/missing");

  const allFindings = [];
  for (const file of files) {
    allFindings.push(...printWorkbook(file));
  }
  printJoinPreview(allFindings);
  console.log(banner("END OF INSPECTION"));
}

main();
