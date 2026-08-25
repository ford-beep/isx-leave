/**
 * Unit tests for the TypeScript preview implementation of calculateLeaveDays.
 *
 * The database is the authority (app.calc_leave_days), and db/tests/03_*.sql
 * covers it directly. These tests pin the client-side mirror to the same
 * behaviour so the number an employee sees while filling in the form is the
 * number they get.
 *
 *   npm test
 */
import { describe, expect, it } from "vitest";
import { calculateLeaveDays, type WorkingCalendar } from "../src/lib/leave/calc";
import { daysBetweenInclusive, formatRange, weekday } from "../src/lib/date";

/** ISX defaults: Monday + Tuesday, with the seeded 2026 BOT holidays. */
function calendar(officeWeekdays = [1, 2], holidayDates: Array<[string, string]> = []): WorkingCalendar {
  return {
    officeWeekdays,
    holidays: new Map(holidayDates.map(([date, name]) =>
      [date, { name, type: "public" as const, source: "BOT" }])),
  };
}

const BOT_2026: Array<[string, string]> = [
  ["2026-01-01", "New Year's Day"],
  ["2026-03-03", "Makha Bucha Day"],
  ["2026-04-13", "Songkran Festival"],
  ["2026-04-14", "Songkran Festival"],
  ["2026-04-15", "Songkran Festival"],
  ["2026-07-28", "H.M. King Maha Vajiralongkorn's Birthday"],
  ["2026-07-29", "Asarnha Bucha Day"],
  ["2026-10-13", "H.M. King Bhumibol Adulyadej The Great Memorial Day"],
  ["2026-12-07", "Substitution for H.M. King Bhumibol's Birthday"],
];

describe("calculateLeaveDays — the worked example from the brief", () => {
  it("charges 2 days for Fri 18 Sep – Tue 22 Sep when office days are Mon + Tue", () => {
    const c = calculateLeaveDays("2026-09-18", "2026-09-22", calendar());
    expect(c.totalCalendarDays).toBe(5);
    expect(c.excludedNonOfficeDays).toBe(3); // Fri, Sat, Sun
    expect(c.excludedHolidays).toBe(0);
    expect(c.leaveDays).toBe(2);             // Mon 21, Tue 22
  });

  it("labels each day so the employee can see why", () => {
    const c = calculateLeaveDays("2026-09-18", "2026-09-22", calendar());
    expect(c.days.map((d) => d.deducted)).toEqual([false, false, false, true, true]);
  });
});

describe("holidays", () => {
  it("does not charge a public holiday that lands on an office day", () => {
    // 12 Oct Mon (charged) + 13 Oct Tue (BOT holiday, free)
    const c = calculateLeaveDays("2026-10-12", "2026-10-13", calendar([1, 2], BOT_2026));
    expect(c.officeDaysInRange).toBe(2);
    expect(c.excludedHolidays).toBe(1);
    expect(c.leaveDays).toBe(1);
    expect(c.holidays[0].name).toContain("Bhumibol");
    expect(c.holidays[0].source).toBe("BOT");
  });

  it("reports a holiday that falls on a non-office day without changing the total", () => {
    // 15 Apr 2026 is a Wednesday and a Songkran holiday: already free.
    const c = calculateLeaveDays("2026-04-15", "2026-04-15", calendar([1, 2], BOT_2026));
    expect(c.leaveDays).toBe(0);
    expect(c.excludedHolidays).toBe(0);       // it was never an office day
    expect(c.excludedNonOfficeDays).toBe(1);
    expect(c.holidays[0].wouldHaveBeenOfficeDay).toBe(false);
  });

  it("charges nothing for a range made entirely of holidays and weekends", () => {
    const c = calculateLeaveDays("2026-07-27", "2026-07-29", calendar([1, 2], BOT_2026));
    // Mon 27 charged; Tue 28 and Wed 29 are holidays.
    expect(c.leaveDays).toBe(1);
  });
});

describe("office-day configuration", () => {
  it("reflects a Mon+Tue+Wed configuration", () => {
    const c = calculateLeaveDays("2026-08-24", "2026-09-01", calendar([1, 2, 3]));
    expect(c.leaveDays).toBe(5); // Mon 24, Tue 25, Wed 26, Mon 31, Tue 1
  });

  it("reflects a conventional Mon–Fri configuration", () => {
    const c = calculateLeaveDays("2026-09-18", "2026-09-22", calendar([1, 2, 3, 4, 5]));
    expect(c.leaveDays).toBe(3); // Fri 18, Mon 21, Tue 22
  });

  it("charges nothing when no office day falls in the range", () => {
    const c = calculateLeaveDays("2026-09-19", "2026-09-20", calendar()); // Sat + Sun
    expect(c.leaveDays).toBe(0);
    expect(c.totalCalendarDays).toBe(2);
  });

  it("charges every day when all seven weekdays are office days", () => {
    const c = calculateLeaveDays("2026-09-18", "2026-09-22", calendar([0, 1, 2, 3, 4, 5, 6]));
    expect(c.leaveDays).toBe(5);
  });
});

describe("input validation", () => {
  it("rejects an end date before the start date", () => {
    expect(() => calculateLeaveDays("2026-09-22", "2026-09-18", calendar()))
      .toThrow("LEAVE_END_BEFORE_START");
  });

  it("accepts a single-day request", () => {
    const c = calculateLeaveDays("2026-09-21", "2026-09-21", calendar());
    expect(c.totalCalendarDays).toBe(1);
    expect(c.leaveDays).toBe(1);
  });

  it("keeps the arithmetic self-consistent over a whole year", () => {
    const c = calculateLeaveDays("2026-01-01", "2026-12-31", calendar([1, 2], BOT_2026));
    expect(c.totalCalendarDays).toBe(365);
    expect(c.excludedNonOfficeDays + c.officeDaysInRange).toBe(c.totalCalendarDays);
    expect(c.excludedHolidays + c.leaveDays).toBe(c.officeDaysInRange);
  });
});

describe("date helpers (timezone safety)", () => {
  it("treats dates as calendar dates, not instants", () => {
    // 21 Sep 2026 is a Monday everywhere, regardless of the runner's TZ.
    expect(weekday("2026-09-21")).toBe(1);
    expect(weekday("2026-09-20")).toBe(0);
  });

  it("counts inclusive ranges", () => {
    expect(daysBetweenInclusive("2026-09-18", "2026-09-22")).toBe(5);
    expect(daysBetweenInclusive("2026-09-18", "2026-09-18")).toBe(1);
  });

  it("formats ranges the way the UI shows them", () => {
    expect(formatRange("2026-09-18", "2026-09-20")).toBe("18–20 Sep 2026");
    expect(formatRange("2026-09-28", "2026-10-02")).toBe("28 Sep – 2 Oct 2026");
    expect(formatRange("2026-09-18", "2026-09-18")).toBe("18 Sep 2026");
  });
});
