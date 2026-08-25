/**
 * Date helpers that operate on plain `YYYY-MM-DD` strings.
 *
 * Leave is a *calendar* concept, not an instant in time: 13 April is a holiday
 * in Bangkok regardless of the viewer's clock. Keeping everything as date
 * strings (and using UTC internally) removes an entire class of off-by-one
 * timezone bugs that plague leave systems.
 */
export type ISODate = string;

export const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];

export function toISODate(d: Date): ISODate {
  return d.toISOString().slice(0, 10);
}

export function parseISO(s: ISODate): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function addDays(s: ISODate, n: number): ISODate {
  const d = parseISO(s);
  d.setUTCDate(d.getUTCDate() + n);
  return toISODate(d);
}

/** 0 = Sunday … 6 = Saturday — the same convention as Postgres `extract(dow)`. */
export function weekday(s: ISODate): number {
  return parseISO(s).getUTCDay();
}

export function eachDay(start: ISODate, end: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

export function daysBetweenInclusive(start: ISODate, end: ISODate): number {
  return Math.round((parseISO(end).getTime() - parseISO(start).getTime()) / 86_400_000) + 1;
}

export function formatDate(s: ISODate): string {
  const d = parseISO(s);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()].slice(0, 3)} ${d.getUTCFullYear()}`;
}

export function formatDateLong(s: ISODate): string {
  const d = parseISO(s);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** "18–20 Sep 2026", "28 Sep – 2 Oct 2026", or a single date. */
export function formatRange(start: ISODate, end: ISODate): string {
  if (start === end) return formatDate(start);
  const a = parseISO(start), b = parseISO(end);
  if (a.getUTCFullYear() === b.getUTCFullYear()) {
    if (a.getUTCMonth() === b.getUTCMonth()) {
      return `${a.getUTCDate()}–${b.getUTCDate()} ${MONTHS[b.getUTCMonth()].slice(0, 3)} ${b.getUTCFullYear()}`;
    }
    return `${a.getUTCDate()} ${MONTHS[a.getUTCMonth()].slice(0, 3)} – ${b.getUTCDate()} ${MONTHS[b.getUTCMonth()].slice(0, 3)} ${b.getUTCFullYear()}`;
  }
  return `${formatDate(start)} – ${formatDate(end)}`;
}

export function monthLabel(year: number, month0: number): string {
  return `${MONTHS[month0]} ${year}`;
}

/** Today in the company's timezone, as a date string. */
export function companyToday(timeZone = "Asia/Bangkok"): ISODate {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

export function relativeDayLabel(s: ISODate, today: ISODate): string {
  const diff = Math.round((parseISO(s).getTime() - parseISO(today).getTime()) / 86_400_000);
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  if (diff < 0) return `${Math.abs(diff)} day${Math.abs(diff) === 1 ? "" : "s"} ago`;
  if (diff < 7) return `in ${diff} days`;
  if (diff < 30) return `in ${Math.round(diff / 7)} week${diff < 14 ? "" : "s"}`;
  return `in ${Math.round(diff / 30)} month${diff < 60 ? "" : "s"}`;
}

/** Calendar grid (6 rows x 7 cols) covering the given month. */
export function monthGrid(year: number, month0: number): ISODate[] {
  const first = new Date(Date.UTC(year, month0, 1));
  const start = addDays(toISODate(first), -first.getUTCDay());
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}
