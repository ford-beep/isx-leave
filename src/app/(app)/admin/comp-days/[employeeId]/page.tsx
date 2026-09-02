import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { companyToday } from "@/lib/date";
import {
  getAllRequests,
  getCompDayBalance,
  getCompDayCredits,
  getUser,
} from "@/lib/queries";
import { Card, CardHead, Kpi } from "@/components/ui";

export const dynamic = "force-dynamic";

function formatDate(date: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

function sessionLabel(session: string) {
  if (session === "morning") {
    return "Half Day · Morning";
  }

  if (session === "afternoon") {
    return "Half Day · Afternoon";
  }

  if (session === "half_day") {
    return "Half Day";
  }

  return "Full Day";
}

function statusLabel(status: string) {
  return (
    status.charAt(0).toUpperCase() +
    status.slice(1)
  );
}

export default async function CompDayEmployeePage({
  params,
}: {
  params: Promise<{ employeeId: string }>;
}) {
  const me = await requireAdmin();
  const { employeeId } = await params;

  const year = Number(companyToday().slice(0, 4));

  const [employee, balance, credits, requests] =
    await Promise.all([
      getUser(me.id, employeeId),
      getCompDayBalance(me.id, employeeId, year),
      getCompDayCredits(me.id, employeeId, year),
      getAllRequests(me.id, { employeeId }),
    ]);

  if (
    !employee ||
    employee.role !== "employee"
  ) {
    notFound();
  }

  const compRequests = requests.filter(
    (request) =>
      request.leaveType === "comp_day" &&
      Number(request.startDate.slice(0, 4)) === year,
  );

  return (
    <>
      <div className="page-head">
        <div className="grow">
          <Link
            href="/admin/comp-days"
            className="muted-sm"
          >
            ← Comp Days
          </Link>

          <h1 style={{ marginTop: 8 }}>
            {employee.name}
          </h1>

          <p className="muted">
            {employee.email} · Comp Day details for{" "}
            {year}
          </p>
        </div>
      </div>

      <div className="kpis k4">
        <Kpi
          label="Earned"
          value={balance.earned}
          unit="days"
        />

        <Kpi
          label="Approved / used"
          value={balance.approved}
          unit="days"
        />

        <Kpi
          label="Pending"
          value={balance.pending}
          unit="days"
        />

        <Kpi
          label="Available"
          value={balance.available}
          unit="days"
          tone="accent"
        />
      </div>

      <div className="section">
        <Card>
          <CardHead
            title="Earned from"
            sub={`Weekend or company holiday work credited in ${year}.`}
          />

          <div className="card-body">
            {credits.length === 0 ? (
              <p className="muted-sm">
                No Comp Days earned in {year}.
              </p>
            ) : (
              <div className="stack">
                {credits.map((credit) => (
                  <div
                    key={credit.id}
                    className="breakdown"
                  >
                    <div className="breakdown-row">
                      <span className="lbl">
                        <b>
                          {formatDate(
                            credit.earnedDate,
                          )}
                        </b>

                        {credit.note ? (
                          <>
                            <br />
                            <span className="tiny">
                              {credit.note}
                            </span>
                          </>
                        ) : null}
                      </span>

                      <span className="val">
                        +1 Comp Day
                      </span>
                    </div>

                    <div className="breakdown-row">
                      <span className="lbl">
                        Granted by
                      </span>

                      <span className="val">
                        {credit.createdByName ??
                          "Unknown"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      </div>

      <div className="section">
        <Card>
          <CardHead
            title="Comp Day leave history"
            sub={`${compRequests.length} request${
              compRequests.length === 1
                ? ""
                : "s"
            } in ${year}.`}
          />

          <div className="card-body">
            {compRequests.length === 0 ? (
              <p className="muted-sm">
                No Comp Day leave requests in {year}.
              </p>
            ) : (
              <div className="stack">
                {compRequests.map((request) => (
                  <div
                    key={request.id}
                    className="breakdown"
                  >
                    <div className="breakdown-row">
                      <span className="lbl">
                        <b>
                          {formatDate(
                            request.startDate,
                          )}
                        </b>
                        <br />
                        <span className="tiny">
                          {sessionLabel(
                            request.leaveSession,
                          )}
                        </span>
                      </span>

                      <span className="val">
                        {request.leaveDays} day
                        {request.leaveDays === 1
                          ? ""
                          : "s"}
                      </span>
                    </div>

                    <div className="breakdown-row">
                      <span className="lbl">
                        Status
                      </span>

                      <span className="val">
                        {statusLabel(
                          request.status,
                        )}
                      </span>
                    </div>

                    {request.reason ? (
                      <div className="breakdown-row">
                        <span className="lbl">
                          Note
                        </span>

                        <span className="val">
                          {request.reason}
                        </span>
                      </div>
                    ) : null}
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