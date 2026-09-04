import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { companyToday } from "@/lib/date";
import { getEmployeeOverview, getSetting } from "@/lib/queries";
import { Card, CardHead, EmptyState, Person } from "@/components/ui";
import { NewEmployeeButton } from "./NewEmployeeButton";
import { IconUsers } from "@/components/icons";

export const dynamic = "force-dynamic";

export default async function EmployeesPage() {
  const me = await requireAdmin();
  const year = Number(companyToday().slice(0, 4));
  const [employees, defaultEntitlement] = await Promise.all([
    getEmployeeOverview(me.id, year),
    getSetting(me.id, "default_annual_entitlement"),
  ]);

  return (
    <>
      <div className="page-head">
        <div className="grow">
          <h1>Employees</h1>
          <p className="muted">{employees.length} people · {year} balances</p>
        </div>
        <NewEmployeeButton defaultEntitlement={Number(defaultEntitlement ?? 15)} />
      </div>

      <Card>
        <CardHead title="All employees" />
        <div className="card-body flush">
          {employees.length === 0 ? (
            <EmptyState icon={<IconUsers size={20} />} title="No employees found."
              body="Add your first employee to get started." />
          ) : (
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
  <th>Name</th>
  <th>Role</th>
  <th className="r">Entitlement</th>
  <th className="r">Used</th>
  <th className="r">Remaining</th>
  <th className="r">Sick leave</th>
  <th>Status</th>
  <th className="r">Action</th>
</tr>
                </thead>
                <tbody>
                  {employees.map((e) => (
                    <tr key={e.id}>
                      <td data-label="Name"><Person name={e.name} email={e.email} /></td>
                      <td data-label="Role">
                        <span className={`badge plain ${e.role === "admin" ? "badge-brand" : "badge-cancelled"}`}>
                          {e.role === "admin" ? "Admin" : "Employee"}
                        </span>
                      </td>
                     <td data-label="Entitlement" className="r num">{e.entitlement}</td>
<td data-label="Used" className="r num">{e.used}</td>
<td data-label="Remaining" className="r num primary">{e.remaining}</td>
<td data-label="Sick leave" className="r num">{e.sickLeaveUsed}</td>
<td data-label="Status">
                        <span className={`badge ${e.active ? "badge-approved" : "badge-cancelled"}`}>
                          {e.active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td data-label="Action" className="r">
                        <div className="actions">
                          <Link className="btn btn-sm" href={`/admin/employees/${e.id}`}>View</Link>
                        </div>
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
