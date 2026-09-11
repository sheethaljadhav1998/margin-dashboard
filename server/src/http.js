import { roundAed } from "../calc/round.js";

export function parsePeriod(query = {}) {
  const errors = [];
  let year = null;
  let month = null;

  if (query.year != null && query.year !== "" && query.year !== "all") {
    year = Number(query.year);
    if (!Number.isInteger(year) || year < 1990 || year > 2100) {
      errors.push("year must be an integer, or 'all'");
    }
  }

  if (query.month != null && query.month !== "" && query.month !== "all") {
    month = Number(query.month);
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      errors.push("month must be 1–12, or 'all'");
    }
  }

  if (errors.length) {
    const err = new Error(errors.join("; "));
    err.status = 400;
    throw err;
  }

  return { year, month };
}

export function serialize(value) {
  if (Array.isArray(value)) return value.map(serialize);
  if (value && typeof value === "object") {
    const out = {};
    for (const [key, nested] of Object.entries(value)) {
      if (typeof nested === "number" && Number.isFinite(nested)) {
        if (/Aed$|margin$|productivity$|profitability$|share$/i.test(key)) {
          out[key] = roundAed(nested);
        } else if (/hours/i.test(key)) {
          out[key] = Math.round(nested * 100) / 100;
        } else {
          out[key] = nested;
        }
      } else {
        out[key] = serialize(nested);
      }
    }
    return out;
  }
  return value;
}

export function csvEscape(value) {
  if (value == null) return "";
  const text = String(value);
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function toCsv(columns, rows) {
  const header = columns.map((c) => csvEscape(c.label)).join(",");
  const lines = rows.map((row) => columns.map((c) => csvEscape(row[c.key])).join(","));
  return [header, ...lines].join("\n");
}
