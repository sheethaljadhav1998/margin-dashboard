export function PageHeader({ kicker, title, children }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        {kicker && <p className="text-xs tracking-[0.18em] text-muted uppercase">{kicker}</p>}
        <h1 className="text-3xl font-semibold tracking-tight text-navy">{title}</h1>
      </div>
      {children}
    </div>
  );
}

export function StatGrid({ children }) {
  return <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-5">{children}</div>;
}

export function Stat({ label, value, hint, tone }) {
  const color = tone === "good" ? "text-good" : tone === "bad" ? "text-bad" : "text-ink";
  return (
    <div className="border border-line bg-panel px-4 py-3">
      <p className="text-xs tracking-wide text-muted uppercase">{label}</p>
      <p className={`tabular mt-1 text-xl font-semibold ${color}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function Table({ columns, rows, onRowClick, empty = "Nothing to show for this period." }) {
  if (!rows?.length) {
    return <p className="border border-dashed border-line px-4 py-10 text-center text-muted">{empty}</p>;
  }
  return (
    <div className="overflow-x-auto border border-line bg-panel">
      <table className="w-full min-w-[40rem] border-collapse text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs tracking-wide text-muted uppercase">
            {columns.map((col) => (
              <th
                key={col.key}
                className={`px-3 py-2 font-medium ${col.align === "right" ? "text-right" : ""}`}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={row.id ?? row.refCode ?? row.employeeNo ?? row.category ?? row.department ?? i}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={`border-b border-line last:border-0 ${onRowClick ? "cursor-pointer hover:bg-paper" : ""}`}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={`tabular px-3 py-2 align-top ${col.align === "right" ? "text-right" : ""}`}
                >
                  {col.render ? col.render(row) : row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Note({ children, tone = "muted" }) {
  const cls = tone === "bad" ? "border-bad text-bad" : "border-line text-muted";
  return <div className={`mb-6 border px-4 py-3 text-sm ${cls}`}>{children}</div>;
}

export function Loading() {
  return <p className="text-muted">Loading…</p>;
}

export function Fail({ error }) {
  return <Note tone="bad">{error?.message || "Could not load this page."}</Note>;
}

export function marginTone(value) {
  if (value == null) return undefined;
  if (value < 0) return "bad";
  if (value > 0) return "good";
  return undefined;
}
