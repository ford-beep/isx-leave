"use client";

import { useActionState } from "react";
import { setWorkModeAction } from "@/actions/admin";

export function WorkModeToggle({
  date,
  mode,
}: {
  date: string;
  mode: "office" | "wfh";
}) {
  const [state, formAction, pending] = useActionState(setWorkModeAction, null);

  const nextMode = mode === "office" ? "wfh" : "office";

  return (
    <form action={formAction}>
      <input type="hidden" name="date" value={date} />
      <input type="hidden" name="mode" value={nextMode} />

      <button
        type="submit"
        className="cal-work-mode-btn"
        disabled={pending}
        title={`Change to ${nextMode === "office" ? "Office" : "WFH"}`}
      >
        {pending
          ? "Saving…"
          : mode === "office"
            ? "Office"
            : "WFH"}
      </button>

      {state?.ok === false && (
        <div className="tiny" style={{ color: "var(--c-bad)" }}>
          {state.message}
        </div>
      )}
    </form>
  );
}