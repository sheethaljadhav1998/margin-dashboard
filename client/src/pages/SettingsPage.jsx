import { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { apiSend, useApi } from "../api.js";
import { MONTHS, formatAed } from "../format.js";
import { Fail, Loading, Note, PageHeader } from "../ui.jsx";

export function SettingsPage() {
  const { year } = useOutletContext();
  const { data, error, loading, reload } = useApi("/api/settings");
  const [billable, setBillable] = useState(new Set());
  const [overhead, setOverhead] = useState({});
  const [status, setStatus] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!data) return;
    setBillable(new Set(data.billableCategories.filter((c) => c.isBillable).map((c) => c.category)));
    const map = {};
    for (const row of data.overhead) {
      if (String(row.year) === String(year)) map[row.month] = row.amountAed;
    }
    setOverhead(map);
  }, [data, year]);

  const categories = useMemo(() => {
    const names = new Set([
      ...(data?.knownCategories ?? []),
      ...(data?.billableCategories ?? []).map((c) => c.category),
    ]);
    return [...names].sort();
  }, [data]);

  if (loading && !data) return <Loading />;
  if (error) return <Fail error={error} />;

  function toggle(category) {
    setBillable((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }

  async function onSave(event) {
    event.preventDefault();
    setSaving(true);
    setStatus(null);
    try {
      const payload = {
        billableCategories: [...billable],
        overhead: MONTHS.filter((m) => m.value !== "all").map((m) => ({
          year: Number(year),
          month: Number(m.value),
          amountAed: Number(overhead[Number(m.value)] ?? 0),
        })),
      };
      await apiSend("/api/settings", { method: "PUT", json: payload });
      window.dispatchEvent(new Event("margin-refresh"));
      await reload();
      setStatus({ tone: "good", text: "Saved. Dashboard figures will use these assumptions." });
    } catch (err) {
      setStatus({ tone: "bad", text: err.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSave}>
      <PageHeader kicker="Assumptions" title="How we split the cost pool">
        <button
          type="submit"
          disabled={saving}
          className="rounded bg-navy px-4 py-2 text-sm text-panel disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </PageHeader>
      {status && (
        <Note tone={status.tone === "bad" ? "bad" : "muted"}>{status.text}</Note>
      )}

      <section className="mb-10">
        <h2 className="mb-2 text-lg font-semibold text-navy">Billable categories</h2>
        <p className="mb-4 max-w-2xl text-sm text-muted">
          Hours in these buckets absorb the indirect pool (support salaries, internal time, and
          overhead). Everything else stays in the pool. Defaults are Projects, Enhancements and
          Hosting.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {categories.map((category) => (
            <label
              key={category}
              className="flex items-center gap-3 border border-line bg-panel px-3 py-2 text-sm"
            >
              <input
                type="checkbox"
                checked={billable.has(category)}
                onChange={() => toggle(category)}
              />
              <span>{category}</span>
            </label>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold text-navy">Monthly overhead · {year}</h2>
        <p className="mb-4 max-w-2xl text-sm text-muted">
          Extra AED added to that month&apos;s indirect pool (rent, software, and so on). Leave at
          zero to reconcile loaded cost to total salaries.
        </p>
        <div className="overflow-x-auto border border-line bg-panel">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs tracking-wide text-muted uppercase">
                <th className="px-3 py-2 font-medium">Month</th>
                <th className="px-3 py-2 font-medium">Overhead (AED)</th>
              </tr>
            </thead>
            <tbody>
              {MONTHS.filter((m) => m.value !== "all").map((m) => (
                <tr key={m.value} className="border-b border-line last:border-0">
                  <td className="px-3 py-2">{m.label}</td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min="0"
                      step="1"
                      className="w-40 rounded border border-line bg-paper px-2 py-1 tabular"
                      value={overhead[Number(m.value)] ?? 0}
                      onChange={(e) =>
                        setOverhead((prev) => ({ ...prev, [Number(m.value)]: e.target.value }))
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted">
          Current year total: {formatAed(MONTHS.filter((m) => m.value !== "all").reduce((n, m) => n + Number(overhead[Number(m.value)] || 0), 0))}
        </p>
      </section>
    </form>
  );
}
