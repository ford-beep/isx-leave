import type { ReactNode } from "react";
import { CancelLeaveButton } from "./CancelLeaveButton";
import {
  formatDate,
  formatRange,
} from "@/lib/date";
import type { LeaveRequest } from "@/lib/types";
import {
  EmptyState,
  StatusBadge,
} from "./ui";
import { IconCalendar } from "./icons";

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

/** The employee's "My Leave" table (§7). */
export function LeaveTable({
  requests,
  emptyAction,
  allowSelfCancel = false,
  today,
  highlightRequestId,
}: {
  requests: LeaveRequest[];
  emptyAction?: ReactNode;
  allowSelfCancel?: boolean;
  today?: string;
  highlightRequestId?: string;
}) {
  if (requests.length === 0) {
    return (
      <EmptyState
        icon={<IconCalendar size={20} />}
        title="You haven't requested any leave yet."
        body="When you submit a request it will appear here with its approval status."
        action={emptyAction}
      />
    );
  }

  return (
    <div className="table-wrap">
      <table className="tbl">
        <thead>
          <tr>
            <th>Date</th>
            <th>Leave type</th>
            <th className="r">Days</th>
            <th>Status</th>
            <th>Submitted</th>

            {allowSelfCancel && (
              <th>Action</th>
            )}
          </tr>
        </thead>

        <tbody>
          {requests.map((r) => {
            const canSelfCancel =
              allowSelfCancel &&
              Boolean(today) &&
              (r.leaveType === "annual" ||
                r.leaveType === "comp_day") &&
              (r.status === "pending" ||
                r.status === "approved") &&
              today! < r.startDate;

            return (
<tr
  key={r.id}
  id={`request-${r.id}`}
  style={
    r.id === highlightRequestId
      ? {
          background:
            "var(--surface-accent, rgba(99, 102, 241, 0.08))",
          outline:
            "2px solid var(--c-accent)",
          outlineOffset: "-2px",
        }
      : undefined
  }
>
                <td
                  data-label="Date"
                  className="primary nowrap"
                >
                  {formatRange(
                    r.startDate,
                    r.endDate,
                  )}

                  {r.leaveSession !==
                    "full_day" && (
                    <div
                      className="tiny"
                      style={{
                        marginTop: 2,
                      }}
                    >
                      {sessionLabel(
                        r.leaveSession,
                      )}
                    </div>
                  )}
                </td>

                <td data-label="Leave type">
                  {r.leaveTypeLabel}

                  {r.status ===
                    "rejected" &&
                    r.rejectionReason && (
                      <div
                        className="tiny"
                        style={{
                          marginTop: 2,
                        }}
                      >
                        Reason:{" "}
                        {
                          r.rejectionReason
                        }
                      </div>
                    )}
                </td>

                <td
                  data-label="Days"
                  className="r num"
                >
                  {r.leaveDays}
                </td>

                <td data-label="Status">
                  <StatusBadge
                    status={r.status}
                  />
                </td>

                <td
                  data-label="Submitted"
                  className="muted-sm nowrap"
                >
                  {formatDate(
                    r.createdAt.slice(
                      0,
                      10,
                    ),
                  )}
                </td>

                {allowSelfCancel && (
                  <td data-label="Action">
                    {canSelfCancel ? (
                      <CancelLeaveButton
                        requestId={r.id}
                      />
                    ) : (
                      <span className="muted-sm">
                        —
                      </span>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}