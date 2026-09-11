import { useOutletContext } from "react-router-dom";
import { useApi } from "../api.js";
import { formatHours, formatPct, monthLabel } from "../format.js";
import { Fail, Loading, PageHeader, Table } from "../ui.jsx";

export function CategoriesPage() {
  const { query, year, month } = useOutletContext();
  const { data, error, loading } = useApi(`/api/categories${query}`);

  if (loading) return <Loading />;
  if (error) return <Fail error={error} />;

  return (
    <div>
      <PageHeader
        kicker={month === "all" ? year : `${monthLabel(month)} ${year}`}
        title="Where does the time go?"
      />
      <Table
        empty="No hours in this period."
        rows={data}
        columns={[
          { key: "category", label: "Category" },
          {
            key: "isBillable",
            label: "Type",
            render: (r) => (r.isBillable ? "Billable" : "Absorbed"),
          },
          { key: "hours", label: "Hours", align: "right", render: (r) => formatHours(r.hours) },
          { key: "share", label: "Share of time", align: "right", render: (r) => formatPct(r.share) },
        ]}
      />
    </div>
  );
}
