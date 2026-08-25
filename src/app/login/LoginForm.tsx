"use client";

import { useActionState } from "react";
import { demoLoginAction, loginAction } from "@/actions/auth";
import { Alert, Avatar, Field } from "@/components/ui";
import { IconAlert } from "@/components/icons";

const DEMO = [
  { email: "admin@demo.isx.local", name: "Somchai Wattana", role: "Admin · HR & Operations" },
  { email: "jane@demo.isx.local", name: "Jane Mitchell", role: "Employee · 15 days" },
  { email: "john@demo.isx.local", name: "John Prasert", role: "Employee · 20 days" },
  { email: "mike@demo.isx.local", name: "Mike Chen", role: "Employee · 12 days" },
];

export function LoginForm({ demoMode, reason }: { demoMode: boolean; reason?: string }) {
  const [state, formAction, pending] = useActionState(loginAction, null);

  return (
    <div className="auth-card">
      <h1>Sign in</h1>
      <p className="muted-sm" style={{ marginBottom: 20 }}>Use your ISX work email address.</p>

      {reason === "inactive" && (
        <div style={{ marginBottom: 14 }}>
          <Alert kind="warn"><IconAlert size={16} /><span>Your session ended because the account is no longer active.</span></Alert>
        </div>
      )}

      <form action={formAction} className="stack">
        {state && !state.ok && !state.field && (
          <Alert kind="error"><IconAlert size={16} /><span>{state.message}</span></Alert>
        )}
        <Field label="Email address" htmlFor="email"
          error={state && !state.ok && state.field === "email" ? state.message : undefined}>
          <input id="email" name="email" type="email" className="input" autoComplete="username"
            required autoFocus placeholder="you@isx.co.th" />
        </Field>
        <Field label="Password" htmlFor="password"
          error={state && !state.ok && state.field === "password" ? state.message : undefined}>
          <input id="password" name="password" type="password" className="input"
            autoComplete="current-password" required placeholder="••••••••" />
        </Field>
        <button className="btn btn-primary btn-lg btn-block" type="submit" disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>

      {demoMode && (
        <>
          <div className="divider" />
          <div className="tiny" style={{ fontWeight: 650, marginBottom: 2 }}>Demo accounts</div>
          <p className="tiny">One click to sign in. Disabled automatically in production.</p>
          <div className="demo-users">
            {DEMO.map((d) => (
              <form action={demoLoginAction} key={d.email}>
                <input type="hidden" name="email" value={d.email} />
                <button className="demo-user" type="submit">
                  <Avatar name={d.name} />
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 13, fontWeight: 600 }}>{d.name}</span>
                    <span className="tiny">{d.role}</span>
                  </span>
                </button>
              </form>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
