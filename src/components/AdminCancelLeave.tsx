"use client";

import { useActionState, useState } from "react";
import { adminCancelLeaveAction } from "@/actions/admin";
import { Dialog } from "./Dialog";
import { useActionToast } from "./Toast";
import type { LeaveRequest } from "@/lib/types";
import { formatRange } from "@/lib/date";

function sessionLabel(
  session: LeaveRequest["leaveSession"],
) {
  switch (session) {
    case "morning":
      return "Half Day · Morning";
    case "afternoon":
      return "Half Day · Afternoon";
    case "half_day":
      return "Half Day";
    default:
      return "Full Day";
  }
}

export function AdminCancelLeave({
  request,
}: {
  request: LeaveRequest;
}) {
  const [open, setOpen] = useState(false);

  const [state, action, cancelling] = useActionState(
    adminCancelLeaveAction,
    null,
  );

  useActionToast(state);

  if (state?.ok && open) {
    setTimeout(() => setOpen(false), 0);
  }

const who = request.employeeName ?? "this employee";

const days = `${request.leaveDays} day${
  request.leaveDays === 1 ? "" : "s"
}`;

const session = sessionLabel(request.leaveSession);

return (
    <>
      <button
        className="btn btn-sm btn-danger"
        type="button"
        onClick={() => setOpen(true)}
      >
        Cancel leave
      </button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Cancel ${who}'s approved leave?`}
        description={`${formatRange(
        request.startDate,
         request.endDate,
        )} · ${session} · ${days}. This will mark the leave as cancelled and restore the leave days to their balance.`}
        footer={
          <>
            <button
              className="btn"
              type="button"
              onClick={() => setOpen(false)}
            >
              Back
            </button>

            <form action={action}>
              <input type="hidden" name="id" value={request.id} />

              <button
                className="btn btn-danger"
                type="submit"
                disabled={cancelling}
              >
                {cancelling ? "Cancelling…" : "Cancel approved leave"}
              </button>
            </form>
          </>
        }
      >
        <div className="alert alert-info">
          <span>
            This request will remain in the leave history with a cancelled
            status. The employee will be notified by email.
          </span>
        </div>
      </Dialog>
    </>
  );
}