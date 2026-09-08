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
import { Card, CardHead } from "@/components/ui";

export const dynamic = "force-dynamic";

function formatDate(date: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

function formatAmount(value: number) {
  return Number.isInteger(value)
    ? String(value)
    : value.toFixed(1);
}

function pluralDay(value: number) {
  return `${formatAmount(value)} day${
    value === 1 ? "" : "s"
  }`;
}

function formatSession(session: string) {
  if (session === "morning") {
    return "Morning";
  }

  if (session === "afternoon") {
    return "Afternoon";
  }

  if (session === "half_day") {
    return "Half Day";
  }

  return "Full Day";
}

function formatHistorySession(session: string) {
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

function formatRequestDateRange(
  startDate: string,
  endDate: string,
) {
  if (startDate === endDate) {
    return formatDate(startDate);
  }

  return `${formatDate(
    startDate,
  )} – ${formatDate(endDate)}`;
}

export default async function CompDayEmployeePage({
  params,
}: {
  params: Promise<{ employeeId: string }>;
}) {
  const me = await requireAdmin();
  const { employeeId } = await params;

  const year = Number(
    companyToday().slice(0, 4),
  );

  const [
    employee,
    balance,
    credits,
    requests,
  ] = await Promise.all([
    getUser(me.id, employeeId),
    getCompDayBalance(
      me.id,
      employeeId,
      year,
    ),
    getCompDayCredits(
      me.id,
      employeeId,
      year,
    ),
    getAllRequests(me.id, {
      employeeId,
    }),
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
      Number(
        request.startDate.slice(0, 4),
      ) === year,
  );

  const requestById = new Map(
    compRequests.map((request) => [
      request.id,
      request,
    ]),
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
            {employee.email} · Comp Day
            details for {year}
          </p>
        </div>
      </div>

      <div className="section">
        <Card>
          <CardHead
            title="Comp Days"
            sub={`Compensatory leave balance for ${employee.name} in ${year}.`}
          />

          <div className="card-body">
            {/* Summary */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(auto-fit, minmax(150px, 1fr))",
                gap: 12,
                marginBottom: 28,
              }}
            >
              <div
                style={{
                  padding: "16px 18px",
                  border:
                    "1px solid var(--border)",
                  borderRadius: 14,
                }}
              >
                <div className="tiny">
                  Earned this year
                </div>

                <div
                  style={{
                    marginTop: 4,
                    fontSize: 24,
                    fontWeight: 750,
                  }}
                >
                  {pluralDay(
                    balance.earned,
                  )}
                </div>
              </div>

              <div
                style={{
                  padding: "16px 18px",
                  border:
                    "1px solid var(--border)",
                  borderRadius: 14,
                }}
              >
                <div className="tiny">
                  Used / approved
                </div>

                <div
                  style={{
                    marginTop: 4,
                    fontSize: 24,
                    fontWeight: 750,
                  }}
                >
                  {pluralDay(
                    balance.approved,
                  )}
                </div>
              </div>

              <div
                style={{
                  padding: "16px 18px",
                  border:
                    "1px solid var(--border)",
                  borderRadius: 14,
                }}
              >
                <div className="tiny">
                  Pending
                </div>

                <div
                  style={{
                    marginTop: 4,
                    fontSize: 24,
                    fontWeight: 750,
                  }}
                >
                  {pluralDay(
                    balance.pending,
                  )}
                </div>
              </div>

              <div
                style={{
                  padding: "16px 18px",
                  border:
                    "1px solid var(--border)",
                  borderRadius: 14,
                  background:
                    "color-mix(in srgb, var(--c-accent) 7%, transparent)",
                }}
              >
                <div className="tiny">
                  Available to book
                </div>

                <div
                  style={{
                    marginTop: 4,
                    fontSize: 24,
                    fontWeight: 800,
                  }}
                >
                  {pluralDay(
                    balance.available,
                  )}
                </div>
              </div>
            </div>

            {/* Earned credits */}
            <div
              style={{
                paddingTop: 20,
                borderTop:
                  "1px solid var(--border)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent:
                    "space-between",
                  alignItems:
                    "flex-start",
                  gap: 16,
                  marginBottom: 14,
                }}
              >
                <div>
                  <div
                    style={{
                      fontWeight: 750,
                      fontSize: 16,
                    }}
                  >
                    Earned from
                  </div>

                  <div className="muted-sm">
                    Weekend or company
                    holiday work credited
                    to this employee.
                  </div>
                </div>

                <div
                  className="tiny"
                  style={{
                    textAlign: "right",
                    whiteSpace: "nowrap",
                  }}
                >
                  Oldest credit is used
                  first
                </div>
              </div>

              {credits.length === 0 ? (
                <p className="muted-sm">
                  No Comp Days earned in{" "}
                  {year}.
                </p>
              ) : (
                <div
                  style={{
                    border:
                      "1px solid var(--border)",
                    borderRadius: 14,
                    overflow: "hidden",
                  }}
                >
                  {credits.map(
                    (
                      credit,
                      creditIndex,
                    ) => {
                      const activeAmount =
                        credit.reservedAmount +
                        credit.usedAmount;

                      const status =
                        credit.usedAmount >=
                        0.9999
                          ? "Used"
                          : credit.usedAmount >
                              0.0001
                            ? "Partially used"
                            : credit.reservedAmount >
                                0.0001
                              ? "Reserved"
                              : "Available";

                      const statusStyle =
                        status === "Used"
                          ? {
                              background:
                                "rgba(16, 185, 129, 0.10)",
                              color:
                                "#047857",
                              border:
                                "1px solid rgba(16, 185, 129, 0.18)",
                            }
                          : status ===
                              "Partially used"
                            ? {
                                background:
                                  "rgba(59, 130, 246, 0.10)",
                                color:
                                  "#1d4ed8",
                                border:
                                  "1px solid rgba(59, 130, 246, 0.18)",
                              }
                            : status ===
                                "Reserved"
                              ? {
                                  background:
                                    "rgba(245, 158, 11, 0.10)",
                                  color:
                                    "#b45309",
                                  border:
                                    "1px solid rgba(245, 158, 11, 0.20)",
                                }
                              : {
                                  background:
                                    "rgba(100, 116, 139, 0.08)",
                                  color:
                                    "var(--text)",
                                  border:
                                    "1px solid var(--border)",
                                };

                      const approvedUsages =
                        credit.usages.filter(
                          (usage) =>
                            usage.status ===
                            "approved",
                        );

                      const pendingUsages =
                        credit.usages.filter(
                          (usage) =>
                            usage.status ===
                            "pending",
                        );

                      return (
                        <div
                          key={credit.id}
                          style={{
                            padding:
                              "18px 18px",
                            borderTop:
                              creditIndex ===
                              0
                                ? undefined
                                : "1px solid var(--border)",
                          }}
                        >
                          <div
                            style={{
                              display:
                                "grid",
                              gridTemplateColumns:
                                "minmax(180px, 1.4fr) minmax(135px, .75fr) minmax(210px, 1.25fr) minmax(130px, .7fr)",
                              gap: 18,
                              alignItems:
                                "center",
                            }}
                          >
                            {/* Earned date / note */}
                            <div>
                              <div
                                style={{
                                  fontWeight:
                                    750,
                                  fontSize: 15,
                                }}
                              >
                                {formatDate(
                                  credit.earnedDate,
                                )}
                              </div>

                              {credit.note ? (
                                <div
                                  className="muted-sm"
                                  style={{
                                    marginTop: 3,
                                  }}
                                >
                                  {
                                    credit.note
                                  }
                                </div>
                              ) : (
                                <div
                                  className="muted-sm"
                                  style={{
                                    marginTop: 3,
                                  }}
                                >
                                  Comp Day
                                  credit
                                </div>
                              )}
                            </div>

                            {/* Status */}
                            <div>
                              <span
                                style={{
                                  display:
                                    "inline-flex",
                                  alignItems:
                                    "center",
                                  gap: 7,
                                  padding:
                                    "7px 11px",
                                  borderRadius:
                                    999,
                                  fontSize: 13,
                                  fontWeight:
                                    700,
                                  ...statusStyle,
                                }}
                              >
                                <span
                                  style={{
                                    width: 8,
                                    height: 8,
                                    borderRadius:
                                      "50%",
                                    background:
                                      "currentColor",
                                    opacity: 0.9,
                                  }}
                                />

                                {status}
                              </span>
                            </div>

                            {/* Usage */}
                            <div>
                              {activeAmount <=
                              0.0001 ? (
                                <div className="muted-sm">
                                  Not used yet
                                </div>
                              ) : (
                                <div
                                  style={{
                                    display:
                                      "flex",
                                    flexDirection:
                                      "column",
                                    gap: 6,
                                  }}
                                >
                                  <div
                                    style={{
                                      fontSize: 14,
                                      fontWeight:
                                        650,
                                    }}
                                  >
                                    {credit.usedAmount >=
                                    0.9999
                                      ? "Credit fully used"
                                      : credit.usedAmount >
                                            0.0001 &&
                                          credit.reservedAmount >
                                            0.0001
                                        ? `${formatAmount(
                                            credit.usedAmount,
                                          )} used · ${formatAmount(
                                            credit.reservedAmount,
                                          )} pending`
                                        : credit.usedAmount >
                                            0.0001
                                          ? `Used ${formatAmount(
                                              credit.usedAmount,
                                            )} of 1 day`
                                          : credit.reservedAmount >
                                              0.0001
                                            ? `${formatAmount(
                                                credit.reservedAmount,
                                              )} day reserved`
                                            : "Not used yet"}
                                  </div>

                                  {approvedUsages.map(
                                    (
                                      usage,
                                    ) => {
                                      const request =
                                        requestById.get(
                                          usage.requestId,
                                        );

                                      const dateLabel =
                                        request
                                          ? formatRequestDateRange(
                                              request.startDate,
                                              request.endDate,
                                            )
                                          : formatDate(
                                              usage.leaveDate,
                                            );

                                      const session =
                                        request
                                          ? request.leaveSession
                                          : usage.leaveSession;

                                      return (
                                        <Link
                                          key={`approved-${usage.requestId}`}
                                          href={`/admin/requests?request=${usage.requestId}`}
                                          className="tiny"
                                          style={{
                                            color:
                                              "inherit",
                                            textDecoration:
                                              "none",
                                          }}
                                        >
                                          Used on{" "}
                                          {
                                            dateLabel
                                          }
                                          {" · "}
                                          {formatSession(
                                            session,
                                          )}
                                          {" · "}
                                          {formatAmount(
                                            usage.amount,
                                          )}{" "}
                                          day
                                        </Link>
                                      );
                                    },
                                  )}

                                  {pendingUsages.map(
                                    (
                                      usage,
                                    ) => {
                                      const request =
                                        requestById.get(
                                          usage.requestId,
                                        );

                                      const dateLabel =
                                        request
                                          ? formatRequestDateRange(
                                              request.startDate,
                                              request.endDate,
                                            )
                                          : formatDate(
                                              usage.leaveDate,
                                            );

                                      const session =
                                        request
                                          ? request.leaveSession
                                          : usage.leaveSession;

                                      return (
                                        <Link
                                          key={`pending-${usage.requestId}`}
                                          href={`/admin/requests?request=${usage.requestId}`}
                                          className="tiny"
                                          style={{
                                            color:
                                              "inherit",
                                            textDecoration:
                                              "none",
                                            fontWeight:
                                              650,
                                          }}
                                        >
                                          Pending for{" "}
                                          {
                                            dateLabel
                                          }
                                          {" · "}
                                          {formatSession(
                                            session,
                                          )}
                                          {" · "}
                                          {formatAmount(
                                            usage.amount,
                                          )}{" "}
                                          day
                                        </Link>
                                      );
                                    },
                                  )}

                                  {credit.availableAmount >
                                  0.0001 ? (
                                    <div className="tiny">
                                      Remaining{" "}
                                      {pluralDay(
                                        credit.availableAmount,
                                      )}
                                    </div>
                                  ) : null}
                                </div>
                              )}
                            </div>

                            {/* Credit amount / creator */}
                            <div
                              style={{
                                textAlign:
                                  "right",
                              }}
                            >
                              <div
                                style={{
                                  fontWeight:
                                    800,
                                  fontSize: 15,
                                }}
                              >
                                +1 Comp Day
                              </div>

                              {credit.createdByName ? (
                                <div
                                  className="muted-sm"
                                  style={{
                                    marginTop: 3,
                                  }}
                                >
                                  Granted by{" "}
                                  <b>
                                    {
                                      credit.createdByName
                                    }
                                  </b>
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      );
                    },
                  )}
                </div>
              )}

              <div
                style={{
                  marginTop: 14,
                  padding: "12px 14px",
                  display: "flex",
                  gap: 10,
                  alignItems:
                    "flex-start",
                  border:
                    "1px solid var(--border)",
                  borderRadius: 12,
                  background:
                    "rgba(59, 130, 246, 0.05)",
                }}
              >
                <div
                  style={{
                    width: 20,
                    height: 20,
                    minWidth: 20,
                    borderRadius: "50%",
                    display: "grid",
                    placeItems:
                      "center",
                    border:
                      "1px solid currentColor",
                    fontSize: 12,
                    fontWeight: 800,
                  }}
                >
                  i
                </div>

                <div className="muted-sm">
                  Comp Days are used on
                  a{" "}
                  <b>
                    first-in, first-out
                    (FIFO)
                  </b>{" "}
                  basis. The oldest
                  available credit is
                  reserved and used
                  first.
                </div>
              </div>
            </div>
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
                No Comp Day leave
                requests in {year}.
              </p>
            ) : (
              <div className="stack">
                {compRequests.map(
                  (request) => (
                    <div
                      key={request.id}
                      className="breakdown"
                    >
                      <div className="breakdown-row">
                        <span className="lbl">
                          <b>
                            <Link
                              href={`/admin/requests?request=${request.id}`}
                              style={{
                                color:
                                  "inherit",
                                textDecoration:
                                  "none",
                              }}
                            >
                              {formatRequestDateRange(
                                request.startDate,
                                request.endDate,
                              )}
                            </Link>
                          </b>

                          <br />

                          <span className="tiny">
                            {formatHistorySession(
                              request.leaveSession,
                            )}
                          </span>
                        </span>

                        <span className="val">
                          {
                            request.leaveDays
                          }{" "}
                          day
                          {request.leaveDays ===
                          1
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
                            {
                              request.reason
                            }
                          </span>
                        </div>
                      ) : null}

                      <div className="breakdown-row">
                        <span className="lbl">
                          Request
                        </span>

                        <span className="val">
                          <Link
                            href={`/admin/requests?request=${request.id}`}
                          >
                            View request →
                          </Link>
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