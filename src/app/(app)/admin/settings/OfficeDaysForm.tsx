"use client";

import { useActionState, useState } from "react";
import { setOfficeDaysAction } from "@/actions/admin";
import { Alert, Card, CardHead, Field } from "@/components/ui";
import { useActionToast } from "@/components/Toast";
import { WEEKDAY_NAMES, formatDate } from "@/lib/date";

/** §14 — Office working days. */
export function OfficeDaysForm({ current, effectiveFrom, today }: {
  current: number[]; effectiveFrom: string; today: string;
}) {
  const [state, formAction, pending] = useActionState(setOfficeDaysAction, null);
  useActionToast(state);
  const [selected, setSelected] = useState<number[]>(current);

  const order = [1, 2, 3, 4, 5, 6, 0]; // Monday-first for humans
  const toggle = (d: number) =>
    setSelected((s) => (s.includes(d) ? s.filter((x) => x !== d) : [...s, d]));

  return (
    <Card>
      <CardHead title="Office working days"
        sub={`In force since ${formatDate(effectiveFrom)}. These are the days leave is deducted for.`} />
      <form action={formAction}>
        <div className="card-body stack">
          {state && !state.ok && <Alert kind="error">{state.message}</Alert>}

          <div className="stack" style={{ gap: 6 }}>
            {order.map((d) => (
              <label key={d} className={`check ${selected.includes(d) ? "on" : ""}`}>
                <input type="checkbox" name="weekday" value={d}
                  checked={selected.includes(d)} onChange={() => toggle(d)} />
                <span className="check-body">
                  <span className="check-title">{WEEKDAY_NAMES[d]}</span>
                </span>
              </label>
            ))}
          </div>

          <Field label="Takes effect from" htmlFor="effectiveFrom"
            hint="Leave already approved keeps the day count it was approved with."
            error={state && !state.ok && state.field === "effectiveFrom" ? state.message : undefined}>
            <input id="effectiveFrom" name="effectiveFrom" type="date" className="input"
              defaultValue={today} required />
          </Field>

          <Alert kind="info">
            <span>
              Changing office days only affects requests submitted <b>after</b> the effective date.
              Historical requests keep their original calculation so past approvals stay auditable.
            </span>
          </Alert>
        </div>
        <div className="card-foot" style={{ textAlign: "right" }}>
          <button className="btn btn-primary" type="submit" disabled={pending || selected.length === 0}>
            {pending ? "Saving…" : "Save office days"}
          </button>
        </div>
      </form>
    </Card>
  );
}
