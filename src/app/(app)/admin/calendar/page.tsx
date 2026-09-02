import { requireAdmin } from "@/lib/auth";
import {
  companyToday,
  formatDate,
  formatRange,
  WEEKDAY_NAMES,
} from "@/lib/date";
import {
  getCalendarBirthdays,
  getEmployeeOverview,
  getHolidays,
  getOfficeDays,
  getRequestsInMonth,
  getWorkSchedule,
} from "@/lib/queries";
import { Card, CardHead } from "@/components/ui";
import { MonthCalendar } from "@/components/MonthCalendar";
import { FilterSelect } from "@/components/FilterSelect";

export const dynamic = "force-dynamic";

export default async function AdminCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ y?: string; m?: string; employee?: string }>;
}) {
  const me = await requireAdmin();
  const today = companyToday();
  const sp = await searchParams;
  const year = Number(sp.y) || Number(today.slice(0, 4));
  const month = Number(sp.m) || Number(today.slice(5, 7));
  const employeeId =
    sp.employee && sp.employee !== "all" ? sp.employee : undefined;

const [office, holidays, requests, employees, workSchedule, birthdays] =
  await Promise.all([
    getOfficeDays(me.id),
    getHolidays(me.id, year),
    getRequestsInMonth(me.id, year, month, employeeId),
    getEmployeeOverview(me.id, year),
    getWorkSchedule(me.id, year, month),
    getCalendarBirthdays(me.id),
  ]);

  const monthHolidays = holidays.filter(
    (h) => h.active && Number(h.date.slice(5, 7)) === month,
  );
  const away = requests.filter((r) => r.status === "approved");

  return (
    <>
      <div className="page-head">
        <div className="grow">
          <h1>Company calendar</h1>
          <p className="muted">
            Everyone&apos;s approved and pending leave. Office days are{" "}
            <b>{office.weekdays.map((d) => WEEKDAY_NAMES[d]).join(" + ")}</b>.
          </p>
        </div>
        <FilterSelect
          name="employee"
          basePath="/admin/calendar"
          label="Filter by employee"
          value={employeeId ?? "all"}
          options={[
            { value: "all", label: "All employees" },
            ...employees.map((e) => ({ value: e.id, label: e.name })),
          ]}
        />
      </div>

      <div className="grid-2">
        <Card>
          <div className="card-body">
            <MonthCalendar
              workSchedule={workSchedule}
              year={year}
              month={month}
              officeWeekdays={office.weekdays}
              holidays={holidays}
              requests={requests}
              birthdays={birthdays}
              mode="admin"
              basePath="/admin/calendar"
              extraQuery={employeeId ? { employee: employeeId } : undefined}
            />
          </div>
        </Card>

        <div className="stack">
          <Card>
            <CardHead
              title="Who's away this month"
              sub={`${away.length} approved period${away.length === 1 ? "" : "s"}`}
            />
            <div className="card-body">
              {away.length === 0 ? (
                <p className="muted-sm">Nobody is away this month.</p>
              ) : (
                <div className="stack" style={{ gap: 12 }}>
                  {away.map((r) => (
                    <div
                      key={r.id}
                      className="row"
                      style={{ alignItems: "flex-start", gap: 10 }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>
                          {r.employeeName}
                        </div>
                        <div className="tiny">
                          {formatRange(r.startDate, r.endDate)} ·{" "}
                          {r.leaveTypeLabel}
                        </div>
                      </div>
                      <span className="chip num">{r.leaveDays}d</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>

          <Card>
            <CardHead title="Holidays this month" />
            <div className="card-body">
              {monthHolidays.length === 0 ? (
                <p className="muted-sm">No public holidays this month.</p>
              ) : (
                <div className="stack" style={{ gap: 10 }}>
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
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
