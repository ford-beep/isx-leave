import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { companyToday, formatDate, formatRange } from "@/lib/date";
import { getAllRequests, getEmployeeOverview } from "@/lib/queries";
import { Card, CardHead, EmptyState, Person, StatusBadge } from "@/components/ui";
import { AdminDecision } from "@/components/AdminDecision";
import { FilterSelect } from "@/components/FilterSelect";
import { IconCheck } from "@/components/icons";

export const dynamic = "force-dynamic";

const STATUSES = ["pending", "approved", "rejected", "cancelled", "all"] as const;

export default async function AdminRequestsPage({
  searchParams,
}: { searchParams: Promise<{ status?: string; employee?: string }> }) {
  const me = await requireAdmin();
  const sp = await searchParams;
  const status = STATUSES.includes(sp.status as never) ? sp.status! : "pending";
  const employeeId = sp.employee && sp.employee !== "all" ? sp.employee : undefined;

  const [requests, employees] = await Promise.all([
    getAllRequests(me.id, { status, employeeId }),
    getEmployeeOverview(me.id, Number(companyToday().slice(0, 4))),
  ]);

  const link = (s: string) =>
    `/admin/requests?status=${s}${employeeId ? `&employee=${employeeId}` : ""}`;

  return (
    <>
      <div className="page-head">
        <div className="grow">
          <h1>Leave requests</h1>
          <p className="muted">Every request across the company, with full history.</p>
        </div>
      </div>

      <Card>
        <div className="card-head" style={{ flexWrap: "wrap", gap: 8 }}>
          <div className="row-wrap" style={{ flex: 1 }}>
            {STATUSES.map((s) => (
              <Link key={s} href={link(s)}
                className={`btn btn-sm ${status === s ? "btn-primary" : ""}`}
                style={{ textTransform: "capitalize" }}>
                {s}
              </Link>
            ))}
          </div>
          <FilterSelect
            name="employee"
            basePath="/admin/requests"
            label="Filter by employee"
            value={employeeId ?? "all"}
            options={[{ value: "all", label: "All employees" },
                      ...employees.map((e) => ({ value: e.id, label: e.name }))]}
          />
        </div>

        <div className="card-body flush">
          {requests.length === 0 ? (
            <EmptyState icon={<IconCheck size={20} />}
              title={status === "pending" ? "You're all caught up." : "No requests match this filter."}
              body={status === "pending" ? "Nothing is waiting for a decision right now." : undefined} />
          ) : (
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Employee</th><th>Leave</th><th>Date</th><th className="r">Days</th>
                    <th>Status</th><th>Submitted</th><th className="r">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map((r) => (
                    <tr key={r.id}>
                      <td data-label="Employee">
                        <Link href={`/admin/employees/${r.employeeId}`}>
                          <Person name={r.employeeName!} email={r.employeeEmail} />
                        </Link>
                      </td>
                      <td data-label="Leave">
                        {r.leaveTypeLabel}
                        {r.reason && <div className="tiny" style={{ marginTop: 2 }}>{r.reason}</div>}
                        {r.status === "rejected" && r.rejectionReason && (
                          <div className="tiny" style={{ marginTop: 2, color: "var(--c-bad)" }}>
                            Rejected: {r.rejectionReason}
                          </div>
                        )}
                      </td>
                      <td data-label="Date" className="nowrap">{formatRange(r.startDate, r.endDate)}</td>
                      <td data-label="Days" className="r num">{r.leaveDays}</td>
                      <td data-label="Status"><StatusBadge status={r.status} /></td>
                      <td data-label="Submitted" className="muted-sm nowrap">{formatDate(r.createdAt.slice(0, 10))}</td>
                      <td data-label="Action" className="r">
                        {r.status === "pending"
                          ? <AdminDecision request={r} />
                          : <span className="tiny">
                              {r.approvedByName ? `by ${r.approvedByName}` : "—"}
                            </span>}
                      </td>
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
