"use client";

import { useActionState, useState } from "react";
import { cancelLeaveAction } from "@/actions/leave";
import { Dialog } from "./Dialog";
import { useActionToast } from "./Toast";

/** Destructive action -> confirmation dialog (§18). */
export function CancelRequestButton({ id, range, days }: { id: string; range: string; days: number }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(cancelLeaveAction, null);
  useActionToast(state);
  if (state?.ok && open) setTimeout(() => setOpen(false), 0);

  return (
    <>
      <button className="btn btn-sm" onClick={() => setOpen(true)}>Cancel</button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Cancel this leave request?"
        description={`${range} · ${days} day${days === 1 ? "" : "s"}. This can't be undone — you'd need to submit a new request.`}
        footer={
          <>
            <button className="btn" onClick={() => setOpen(false)}>Keep request</button>
            <form action={formAction}>
              <input type="hidden" name="id" value={id} />
              <button className="btn btn-danger" type="submit" disabled={pending}>
                {pending ? "Cancelling…" : "Cancel request"}
              </button>
            </form>
          </>
        }
      />
    </>
  );
}
