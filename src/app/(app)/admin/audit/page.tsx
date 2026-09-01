import { requireAdmin } from "@/lib/auth";
import { getAuditLog } from "@/lib/queries";
import { Card, CardHead, EmptyState } from "@/components/ui";
import { FilterSelect } from "@/components/FilterSelect";
import { IconFile } from "@/components/icons";

export const dynamic = "force-dynamic";

const ACTION_LABEL: Record<string, string> = {
  "leave.submitted": "submitted a leave request",
  "leave.approved": "approved leave",
  "leave.rejected": "rejected leave",
  "leave.cancelled": "cancelled a leave request",
  "user.insert": "added an employee",
  "user.update": "edited an employee",
  "user.delete": "removed an employee",
  "user.password_changed": "changed a password",
  "leave_entitlement.insert": "set a leave entitlement",
  "leave_entitlement.update": "changed a leave entitlement",
  "office_day.insert": "changed office working days",
  "office_day.update": "changed office working days",
  "holiday.insert": "added a holiday",
  "work_schedule.updated": "changed work mode",
  "office_day.schedule_updated": "changed office working days",
  "holiday.update": "updated a holiday",
  "leave_type.insert": "added a leave type",
  "leave_type.update": "updated a leave type",
  "auth.login": "signed in",
};

function summarise(action: string, metadata: Record<string, unknown>): string {
  const m = metadata as Record<string, string | number | undefined> & {
    before?: Record<string, unknown>; after?: Record<string, unknown>;
  };
  if (action.startsWith("leave.")) {
    const bits = [m.employee_name, m.start_date && `${m.start_date} → ${m.end_date}`,
      m.leave_days !== undefined && `${m.leave_days} day(s)`, m.rejection_reason && `“${m.rejection_reason}”`]
      .filter(Boolean);
    return bits.join(" · ");
  }

  if (action === "work_schedule.updated") {
  const date = m.date;
  const fromMode =
    m.from_mode === "office"
      ? "Office"
      : m.from_mode === "wfh"
        ? "WFH"
        : m.from_mode;

  const toMode =
    m.to_mode === "office"
      ? "Office"
      : m.to_mode === "wfh"
        ? "WFH"
        : m.to_mode;

  return [
    date,
    fromMode && toMode && `${fromMode} → ${toMode}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

if (action === "office_day.schedule_updated") {
  const dayNames = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];

  const before = Array.isArray(metadata.before_weekdays)
    ? metadata.before_weekdays
        .map((d) => dayNames[Number(d)])
        .filter(Boolean)
        .join(", ")
    : "";

  const after = Array.isArray(metadata.after_weekdays)
    ? metadata.after_weekdays
        .map((d) => dayNames[Number(d)])
        .filter(Boolean)
        .join(", ")
    : "";

  const effectiveFrom =
    typeof metadata.effective_from === "string"
      ? metadata.effective_from
      : "";

  return [
    effectiveFrom && `Effective ${effectiveFrom}`,
    `${before || "None"} → ${after || "None"}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

  if (m.after && typeof m.after === "object") {
    const a = m.after as Record<string, unknown>;
    return [a.name, a.email, a.total_days !== undefined && `${a.total_days} days`,
      a.year, a.weekday !== undefined && `weekday ${a.weekday} → ${a.is_office_day ? "office" : "off"}`]
      .filter(Boolean).join(" · ");
  }
  return "";
}

export default async function AuditPage({
  searchParams,
}: { searchParams: Promise<{ entity?: string }> }) {
  const me = await requireAdmin();
  const sp = await searchParams;
  const entity = sp.entity ?? "all";
  const entries = await getAuditLog(me.id, { entityType: entity, limit: 200 });

  return (
    <>
      <div className="page-head">
        <div className="grow">
          <h1>Audit log</h1>
          <p className="muted">
            Append-only record of every decision and configuration change. Written by the database itself,
            so it can&apos;t be bypassed or edited — not even by an administrator.
          </p>
        </div>
        <FilterSelect
          name="entity" basePath="/admin/audit" label="Filter by type" value={entity}
          options={[
            { value: "all", label: "Everything" },
            { value: "leave_request", label: "Leave requests" },
            { value: "user", label: "Employees" },
            { value: "leave_entitlement", label: "Entitlements" },
            { value: "office_day", label: "Office days" },
            { value: "work_schedule", label: "Work schedule" },
            { value: "holiday", label: "Holidays" },
          ]}
        />
      </div>

      <Card>
        <CardHead title="Recent activity" sub={`${entries.length} most recent entries`} />
        <div className="card-body flush">
          {entries.length === 0 ? (
            <EmptyState icon={<IconFile size={20} />} title="Nothing recorded yet."
              body="Actions will show up here as people use the system." />
          ) : (
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr><th>When</th><th>Who</th><th>Action</th><th>Details</th></tr>
                </thead>
                <tbody>
                  {entries.map((e) => (
                    <tr key={e.id}>
                      <td data-label="When" className="muted-sm nowrap">
                        {new Date(e.createdAt).toLocaleString("en-GB", {
                          timeZone: "Asia/Bangkok", day: "2-digit", month: "short",
                          year: "numeric", hour: "2-digit", minute: "2-digit",
                        })}
                      </td>
                      <td data-label="Who" className="primary">{e.actorName ?? "System"}</td>
                      <td data-label="Action">
                        <span className="chip">{ACTION_LABEL[e.action] ?? e.action}</span>
                      </td>
                      <td data-label="Details" className="muted-sm">{summarise(e.action, e.metadata)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>
    </>
  );
}
