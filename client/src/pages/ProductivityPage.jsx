import { useNavigate, useOutletContext } from "react-router-dom";
import { useApi } from "../api.js";
import { formatHours, formatPct, monthLabel } from "../format.js";
import { Fail, Loading, PageHeader, Table } from "../ui.jsx";

export function ProductivityPage() {
  const { query, year, month } = useOutletContext();
  const { data, error, loading } = useApi(`/api/productivity${query}`);
  const navigate = useNavigate();

  if (loading) return <Loading />;
  if (error) return <Fail error={error} />;

  return (
    <div>
      <PageHeader
        kicker={month === "all" ? year : `${monthLabel(month)} ${year}`}
        title="Who is on billable work?"
      />
      <Table
        empty="No timesheet rows in this period."
        onRowClick={(row) => row.department && navigate(`/departments/${encodeURIComponent(row.department)}${query}`)}
        rows={data}
        columns={[
          { key: "employeeName", label: "Name" },
          { key: "department", label: "Department" },
          { key: "designation", label: "Role" },
          { key: "billableHours", label: "Billable", align: "right", render: (r) => formatHours(r.billableHours) },
          { key: "totalHours", label: "Total", align: "right", render: (r) => formatHours(r.totalHours) },
          {
            key: "productivity",
            label: "Billable / total",
            align: "right",
            render: (r) => formatPct(r.productivity),
          },
        ]}
      />
    </div>
  );
}
