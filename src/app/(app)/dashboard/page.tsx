import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { companyToday, formatRange, relativeDayLabel } from "@/lib/date";
import { getDashboardQuote } from "@/lib/dashboardQuote";
import { getDashboardSeason } from "@/lib/dashboardSeason";
import {
  getBalance,
  getCalendarBirthdays,
  getCompanyLeaveCalendar,
  getHolidays,
  getMyRequests,
  getNextUpcomingLeave,
  getOfficeDays,
  getWorkSchedule,
  getSickLeaveUsed,
  getAllowNextYearLeave,
} from "@/lib/queries";
import { Card, CardHead, Kpi } from "@/components/ui";
import { LeaveTable } from "@/components/LeaveTable";
import { MonthCalendar } from "@/components/MonthCalendar";
import { IconPlus } from "@/components/icons";
import { ChristmasGingerbread } from "@/components/ChristmasGingerbread";

export const dynamic = "force-dynamic";

function greeting() {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Bangkok",
      hour: "2-digit",
      hour12: false,
    }).format(new Date()),
  );

  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ y?: string; m?: string }>;
}) {
  const me = await requireUser();
  const today = companyToday();
  const year = Number(today.slice(0, 4));
  const allowNextYearLeave =
  await getAllowNextYearLeave(me.id);

const maxCalendarYear =
  allowNextYearLeave
    ? year + 1
    : year;
  const sp = await searchParams;
  const requestedCalYear =
  Number(sp.y) || year;

const calYear = Math.min(
  requestedCalYear,
  maxCalendarYear,
);
  const calMonth = Number(sp.m) || Number(today.slice(5, 7));

  const [
    balance,
    sickLeaveUsed,
    next,
    recent,
    office,
    holidays,
    companyLeaves,
    workSchedule,
    birthdays,
  ] = await Promise.all([
    getBalance(me.id, me.id, year),
    getSickLeaveUsed(me.id, me.id, year),
    getNextUpcomingLeave(me.id),
    getMyRequests(me.id, 5),
    getOfficeDays(me.id),
    getHolidays(me.id, calYear),
    getCompanyLeaveCalendar(me.id, calYear, calMonth),
    getWorkSchedule(me.id, calYear, calMonth),
    getCalendarBirthdays(me.id),
  ]);

  const dashboardQuote = getDashboardQuote(today);
  const dashboardSeason = getDashboardSeason(today);
  const isChristmas = dashboardSeason === "christmas";

  return (
    <div className={isChristmas ? "dashboard-christmas" : ""}>
      {/* Christmas background decorations */}
      {isChristmas && (
        <div className="christmas-decorations" aria-hidden="true">
          <img
            src="/seasonal/christmas/christmas-lights.svg"
            alt=""
            className="christmas-lights-art"
          />

          <div className="christmas-snow">
            {Array.from({ length: 28 }).map((_, index) => (
              <span
                key={index}
                className={`christmas-snowflake christmas-snowflake-${
                  (index % 8) + 1
                }`}
              >
                •
              </span>
            ))}
          </div>

          <img
            src="/seasonal/christmas/christmas-tree.webp"
            alt=""
            className="christmas-tree"
          />
        </div>
      )}

      {/* Dashboard content */}
      <div className={isChristmas ? "dashboard-christmas-content" : ""}>
        {/* Christmas Gingerbread */}
        {isChristmas && (
          <div className="christmas-greeting-row" aria-hidden="true">
            <ChristmasGingerbread />

            <div className="christmas-sparkle christmas-sparkle-1">✦</div>
            <div className="christmas-sparkle christmas-sparkle-2">✦</div>
          </div>
        )}

        {/* Greeting */}
        <div className="page-head">
          <div className="grow">
            <h1>
              {greeting()}, {me.name.split(" ")[0]}
            </h1>

            <p className="muted">{dashboardQuote}</p>
          </div>

          <Link href="/request" className="btn btn-primary">
            <IconPlus size={16} />
            Request leave
          </Link>
        </div>

        {/* KPI */}
        <div className="kpis">
          <Kpi
            label="Annual entitlement"
            value={balance.entitlement}
            unit="days"
            sub={`For ${year}`}
          />

          <Kpi
            label="Used"
            value={balance.approved}
            unit="days"
            meter={{
              used: balance.approved,
              total: balance.entitlement,
            }}
            sub={
              balance.pending > 0
                ? `${balance.pending} more awaiting approval`
                : "Approved leave only"
            }
          />

          <Kpi
            label="Remaining"
            value={balance.remaining}
            unit="days"
            tone="accent"
            sub={`${balance.available} available once pending is counted`}
          />

          {/* Sick Leave */}
          {isChristmas ? (
            <div className="kpi christmas-sick-kpi">
              <div className="kpi-label">Sick leave</div>

              <div className="kpi-value">
                {sickLeaveUsed}
                <span className="unit">days</span>
              </div>

              <div className="kpi-sub">Used in {year}</div>

              <img
                src="/seasonal/christmas/Snowman.svg"
                alt=""
                className="christmas-sick-snowman"
                aria-hidden="true"
              />
            </div>
          ) : (
            <Kpi
              label="Sick leave"
              value={sickLeaveUsed}
              unit="days"
              sub={`Used in ${year}`}
            />
          )}
        </div>

        {/* Weekly Plan */}
        <Link href="/weekly-plan" className="dashboard-weekly-plan">
          <div className="dashboard-weekly-plan-copy">
            <div className="dashboard-weekly-plan-icon" aria-hidden="true">
              <span>W</span>
            </div>

            <div>
              <strong>Weekly Plan</strong>
              <p>Plan and update your work for this week.</p>
            </div>
          </div>

          <span className="dashboard-weekly-plan-action">
            Open weekly plan
            <span aria-hidden="true">→</span>
          </span>
        </Link>

        {/* Calendar + Upcoming Leave */}
        <div className="section grid-2">
          <Card>
            <CardHead
              title={
                calMonth === Number(today.slice(5, 7)) && calYear === year
                  ? "This month"
                  : "Calendar"
              }
              sub="Company leave, Office/WFH schedule, birthdays and Thai public holidays."
            />

            <div className="card-body">
              <MonthCalendar
                year={calYear}
                maxYear={maxCalendarYear}
                month={calMonth}
                officeWeekdays={office.weekdays}
                workSchedule={workSchedule}
                holidays={holidays}
                requests={[]}
                companyLeaves={companyLeaves}
                birthdays={birthdays}
                mode="employee"
                basePath="/dashboard"
              />
            </div>
          </Card>

          <div className="stack">
            <Card>
              <CardHead title="Upcoming leave" />

              <div className="card-body">
                {next ? (
                  <>
                    <div
                      style={{
                        fontSize: 18,
                        fontWeight: 650,
                        letterSpacing: "-0.02em",
                      }}
                    >
                      {formatRange(next.startDate, next.endDate)}
                    </div>

                    <div
                      className="row"
                      style={{
                        marginTop: 8,
                        gap: 8,
                      }}
                    >
                      <span className="badge badge-approved">Approved</span>

                      <span className="chip">{next.leaveTypeLabel}</span>

                      <span className="chip">
                        {next.leaveDays} day
                        {next.leaveDays === 1 ? "" : "s"}
                      </span>
                    </div>

                    <p className="muted-sm mt-16">
                      Starts {relativeDayLabel(next.startDate, today)}.
                    </p>
                  </>
                ) : (
                  <p className="muted-sm">No upcoming leave.</p>
                )}
              </div>
            </Card>
          </div>
        </div>

        {/* Recent Leave */}
        <div className="section">
          <Card>
            <CardHead
              title="Recent leave requests"
              action={
                <Link href="/my-leave" className="btn btn-sm">
                  View all
                </Link>
              }
            />

            <div className="card-body flush">
              <LeaveTable
                requests={recent}
                emptyAction={
                  <Link href="/request" className="btn btn-primary">
                    <IconPlus size={16} />
                    Request leave
                  </Link>
                }
              />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}