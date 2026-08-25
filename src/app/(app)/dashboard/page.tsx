import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { companyToday, formatRange, relativeDayLabel, WEEKDAY_NAMES } from "@/lib/date";
import {
  getBalance, getHolidays, getLeaveTypes, getMyRequests, getNextUpcomingLeave,
  getOfficeDays, getRequestsInMonth,getWorkSchedule,
} from "@/lib/queries";
import { Card, CardHead, Kpi } from "@/components/ui";
import { LeaveTable } from "@/components/LeaveTable";
import { MonthCalendar } from "@/components/MonthCalendar";
import { IconPlus } from "@/components/icons";

export const dynamic = "force-dynamic";

function greeting() {
  const hour = Number(new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok", hour: "2-digit", hour12: false,
  }).format(new Date()));
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default async function DashboardPage({
  searchParams,
}: { searchParams: Promise<{ y?: string; m?: string }> }) {
  const me = await requireUser();
  const today = companyToday();
  const year = Number(today.slice(0, 4));
  const sp = await searchParams;
  const calYear = Number(sp.y) || year;
  const calMonth = Number(sp.m) || Number(today.slice(5, 7));

const [
  balance,
  next,
  recent,
  office,
  holidays,
  monthRequests,
  leaveTypes,
  workSchedule,
] = await Promise.all([
  getBalance(me.id, me.id, year),
  getNextUpcomingLeave(me.id),
  getMyRequests(me.id, 5),
  getOfficeDays(me.id),
  getHolidays(me.id, calYear),
  getRequestsInMonth(me.id, calYear, calMonth),
  getLeaveTypes(me.id),
  getWorkSchedule(me.id, calYear, calMonth),
]);

  const officeNames = office.weekdays.map((d) => WEEKDAY_NAMES[d]).join(" + ") || "not configured";

  return (
    <>
      <div className="page-head">
        <div className="grow">
          <h1>{greeting()}, {me.name.split(" ")[0]}</h1>
          <p className="muted">
            ISX working days are <b>{officeNames}</b>. All working days count against your leave, whether Office or WFH.
          </p>
        </div>
        <Link href="/request" className="btn btn-primary"><IconPlus size={16} />Request leave</Link>
      </div>

      <div className="kpis">
        <Kpi label="Annual entitlement" value={balance.entitlement} unit="days"
          sub={`For ${year}`} />
        <Kpi label="Used" value={balance.approved} unit="days"
          meter={{ used: balance.approved, total: balance.entitlement }}
          sub={balance.pending > 0 ? `${balance.pending} more awaiting approval` : "Approved leave only"} />
        <Kpi label="Remaining" value={balance.remaining} unit="days" tone="accent"
          sub={`${balance.available} available once pending is counted`} />
        <Kpi
          label="Next leave"
          value={next ? formatRange(next.startDate, next.endDate) : "None"}
          sub={next
            ? `${next.leaveTypeLabel} · ${next.leaveDays} day${next.leaveDays === 1 ? "" : "s"} · ${relativeDayLabel(next.startDate, today)}`
            : "No upcoming leave"} />
      </div>

      <div className="section grid-2">
        <Card>
          <CardHead title={`${calMonth === Number(today.slice(5, 7)) && calYear === year ? "This month" : "Calendar"}`}
            sub="Your leave, Office/WFH schedule and Thai public holidays." />
          <div className="card-body">
            <MonthCalendar
              year={calYear}
              month={calMonth}
              officeWeekdays={office.weekdays}
              workSchedule={workSchedule}
              holidays={holidays}
              requests={monthRequests}
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
                  <div style={{ fontSize: 18, fontWeight: 650, letterSpacing: "-0.02em" }}>
                    {formatRange(next.startDate, next.endDate)}
                  </div>
                  <div className="row" style={{ marginTop: 8, gap: 8 }}>
                    <span className="badge badge-approved">Approved</span>
                    <span className="chip">{next.leaveTypeLabel}</span>
                    <span className="chip">{next.leaveDays} day{next.leaveDays === 1 ? "" : "s"}</span>
                  </div>
                  <p className="muted-sm mt-16">Starts {relativeDayLabel(next.startDate, today)}.</p>
                </>
              ) : (
                <p className="muted-sm">No upcoming leave.</p>
              )}
            </div>
          </Card>

          <Card>
            <CardHead title="Leave types" />
            <div className="card-body stack" style={{ gap: 10 }}>
              {leaveTypes.map((t) => (
                <div key={t.code}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{t.label}</div>
                  {t.description && <div className="tiny">{t.description}</div>}
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      <div className="section">
        <Card>
          <CardHead title="Recent leave requests"
            action={<Link href="/my-leave" className="btn btn-sm">View all</Link>} />
          <div className="card-body flush">
            <LeaveTable requests={recent}
              emptyAction={<Link href="/request" className="btn btn-primary"><IconPlus size={16} />Request leave</Link>} />
          </div>
        </Card>
      </div>
    </>
  );
}
