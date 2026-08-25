import type { ReactNode } from "react";
import { formatDate, formatRange } from "@/lib/date";
import type { LeaveRequest } from "@/lib/types";
import { EmptyState, StatusBadge } from "./ui";
import { CancelRequestButton } from "./CancelRequestButton";
import { IconCalendar } from "./icons";

/** The employee's "My Leave" table (§7). */
export function LeaveTable({ requests, showActions = true, emptyAction }: {
  requests: LeaveRequest[]; showActions?: boolean; emptyAction?: ReactNode;
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
            {showActions && <th className="r">Action</th>}
          </tr>
        </thead>
        <tbody>
          {requests.map((r) => (
            <tr key={r.id}>
              <td data-label="Date" className="primary nowrap">{formatRange(r.startDate, r.endDate)}</td>
              <td data-label="Leave type">
                {r.leaveTypeLabel}
                {r.status === "rejected" && r.rejectionReason && (
                  <div className="tiny" style={{ marginTop: 2 }}>Reason: {r.rejectionReason}</div>
                )}
              </td>
              <td data-label="Days" className="r num">{r.leaveDays}</td>
              <td data-label="Status"><StatusBadge status={r.status} /></td>
              <td data-label="Submitted" className="muted-sm nowrap">{formatDate(r.createdAt.slice(0, 10))}</td>
              {showActions && (
                <td data-label="Action" className="r">
                  <div className="actions">
                    {r.status === "pending"
                      ? <CancelRequestButton id={r.id} range={formatRange(r.startDate, r.endDate)} days={r.leaveDays} />
                      : <span className="tiny">—</span>}
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
