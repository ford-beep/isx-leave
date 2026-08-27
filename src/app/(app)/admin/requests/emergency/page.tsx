import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { companyToday } from "@/lib/date";
import { getEmployeeOverview } from "@/lib/queries";
import { Card, CardHead } from "@/components/ui";
import { EmergencyLeaveForm } from "@/components/EmergencyLeaveForm";

export const dynamic = "force-dynamic";

export default async function EmergencyLeavePage() {
  const me = await requireAdmin();
  const year = Number(companyToday().slice(0, 4));

  const employees = await getEmployeeOverview(me.id, year);

  return (
    <>
      <div className="page-head">
        <div className="grow">
          <h1>Add emergency leave</h1>
          <p className="muted">
            Use this when an employee cannot submit leave at least 7 days in advance.
          </p>
        </div>

        <Link href="/admin/requests" className="btn">
          Back to requests
        </Link>
      </div>

      <Card>
        <CardHead
          title="Emergency leave"
          sub="The request will be created as pending and must still be approved."
        />

        <div className="card-body">
          <EmergencyLeaveForm
            employees={employees
              .filter((employee) => employee.active)
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