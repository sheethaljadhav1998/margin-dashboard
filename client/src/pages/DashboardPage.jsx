import { useOutletContext, useNavigate } from "react-router-dom";
import { useApi } from "../api.js";
import { displayName, formatAed, formatHours, formatPct, monthLabel } from "../format.js";
import { Fail, IssuesList, Loading, Note, PageHeader, Pill, Stat, StatGrid, Table, marginTone } from "../ui.jsx";

export function DashboardPage() {
  const { query, year, month } = useOutletContext();
  const { data, error, loading } = useApi(`/api/dashboard${query || "?year=2025"}`);
  const navigate = useNavigate();

  if (loading) return <Loading />;
  if (error) return <Fail error={error} />;

  const period = month === "all" ? year : `${monthLabel(month)} ${year}`;
  const empty = !data.totalHours && !data.projects?.length;

  return (
    <div>
      <PageHeader kicker={period} title="Did we make money?" />
      {empty && (
        <Note>
          No timesheet rows for this period. If this is a first run, wait for the API to finish
          seeding, or upload the three spreadsheets in the header.
        </Note>
      )}
      <IssuesList issues={data.issues} />
      <StatGrid>
        <Stat label="Hours" value={formatHours(data.totalHours)} />
        <Stat
          label="Billable"
          value={formatHours(data.billableHours)}
          hint={data.totalHours ? formatPct(data.billableHours / data.totalHours) : undefined}
        />
        <Stat label="Cost" value={formatAed(data.costAed)} hint="Loaded labour" />
        <Stat label="Revenue" value={formatAed(data.revenueAed)} hint="Price × hours in period" />
        <Stat label="Margin" value={formatPct(data.margin)} tone={marginTone(data.margin)} />
      </StatGrid>
      <h2 className="mb-3 text-lg font-semibold text-navy">Projects</h2>
      <Table
        empty="No project hours in this period."
        onRowClick={(row) => navigate(`/projects/${encodeURIComponent(row.refCode)}${query}`)}
        rows={data.projects}
        columns={[
          { key: "refCode", label: "Ref" },
          { key: "name", label: "Project", render: (r) => (
            <span>
              {displayName(r.name)}
              {r.missingPrice && <Pill tone="bad">No price</Pill>}
            </span>
          ) },
          { key: "category", label: "Category" },
          { key: "hours", label: "Hours", align: "right", render: (r) => formatHours(r.hours) },
          { key: "costAed", label: "Cost", align: "right", render: (r) => formatAed(r.costAed) },
          { key: "priceAed", label: "Price", align: "right", render: (r) => formatAed(r.priceAed) },
          {
            key: "margin",
            label: "Margin",
            align: "right",
            render: (r) => (
              <span className={marginTone(r.margin) === "bad" ? "text-bad" : marginTone(r.margin) === "good" ? "text-good" : ""}>
                {formatPct(r.margin)}
              </span>
            ),
          },
        ]}
      />
    </div>
  );
}
