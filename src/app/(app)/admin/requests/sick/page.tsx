import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { companyToday } from "@/lib/date";
import { getEmployeeOverview } from "@/lib/queries";
import { Card, CardHead } from "@/components/ui";
import { SickLeaveForm } from "@/components/SickLeaveForm";

export const dynamic = "force-dynamic";

export default async function SickLeavePage() {
  const me = await requireAdmin();
  const year = Number(
    companyToday().slice(0, 4),
  );

  const employees =
    await getEmployeeOverview(me.id, year);

  return (
    <>
      <div className="page-head">
        <div className="grow">
          <h1>Add sick leave</h1>

          <p className="muted">
            Record sick leave on behalf of an
            employee.
          </p>
        </div>

        <Link
          href="/admin/requests"
          className="btn"
        >
          Back to requests
        </Link>
      </div>

      <Card>
        <CardHead
          title="Sick leave"
          sub="Sick leave is approved immediately and does not deduct Annual Leave or Comp Day balance."
        />

        <div className="card-body">
          <SickLeaveForm
            employees={employees
              .filter(
                (employee) =>
                  employee.active,
              )
              .map((employee) => ({
                id: employee.id,
                name: employee.name,
              }))}
          />
        </div>
      </Card>
    </>
  );
}