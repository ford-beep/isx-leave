"use server";
import { env } from "@/lib/env";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { companyToday } from "@/lib/date";
import { withUser } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import {
  calcLeaveDays,
  getActiveAdminEmails,
} from "@/lib/queries";
import { toFriendlyError } from "@/lib/errors";
import type { LeaveCalculation } from "@/lib/types";

export type LeaveFormState =
  | {
      ok: boolean;
      message?: string;
      field?: string;
    }
  | null;

type LeaveType = "annual" | "comp_day";

type LeaveSession =
  | "full_day"
  | "morning"
  | "afternoon";

const requestSchema = z
  .object({
    leaveType: z.enum(["annual", "comp_day"]),

    leaveSession: z.enum([
      "full_day",
      "morning",
      "afternoon",
    ]),

    startDate: z
      .string()
      .regex(
        /^\d{4}-\d{2}-\d{2}$/,
        "Choose a start date.",
      ),

    endDate: z
      .string()
      .regex(
        /^\d{4}-\d{2}-\d{2}$/,
        "Choose an end date.",
      ),

    reason: z
      .string()
      .max(
        1000,
        "Please keep the note under 1000 characters.",
      )
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (
      data.leaveSession !== "full_day" &&
      data.startDate !== data.endDate
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endDate"],
        message:
          "Half Day leave must be for a single date.",
      });
    }

    if (
      data.leaveType === "comp_day" &&
      data.startDate !== data.endDate
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endDate"],
        message:
          "Compensatory Leave must be for a single date.",
      });
    }
  });

function sessionLabel(session: LeaveSession) {
  switch (session) {
    case "morning":
      return "Half Day — Morning";
    case "afternoon":
      return "Half Day — Afternoon";
    default:
      return "Full Day";
  }
}

/**
 * Submit a leave request.
 *
 * The client never decides leave_days.
 * The database trigger recomputes and stores the authoritative
 * number of days and calculation snapshot.
 */
export async function submitLeaveAction(
  _prev: LeaveFormState,
  formData: FormData,
): Promise<LeaveFormState> {
  const me = await requireUser();

  const parsed = requestSchema.safeParse({
    leaveType: String(
      formData.get("leaveType") ?? "annual",
    ),

    leaveSession: String(
      formData.get("leaveSession") ?? "full_day",
    ),

    startDate: String(
      formData.get("startDate") ?? "",
    ),

    endDate: String(
      formData.get("endDate") ?? "",
    ),

    reason:
      String(formData.get("reason") ?? "").trim() ||
      undefined,
  });

  if (!parsed.success) {
    const issue = parsed.error.issues[0];

    return {
      ok: false,
      message: issue.message,
      field: String(issue.path[0]),
    };
  }

  const {
    leaveType,
    leaveSession,
    startDate,
    endDate,
    reason,
  } = parsed.data;

  const today = companyToday();

  const earliestStart = new Date(
    `${today}T00:00:00+07:00`,
  );

  earliestStart.setDate(
    earliestStart.getDate() + 7,
  );

  const earliestStartDate =
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Bangkok",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(earliestStart);

  if (startDate < earliestStartDate) {
    return {
      ok: false,
      message:
        "Leave must be requested at least 7 days in advance. For emergency leave, please contact an admin.",
      field: "startDate",
    };
  }

let requestId: string;

try {
  requestId = await withUser(me.id, async (db) => {
    const result = await db.query<{ id: string }>(
      `
        insert into leave_requests (
          employee_id,
          leave_type,
          start_date,
          end_date,
          leave_session,
          reason
        )
        values (
          $1,
          $2,
          $3::date,
          $4::date,
          $5::public.leave_session,
          $6
        )
        returning id
      `,
      [
        me.id,
        leaveType,
        startDate,
        endDate,
        leaveSession,
        reason ?? null,
      ],
    );

    return result.rows[0].id;
  });
} catch (e) {
    const f = toFriendlyError(e);

    return {
      ok: false,
      message: f.message,
      field: f.field,
    };
  }

  try {
    const adminEmails =
      await getActiveAdminEmails(me.id);

    if (adminEmails.length > 0) {
      const leaveTypeLabel =
        leaveType === "comp_day"
          ? "Compensatory Leave"
          : "Annual Leave";

      await sendEmail({
        to: adminEmails,
        subject: `New leave request — ${me.name}`,
        html: `
          <h2>New leave request</h2>

          <p>
            <strong>${me.name}</strong>
            has submitted a leave request.
          </p>

          <p>
            <strong>Leave type:</strong>
            ${leaveTypeLabel}<br />

            <strong>Duration:</strong>
            ${sessionLabel(leaveSession)}<br />

            <strong>Start:</strong>
            ${startDate}<br />

            <strong>End:</strong>
            ${endDate}<br />

            <strong>Reason:</strong>
            ${reason ?? "—"}
          </p>

          <p>
            Please sign in to ISX Leave to review
            the request.
          </p>
          <p>
  <a href="${env.appUrl}/admin/requests?request=${requestId}">
    Review Request
  </a>
</p>
        `,
      });
    }
  } catch (error) {
    console.error(
      "[leave email] Could not notify admins:",
      error,
    );
  }

  revalidatePath("/dashboard");
  revalidatePath("/my-leave");
  revalidatePath("/calendar");

  return {
    ok: true,
    message:
      "Leave request submitted. You'll be notified once HR reviews it.",
  };
}

/**
 * Live breakdown for the request form.
 *
 * Final validation and leave_days remain authoritative
 * in PostgreSQL.
 */
export async function previewLeaveAction(
  leaveType: LeaveType,
  leaveSession: LeaveSession,
  startDate: string,
  endDate: string,
): Promise<
  | {
      ok: true;
      calc: LeaveCalculation;
    }
  | {
      ok: false;
      message: string;
    }
> {
  const me = await requireUser();

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(startDate) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(endDate)
  ) {
    return {
      ok: false,
      message:
        "Pick both a start and an end date.",
    };
  }

  if (endDate < startDate) {
    return {
      ok: false,
      message:
        "The end date must be on or after the start date.",
    };
  }

  const isHalfDay =
    leaveSession === "morning" ||
    leaveSession === "afternoon";

  if (isHalfDay && startDate !== endDate) {
    return {
      ok: false,
      message:
        "Half Day leave must be for a single date.",
    };
  }

  if (
    leaveType === "comp_day" &&
    startDate !== endDate
  ) {
    return {
      ok: false,
      message:
        "Compensatory Leave must be for a single date.",
    };
  }

  /*
   * Half Day Annual Leave and all Comp Day requests
   * need date eligibility information.
   */
  if (leaveType === "comp_day" || isHalfDay) {
    try {
      const result = await withUser(
        me.id,
        async (db) => {
          const { rows } = await db.query<{
            mode: "office" | "wfh";
            is_holiday: boolean;
            is_weekend: boolean;
          }>(
            `
              select
                app.effective_work_mode(
                  $1::date
                ) as mode,

                exists (
                  select 1
                  from public.holidays h
                  where
                    h.holiday_date = $1::date
                    and h.active
                ) as is_holiday,

                extract(
                  isodow from $1::date
                ) in (6, 7) as is_weekend
            `,
            [startDate],
          );

          return rows[0];
        },
      );

      if (result.is_weekend) {
        return {
          ok: false,
          message:
            leaveType === "comp_day"
              ? "Compensatory Leave cannot be used on weekends."
              : "Half Day leave cannot be used on weekends.",
        };
      }

      if (result.is_holiday) {
        return {
          ok: false,
          message:
            leaveType === "comp_day"
              ? "Compensatory Leave cannot be used on company holidays."
              : "Half Day leave cannot be used on company holidays.",
        };
      }

      if (
        leaveType === "comp_day" &&
        result.mode !== "wfh"
      ) {
        return {
          ok: false,
          message:
            "Compensatory Leave can only be used on WFH days.",
        };
      }

      const leaveDays = isHalfDay ? 0.5 : 1;

      return {
        ok: true,
        calc: {
          startDate,
          endDate,
          totalCalendarDays: 1,
          officeDaysInRange:
            result.mode === "office" ? 1 : 0,
          excludedNonOfficeDays: 0,
          excludedHolidays: 0,
          leaveDays,
          holidays: [],
          days: [
            {
              date: startDate,
              officeDay:
                result.mode === "office",
              holiday: null,
              deducted: true,
            },
          ],
        },
      };
    } catch (e) {
      return {
        ok: false,
        message: toFriendlyError(e).message,
      };
    }
  }

  /*
   * Full-day Annual Leave keeps the existing
   * calculation logic unchanged.
   */
  try {
    return {
      ok: true,
      calc: await calcLeaveDays(
        me.id,
        startDate,
        endDate,
      ),
    };
  } catch (e) {
    return {
      ok: false,
      message: toFriendlyError(e).message,
    };
  }
}

export async function markNotificationsReadAction(): Promise<void> {
  const me = await requireUser();

  await withUser(me.id, (db) =>
    db.query(
      `
        update notifications
        set read_at = now()
        where user_id = $1
          and read_at is null
      `,
      [me.id],
    ),
  );

  revalidatePath("/dashboard");
}

export async function cancelOwnLeaveAction(
  requestId: string,
): Promise<LeaveFormState> {
  const me = await requireUser();

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      requestId,
    )
  ) {
    return {
      ok: false,
      message: "Invalid leave request.",
    };
  }

  let cancelled: {
    previous_status: string;
    leave_type: string;
    start_date: string;
    end_date: string;
    leave_days: string | number;
  };

  try {
    cancelled = await withUser(
      me.id,
      async (db) => {
        const result = await db.query<{
          previous_status: string;
          leave_type: string;
          start_date: string;
          end_date: string;
          leave_days: string | number;
        }>(
          `
            select
              previous_status,
              leave_type,
              start_date::text,
              end_date::text,
              leave_days
            from app.cancel_own_leave($1::uuid)
          `,
          [requestId],
        );

        if (!result.rows[0]) {
          throw new Error("LEAVE_NOT_FOUND");
        }

        return result.rows[0];
      },
    );
  } catch (e) {
    const message =
      e instanceof Error &&
      e.message.includes(
        "LEAVE_SELF_CANCEL_TOO_LATE",
      )
        ? "This leave can no longer be cancelled because the leave date has started."
        : e instanceof Error &&
            e.message.includes(
              "LEAVE_SELF_CANCEL_NOT_ALLOWED",
            )
          ? "This type of leave cannot be cancelled by employees."
          : e instanceof Error &&
              e.message.includes(
                "LEAVE_INVALID_TRANSITION",
              )
            ? "This leave can no longer be cancelled."
            : toFriendlyError(e).message;

    return {
      ok: false,
      message,
    };
  }

  try {
    const adminEmails =
      await getActiveAdminEmails(me.id);

    if (adminEmails.length > 0) {
      const leaveTypeLabel =
        cancelled.leave_type === "comp_day"
          ? "Compensatory Leave"
          : "Annual Leave";
        const requestUrl =
        `${env.appUrl}/admin/requests?request=${requestId}`;
      await sendEmail({

        to: adminEmails,
        subject: `Leave cancelled — ${me.name}`,
        html: `
          <h2>Leave cancelled by employee</h2>

          <p>
            <strong>${me.name}</strong>
            has cancelled their leave request.
          </p>

          <p>
            <strong>Leave type:</strong>
            ${leaveTypeLabel}<br />

            <strong>Start:</strong>
            ${cancelled.start_date}<br />

            <strong>End:</strong>
            ${cancelled.end_date}<br />

            <strong>Days:</strong>
            ${cancelled.leave_days}<br />

            <strong>Previous status:</strong>
            ${cancelled.previous_status}<br />

            <strong>New status:</strong>
            Cancelled
          </p>

          <p>
  <a
    href="${requestUrl}"
    style="
      display:inline-block;
      padding:10px 16px;
      background:#111827;
      color:#ffffff;
      text-decoration:none;
      border-radius:8px;
      font-weight:600;
    "
  >
    View leave request
  </a>
</p>

<p>
  Or open this link:<br />
  <a href="${requestUrl}">
    ${requestUrl}
  </a>
</p>
        `,
      });
    }
  } catch (error) {
    console.error(
      "[leave cancel email] Could not notify admins:",
      error,
    );
  }

  revalidatePath("/my-leave");
  revalidatePath("/dashboard");
  revalidatePath("/calendar");
  revalidatePath("/admin");
  revalidatePath("/admin/requests");

  return {
    ok: true,
    message: "Leave cancelled successfully.",
  };
}