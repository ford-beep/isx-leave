import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { companyToday } from "@/lib/date";
import {
  getCompDayBalance,
  getEmployeeOverview,
} from "@/lib/queries";
import { Card, CardHead } from "@/components/ui";
import { GrantCompDayForm } from "./GrantCompDayForm";

export const dynamic = "force-dynamic";

export default async function CompDaysPage() {
  const me = await requireAdmin();

  const today = companyToday();
  const year = Number(today.slice(0, 4));

  const roster = await getEmployeeOverview(
    me.id,
    year,
  );

  const employees = roster.filter(
    (employee) =>
      employee.active &&
      employee.role === "employee",
  );

  const balances = await Promise.all(
    employees.map(async (employee) => ({
      employee,
      balance: await getCompDayBalance(
        me.id,
        employee.id,
        year,
      ),
    })),
  );

  return (
    <>
      <div className="page-head">
        <div className="grow">
          <h1>Comp Days</h1>

          <p className="muted">
            Grant and review compensatory leave for{" "}
            {year}.
          </p>
        </div>
      </div>

      <div className="grid-2">
        <GrantCompDayForm
          employees={employees.map((employee) => ({
            id: employee.id,
            name: employee.name,
            email: employee.email,
          }))}
        />

        <Card>
  <CardHead
    title="Comp Day balances"
    sub={`Current balances for ${year}.`}
  />

  <div className="card-body flush">
    {balances.length === 0 ? (
      <div style={{ padding: 20 }}>
        <p className="muted-sm">
          No active employees found.
        </p>
      </div>
    ) : (
      <div>
        {balances.map(
          ({ employee, balance }, index) => (
            <Link
              key={employee.id}
              href={`/admin/comp-days/${employee.id}`}
              style={{
                display: "block",
                padding: "16px 20px",
                textDecoration: "none",
                color: "inherit",
                borderBottom:
                  index === balances.length - 1
                    ? "none"
                    : "1px solid var(--border)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 20,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontWeight: 700,
                      marginBottom: 3,
                    }}
                  >
                    {employee.name}
                  </div>

                  <div className="tiny">
                    {employee.email}
                  </div>

                  <div
                    className="muted-sm"
                    style={{ marginTop: 8 }}
                  >
                    Earned {balance.earned}
                    {" · "}
                    Used {balance.approved}
                    {" · "}
                    Pending {balance.pending}
                  </div>
                </div>

                <div
                  style={{
                    flexShrink: 0,
                    textAlign: "right",
                  }}
                >
                  <div
                    style={{
                      fontWeight: 700,
                      fontSize: 16,
                    }}
                  >
                    {balance.available}
                  </div>

                  <div className="tiny">
                    available&nbsp;&nbsp;›
                  </div>
                </div>
              </div>
            </Link>
          ),
        )}
      </div>
    )}
  </div>
</Card>
      </div>
    </>
  );
}