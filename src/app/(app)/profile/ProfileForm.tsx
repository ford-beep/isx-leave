"use client";

import { useActionState } from "react";
import {
  updateProfileAction,
  type ProfileFormState,
} from "@/actions/profile";
import { useActionToast } from "@/components/Toast";

export function ProfileForm({
  name,
  email,
}: {
  name: string;
  email: string;
}) {
  const [state, action, pending] = useActionState<
    ProfileFormState,
    FormData
  >(updateProfileAction, null);

  useActionToast(state);

  return (
    <form action={action} className="stack">
      <div className="field">
        <label htmlFor="profile-name">Name</label>

        <input
          id="profile-name"
          className="input"
          name="name"
          type="text"
          defaultValue={name}
          required
          maxLength={120}
        />

        {state && !state.ok && state.field === "name" && (
          <p className="field-error">{state.message}</p>
        )}
      </div>

      <div className="field">
        <label htmlFor="profile-email">Email</label>

        <input
          id="profile-email"
          className="input"
          type="email"
          value={email}
          disabled
          readOnly
        />

        <p className="tiny">
          Email is managed by an administrator.
        </p>
      </div>

      {state && !state.ok && state.field !== "name" && (
        <div className="alert alert-error">
          <span>{state.message}</span>
        </div>
      )}

      <div>
        <button
          className="btn btn-primary"
          type="submit"
          disabled={pending}
        >
          {pending ? "Saving…" : "Save profile"}
        </button>
      </div>
    </form>
  );
}
