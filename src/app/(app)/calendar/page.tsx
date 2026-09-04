import { requireUser } from "@/lib/auth";
import { companyToday, formatDate, WEEKDAY_NAMES } from "@/lib/date";
import {
  getCalendarBirthdays,
  getCompanyLeaveCalendar,
  getHolidays,
  getOfficeDays,
  getWorkSchedule,
} from "@/lib/queries";
import { Card, CardHead } from "@/components/ui";
import { MonthCalendar } from "@/components/MonthCalendar";

export const dynamic = "force-dynamic";

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ y?: string; m?: string }>;
}) {
  const me = await requireUser();
  const today = companyToday();
  const sp = await searchParams;
  const year = Number(sp.y) || Number(today.slice(0, 4));
  const month = Number(sp.m) || Number(today.slice(5, 7));

  const [office, holidays, companyLeaves, workSchedule, birthdays] =
  await Promise.all([
    getOfficeDays(me.id),
    getHolidays(me.id, year),
    getCompanyLeaveCalendar(me.id, year, month),
    getWorkSchedule(me.id, year, month),
    getCalendarBirthdays(me.id),
  ]);

  const monthHolidays = holidays.filter(
    (h) => h.active && Number(h.date.slice(5, 7)) === month,
  );

  return (
    <>
      <div className="page-head">
        <div className="grow">
          <h1>Calendar</h1>
          <p className="muted">
            Office days are{" "}
            <b>{office.weekdays.map((d) => WEEKDAY_NAMES[d]).join(" + ")}</b>.
            Public holidays come from the Bank of Thailand calendar.
          </p>
        </div>
      </div>

      <div className="grid-2">
        <Card>
          <div className="card-body">
          <MonthCalendar
  year={year}
  month={month}
  officeWeekdays={office.weekdays}
  holidays={holidays}
  requests={[]}
  companyLeaves={companyLeaves}
  birthdays={birthdays}
  mode="employee"
  basePath="/calendar"
  workSchedule={workSchedule}
/>
          </div>
        </Card>

        <div className="stack">
          <Card>
            <CardHead title="Holidays this month" />
            <div className="card-body">
              {monthHolidays.length === 0 ? (
                <p className="muted-sm">No public holidays this month.</p>
              ) : (
                <div className="stack" style={{ gap: 12 }}>
                  {monthHolidays.map((h) => (
                    <div key={h.id}>
                      <div className="row" style={{ gap: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 650 }}>
                          {formatDate(h.date)}
                        </span>
                        <span
                          className={`badge plain ${h.type === "public" ? "badge-info" : "badge-brand"}`}
                        >
                          {h.type === "public" ? h.source : "Company"}
                        </span>
                      </div>
                      <div className="tiny">{h.name}</div>
                      {h.nameTh && (
                        <div className="tiny" style={{ opacity: 0.8 }}>
                          {h.nameTh}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>

<Card>
  <CardHead title="Company leave" />
  <div className="card-body">
    <p className="muted-sm">
      Approved leave is visible to the team by name and date only.
      Leave type, reason and other private details remain hidden.
    </p>
  </div>
</Card>
        </div>
      </div>
    </>
  );
}
