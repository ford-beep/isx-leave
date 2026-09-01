import { requireUser } from "@/lib/auth";
import { companyToday, WEEKDAY_NAMES } from "@/lib/date";
import {
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

  const [balance, compDayBalance, office] = await Promise.all([
    getBalance(me.id, me.id, year),
    getCompDayBalance(me.id, me.id, year),
    getOfficeDays(me.id),
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
              {compDayBalance.available === 1 ? "" : "s"}
            </b>
            {" "}in {year}.
          </p>
        </div>
      </div>

      <RequestForm
        balance={balance}
        compDayBalance={compDayBalance}
        today={today}
        officeDayNames={office.weekdays
          .map((d) => WEEKDAY_NAMES[d])
          .join(" + ")}
      />
    </>
  );
}