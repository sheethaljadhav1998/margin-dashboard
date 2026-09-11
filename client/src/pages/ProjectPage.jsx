import { Link, useOutletContext, useParams } from "react-router-dom";
import { useApi } from "../api.js";
import { displayName, formatAed, formatHours, formatPct, monthLabel } from "../format.js";
import { Fail, Loading, PageHeader, Stat, StatGrid, Table, marginTone } from "../ui.jsx";

export function ProjectPage() {
  const { refCode } = useParams();
  const { query, year, month } = useOutletContext();
  const { data, error, loading } = useApi(`/api/projects/${encodeURIComponent(refCode)}${query}`);

  if (loading) return <Loading />;
  if (error) return <Fail error={error} />;

  const period = month === "all" ? `${year} · full picture` : `${monthLabel(month)} ${year}`;

  return (
    <div>
      <p className="mb-4 text-sm">
        <Link to={`/${query}`} className="text-navy underline-offset-2 hover:underline">
          ← All projects
        </Link>
      </p>
      <PageHeader kicker={data.refCode} title={displayName(data.name)}>
        <p className="text-sm text-muted">
          {data.category}
          {data.status ? ` · ${data.status}` : ""} · {period}
        </p>
      </PageHeader>
      <StatGrid>
        <Stat label="Price" value={formatAed(data.priceAed)} />
        <Stat label="Hours" value={formatHours(data.hours)} />
        <Stat label="Cost" value={formatAed(data.costAed)} />
        <Stat label="Profit" value={formatAed(data.profitAed)} tone={data.profitAed < 0 ? "bad" : "good"} />
        <Stat label="Margin" value={formatPct(data.margin)} tone={marginTone(data.margin)} />
      </StatGrid>

      <h2 className="mb-3 text-lg font-semibold text-navy">Hours by department</h2>
      <Table
        empty="No hours on this project in the period."
        rows={data.hoursByDepartment}
        columns={[
          { key: "department", label: "Department" },
          { key: "hours", label: "Hours", align: "right", render: (r) => formatHours(r.hours) },
          { key: "costAed", label: "Loaded cost", align: "right", render: (r) => formatAed(r.costAed) },
        ]}
      />

      <h2 className="mt-8 mb-3 text-lg font-semibold text-navy">People on this project</h2>
      <Table
        empty="No one logged time here in the period."
        rows={data.employees}
        columns={[
          { key: "employeeName", label: "Name" },
          { key: "department", label: "Department" },
          { key: "hours", label: "Hours", align: "right", render: (r) => formatHours(r.hours) },
          { key: "costAed", label: "Cost", align: "right", render: (r) => formatAed(r.costAed) },
        ]}
      />
    </div>
  );
}
