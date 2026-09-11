import path from "node:path";
import { parseWorkbook } from "./parse.js";
import { persistParsed } from "./persist.js";

export { ParseError } from "./parse.js";
export { persistParsed } from "./persist.js";

export function ingestFile(db, file, { expectedKind = null, filename } = {}) {
  const name = filename ?? (typeof file === "string" ? path.basename(file) : "upload.xlsx");
  const parsed = parseWorkbook(file, { filename: name, expectedKind });
  const saved = persistParsed(db, parsed, { filename: name });
  return { ...saved, headerRow: parsed.headerRow, sheetName: parsed.sheetName };
}

export function ingestSampleDir(db, sampleDir) {
  const files = [
    { name: "timesheet-2025.xlsx", kind: "timesheet" },
    { name: "salaries-2025.xlsx", kind: "salary" },
    { name: "project-prices-2025.xlsx", kind: "projects" },
  ];
  return files.map((f) => ingestFile(db, path.join(sampleDir, f.name), { expectedKind: f.kind, filename: f.name }));
}
