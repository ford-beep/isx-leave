import Link from "next/link";

import { CopyLastWeekButton } from "@/components/CopyLastWeekButton";
import { WeeklyPlanEditor } from "@/components/WeeklyPlanEditor";
import { IconChevronLeft, IconChevronRight } from "@/components/icons";
import { requireUser } from "@/lib/auth";
import { companyToday } from "@/lib/date";
import {
  getHolidays,
  getMyRequests,
  getMyWeeklyPlan,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

const DAY_MS = 24 * 60 * 60 * 1000;

function parseDate(value: string) {
  return new Date(`${value}T00:00:00Z`);
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(value: string, amount: number) {
  const date = parseDate(value);
  date.setUTCDate(date.getUTCDate() + amount);
  return isoDate(date);
}

function mondayOf(value: string) {
  const date = parseDate(value);
  const day = date.getUTCDay();
  const distance = day === 0 ? -6 : 1 - day;

  date.setUTCDate(date.getUTCDate() + distance);

  return isoDate(date);
}

function validISODate(value: string | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = parseDate(value);

  return !Number.isNaN(date.getTime()) && isoDate(date) === value;
}

function formatWeekRange(weekStart: string) {
  const start = parseDate(weekStart);
  const end = parseDate(addDays(weekStart, 6));

  const sameMonth =
    start.getUTCMonth() === end.getUTCMonth() &&
    start.getUTCFullYear() === end.getUTCFullYear();

  const sameYear = start.getUTCFullYear() === end.getUTCFullYear();

  if (sameMonth) {
    const month = new Intl.DateTimeFormat("en-GB", {
      month: "short",
      timeZone: "UTC",
    }).format(start);

    return `${start.getUTCDate()}–${end.getUTCDate()} ${month} ${start.getUTCFullYear()}`;
  }

  if (sameYear) {
    const startText = new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    }).format(start);

    const endText = new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    }).format(end);

    return `${startText} – ${endText} ${start.getUTCFullYear()}`;
  }

  const formatter = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

  return `${formatter.format(start)} – ${formatter.format(end)}`;
}

function buildDays(weekStart: string) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    timeZone: "UTC",
  });

  return Array.from({ length: 7 }, (_, index) => {
    const date = addDays(weekStart, index);
    const parsed = parseDate(date);

    return {
      date,
      short: formatter.format(parsed),
      dayNumber: String(parsed.getUTCDate()),
      weekend: index >= 5,
    };
  });
}

export default async function WeeklyPlanPage({
  searchParams,
}: {
  searchParams: Promise<{
    week?: string;
  }>;
}) {
  const me = await requireUser();
  const sp = await searchParams;

  const today = companyToday();
  const currentWeek = mondayOf(today);

  const requestedWeek = validISODate(sp.week)
    ? mondayOf(sp.week!)
    : currentWeek;

  const previousWeek = addDays(requestedWeek, -7);
  const nextWeek = addDays(requestedWeek, 7);

const weekEnd = addDays(requestedWeek, 6);

const weekYears = Array.from(
  new Set([
    Number(requestedWeek.slice(0, 4)),
    Number(weekEnd.slice(0, 4)),
  ]),
);

const [items, requests, holidayGroups] = await Promise.all([
  getMyWeeklyPlan(me.id, requestedWeek),
  getMyRequests(me.id),
  Promise.all(
    weekYears.map((year) => getHolidays(me.id, year)),
  ),
]);

const holidays = holidayGroups
  .flat()
  .filter((holiday) => holiday.active);

const approvedLeaves = requests.filter(
  (request) =>
    request.status === "approved" &&
    request.endDate >= requestedWeek &&
    request.startDate <= weekEnd,
);

const days = buildDays(requestedWeek).map((day) => {
  const holiday = holidays.find(
    (item) => item.date === day.date,
  );

  const leave = approvedLeaves.find(
    (request) =>
      request.startDate <= day.date &&
      request.endDate >= day.date,
  );

  let leaveSessionLabel: string | null = null;

  if (leave?.leaveSession === "morning") {
    leaveSessionLabel = "AM";
  } else if (leave?.leaveSession === "afternoon") {
    leaveSessionLabel = "PM";
  } else if (leave?.leaveSession === "half_day") {
    leaveSessionLabel = "Half day";
  }

  return {
    ...day,
    holidayName: holiday?.name ?? null,
    leaveLabel: leave
      ? `${leave.leaveTypeLabel}${
          leaveSessionLabel
            ? ` · ${leaveSessionLabel}`
            : ""
        }`
      : null,
  };
});

  const isCurrentWeek = requestedWeek === currentWeek;

  return (
    <>
      <div className="page-head">
        <div className="grow">
          <h1>Weekly Plan</h1>

          <p className="muted">
            Plan what you know now. Update it anytime as the week changes.
          </p>
        </div>
      </div>

      <div className="weekly-plan-toolbar">
        <Link href={`/weekly-plan?week=${previousWeek}`} className="btn btn-sm">
          <IconChevronLeft size={15} />
          Previous
        </Link>

        <div className="weekly-plan-week-title">
          <strong>{formatWeekRange(requestedWeek)}</strong>

          {isCurrentWeek ? (
            <span className="weekly-plan-current">This week</span>
          ) : (
            <Link href="/weekly-plan" className="weekly-plan-this-week">
              Go to this week
            </Link>
          )}
        </div>

        <Link href={`/weekly-plan?week=${nextWeek}`} className="btn btn-sm">
          Next
          <IconChevronRight size={15} />
        </Link>
      </div>

      <div className="weekly-plan-tools">
        <CopyLastWeekButton weekStart={requestedWeek} />
      </div>

      <WeeklyPlanEditor weekStart={requestedWeek} days={days} items={items} />
    </>
  );
}
