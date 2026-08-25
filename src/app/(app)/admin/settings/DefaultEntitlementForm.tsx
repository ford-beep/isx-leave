"use client";

import { useActionState } from "react";
import { setDefaultEntitlementAction } from "@/actions/admin";
import { Alert, Card, CardHead, Field } from "@/components/ui";
import { useActionToast } from "@/components/Toast";

export function DefaultEntitlementForm({ value }: { value: number }) {
  const [state, formAction, pending] = useActionState(setDefaultEntitlementAction, null);
  useActionToast(state);

  return (
    <Card>
      <CardHead title="Default annual entitlement"
        sub="Used for new employees and for anyone without a row for a given year." />
      <form action={formAction}>
        <div className="card-body stack">
          {state && !state.ok && <Alert kind="error">{state.message}</Alert>}
          <Field label="Days per year" htmlFor="defaultEntitlement"
            hint="Individual employees can still be given more or fewer days.">
            <input id="defaultEntitlement" name="defaultEntitlement" type="number" className="input"
              min={0} max={366} step={0.5} defaultValue={value} required />
          </Field>
        </div>
        <div className="card-foot" style={{ textAlign: "right" }}>
          <button className="btn btn-primary" type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save default"}
          </button>
        </div>
      </form>
    </Card>
  );
}
