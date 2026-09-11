const DASHES = new Set(["-", "–", "—", "−", "n/a", "N/A", "na", "NA", "."]);

export function isBlank(value) {
  if (value === undefined || value === null) return true;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed === "" || DASHES.has(trimmed);
  }
  return false;
}

export function asText(value) {
  if (isBlank(value)) return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    if (Number.isInteger(value)) return String(value);
    return String(value);
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  return String(value).trim();
}

export function asEmployeeNo(value) {
  if (isBlank(value)) return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(Math.trunc(value));
  }
  return String(value).trim();
}

export function asNumber(value) {
  if (isBlank(value)) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const cleaned = value.replace(/[, ]/g, "").trim();
    if (isBlank(cleaned)) return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function normalizeHeader(value) {
  return asText(value)?.toLowerCase().replace(/\./g, "").replace(/\s+/g, " ").trim() ?? "";
}
