"use client";

import { useActionState, useState } from "react";
import { createEmployeeAction } from "@/actions/admin";
import { Dialog } from "@/components/Dialog";
import { Alert, Field } from "@/components/ui";
import { useActionToast } from "@/components/Toast";
import { IconPlus } from "@/components/icons";

export function NewEmployeeButton({ defaultEntitlement }: { defaultEntitlement: number }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(createEmployeeAction, null);
  useActionToast(state);
  if (state?.ok && open) setTimeout(() => setOpen(false), 0);
  const err = (f: string) => (state && !state.ok && state.field === f ? state.message : undefined);

  return (
    <>
      <button className="btn btn-primary" onClick={() => setOpen(true)}>
        <IconPlus size={16} />Add employee
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} wide
        title="Add an employee"
        description="They'll be able to sign in immediately with the temporary password you set.">
        <form action={formAction} className="stack">
          {state && !state.ok && !state.field && <Alert kind="error">{state.message}</Alert>}
          <div className="form-grid">
            <Field label="Full name" htmlFor="name" error={err("name")} className="full">
              <input id="name" name="name" className="input" required placeholder="Jane Mitchell" />
            </Field>
            <Field label="Work email" htmlFor="email" error={err("email")}>
              <input id="email" name="email" type="email" className="input" required placeholder="jane@isx.co.th" />
            </Field>
            <Field label="Job title" htmlFor="jobTitle" error={err("jobTitle")}>
              <input id="jobTitle" name="jobTitle" className="input" placeholder="Senior Retoucher" />
            </Field>
            <Field label="Role" htmlFor="role">
              <select id="role" name="role" className="select" defaultValue="employee">
                <option value="employee">Employee</option>
                <option value="admin">Administrator</option>
              </select>
            </Field>
            <Field label="Annual entitlement" htmlFor="entitlement" error={err("entitlement")}
              hint={`Company default is ${defaultEntitlement} days`}>
              <input id="entitlement" name="entitlement" type="number" className="input"
                min={0} max={366} step={0.5} defaultValue={defaultEntitlement} required />
            </Field>
            <Field label="Temporary password" htmlFor="password" error={err("password")}
              hint="At least 8 characters. Ask them to change it after first sign-in." className="full">
              <input id="password" name="password" className="input" required minLength={8} />
            </Field>
          </div>
          <div className="row" style={{ justifyContent: "flex-end", marginTop: 6 }}>
            <button className="btn" type="button" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn btn-primary" type="submit" disabled={pending}>
              {pending ? "Adding…" : "Add employee"}
            </button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
