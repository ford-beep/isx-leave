"use client";

import { useActionState } from "react";
import {
  createEmergencyLeaveAction,
  type AdminFormState,
} from "@/actions/admin";
import { Field } from "@/components/ui";

type EmployeeOption = {
  id: string;
  name: string;
};

export function EmergencyLeaveForm({
  employees,
}: {
  employees: EmployeeOption[];
}) {
  const [state, action, pending] = useActionState<
    AdminFormState,
    FormData
  >(createEmergencyLeaveAction, null);

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
            <option key={employee.id} value={employee.id}>
              {employee.name}
            </option>
          ))}
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
        label="Reason"
        htmlFor="reason"
        error={errorFor("reason")}
        hint="Explain why this leave is being entered by an admin."
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
          className={state.ok ? "alert alert-success" : "alert alert-error"}
        >
          {state.message}
        </div>
      )}

      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button
          type="submit"
          className="btn btn-primary"
          disabled={pending}
        >
          {pending ? "Adding..." : "Add emergency leave"}
        </button>
      </div>
    </form>
  );
}