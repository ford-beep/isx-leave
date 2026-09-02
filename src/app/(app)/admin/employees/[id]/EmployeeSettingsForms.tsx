"use client";

import { useActionState } from "react";
import {
  resetEmployeePasswordAction, setEntitlementAction, updateEmployeeAction,
} from "@/actions/admin";
import { Alert, Card, CardHead, Field } from "@/components/ui";
import { useActionToast } from "@/components/Toast";
import type { UserRow } from "@/lib/types";

export function EmployeeSettingsForms({ employee, entitlements, currentYear, isSelf }: {
  employee: UserRow;
  entitlements: Array<{ year: number; totalDays: number; note: string | null }>;
  currentYear: number;
  isSelf: boolean;
}) {
  const [profileState, profileAction, profilePending] = useActionState(updateEmployeeAction, null);
  const [entState, entAction, entPending] = useActionState(setEntitlementAction, null);
  const [pwState, pwAction, pwPending] = useActionState(resetEmployeePasswordAction, null);
  useActionToast(profileState);
  useActionToast(entState);
  useActionToast(pwState);

  const years = Array.from(new Set([currentYear, currentYear + 1, ...entitlements.map((e) => e.year)]))
    .sort((a, b) => b - a);

  return (
    <div className="stack">
      <Card>
        <CardHead title="Employee details" />
        <form action={profileAction}>
          <div className="card-body stack">
            {profileState && !profileState.ok && <Alert kind="error">{profileState.message}</Alert>}
            <input type="hidden" name="id" value={employee.id} />
            <Field label="Full name" htmlFor="name">
              <input id="name" name="name" className="input" defaultValue={employee.name} required />
            </Field>
            <Field label="Job title" htmlFor="jobTitle">
              <input id="jobTitle" name="jobTitle" className="input" defaultValue={employee.jobTitle ?? ""} />
            </Field>
            <Field label="Full name" htmlFor="name">
  <input
    id="name"
    name="name"
    className="input"
    defaultValue={employee.name}
    required
  />
</Field>

<Field label="Job title" htmlFor="jobTitle">
  <input
    id="jobTitle"
    name="jobTitle"
    className="input"
    defaultValue={employee.jobTitle ?? ""}
  />
</Field>

<Field
  label="Birthday"
  htmlFor="birthday"
  hint="Managed by administrators."
>
  <input
    id="birthday"
    name="birthday"
    type="date"
    className="input"
    max={new Date().toISOString().slice(0, 10)}
    defaultValue={employee.birthday ?? ""}
  />
</Field>

<div className="form-grid"></div>
            <div className="form-grid">
              <Field label="Role" htmlFor="role"
                hint={isSelf ? "You can't change your own role." : undefined}>
                <select id="role" name="role" className="select" defaultValue={employee.role} disabled={isSelf}>
                  <option value="employee">Employee</option>
                  <option value="admin">Administrator</option>
                </select>
                {isSelf && <input type="hidden" name="role" value={employee.role} />}
              </Field>
              <Field label="Account status" htmlFor="active">
                <select id="active" name="active" className="select"
                  defaultValue={employee.active ? "true" : "false"} disabled={isSelf}>
                  <option value="true">Active</option>
                  <option value="false">Inactive — cannot sign in</option>
                </select>
                {isSelf && <input type="hidden" name="active" value="true" />}
              </Field>
            </div>
          </div>
          <div className="card-foot" style={{ textAlign: "right" }}>
            <button className="btn btn-primary" type="submit" disabled={profilePending}>
              {profilePending ? "Saving…" : "Save details"}
            </button>
          </div>
        </form>
      </Card>

      <Card>
        <CardHead title="Leave entitlement" sub="Set separately for each calendar year (§23)." />
        <form action={entAction}>
          <div className="card-body stack">
            {entState && !entState.ok && <Alert kind="error">{entState.message}</Alert>}
            <input type="hidden" name="employeeId" value={employee.id} />
            <div className="form-grid">
              <Field label="Year" htmlFor="year">
                <select id="year" name="year" className="select" defaultValue={currentYear}>
                  {years.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
              </Field>
              <Field label="Total days" htmlFor="totalDays">
                <input id="totalDays" name="totalDays" type="number" className="input"
                  min={0} max={366} step={0.5}
                  defaultValue={entitlements.find((e) => e.year === currentYear)?.totalDays ?? 15} required />
              </Field>
            </div>
            <Field label="Note" htmlFor="note" hint="Optional — why this differs from the default.">
              <input id="note" name="note" className="input" placeholder="e.g. Long service — 5 extra days"
                defaultValue={entitlements.find((e) => e.year === currentYear)?.note ?? ""} />
            </Field>

            {entitlements.length > 0 && (
              <div className="breakdown">
                {entitlements.map((e) => (
                  <div className="breakdown-row" key={e.year}>
                    <span className="lbl">{e.year}{e.note ? ` · ${e.note}` : ""}</span>
                    <span className="val">{e.totalDays} days</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="card-foot" style={{ textAlign: "right" }}>
            <button className="btn btn-primary" type="submit" disabled={entPending}>
              {entPending ? "Saving…" : "Save entitlement"}
            </button>
          </div>
        </form>
      </Card>

      <Card>
        <CardHead title="Reset password" sub="Issues a temporary password you can share with them." />
        <form action={pwAction}>
          <div className="card-body">
            {pwState && !pwState.ok && <Alert kind="error">{pwState.message}</Alert>}
            <input type="hidden" name="id" value={employee.id} />
            <Field label="Temporary password" htmlFor="password" hint="At least 8 characters.">
              <input id="password" name="password" className="input" minLength={8} required />
            </Field>
          </div>
          <div className="card-foot" style={{ textAlign: "right" }}>
            <button className="btn" type="submit" disabled={pwPending}>
              {pwPending ? "Setting…" : "Set temporary password"}
            </button>
          </div>
        </form>
      </Card>
    </div>
  );
}
