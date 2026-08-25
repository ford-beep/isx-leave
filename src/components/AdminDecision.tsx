"use client";

import { useActionState, useState } from "react";
import { approveLeaveAction, rejectLeaveAction } from "@/actions/admin";
import { Dialog } from "./Dialog";
import { Field } from "./ui";
import { useActionToast } from "./Toast";
import type { LeaveRequest } from "@/lib/types";
import { formatRange } from "@/lib/date";

/** Approve / reject controls with the confirmation UX from §31. */
export function AdminDecision({ request }: { request: LeaveRequest }) {
  const [mode, setMode] = useState<null | "approve" | "reject">(null);
  const [approveState, approveAction, approving] = useActionState(approveLeaveAction, null);
  const [rejectState, rejectAction, rejecting] = useActionState(rejectLeaveAction, null);
  useActionToast(approveState);
  useActionToast(rejectState);

  if ((approveState?.ok || rejectState?.ok) && mode) setTimeout(() => setMode(null), 0);

  const who = request.employeeName ?? "this employee";
  const days = `${request.leaveDays} day${request.leaveDays === 1 ? "" : "s"}`;

  return (
    <>
      <div className="actions">
        <button className="btn btn-sm btn-ok" onClick={() => setMode("approve")}>Approve</button>
        <button className="btn btn-sm btn-danger" onClick={() => setMode("reject")}>Reject</button>
      </div>

      <Dialog
        open={mode === "approve"}
        onClose={() => setMode(null)}
        title={`Approve ${days} of ${request.leaveTypeLabel} for ${who}?`}
        description={`${formatRange(request.startDate, request.endDate)}. This deducts ${days} from their ${new Date(request.startDate).getUTCFullYear()} balance and notifies them.`}
        footer={
          <>
            <button className="btn" onClick={() => setMode(null)}>Back</button>
            <form action={approveAction}>
              <input type="hidden" name="id" value={request.id} />
              <button className="btn btn-ok" type="submit" disabled={approving}>
                {approving ? "Approving…" : "Approve leave"}
              </button>
            </form>
          </>
        }
      >
        {request.reason && (
          <div className="alert alert-info"><span><b>Their note:</b> {request.reason}</span></div>
        )}
      </Dialog>

      <Dialog
        open={mode === "reject"}
        onClose={() => setMode(null)}
        title={`Reject ${who}'s leave request?`}
        description={`${formatRange(request.startDate, request.endDate)} · ${request.leaveTypeLabel} · ${days}`}
      >
        <form action={rejectAction} id={`reject-${request.id}`}>
          <input type="hidden" name="id" value={request.id} />
          <Field
            label="Reason for rejection"
            htmlFor={`reason-${request.id}`}
            hint="The employee will see this, so be specific and constructive."
            error={rejectState && !rejectState.ok ? rejectState.message : undefined}
          >
            <textarea id={`reason-${request.id}`} name="reason" className="textarea" required minLength={3}
              placeholder="e.g. Client shoot scheduled that Monday — please re-submit for a later week." />
          </Field>
          <div className="row" style={{ justifyContent: "flex-end", marginTop: 14 }}>
            <button className="btn" type="button" onClick={() => setMode(null)}>Back</button>
            <button className="btn btn-danger" type="submit" disabled={rejecting}>
              {rejecting ? "Rejecting…" : "Reject with reason"}
            </button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
