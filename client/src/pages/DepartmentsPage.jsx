import { useNavigate, useOutletContext } from "react-router-dom";
import { useApi } from "../api.js";
import { formatAed, formatHours, formatPct, monthLabel } from "../format.js";
import { Fail, Loading, PageHeader, Table } from "../ui.jsx";

export function DepartmentsPage() {
  const { query, year, month } = useOutletContext();
  const { data, error, loading } = useApi(`/api/departments${query}`);
  const navigate = useNavigate();

  if (loading) return <Loading />;
  if (error) return <Fail error={error} />;

  return (
    <div>
      <PageHeader
        kicker={month === "all" ? year : `${monthLabel(month)} ${year}`}
        title="Cost by department"
      />
      <Table
        empty="No department hours in this period."
        onRowClick={(row) => navigate(`/departments/${encodeURIComponent(row.department)}${query}`)}
        rows={data}
        columns={[
          { key: "department", label: "Department" },
          { key: "hours", label: "Hours", align: "right", render: (r) => formatHours(r.hours) },
          { key: "billableHours", label: "Billable", align: "right", render: (r) => formatHours(r.billableHours) },
          { key: "costAed", label: "Loaded cost", align: "right", render: (r) => formatAed(r.costAed) },
          { key: "directCostAed", label: "Direct cost", align: "right", render: (r) => formatAed(r.directCostAed) },
        ]}
      />
      <p className="mt-3 text-xs text-muted">
        Loaded cost is billable hours × (direct + indirect rate). Direct cost is hours × that
        person&apos;s monthly rate — useful for teams like Management who rarely touch a client
        project.
      </p>
    </div>
  );
}
