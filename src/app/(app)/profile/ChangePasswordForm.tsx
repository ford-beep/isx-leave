"use client";

import { useActionState } from "react";
import { changePasswordAction } from "@/actions/auth";
import { Alert, Field } from "@/components/ui";
import { useActionToast } from "@/components/Toast";

export function ChangePasswordForm() {
  const [state, formAction, pending] = useActionState(changePasswordAction, null);
  useActionToast(state);
  const err = (f: string) => (state && !state.ok && state.field === f ? state.message : undefined);

  return (
    <form action={formAction} className="stack">
      {state && !state.ok && !state.field && <Alert kind="error">{state.message}</Alert>}
      {state?.ok && <Alert kind="ok">{state.message}</Alert>}
      <Field label="Current password" htmlFor="current" error={err("current")}>
        <input id="current" name="current" type="password" className="input" autoComplete="current-password" required />
      </Field>
      <Field label="New password" htmlFor="next" hint="At least 8 characters." error={err("next")}>
        <input id="next" name="next" type="password" className="input" autoComplete="new-password" required minLength={8} />
      </Field>
      <Field label="Confirm new password" htmlFor="confirm" error={err("confirm")}>
        <input id="confirm" name="confirm" type="password" className="input" autoComplete="new-password" required />
      </Field>
      <button className="btn btn-primary" type="submit" disabled={pending}>
        {pending ? "Updating…" : "Update password"}
      </button>
    </form>
  );
}
