"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { previewLeaveAction, submitLeaveAction } from "@/actions/leave";
import { formatDate } from "@/lib/date";
import type { LeaveBalance, LeaveCalculation, LeaveType } from "@/lib/types";
import { Alert, Card, CardHead, Field } from "./ui";
import { useActionToast } from "./Toast";
import { IconAlert, IconCheck } from "./icons";

export function RequestForm({ leaveTypes, balance, today, officeDayNames }: {
  leaveTypes: LeaveType[]; balance: LeaveBalance; today: string; officeDayNames: string;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(submitLeaveAction, null);
  useActionToast(state);

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [calc, setCalc] = useState<LeaveCalculation | null>(null);
  const [calcError, setCalcError] = useState<string | null>(null);
  const [calcPending, startCalc] = useTransition();

  // Live breakdown, computed by the same SQL function the database uses to
  // validate the request — the preview can never disagree with the outcome.
  useEffect(() => {
    if (!startDate || !endDate) { setCalc(null); setCalcError(null); return; }
    startCalc(async () => {
      const res = await previewLeaveAction(startDate, endDate);
      if (res.ok) { setCalc(res.calc); setCalcError(null); }
      else { setCalc(null); setCalcError(res.message); }
    });
  }, [startDate, endDate]);

  useEffect(() => {
    if (state?.ok) router.push("/my-leave");
  }, [state, router]);

  const overBudget = calc ? calc.leaveDays > balance.available : false;
  const err = (f: string) => (state && !state.ok && state.field === f ? state.message : undefined);

  return (
    <div className="grid-2">
      <Card>
        <CardHead title="Request leave" sub="Days are deducted only for office working days that aren't public holidays." />
        <form action={formAction}>
          <div className="card-body stack">
            {state && !state.ok && !state.field && (
              <Alert kind="error"><IconAlert size={16} /><span>{state.message}</span></Alert>
            )}

            <Field label="Leave type" htmlFor="leaveType" error={err("leaveType")}
              hint={leaveTypes.find((t) => t.code === "annual")?.description ?? undefined}>
              <select id="leaveType" name="leaveType" className="select" defaultValue="annual" required>
                {leaveTypes.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
              </select>
            </Field>

            <div className="form-grid">
              <Field label="Start date" htmlFor="startDate" error={err("startDate")}>
                <input id="startDate" name="startDate" type="date" className="input" required
                  min={today} value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    if (endDate && e.target.value > endDate) setEndDate(e.target.value);
                  }} />
              </Field>
              <Field label="End date" htmlFor="endDate" error={err("endDate")}>
                <input id="endDate" name="endDate" type="date" className="input" required
                  min={startDate || today} value={endDate}
                  onChange={(e) => setEndDate(e.target.value)} />
              </Field>
            </div>

            <Field label="Reason or note" htmlFor="reason" hint="Optional — helpful context for whoever approves it."
              error={err("reason")}>
              <textarea id="reason" name="reason" className="textarea" maxLength={1000}
                placeholder="e.g. Family trip to Chiang Mai" />
            </Field>

            {calcError && <Alert kind="warn"><IconAlert size={16} /><span>{calcError}</span></Alert>}
            {overBudget && (
              <Alert kind="error">
                <IconAlert size={16} />
                <span>
                  This request needs <b>{calc!.leaveDays} days</b> but you only have <b>{balance.available}</b> left
                  once pending requests are counted.
                </span>
              </Alert>
            )}
          </div>

          <div className="card-foot spread">
            <span className="tiny">
              {calcPending ? "Calculating…" : calc ? `${calc.leaveDays} day(s) will be deducted` : "Pick your dates to see the calculation"}
            </span>
            <button className="btn btn-primary" type="submit"
              disabled={pending || !calc || calc.leaveDays === 0 || overBudget}>
              {pending ? "Submitting…" : "Submit request"}
            </button>
          </div>
        </form>
      </Card>

      <div className="stack">
        <Card>
          <CardHead title="How this is calculated" />
          <div className="card-body">
            {calc ? <Breakdown calc={calc} /> : (
              <p className="muted-sm">
                ISX office days are currently <b>{officeDayNames}</b>. Choose a date range and you'll see exactly
                which days count against your balance and which don't.
              </p>
            )}
          </div>
        </Card>

        <Card>
          <CardHead title="Your balance" />
          <div className="card-body">
            <dl className="dl">
              <dt>Annual entitlement</dt><dd className="num">{balance.entitlement} days</dd>
              <dt>Approved so far</dt><dd className="num">{balance.approved} days</dd>
              <dt>Awaiting approval</dt><dd className="num">{balance.pending} days</dd>
              <dt>Available to book</dt>
              <dd className="num" style={{ color: balance.available <= 2 ? "var(--c-warn)" : undefined }}>
                {balance.available} days
              </dd>
            </dl>
            <p className="tiny mt-16">
              Only approved leave reduces your official balance. Pending requests are held aside so you can&apos;t
              book the same days twice.
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}

export function Breakdown({ calc }: { calc: LeaveCalculation }) {
  return (
    <>
      <div className="breakdown">
        <div className="breakdown-row">
          <span className="lbl">Calendar days selected</span>
          <span className="val">{calc.totalCalendarDays}</span>
        </div>
        <div className="breakdown-row">
          <span className="lbl">Non-office days (weekends and days ISX doesn&apos;t work)</span>
          <span className="val">− {calc.excludedNonOfficeDays}</span>
        </div>
        <div className="breakdown-row">
          <span className="lbl">Public holidays falling on an office day</span>
          <span className="val">− {calc.excludedHolidays}</span>
        </div>
        <div className="breakdown-row total">
          <span className="lbl">Leave days deducted</span>
          <span className="val">{calc.leaveDays}</span>
        </div>
      </div>

      {calc.holidays.length > 0 && (
        <div className="mt-16">
          <div className="tiny" style={{ fontWeight: 650, marginBottom: 6 }}>Holidays in this range</div>
          <div className="stack" style={{ gap: 6 }}>
            {calc.holidays.map((h) => (
              <div key={h.date + h.name} className="row" style={{ gap: 8 }}>
                <IconCheck size={14} />
                <span className="tiny"><b>{formatDate(h.date)}</b> — {h.name} <span className="chip">{h.source}</span></span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
