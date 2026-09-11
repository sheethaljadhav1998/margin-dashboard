import { Link, useOutletContext, useParams } from "react-router-dom";
import { useApi } from "../api.js";
import { formatAed, formatHours, formatPct, monthLabel } from "../format.js";
import { Fail, Loading, PageHeader, Stat, StatGrid, Table } from "../ui.jsx";

export function DepartmentPage() {
  const { department } = useParams();
  const name = decodeURIComponent(department);
  const { query, year, month } = useOutletContext();
  const { data, error, loading } = useApi(
    `/api/departments/${encodeURIComponent(name)}${query}`,
  );

  if (loading) return <Loading />;
  if (error) return <Fail error={error} />;

  return (
    <div>
      <p className="mb-4 text-sm">
        <Link to={`/departments${query}`} className="text-navy underline-offset-2 hover:underline">
          ← All departments
        </Link>
      </p>
      <PageHeader
        kicker={month === "all" ? year : `${monthLabel(month)} ${year}`}
        title={data.department}
      />
      <StatGrid>
        <Stat label="Hours" value={formatHours(data.hours)} />
        <Stat label="Billable" value={formatHours(data.billableHours)} />
        <Stat label="Loaded cost" value={formatAed(data.costAed)} />
        <Stat label="Direct cost" value={formatAed(data.directCostAed)} />
        <Stat
          label="Productivity"
          value={formatPct(data.hours ? data.billableHours / data.hours : null)}
        />
      </StatGrid>
      <Table
        empty="No one in this department logged time in the period."
        rows={data.employees}
        columns={[
          { key: "employeeName", label: "Name" },
          { key: "designation", label: "Role" },
          { key: "hours", label: "Hours", align: "right", render: (r) => formatHours(r.hours) },
          { key: "billableHours", label: "Billable", align: "right", render: (r) => formatHours(r.billableHours) },
          { key: "costAed", label: "Loaded cost", align: "right", render: (r) => formatAed(r.costAed) },
          { key: "directCostAed", label: "Direct cost", align: "right", render: (r) => formatAed(r.directCostAed) },
          { key: "productivity", label: "Billable / total", align: "right", render: (r) => formatPct(r.productivity) },
        ]}
      />
    </div>
  );
}
