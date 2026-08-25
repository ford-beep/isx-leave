import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { companyToday, formatDate, formatRange, relativeDayLabel } from "@/lib/date";
import {
  getAllRequests, getBalance, getEntitlements, getNextUpcomingLeave, getUser,
} from "@/lib/queries";
import { Card, CardHead, EmptyState, Kpi, Person, StatusBadge } from "@/components/ui";
import { AdminDecision } from "@/components/AdminDecision";
import { EmployeeSettingsForms } from "./EmployeeSettingsForms";
import { IconCalendar } from "@/components/icons";

export const dynamic = "force-dynamic";

export default async function EmployeeDetailPage({
  params,
}: { params: Promise<{ id: string }> }) {
  const me = await requireAdmin();
  const { id } = await params;
  const today = companyToday();
  const year = Number(today.slice(0, 4));

  const employee = await getUser(me.id, id);
  if (!employee) notFound();

  const [balance, requests, entitlements, next] = await Promise.all([
    getBalance(me.id, id, year),
    getAllRequests(me.id, { employeeId: id, status: "all" }),
    getEntitlements(me.id, id),
    getNextUpcomingLeave(me.id, id),
  ]);

  const pending = requests.filter((r) => r.status === "pending");

  return (
    <>
      <div className="page-head">
        <div className="grow">
          <div className="tiny" style={{ marginBottom: 6 }}>
            <Link href="/admin/employees" className="muted">← Employees</Link>
          </div>
          <Person name={employee.name} email={employee.email} />
          <p className="muted-sm" style={{ marginTop: 6 }}>
            {employee.jobTitle ?? "No job title"} ·{" "}
            {employee.role === "admin" ? "Administrator" : "Employee"} ·{" "}
            {employee.active ? "Active" : "Inactive"} · joined {formatDate(employee.createdAt.slice(0, 10))}
          </p>
        </div>
      </div>

      <div className="kpis">
        <Kpi label="Annual entitlement" value={balance.entitlement} unit="days" sub={`For ${year}`} />
        <Kpi label="Used" value={balance.approved} unit="days"
          meter={{ used: balance.approved, total: balance.entitlement }} sub="Approved leave" />
        <Kpi label="Remaining" value={balance.remaining} unit="days" tone="accent"
          sub={`${balance.pending} day(s) pending`} />
        <Kpi label="Next leave"
          value={next ? formatRange(next.startDate, next.endDate) : "None"}
          sub={next ? `${next.leaveTypeLabel} · ${relativeDayLabel(next.startDate, today)}` : "No upcoming leave"} />
      </div>

      {pending.length > 0 && (
        <div className="section">
          <Card>
            <CardHead title={`${pending.length} pending request${pending.length === 1 ? "" : "s"}`} />
            <div className="card-body flush">
              <table className="tbl">
                <thead>
                  <tr><th>Date</th><th>Leave</th><th className="r">Days</th><th className="r">Action</th></tr>
                </thead>
                <tbody>
                  {pending.map((r) => (
                    <tr key={r.id}>
                      <td data-label="Date" className="primary nowrap">{formatRange(r.startDate, r.endDate)}</td>
                      <td data-label="Leave">{r.leaveTypeLabel}
                        {r.reason && <div className="tiny">{r.reason}</div>}</td>
                      <td data-label="Days" className="r num">{r.leaveDays}</td>
                      <td data-label="Action" className="r"><AdminDecision request={r} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      <div className="section grid-2">
        <Card>
          <CardHead title="Leave history" sub={`${requests.length} request${requests.length === 1 ? "" : "s"} on record`} />
          <div className="card-body flush">
            {requests.length === 0 ? (
              <EmptyState icon={<IconCalendar size={20} />} title="No leave requests yet."
                body="This employee hasn't submitted any leave." />
            ) : (
              <div className="table-wrap">
                <table className="tbl">
                  <thead>
                    <tr><th>Date</th><th>Leave type</th><th className="r">Days</th><th>Status</th><th>Decided by</th></tr>
                  </thead>
                  <tbody>
                    {requests.map((r) => (
                      <tr key={r.id}>
                        <td data-label="Date" className="primary nowrap">{formatRange(r.startDate, r.endDate)}</td>
                        <td data-label="Leave type">
                          {r.leaveTypeLabel}
                          {r.rejectionReason && (
                            <div className="tiny" style={{ color: "var(--c-bad)" }}>Rejected: {r.rejectionReason}</div>
                          )}
                        </td>
                        <td data-label="Days" className="r num">{r.leaveDays}</td>
                        <td data-label="Status"><StatusBadge status={r.status} /></td>
                        <td data-label="Decided by" className="muted-sm">{r.approvedByName ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Card>

        <EmployeeSettingsForms
          employee={employee}
          entitlements={entitlements}
          currentYear={year}
          isSelf={employee.id === me.id}
        />
      </div>
    </>
  );
}
