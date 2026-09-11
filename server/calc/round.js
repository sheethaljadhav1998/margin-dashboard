/** Round AED to fils (2 decimal places). */
export function roundAed(value) {
  if (value == null || !Number.isFinite(value)) return value;
  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function aedEqual(a, b, { dirham = true } = {}) {
  if (a == null || b == null) return a === b;
  if (dirham) return Math.abs(roundAed(a) - roundAed(b)) < 0.005;
  return Math.abs(a - b) < 1e-9;
}

export function ratio(numerator, denominator) {
  if (numerator == null || denominator == null) return null;
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
    return null;
  }
  return numerator / denominator;
}
