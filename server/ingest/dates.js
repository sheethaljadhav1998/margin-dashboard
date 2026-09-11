import { asText, isBlank } from "./blanks.js";

const MONTHS = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

const MONTH_NAMES = Object.entries(MONTHS)
  .filter(([name]) => name.length > 3 || name === "may" || name === "jun" || name === "jul" || name === "sep" || name === "oct" || name === "nov" || name === "dec")
  .sort((a, b) => b[0].length - a[0].length);

export function monthFromName(value) {
  if (isBlank(value)) return null;
  const key = String(value).trim().toLowerCase().replace(/\./g, "");
  return MONTHS[key] ?? null;
}

export function isMonthHeader(value) {
  return monthFromName(value) != null;
}

/**
 * Parse a timesheet / sales-month cell into { year, month }.
 * Accepts: "January 2025", "January '25", "May '25", "January 2026",
 * "January", Excel serials, and Date objects.
 */
export function parseYearMonth(value, fallbackYear = null) {
  if (isBlank(value)) return null;

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return { year: value.getUTCFullYear(), month: value.getUTCMonth() + 1 };
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    if (value > 20000 && value < 80000) {
      return excelSerialToYearMonth(value);
    }
    return null;
  }

  const text = asText(value);
  if (!text) return null;

  const normalized = text.replace(/,/g, " ").replace(/\s+/g, " ").trim();

  const full = normalized.match(/^([A-Za-z]+)\s+'?(\d{2,4})$/);
  if (full) {
    const month = monthFromName(full[1]);
    const year = coerceYear(full[2], fallbackYear);
    if (month && year) return { year, month };
  }

  const dashed = normalized.match(/^([A-Za-z]+)[-/](\d{2,4})$/);
  if (dashed) {
    const month = monthFromName(dashed[1]);
    const year = coerceYear(dashed[2], fallbackYear);
    if (month && year) return { year, month };
  }

  const monthOnly = monthFromName(normalized);
  if (monthOnly && fallbackYear) return { year: fallbackYear, month: monthOnly };

  return null;
}

export function coerceYear(token, fallbackYear) {
  if (token == null || token === "") return fallbackYear;
  const n = Number(String(token).replace(/^'/, ""));
  if (!Number.isFinite(n)) return fallbackYear;
  if (n >= 1000) return n;
  if (n >= 0 && n < 100) return n >= 70 ? 1900 + n : 2000 + n;
  return fallbackYear;
}

export function yearFromText(...texts) {
  for (const text of texts) {
    if (!text) continue;
    const match = String(text).match(/\b(19|20)\d{2}\b/);
    if (match) return Number(match[0]);
  }
  return null;
}

/** Excel's 1900 date system, matching what SheetJS uses. */
export function excelSerialToYearMonth(serial) {
  const utc = Date.UTC(1899, 11, 30) + Math.round(serial) * 86400000;
  const date = new Date(utc);
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}

export { MONTHS, MONTH_NAMES };
