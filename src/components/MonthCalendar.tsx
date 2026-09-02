import Link from "next/link";
import { WorkModeToggle } from "./WorkModeToggle";
import {
  companyToday,
  monthGrid,
  monthLabel,
  parseISO,
  WEEKDAY_SHORT,
} from "@/lib/date";
import type { Holiday, LeaveRequest, WorkScheduleDay } from "@/lib/types";
import type { CalendarBirthday } from "@/lib/queries";
import { IconChevronLeft, IconChevronRight } from "./icons";

export interface CalendarProps {
  year: number;
  /** 1-12 */
  month: number;
  officeWeekdays: number[];
  workSchedule: WorkScheduleDay[];
  holidays: Holiday[];
  requests: LeaveRequest[];
  birthdays: CalendarBirthday[];
  /** "employee" labels every entry "My leave"; "admin" shows the person's name. */
  mode: "employee" | "admin";
  /** Route the month arrows point at. */
  basePath: string;
  /** Extra query params preserved when changing month (e.g. the employee filter). */
  extraQuery?: Record<string, string>;
}

function qs(
  base: string,
  y: number,
  m: number,
  extra?: Record<string, string>,
) {
  const p = new URLSearchParams({
    y: String(y),
    m: String(m),
    ...(extra ?? {}),
  });
  return `${base}?${p.toString()}`;
}

export function MonthCalendar({
  year,
  month,
  officeWeekdays,
  workSchedule,
  holidays,
  requests,
  birthdays,
  mode,
  basePath,
  extraQuery,
}: CalendarProps) {
  const today = companyToday();
  const officeSet = new Set(officeWeekdays);
  const workModeByDate = new Map(workSchedule.map((d) => [d.date, d.mode]));
  const holidayByDate = new Map(
    holidays.filter((h) => h.active).map((h) => [h.date, h]),
  );
  const birthdaysByDay = new Map<number, CalendarBirthday[]>();

  for (const person of birthdays) {
    const birthdayMonth = Number(person.birthday.slice(5, 7));
    const birthdayDay = Number(person.birthday.slice(8, 10));

    if (birthdayMonth !== month) continue;

    const list = birthdaysByDay.get(birthdayDay) ?? [];
    list.push(person);
    birthdaysByDay.set(birthdayDay, list);
  }

  // Expand each request into the individual dates it covers.
  const entriesByDate = new Map<
    string,
    Array<{ label: string; status: string; title: string }>
  >();
  for (const r of requests) {
    for (let d = r.startDate; d <= r.endDate;) {
      const list = entriesByDate.get(d) ?? [];
      list.push({
        label: mode === "admin" ? (r.employeeName ?? "Employee") : "My leave",
        status: r.status,
        title:
          mode === "admin"
            ? `${r.employeeName} — ${r.leaveTypeLabel} — ${r.status}`
            : `${r.leaveTypeLabel} — ${r.status}`,
      });
      entriesByDate.set(d, list);
      const nd = parseISO(d);
      nd.setUTCDate(nd.getUTCDate() + 1);
      d = nd.toISOString().slice(0, 10);
    }
  }

  const prev = month === 1 ? { y: year - 1, m: 12 } : { y: year, m: month - 1 };
  const next = month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 };
  const cells = monthGrid(year, month - 1);

  return (
    <div>
      <div className="cal-head">
        <div className="cal-title">{monthLabel(year, month - 1)}</div>
        <div className="row" style={{ marginLeft: "auto", gap: 6 }}>
          <Link
            className="btn btn-sm"
            href={qs(basePath, prev.y, prev.m, extraQuery)}
            aria-label="Previous month"
          >
            <IconChevronLeft size={15} />
          </Link>
          <Link
            className="btn btn-sm"
            href={qs(
              basePath,
              Number(today.slice(0, 4)),
              Number(today.slice(5, 7)),
              extraQuery,
            )}
          >
            Today
          </Link>
          <Link
            className="btn btn-sm"
            href={qs(basePath, next.y, next.m, extraQuery)}
            aria-label="Next month"
          >
            <IconChevronRight size={15} />
          </Link>
        </div>
      </div>

      <div className="cal">
        <div className="cal-dow">
          {WEEKDAY_SHORT.map((d) => (
            <div key={d}>{d}</div>
          ))}
        </div>
        <div className="cal-grid">
          {cells.map((date) => {
            const dt = parseISO(date);
            const inMonth = dt.getUTCMonth() === month - 1;
            const isWorkingDay = officeSet.has(dt.getUTCDay());
            const explicitWorkMode = workModeByDate.get(date);

            // Default:
            // Monday + Tuesday = Office
            // Wednesday–Friday = WFH
            // An explicit admin override always wins.
            const defaultWorkMode =
              dt.getUTCDay() === 1 || dt.getUTCDay() === 2 ? "office" : "wfh";

            const workMode = explicitWorkMode ?? defaultWorkMode;

            const isOffice = isWorkingDay && workMode === "office";
            const isWFH = isWorkingDay && workMode === "wfh";
            const hol = holidayByDate.get(date);
            const entries = entriesByDate.get(date) ?? [];
            const dayBirthdays = inMonth
              ? (birthdaysByDay.get(dt.getUTCDate()) ?? [])
              : [];
            const cls = [
              "cal-cell",
              inMonth ? "" : "out",
              hol ? "holiday" : isOffice ? "office" : isWFH ? "wfh" : "",
              date === today ? "today" : "",
            ]
              .filter(Boolean)
              .join(" ");

            return (
              <div key={date} className={cls}>
                <div className="cal-num">{dt.getUTCDate()}</div>
                {!hol &&
                  isWorkingDay &&
                  (mode === "admin" ? (
                    <WorkModeToggle
                      date={date}
                      mode={isOffice ? "office" : "wfh"}
                    />
                  ) : (
                    <>
                      {isOffice && (
                        <span className="cal-office-dot" title="Office" />
                      )}

                      {isWFH && (
                        <div className="cal-tag wfh" title="Work from home">
                          WFH
                        </div>
                      )}
                    </>
                  ))}
                {entries.slice(0, 2).map((e, i) => (
                  <div
                    key={i}
                    className={`cal-tag ${e.status}`}
                    title={e.title}
                  >
                    {e.label}
                  </div>
                ))}
                {entries.length > 2 && (
                  <div className="cal-tag more">+{entries.length - 2} more</div>
                )}
                {dayBirthdays.slice(0, 2).map((person) => (
                  <div
                    key={`birthday-${person.id}`}
                    className="cal-tag birthday"
                    title={`${person.name}'s birthday`}
                  >
                    🎂 {person.name}
                  </div>
                ))}

                {dayBirthdays.length > 2 && (
                  <div
                    className="cal-tag more"
                    title={dayBirthdays
                      .slice(2)
                      .map((person) => person.name)
                      .join(", ")}
                  >
                    +{dayBirthdays.length - 2} birthday
                    {dayBirthdays.length - 2 === 1 ? "" : "s"}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <CalendarLegend />
    </div>
  );
}

export function CalendarLegend() {
  const items: Array<[string, string]> = [
    ["var(--cal-office)", "Office"],
    ["var(--c-surface)", "WFH"],
    ["var(--cal-approved)", "Approved leave"],
    ["var(--cal-pending)", "Pending leave"],
    ["var(--cal-holiday)", "Public holiday"],
    ["var(--c-surface-sunk)", "Weekend"],
  ];
  return (
    <div className="legend">
      {items.map(([c, label]) => (
        <span className="legend-item" key={label}>
          <span className="legend-swatch" style={{ background: c }} />
          {label}
        </span>
      ))}
      <span className="legend-item">
        <span style={{ fontSize: 14, lineHeight: 1 }}>🎂</span>
        Birthday
      </span>
    </div>
  );
}
