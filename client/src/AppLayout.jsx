import { useState } from "react";
import { Link, NavLink, Outlet, useSearchParams } from "react-router-dom";
import { apiSend, useApi } from "./api.js";
import { MONTHS, periodQuery } from "./format.js";

const NAV = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/productivity", label: "Productivity" },
  { to: "/categories", label: "Categories" },
];

export function AppLayout() {
  const [params, setParams] = useSearchParams();
  const year = params.get("year") || "2025";
  const month = params.get("month") || "all";
  const query = periodQuery(year, month);
  const dash = useApi(`/api/dashboard${query || "?year=2025"}`);
  const years = dash.data?.filters?.years?.length ? dash.data.filters.years : [2025];

  function setPeriod(next) {
    const merged = { year, month, ...next };
    const nextParams = new URLSearchParams();
    if (merged.year) nextParams.set("year", merged.year);
    if (merged.month) nextParams.set("month", merged.month);
    setParams(nextParams);
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-panel">
        <div className="mx-auto flex max-w-6xl flex-wrap items-end justify-between gap-6 px-6 py-5">
          <div>
            <p className="text-xs tracking-[0.2em] text-muted uppercase">Agency finance</p>
            <Link to={`/${query}`} className="text-2xl font-semibold tracking-tight text-navy">
              Margin
            </Link>
          </div>
          <nav className="flex flex-wrap gap-5 text-sm">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={`${item.to}${query}`}
                end={item.end}
                className={({ isActive }) =>
                  `pb-1 ${isActive ? "border-b-2 border-navy text-ink" : "text-muted hover:text-ink"}`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-3 text-sm">
            <label className="text-muted">
              Year
              <select
                className="ml-2 rounded border border-line bg-paper px-2 py-1 text-ink"
                value={year}
                onChange={(e) => setPeriod({ year: e.target.value })}
              >
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-muted">
              Month
              <select
                className="ml-2 rounded border border-line bg-paper px-2 py-1 text-ink"
                value={month}
                onChange={(e) => setPeriod({ month: e.target.value })}
              >
                {MONTHS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
        <UploadBar onDone={() => window.dispatchEvent(new Event("margin-refresh"))} />
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">
        <Outlet context={{ year, month, query, refreshKey: dash.data }} />
      </main>
    </div>
  );
}

function UploadBar({ onDone }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  async function onSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const hasFile = [...data.values()].some((v) => v instanceof File && v.size);
    if (!hasFile) {
      setMessage({ tone: "bad", text: "Choose at least one spreadsheet." });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const result = await apiSend("/api/upload", { method: "POST", form: data });
      const bits = (result.ingested || []).map((i) => `${i.kind}: ${i.rows} rows`);
      setMessage({ tone: "good", text: `Loaded ${bits.join("; ")}.` });
      form.reset();
      onDone?.();
    } catch (err) {
      setMessage({ tone: "bad", text: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mx-auto flex max-w-6xl flex-wrap items-end gap-4 border-t border-line px-6 py-3 text-xs"
    >
      <FileField name="timesheet" label="Timesheet" />
      <FileField name="salary" label="Salary overview" />
      <FileField name="projects" label="Project prices" />
      <button
        type="submit"
        disabled={busy}
        className="rounded bg-navy px-3 py-1.5 text-panel disabled:opacity-60"
      >
        {busy ? "Uploading…" : "Upload"}
      </button>
      {message && (
        <p className={message.tone === "bad" ? "text-bad" : "text-good"}>{message.text}</p>
      )}
    </form>
  );
}

function FileField({ name, label }) {
  return (
    <label className="text-muted">
      {label}
      <input
        type="file"
        name={name}
        accept=".xlsx,.xls"
        className="ml-2 max-w-48 text-ink file:mr-2 file:rounded file:border-0 file:bg-paper file:px-2 file:py-1"
      />
    </label>
  );
}
