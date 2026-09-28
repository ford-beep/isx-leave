import Link from "next/link";

import { IconChevronLeft, IconChevronRight } from "@/components/icons";
import { Card, CardHead, Person } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { companyToday } from "@/lib/date";
import {
  getAllRequests,
  getHolidays,
  getTeamWeeklyPlan,
  getWeeklyPlanEmployees,
} from "@/lib/queries";
import type { WeeklyPlanCategory, WeeklyPlanItem } from "@/lib/types";

export const dynamic = "force-dynamic";

const DAY_MS = 24 * 60 * 60 * 1000;

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

function parseDate(value: string) {
  return new Date(`${value}T00:00:00Z`);
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(value: string, amount: number) {
  const date = parseDate(value);
  return isoDate(new Date(date.getTime() + amount * DAY_MS));
}

function mondayOf(value: string) {
  const date = parseDate(value);
  const day = date.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;

  return addDays(value, offset);
}

function validISODate(value: string | undefined) {
  return Boolean(
    value &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(parseDate(value).getTime()),
  );
}

function formatWeekRange(weekStart: string) {
  const start = parseDate(weekStart);
  const end = parseDate(addDays(weekStart, 6));

  const startText = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
  }).format(start);

  const endText = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(end);

  return `${startText} – ${endText}`;
}

function buildDays(weekStart: string) {
  return DAY_NAMES.map((name, index) => {
    const date = addDays(weekStart, index);

    return {
      name,
      date,
      dayNumber: parseDate(date).getUTCDate(),
      weekend: index >= 5,
    };
  });
}

type PlanDay = ReturnType<typeof buildDays>[number] & {
  holidayName: string | null;
  leaveLabel: string | null;
};

function weeklyPlanHref(weekStart: string, employeeId: string | undefined) {
  const params = new URLSearchParams();
  params.set("week", weekStart);

  if (employeeId) {
    params.set("employee", employeeId);
  }

  return `/admin/weekly-plans?${params.toString()}`;
}

function PlanSection({
  category,
  items,
  days,
}: {
  category: WeeklyPlanCategory;
  items: WeeklyPlanItem[];
  days: PlanDay[];
}) {
  const title =
    category === "priority"
      ? "Priority"
      : "Other";

  return (
    <section
      className={`weekly-plan-section weekly-plan-${category}`}
    >
      <div className="weekly-plan-section-head">
        <div>
          <h2>{title}</h2>

          <p className="muted">
            {category === "priority"
              ? "The work you want to keep front and center."
              : "Other tasks, support work, learning, or things that may come up."}
          </p>
        </div>
      </div>

      <div className="weekly-plan-grid">
        {days.map((day) => {
          const dayItems = items.filter(
            (item) =>
              item.workDate === day.date &&
              item.category === category,
          );

          return (
            <div
              key={day.date}
              className={[
                "weekly-plan-day",
                day.weekend
                  ? "is-weekend"
                  : "",
                day.leaveLabel
                  ? "is-leave"
                  : "",
                day.holidayName
                  ? "is-holiday"
                  : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <div className="weekly-plan-day-head">
                <span>{day.name}</span>
                <strong>{day.dayNumber}</strong>
              </div>

              {day.leaveLabel ||
              day.holidayName ? (
                <div className="weekly-plan-day-status">
                  {day.leaveLabel ? (
                    <div className="weekly-plan-day-note is-leave">
                      <span aria-hidden="true">
                        🏖️
                      </span>

                      <span>
                        {day.leaveLabel}
                      </span>
                    </div>
                  ) : null}

                  {day.holidayName ? (
                    <div className="weekly-plan-day-note is-holiday">
                      <span aria-hidden="true">
                        🎉
                      </span>

                      <span>
                        {day.holidayName}
                      </span>
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="weekly-plan-day-body">
                {dayItems.length === 0 ? (
                  <div className="weekly-plan-admin-empty">
                    —
                  </div>
                ) : (
                  dayItems.map((item) => (
                    <div
                      key={item.id}
                      className="weekly-plan-task"
                    >
                      <div className="weekly-plan-task-content">
                        {item.content}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default async function AdminWeeklyPlansPage({
  searchParams,
}: {
  searchParams: Promise<{
    week?: string;
    employee?: string;
  }>;
}) {
  const me = await requireAdmin();
  const params = await searchParams;

  const today = companyToday();
  const currentWeek = mondayOf(today);

  const requestedWeek = validISODate(params.week)
    ? mondayOf(params.week!)
    : currentWeek;

  const employees = await getWeeklyPlanEmployees(me.id);

  const requestedEmployee = employees.find(
    (employee) => employee.id === params.employee,
  );

  const selectedEmployee =
    requestedEmployee ??
    employees.find((employee) => employee.role === "employee") ??
    employees[0];

  const weekEnd = addDays(
  requestedWeek,
  6,
);

const weekYears = Array.from(
  new Set([
    Number(
      requestedWeek.slice(0, 4),
    ),
    Number(
      weekEnd.slice(0, 4),
    ),
  ]),
);

const items = selectedEmployee
  ? await getTeamWeeklyPlan(
      me.id,
      requestedWeek,
      selectedEmployee.id,
    )
  : [];

const requests = selectedEmployee
  ? await getAllRequests(
      me.id,
      {
        status: "approved",
        employeeId:
          selectedEmployee.id,
      },
    )
  : [];

const holidayGroups =
  await Promise.all(
    weekYears.map((year) =>
      getHolidays(me.id, year),
    ),
  );

const holidays = holidayGroups
  .flat()
  .filter(
    (holiday) =>
      holiday.active,
  );

const approvedLeaves =
  requests.filter(
    (request) =>
      request.status ===
        "approved" &&
      request.endDate >=
        requestedWeek &&
      request.startDate <=
        weekEnd,
  );

const days: PlanDay[] =
  buildDays(requestedWeek).map(
    (day) => {
      const holiday =
        holidays.find(
          (item) =>
            item.date ===
            day.date,
        );

      const leave =
        approvedLeaves.find(
          (request) =>
            request.startDate <=
              day.date &&
            request.endDate >=
              day.date,
        );

      let leaveSessionLabel:
        | string
        | null = null;

      if (
        leave?.leaveSession ===
        "morning"
      ) {
        leaveSessionLabel = "AM";
      } else if (
        leave?.leaveSession ===
        "afternoon"
      ) {
        leaveSessionLabel = "PM";
      } else if (
        leave?.leaveSession ===
        "half_day"
      ) {
        leaveSessionLabel =
          "Half day";
      }

      return {
        ...day,

        holidayName:
          holiday?.name ?? null,

        leaveLabel: leave
          ? `${
              leave.leaveTypeLabel
            }${
              leaveSessionLabel
                ? ` · ${leaveSessionLabel}`
                : ""
            }`
          : null,
      };
    },
  );

const previousWeek = addDays(
  requestedWeek,
  -7,
);

const nextWeek = addDays(
  requestedWeek,
  7,
);

const isCurrentWeek =
  requestedWeek === currentWeek;


  return (
    <>
      <div className="page-head">
        <div className="grow">
          <h1>Weekly Plans</h1>
          <p className="muted">View each team member&apos;s weekly plan.</p>
        </div>
      </div>

      <div className="weekly-plan-toolbar">
        <Link
          href={weeklyPlanHref(previousWeek, selectedEmployee?.id)}
          className="btn btn-sm"
        >
          <IconChevronLeft size={15} />
          Previous
        </Link>

        <div className="weekly-plan-week-title">
          <strong>{formatWeekRange(requestedWeek)}</strong>

          {isCurrentWeek ? (
            <span className="weekly-plan-current">This week</span>
          ) : (
            <Link
              href={weeklyPlanHref(currentWeek, selectedEmployee?.id)}
              className="weekly-plan-this-week"
            >
              Go to this week
            </Link>
          )}
        </div>

        <Link
          href={weeklyPlanHref(nextWeek, selectedEmployee?.id)}
          className="btn btn-sm"
        >
          Next
          <IconChevronRight size={15} />
        </Link>
      </div>

      <Card className="weekly-plan-admin-person-card">
        <CardHead
          title="Team member"
          sub="Select a person to view their plan."
        />

        <div className="card-body">
          {employees.length === 0 ? (
            <p className="muted">No active team members found.</p>
          ) : (
            <>
              {selectedEmployee ? (
                <div className="weekly-plan-admin-selected">
                  <Person
                    name={selectedEmployee.name}
                    email={selectedEmployee.email}
                  />

                  {selectedEmployee.jobTitle ? (
                    <span className="muted-sm">
                      {selectedEmployee.jobTitle}
                    </span>
                  ) : null}
                </div>
              ) : null}

              <div className="weekly-plan-admin-people">
                {employees.map((employee) => {
                  const selected = employee.id === selectedEmployee?.id;

                  return (
                    <Link
                      key={employee.id}
                      href={weeklyPlanHref(requestedWeek, employee.id)}
                      className={`weekly-plan-admin-person ${
                        selected ? "is-selected" : ""
                      }`}
                    >
                      <span>{employee.name}</span>

                      {employee.role === "admin" ? (
                        <span className="muted-sm">Admin</span>
                      ) : null}
                    </Link>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </Card>

      {selectedEmployee ? (
        <div className="weekly-plan weekly-plan-admin-board">
          <PlanSection category="priority" items={items} days={days} />

          <PlanSection category="other" items={items} days={days} />
        </div>
      ) : null}
    </>
  );
}
