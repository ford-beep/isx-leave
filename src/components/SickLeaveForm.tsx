"use client";

import { useActionState } from "react";
import {
  createSickLeaveAction,
  type AdminFormState,
} from "@/actions/admin";
import { Field } from "@/components/ui";

type EmployeeOption = {
  id: string;
  name: string;
};

export function SickLeaveForm({
  employees,
}: {
  employees: EmployeeOption[];
}) {
  const [state, action, pending] = useActionState<
    AdminFormState,
    FormData
  >(createSickLeaveAction, null);

  const errorFor = (field: string) =>
    state && !state.ok && state.field === field
      ? state.message
      : undefined;

  return (
    <form action={action} className="stack">
      <Field
        label="Employee"
        htmlFor="employeeId"
        error={errorFor("employeeId")}
      >
        <select
          id="employeeId"
          name="employeeId"
          className="select"
          required
          defaultValue=""
        >
          <option value="" disabled>
            Select employee
          </option>

          {employees.map((employee) => (
            <option
              key={employee.id}
              value={employee.id}
            >
              {employee.name}
            </option>
          ))}
        </select>
      </Field>

      <Field
        label="Leave duration"
        htmlFor="leaveSession"
        error={errorFor("leaveSession")}
      >
        <select
          id="leaveSession"
          name="leaveSession"
          className="select"
          required
          defaultValue="full_day"
        >
          <option value="full_day">
            Full day
          </option>

          <option value="morning">
            Morning — 0.5 day
          </option>

          <option value="afternoon">
            Afternoon — 0.5 day
          </option>
        </select>
      </Field>

      <div className="grid-2">
        <Field
          label="Start date"
          htmlFor="startDate"
          error={errorFor("startDate")}
        >
          <input
            id="startDate"
            name="startDate"
            type="date"
            className="input"
            required
          />
        </Field>

        <Field
          label="End date"
          htmlFor="endDate"
          error={errorFor("endDate")}
        >
          <input
            id="endDate"
            name="endDate"
            type="date"
            className="input"
            required
          />
        </Field>
      </div>

      <Field
        label="Note"
        htmlFor="reason"
        error={errorFor("reason")}
        hint="Internal note about the sick leave."
      >
        <textarea
          id="reason"
          name="reason"
          className="textarea"
          rows={4}
          maxLength={1000}
          required
        />
      </Field>

      {state?.message && (
        <div
         className={
  state.ok
    ? "alert alert-ok"
    : "alert alert-error"
}
        >
          {state.message}
        </div>
      )}

      <div
        className="row"
        style={{ justifyContent: "flex-end" }}
      >
        <button
          type="submit"
          className="btn btn-primary"
          disabled={pending}
        >
          {pending
            ? "Adding..."
            : "Add sick leave"}
        </button>
      </div>
    </form>
  );
}