"use server";

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

  try {
    await withUser(me.id, (db) =>
      db.query(
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
        `,
        [
          me.id,
          leaveType,
          startDate,
          endDate,
          leaveSession,
          reason ?? null,
        ],
      ),
    );
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