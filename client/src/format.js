const MONTHS = [
  { value: "all", label: "Full year" },
  { value: "1", label: "January" },
  { value: "2", label: "February" },
  { value: "3", label: "March" },
  { value: "4", label: "April" },
  { value: "5", label: "May" },
  { value: "6", label: "June" },
  { value: "7", label: "July" },
  { value: "8", label: "August" },
  { value: "9", label: "September" },
  { value: "10", label: "October" },
  { value: "11", label: "November" },
  { value: "12", label: "December" },
];

export function monthLabel(value) {
  return MONTHS.find((m) => m.value === String(value))?.label ?? value;
}

export { MONTHS };

export function formatAed(value, { empty = "—" } = {}) {
  if (value == null || Number.isNaN(value)) return empty;
  return new Intl.NumberFormat("en-AE", {
    style: "currency",
    currency: "AED",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatAedExact(value, { empty = "—" } = {}) {
  if (value == null || Number.isNaN(value)) return empty;
  return new Intl.NumberFormat("en-AE", {
    style: "currency",
    currency: "AED",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatHours(value, { empty = "—" } = {}) {
  if (value == null || Number.isNaN(value)) return empty;
  return new Intl.NumberFormat("en-GB", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  }).format(value);
}

export function formatPct(value, { empty = "—" } = {}) {
  if (value == null || Number.isNaN(value)) return empty;
  return `${(value * 100).toFixed(1)}%`;
}

export function formatNumber(value, { empty = "—", digits = 0 } = {}) {
  if (value == null || Number.isNaN(value)) return empty;
  return new Intl.NumberFormat("en-GB", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export function periodQuery(year, month) {
  const params = new URLSearchParams();
  if (year && year !== "all") params.set("year", year);
  if (month && month !== "all") params.set("month", month);
  const q = params.toString();
  return q ? `?${q}` : "";
}

export function displayName(name) {
  if (!name) return "—";
  return name.replace(/-COMMERCIAL\.pdf$/i, "").replace(/\.pdf$/i, "");
}
