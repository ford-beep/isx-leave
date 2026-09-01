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

          <div className="card-body">
            {balances.length === 0 ? (
              <p className="muted-sm">
                No active employees found.
              </p>
            ) : (
              <div className="stack">
                {balances.map(
                  ({ employee, balance }) => (
                    <div
                      key={employee.id}
                      className="breakdown"
                    >
                      <div className="breakdown-row">
                        <span className="lbl">
                          <b>{employee.name}</b>
                          <br />
                          <span className="tiny">
                            {employee.email}
                          </span>
                        </span>

                        <span className="val">
                          {balance.available} available
                        </span>
                      </div>

                      <div className="breakdown-row">
                        <span className="lbl">
                          Earned
                        </span>
                        <span className="val">
                          {balance.earned}
                        </span>
                      </div>

                      <div className="breakdown-row">
                        <span className="lbl">
                          Approved / used
                        </span>
                        <span className="val">
                          {balance.approved}
                        </span>
                      </div>

                      <div className="breakdown-row">
                        <span className="lbl">
                          Pending
                        </span>
                        <span className="val">
                          {balance.pending}
                        </span>
                      </div>

                      <div className="breakdown-row total">
                        <span className="lbl">
                          Available
                        </span>
                        <span className="val">
                          {balance.available}
                        </span>
                      </div>
                    </div>
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