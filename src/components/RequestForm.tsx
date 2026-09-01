"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { previewLeaveAction, submitLeaveAction } from "@/actions/leave";
import { formatDate } from "@/lib/date";
import type {
  CompDayBalance,
  LeaveBalance,
  LeaveCalculation,
} from "@/lib/types";
import { Alert, Card, CardHead, Field } from "./ui";
import { useActionToast } from "./Toast";
import { IconAlert, IconCheck } from "./icons";

export function RequestForm({
  balance,
  compDayBalance,
  today,
  officeDayNames,
}: {
  balance: LeaveBalance;
  compDayBalance: CompDayBalance;
  today: string;
  officeDayNames: string;
}) {
  const router = useRouter();

  const [state, formAction, pending] = useActionState(
    submitLeaveAction,
    null,
  );

  useActionToast(state);

  const [leaveType, setLeaveType] = useState<"annual" | "comp_day">(
    "annual",
  );

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [calc, setCalc] = useState<LeaveCalculation | null>(null);
  const [calcError, setCalcError] = useState<string | null>(null);

  const [calcPending, startCalc] = useTransition();

  const earliestStartDate = (() => {
    const d = new Date(`${today}T00:00:00+07:00`);

    d.setDate(d.getDate() + 7);

    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Bangkok",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  })();

  useEffect(() => {
    if (!startDate || !endDate) {
      setCalc(null);
      setCalcError(null);
      return;
    }

    startCalc(async () => {
      const res = await previewLeaveAction(
        leaveType,
        startDate,
        endDate,
      );

      if (res.ok) {
        setCalc(res.calc);
        setCalcError(null);
      } else {
        setCalc(null);
        setCalcError(res.message);
      }
    });
  }, [leaveType, startDate, endDate]);

  useEffect(() => {
    if (state?.ok) {
      router.push("/my-leave");
    }
  }, [state, router]);

  const availableBalance =
    leaveType === "comp_day"
      ? compDayBalance.available
      : balance.available;

  const overBudget = calc
    ? calc.leaveDays > availableBalance
    : false;

  const err = (field: string) =>
    state && !state.ok && state.field === field
      ? state.message
      : undefined;

  return (
    <div className="grid-2">
      <Card>
        <CardHead
          title="Request leave"
          sub="Submit at least 7 days in advance. For emergency leave, please contact an admin."
        />

        <form action={formAction}>
          <input
            type="hidden"
            name="leaveType"
            value={leaveType}
          />

          <div className="card-body stack">
            {state && !state.ok && !state.field && (
              <Alert kind="error">
                <IconAlert size={16} />
                <span>{state.message}</span>
              </Alert>
            )}

            <div className="form-grid">
              <Field
                label="Leave type"
                htmlFor="leaveType"
              >
                <select
                  id="leaveType"
                  className="input"
                  value={leaveType}
                  onChange={(e) => {
                    const nextType = e.target.value as
                      | "annual"
                      | "comp_day";

                    setLeaveType(nextType);
                    setCalc(null);
                    setCalcError(null);

                    if (
                      nextType === "comp_day" &&
                      startDate
                    ) {
                      setEndDate(startDate);
                    }
                  }}
                >
                  <option value="annual">
                    Annual Leave
                  </option>

                  <option value="comp_day">
                    Compensatory Leave
                  </option>
                </select>
              </Field>

              <Field
                label={
                  leaveType === "comp_day"
                    ? "Leave date"
                    : "Start date"
                }
                htmlFor="startDate"
                error={err("startDate")}
              >
                <input
                  id="startDate"
                  name="startDate"
                  type="date"
                  className="input"
                  required
                  min={earliestStartDate}
                  value={startDate}
                  onChange={(e) => {
                    const value = e.target.value;

                    setStartDate(value);

                    if (leaveType === "comp_day") {
                      setEndDate(value);
                    } else if (
                      endDate &&
                      value > endDate
                    ) {
                      setEndDate(value);
                    }
                  }}
                />
              </Field>

              {leaveType === "annual" ? (
                <Field
                  label="End date"
                  htmlFor="endDate"
                  error={err("endDate")}
                >
                  <input
                    id="endDate"
                    name="endDate"
                    type="date"
                    className="input"
                    required
                    min={
                      startDate ||
                      earliestStartDate
                    }
                    value={endDate}
                    onChange={(e) =>
                      setEndDate(e.target.value)
                    }
                  />
                </Field>
              ) : (
                <input
                  type="hidden"
                  name="endDate"
                  value={startDate}
                />
              )}
            </div>

            {leaveType === "comp_day" && (
              <p className="tiny">
                Compensatory Leave is for one full day only
                and can only be used on an eligible WFH day.
              </p>
            )}

            <Field
              label="Reason or note"
              htmlFor="reason"
              hint="Optional — helpful context for whoever approves it."
              error={err("reason")}
            >
              <textarea
                id="reason"
                name="reason"
                className="textarea"
                maxLength={1000}
                placeholder={
                  leaveType === "comp_day"
                    ? "e.g. Using Comp Day earned from weekend work"
                    : "e.g. Family trip to Chiang Mai"
                }
              />
            </Field>

            {calcError && (
              <Alert kind="warn">
                <IconAlert size={16} />
                <span>{calcError}</span>
              </Alert>
            )}

            {overBudget && (
              <Alert kind="error">
                <IconAlert size={16} />

                <span>
                  This request needs{" "}
                  <b>{calc!.leaveDays} day(s)</b> but you
                  only have{" "}
                  <b>{availableBalance}</b> available once
                  pending requests are counted.
                </span>
              </Alert>
            )}
          </div>

          <div className="card-foot spread">
            <span className="tiny">
              {calcPending
                ? "Calculating…"
                : calc
                  ? leaveType === "comp_day"
                    ? "1 Comp Day will be used"
                    : `${calc.leaveDays} day(s) will be deducted`
                  : leaveType === "comp_day"
                    ? "Pick a WFH date to continue"
                    : "Pick your dates to see the calculation"}
            </span>

            <button
              className="btn btn-primary"
              type="submit"
              disabled={
                pending ||
                !calc ||
                calc.leaveDays === 0 ||
                overBudget
              }
            >
              {pending
                ? "Submitting…"
                : "Submit request"}
            </button>
          </div>
        </form>
      </Card>

      <div className="stack">
        <Card>
          <CardHead
            title={
              leaveType === "comp_day"
                ? "Comp Day rules"
                : "How this is calculated"
            }
          />

          <div className="card-body">
            {leaveType === "comp_day" ? (
              <div className="stack">
                <p className="muted-sm">
                  Compensatory Leave can only be used on
                  an eligible <b>WFH day</b>.
                </p>

                <p className="tiny">
                  Each request uses exactly 1 Comp Day.
                  Office days, weekends, and company
                  holidays cannot be selected.
                </p>

                {calc && (
                  <div className="breakdown">
                    <div className="breakdown-row">
                      <span className="lbl">
                        Selected date
                      </span>

                      <span className="val">
                        {formatDate(calc.startDate)}
                      </span>
                    </div>

                    <div className="breakdown-row total">
                      <span className="lbl">
                        Comp Day used
                      </span>

                      <span className="val">
                        1
                      </span>
                    </div>
                  </div>
                )}
              </div>
            ) : calc ? (
              <Breakdown calc={calc} />
            ) : (
              <p className="muted-sm">
                ISX office days are currently{" "}
                <b>{officeDayNames}</b>. Choose a date
                range and you&apos;ll see exactly which
                days count against your balance and which
                don&apos;t.
              </p>
            )}
          </div>
        </Card>

        <Card>
          <CardHead
            title={
              leaveType === "comp_day"
                ? "Your Comp Day balance"
                : "Your annual leave balance"
            }
          />

          <div className="card-body">
            {leaveType === "comp_day" ? (
              <>
                <dl className="dl">
                  <dt>Earned this year</dt>
                  <dd className="num">
                    {compDayBalance.earned} days
                  </dd>

                  <dt>Used / approved</dt>
                  <dd className="num">
                    {compDayBalance.approved} days
                  </dd>

                  <dt>Awaiting approval</dt>
                  <dd className="num">
                    {compDayBalance.pending} days
                  </dd>

                  <dt>Remaining</dt>
                  <dd className="num">
                    {compDayBalance.remaining} days
                  </dd>

                  <dt>Available to book</dt>
                  <dd
                    className="num"
                    style={{
                      color:
                        compDayBalance.available <= 1
                          ? "var(--c-warn)"
                          : undefined,
                    }}
                  >
                    {compDayBalance.available} days
                  </dd>
                </dl>

                <p className="tiny mt-16">
                  Comp Days are earned by working on an
                  eligible weekend or company holiday.
                  They expire at the end of the year they
                  were earned.
                </p>
              </>
            ) : (
              <>
                <dl className="dl">
                  <dt>Annual entitlement</dt>
                  <dd className="num">
                    {balance.entitlement} days
                  </dd>

                  <dt>Approved so far</dt>
                  <dd className="num">
                    {balance.approved} days
                  </dd>

                  <dt>Awaiting approval</dt>
                  <dd className="num">
                    {balance.pending} days
                  </dd>

                  <dt>Available to book</dt>
                  <dd
                    className="num"
                    style={{
                      color:
                        balance.available <= 2
                          ? "var(--c-warn)"
                          : undefined,
                    }}
                  >
                    {balance.available} days
                  </dd>
                </dl>

                <p className="tiny mt-16">
                  Only approved Annual Leave reduces your
                  official annual balance. Pending requests
                  are held aside so you can&apos;t book the
                  same balance twice.
                </p>
              </>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

export function Breakdown({
  calc,
}: {
  calc: LeaveCalculation;
}) {
  return (
    <>
      <div className="breakdown">
        <div className="breakdown-row">
          <span className="lbl">
            Calendar days selected
          </span>

          <span className="val">
            {calc.totalCalendarDays}
          </span>
        </div>

        <div className="breakdown-row">
          <span className="lbl">
            Non-office days (weekends and days ISX
            doesn&apos;t work)
          </span>

          <span className="val">
            − {calc.excludedNonOfficeDays}
          </span>
        </div>

        <div className="breakdown-row">
          <span className="lbl">
            Public holidays falling on an office day
          </span>

          <span className="val">
            − {calc.excludedHolidays}
          </span>
        </div>

        <div className="breakdown-row total">
          <span className="lbl">
            Leave days deducted
          </span>

          <span className="val">
            {calc.leaveDays}
          </span>
        </div>
      </div>

      {calc.holidays.length > 0 && (
        <div className="mt-16">
          <div
            className="tiny"
            style={{
              fontWeight: 650,
              marginBottom: 6,
            }}
          >
            Holidays in this range
          </div>

          <div
            className="stack"
            style={{ gap: 6 }}
          >
            {calc.holidays.map((h) => (
              <div
                key={h.date + h.name}
                className="row"
                style={{ gap: 8 }}
              >
                <IconCheck size={14} />

                <span className="tiny">
                  <b>{formatDate(h.date)}</b>
                  {" — "}
                  {h.name}{" "}
                  <span className="chip">
                    {h.source}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}