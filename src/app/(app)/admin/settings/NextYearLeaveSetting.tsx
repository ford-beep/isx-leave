"use client";

import { useActionState } from "react";

import {
  setNextYearLeavePlanningAction,
  type AdminFormState,
} from "@/actions/admin";
import { Card, CardHead } from "@/components/ui";
import { useActionToast } from "@/components/Toast";

export function NextYearLeaveSetting({
  enabled,
  currentYear,
}: {
  enabled: boolean;
  currentYear: number;
}) {
  const [state, action, pending] = useActionState<
    AdminFormState,
    FormData
  >(
    setNextYearLeavePlanningAction,
    null,
  );

  useActionToast(state);

  const nextYear = currentYear + 1;

  return (
    <Card>
      <CardHead
        title="Next-year leave planning"
        sub={`Control whether employees can view and request leave for ${nextYear}.`}
      />

      <div className="card-body">
        <div
          className="spread"
          style={{
            alignItems: "center",
          }}
        >
          <div>
            <div
              style={{
                fontSize: 13.5,
                fontWeight: 600,
              }}
            >
              Employee access for {nextYear}
            </div>

            <p
              className="muted-sm"
              style={{
                marginTop: 4,
                maxWidth: 520,
              }}
            >
              {enabled
                ? `Employees can view the ${nextYear} calendar and submit leave requests for ${nextYear}.`
                : `${nextYear} is hidden from employee calendars and employees cannot submit leave requests for that year.`}
            </p>
          </div>

          <form action={action}>
            <input
              type="hidden"
              name="enabled"
              value={enabled ? "false" : "true"}
            />

            <button
              type="submit"
              className={
                enabled
                  ? "btn"
                  : "btn btn-primary"
              }
              disabled={pending}
            >
              {pending
                ? "Updating..."
                : enabled
                  ? "Close next year"
                  : "Open next year"}
            </button>
          </form>
        </div>

        <div style={{ marginTop: 12 }}>
          <span
            className={`badge ${
              enabled
                ? "badge-approved"
                : "badge-cancelled"
            }`}
          >
            {enabled ? "Open" : "Closed"}
          </span>
        </div>
      </div>
    </Card>
  );
}