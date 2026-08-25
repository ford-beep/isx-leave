import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { companyToday, formatRange, relativeDayLabel } from "@/lib/date";
import {
  getAdminStats, getEmployeeOverview, getPendingRequests, getUpcomingLeaveAll,
} from "@/lib/queries";
import { Card, CardHead, EmptyState, Kpi, Person, StatusBadge } from "@/components/ui";
import { AdminDecision } from "@/components/AdminDecision";
import { IconCheck, IconUsers } from "@/components/icons";

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  const me = await requireAdmin();
  const today = companyToday();
  const year = Number(today.slice(0, 4));

  const [stats, pending, upcoming, employees] = await Promise.all([
    getAdminStats(me.id, year),
    getPendingRequests(me.id),
    getUpcomingLeaveAll(me.id),
    getEmployeeOverview(me.id, year),
  ]);

  return (
    <>
      <div className="page-head">
        <div className="grow">
          <h1>ISX Leave Management</h1>
          <p className="muted">
            {stats.pendingRequests > 0
              ? `${stats.pendingRequests} request${stats.pendingRequests === 1 ? "" : "s"} waiting on you.`
              : "Nothing is waiting for approval."}
          </p>
        </div>
        <Link href="/admin/requests" className="btn">All requests</Link>
      </div>

      <div className="kpis">
        <Kpi label="Employees" value={stats.totalEmployees}
          sub={`${stats.activeEmployees} active`} />
        <Kpi label="Pending requests" value={stats.pendingRequests}
          tone={stats.pendingRequests > 0 ? "warn" : undefined}
          sub={stats.pendingRequests > 0 ? "Needs a decision" : "All caught up"} />
        <Kpi label="Approved this month" value={stats.approvedThisMonth} sub="Requests starting this month" />
        <Kpi label="Leave days used" value={stats.totalDaysUsed} unit="days" sub={`Company-wide in ${year}`} />
      </div>

      <div className="section">
        <Card>
          <CardHead title="Pending leave requests" sub="Approve or reject directly from here." />
          <div className="card-body flush">
            {pending.length === 0 ? (
              <EmptyState icon={<IconCheck size={20} />} title="You're all caught up."
                body="New requests will appear here as soon as employees submit them." />
            ) : (
              <div className="table-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Employee</th><th>Leave</th><th>Date</th>
                      <th className="r">Days</th><th>Status</th><th className="r">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pending.map((r) => (
                      <tr key={r.id}>
                        <td data-label="Employee">
                          <Link href={`/admin/employees/${r.employeeId}`}>
                            <Person name={r.employeeName!} email={r.employeeEmail} />
                          </Link>
                        </td>
                        <td data-label="Leave">
                          {r.leaveTypeLabel}
                          {r.reason && <div className="tiny" style={{ marginTop: 2 }}>{r.reason}</div>}
                        </td>
                        <td data-label="Date" className="nowrap">{formatRange(r.startDate, r.endDate)}</td>
                        <td data-label="Days" className="r num">{r.leaveDays}</td>
                        <td data-label="Status"><StatusBadge status={r.status} /></td>
                        <td data-label="Action" className="r"><AdminDecision request={r} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Card>
      </div>

      <div className="section grid-2">
        <Card>
          <CardHead title="Employee leave overview" sub={`Balances for ${year}`}
            action={<Link href="/admin/employees" className="btn btn-sm">Manage</Link>} />
          <div className="card-body flush">
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr><th>Employee</th><th className="r">Entitlement</th><th className="r">Used</th><th className="r">Remaining</th></tr>
                </thead>
                <tbody>
                  {employees.map((e) => (
                    <tr key={e.id}>
                      <td data-label="Employee">
                        <Link href={`/admin/employees/${e.id}`}>
                          <Person name={e.name} email={e.email} />
                        </Link>
                      </td>
                      <td data-label="Entitlement" className="r num">{e.entitlement}</td>
                      <td data-label="Used" className="r num">{e.used}</td>
                      <td data-label="Remaining" className="r num primary">{e.remaining}</td>
                    </tr>
                  ))}
                  {employees.length === 0 && (
                    <tr><td colSpan={4}><EmptyState icon={<IconUsers size={20} />} title="No employees found." /></td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </Card>

        <Card>
          <CardHead title="Upcoming leave" sub="Approved, in the next 45 days" />
          <div className="card-body">
            {upcoming.length === 0 ? (
              <p className="muted-sm">Nobody is scheduled to be away.</p>
            ) : (
              <div className="stack" style={{ gap: 14 }}>
                {upcoming.map((r) => (
                  <div key={r.id} className="row" style={{ gap: 10, alignItems: "flex-start" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{r.employeeName}</div>
                      <div className="tiny">
                        {formatRange(r.startDate, r.endDate)} · {r.leaveTypeLabel} · {r.leaveDays}d
                      </div>
                    </div>
                    <span className="chip">{relativeDayLabel(r.startDate, today)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      </div>
    </>
  );
}
