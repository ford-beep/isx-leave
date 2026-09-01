"use client";

import { useActionState } from "react";
import { grantCompDayAction } from "@/actions/comp-days";
import { Alert, Card, CardHead, Field } from "@/components/ui";
import { IconAlert, IconCheck } from "@/components/icons";

type EmployeeOption = {
  id: string;
  name: string;
  email: string;
};

export function GrantCompDayForm({
  employees,
}: {
  employees: EmployeeOption[];
}) {
  const [state, formAction, pending] = useActionState(
    grantCompDayAction,
    null,
  );

  const err = (field: string) =>
    state &&
    !state.ok &&
    "field" in state &&
    state.field === field
      ? state.message
      : undefined;

  return (
    <Card>
      <CardHead
        title="Grant Comp Day"
        sub="Give 1 Comp Day for work performed on a weekend or company holiday."
      />

      <form action={formAction}>
        <div className="card-body stack">
          {state?.ok && (
            <Alert kind="ok">
              <IconCheck size={16} />
              <span>{state.message}</span>
            </Alert>
          )}

          {state && !state.ok && (
            <Alert kind="error">
              <IconAlert size={16} />
              <span>{state.message}</span>
            </Alert>
          )}

          <Field
            label="Employee"
            htmlFor="employeeId"
            error={err("employeeId")}
          >
            <select
              id="employeeId"
              name="employeeId"
              className="input"
              required
              defaultValue=""
            >
              <option value="" disabled>
                Choose employee
              </option>

              {employees.map((employee) => (
                <option
                  key={employee.id}
                  value={employee.id}
                >
                  {employee.name} — {employee.email}
                </option>
              ))}
            </select>
          </Field>

          <Field
            label="Date worked"
            htmlFor="earnedDate"
            hint="Must be a weekend or company holiday."
            error={err("earnedDate")}
          >
            <input
              id="earnedDate"
              name="earnedDate"
              type="date"
              className="input"
              required
            />
          </Field>

          <Field
            label="Note"
            htmlFor="note"
            hint="Optional — e.g. event name or reason for weekend work."
            error={err("note")}
          >
            <textarea
              id="note"
              name="note"
              className="textarea"
              maxLength={1000}
              placeholder="e.g. Worked at weekend client event"
            />
          </Field>

          <Alert kind="info">
            <span>
              Working on an eligible weekend or company
holiday grants <b>1 Comp Day</b>. Comp Days
expire at the end of the calendar year they
were earned.
            </span>
          </Alert>
        </div>

        <div className="card-foot">
          <button
            type="submit"
            className="btn btn-primary"
            disabled={pending || employees.length === 0}
          >
            {pending
              ? "Granting…"
              : "Grant 1 Comp Day"}
          </button>
        </div>
      </form>
    </Card>
  );
}