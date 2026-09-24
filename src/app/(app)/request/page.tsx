import { requireUser } from "@/lib/auth";
import { companyToday, WEEKDAY_NAMES } from "@/lib/date";
import {
  getAllowNextYearLeave,
  getBalance,
  getCompDayBalance,
  getOfficeDays,
} from "@/lib/queries";
import { RequestForm } from "@/components/RequestForm";

export const dynamic = "force-dynamic";

export default async function RequestPage() {
  const me = await requireUser();
  const today = companyToday();

  const year = Number(today.slice(0, 4));
  const nextYear = year + 1;

  const [
    balance,
    compDayBalance,
    nextYearBalance,
    nextYearCompDayBalance,
    office,
    allowNextYearLeave,
  ] = await Promise.all([
    getBalance(me.id, me.id, year),
    getCompDayBalance(me.id, me.id, year),

    getBalance(me.id, me.id, nextYear),
    getCompDayBalance(me.id, me.id, nextYear),

    getOfficeDays(me.id),
    getAllowNextYearLeave(me.id),
  ]);

  return (
    <>
      <div className="page-head">
        <div className="grow">
          <h1>Request leave</h1>

          <p className="muted">
            Annual Leave available:{" "}
            <b>
              {balance.available} day
              {balance.available === 1 ? "" : "s"}
            </b>
            {" · "}
            Comp Days available:{" "}
            <b>
              {compDayBalance.available} day
              {compDayBalance.available === 1
                ? ""
                : "s"}
            </b>
            {" "}in {year}.
          </p>
        </div>
      </div>

      <RequestForm
        balance={balance}
        compDayBalance={compDayBalance}
        nextYearBalance={nextYearBalance}
        nextYearCompDayBalance={
          nextYearCompDayBalance
        }
        today={today}
        currentYear={year}
        allowNextYearLeave={allowNextYearLeave}
        officeDayNames={office.weekdays
          .map((d) => WEEKDAY_NAMES[d])
          .join(" + ")}
      />
    </>
  );
}