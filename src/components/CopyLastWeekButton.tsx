"use client";

import { useActionState } from "react";

import {
  copyLastWeekAction,
  type WeeklyPlanActionState,
} from "@/actions/weekly-plan";

const initialState: WeeklyPlanActionState = null;

export function CopyLastWeekButton({ weekStart }: { weekStart: string }) {
  const [state, action, pending] = useActionState(
    copyLastWeekAction,
    initialState,
  );

  return (
    <div className="weekly-plan-copy">
      <form action={action}>
        <input type="hidden" name="weekStart" value={weekStart} />

        <button type="submit" className="btn btn-sm" disabled={pending}>
          {pending ? "Copying..." : "Copy last week"}
        </button>
      </form>

      {state ? (
        <span
          className={
            state.ok ? "weekly-plan-copy-message" : "weekly-plan-error"
          }
        >
          {state.message}
        </span>
      ) : null}
    </div>
  );
}
