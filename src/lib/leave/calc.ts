/**
 * calculateLeaveDays() — TypeScript implementation (§22).
 *
 * ---------------------------------------------------------------------------
 * This is the *preview* implementation. It exists so the request form can show
 * the day-by-day breakdown instantly as the user picks dates, without a round
 * trip per keystroke.
 *
 * The AUTHORITATIVE implementation is `app.calc_leave_days()` in
 * db/migrations/0002_functions.sql. When a request is inserted, a BEFORE
 * trigger recomputes the number in the database and overwrites whatever the
 * client sent. tests/calc.test.ts asserts the two agree.
 * ---------------------------------------------------------------------------
 *
 * THE RULE
 *   A date is deducted from the leave balance when
 *     (a) it is a configured OFFICE DAY on that date, and
 *     (b) it is not an active public/company holiday.
 *
 *   Everything else — weekends, any weekday the company does not work, and
 *   holidays — is free.
 *
 * Worked example (ISX defaults: office days Monday + Tuesday)
 *   Request  Fri 18 Sep 2026 → Tue 22 Sep 2026
 *     18 Sep Fri  not an office day   free
 *     19 Sep Sat  not an office day   free
 *     20 Sep Sun  not an office day   free
 *     21 Sep Mon  office day          DEDUCTED
 *     22 Sep Tue  office day          DEDUCTED
 *   => 5 calendar days, 2 leave days deducted.
 */
import { eachDay, weekday, type ISODate } from "../date";
import type { CalcDay, CalcHoliday, LeaveCalculation } from "../types";

export interface WorkingCalendar {
  /** Weekday numbers that are office days. 0 = Sunday … 6 = Saturday. */
  officeWeekdays: number[];
  /** Active holidays keyed by ISO date. */
  holidays: Map<ISODate, { name: string; type: "public" | "company"; source: string }>;
}

export function calculateLeaveDays(
  startDate: ISODate,
  endDate: ISODate,
  calendar: WorkingCalendar,
): LeaveCalculation {
  if (!startDate || !endDate) throw new Error("LEAVE_DATES_REQUIRED");
  if (endDate < startDate) throw new Error("LEAVE_END_BEFORE_START");

  const officeSet = new Set(calendar.officeWeekdays);
  const days: CalcDay[] = [];
  const holidays: CalcHoliday[] = [];

  let officeDaysInRange = 0;
  let excludedNonOfficeDays = 0;
  let excludedHolidays = 0;
  let leaveDays = 0;

  for (const date of eachDay(startDate, endDate)) {
    const isOffice = officeSet.has(weekday(date));
    const hol = calendar.holidays.get(date) ?? null;

    if (!isOffice) {
      excludedNonOfficeDays++;
    } else {
      officeDaysInRange++;
      if (hol) excludedHolidays++;
      else leaveDays++;
    }

    if (hol) {
      holidays.push({ date, name: hol.name, type: hol.type, source: hol.source, wouldHaveBeenOfficeDay: isOffice });
    }
    days.push({ date, officeDay: isOffice, holiday: hol?.name ?? null, deducted: isOffice && !hol });
  }

  return {
    startDate, endDate,
    totalCalendarDays: days.length,
    officeDaysInRange,
    excludedNonOfficeDays,
    excludedHolidays,
    leaveDays,
    holidays,
    days,
  };
}

/** Human-readable summary used under the date pickers. */
export function explainCalculation(c: LeaveCalculation): string[] {
  const out = [`${c.totalCalendarDays} calendar day${c.totalCalendarDays === 1 ? "" : "s"} selected`];
  if (c.excludedNonOfficeDays) {
    out.push(`− ${c.excludedNonOfficeDays} non-office day${c.excludedNonOfficeDays === 1 ? "" : "s"} (weekends and days ISX doesn't work)`);
  }
  if (c.excludedHolidays) {
    out.push(`− ${c.excludedHolidays} public holiday${c.excludedHolidays === 1 ? "" : "s"} falling on an office day`);
  }
  out.push(`= ${c.leaveDays} leave day${c.leaveDays === 1 ? "" : "s"} deducted`);
  return out;
}
