"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { toFriendlyError } from "@/lib/errors";
import { canManageCalendarActivities } from "@/lib/queries";

export type CalendarActivityActionState =
  | {
      ok: true;
      message: string;
      activityId?: string;
    }
  | {
      ok: false;
      message: string;
      field?: string;
    }
  | null;

const isoDateSchema = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}$/,
    "Choose a valid date.",
  );

const timeSchema = z
  .string()
  .regex(
    /^([01]\d|2[0-3]):[0-5]\d$/,
    "Choose a valid time.",
  )
  .optional();

const activityFieldsSchema = z
  .object({
    date: isoDateSchema,

    title: z
      .string()
      .trim()
      .min(1, "Activity name is required.")
      .max(
        160,
        "Please keep the activity name under 160 characters.",
      ),

    startTime: timeSchema,
    endTime: timeSchema,

    location: z
      .string()
      .trim()
      .max(
        200,
        "Please keep the location under 200 characters.",
      )
      .optional(),

    description: z
      .string()
      .trim()
      .max(
        2000,
        "Please keep the description under 2000 characters.",
      )
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (data.endTime && !data.startTime) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["startTime"],
        message: "Choose a start time first.",
      });

      return;
    }

    if (
      data.startTime &&
      data.endTime &&
      data.endTime <= data.startTime
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endTime"],
        message:
          "End time must be later than start time.",
      });
    }
  });

const createActivitySchema = activityFieldsSchema;

const updateActivitySchema =
  activityFieldsSchema.and(
    z.object({
      id: z.string().uuid("Invalid activity."),
    }),
  );

const deleteActivitySchema = z.object({
  id: z.string().uuid("Invalid activity."),
});

function emptyToUndefined(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();

  return text || undefined;
}

function firstIssue(
  parsed: {
    success: false;
    error: z.ZodError;
  },
): CalendarActivityActionState {
  const issue = parsed.error.issues[0];

  return {
    ok: false,
    message:
      issue?.message ??
      "Please check the activity and try again.",
    field:
      typeof issue?.path?.[0] === "string"
        ? issue.path[0]
        : undefined,
  };
}

function revalidateCalendarActivities() {
  revalidatePath("/dashboard");
  revalidatePath("/calendar");
  revalidatePath("/admin/calendar");
}

async function currentActivityManager() {
  const me = await requireUser();

  const allowed =
    await canManageCalendarActivities(me.id);

  return {
    me,
    allowed,
  };
}

export async function createCalendarActivityAction(
  _prevState: CalendarActivityActionState,
  formData: FormData,
): Promise<CalendarActivityActionState> {
  const { me, allowed } =
    await currentActivityManager();

  if (!allowed) {
    return {
      ok: false,
      message:
        "You do not have permission to add calendar activities.",
    };
  }

  const parsed = createActivitySchema.safeParse({
    date: String(formData.get("date") ?? ""),
    title: String(formData.get("title") ?? ""),
    startTime: emptyToUndefined(
      formData.get("startTime"),
    ),
    endTime: emptyToUndefined(
      formData.get("endTime"),
    ),
    location: emptyToUndefined(
      formData.get("location"),
    ),
    description: emptyToUndefined(
      formData.get("description"),
    ),
  });

  if (!parsed.success) {
    return firstIssue(parsed);
  }

  const {
    date,
    title,
    startTime,
    endTime,
    location,
    description,
  } = parsed.data;

  try {
    const result = await withUser(
      me.id,
      async (db) =>
        db.query<{ id: string }>(
          `
            insert into calendar_activities (
              activity_date,
              title,
              start_time,
              end_time,
              location,
              description,
              created_by
            )
            values (
              $1::date,
              $2,
              $3::time,
              $4::time,
              $5,
              $6,
              $7
            )
            returning id
          `,
          [
            date,
            title,
            startTime ?? null,
            endTime ?? null,
            location ?? null,
            description ?? null,
            me.id,
          ],
        ),
    );

    revalidateCalendarActivities();

    return {
      ok: true,
      message: "Activity added.",
      activityId: result.rows[0]?.id,
    };
  } catch (error) {
    const friendly = toFriendlyError(error);

    return {
      ok: false,
      message: friendly.message,
    };
  }
}

export async function updateCalendarActivityAction(
  _prevState: CalendarActivityActionState,
  formData: FormData,
): Promise<CalendarActivityActionState> {
  const { me, allowed } =
    await currentActivityManager();

  if (!allowed) {
    return {
      ok: false,
      message:
        "You do not have permission to edit calendar activities.",
    };
  }

  const parsed = updateActivitySchema.safeParse({
    id: String(formData.get("id") ?? ""),
    date: String(formData.get("date") ?? ""),
    title: String(formData.get("title") ?? ""),
    startTime: emptyToUndefined(
      formData.get("startTime"),
    ),
    endTime: emptyToUndefined(
      formData.get("endTime"),
    ),
    location: emptyToUndefined(
      formData.get("location"),
    ),
    description: emptyToUndefined(
      formData.get("description"),
    ),
  });

  if (!parsed.success) {
    return firstIssue(parsed);
  }

  const {
    id,
    date,
    title,
    startTime,
    endTime,
    location,
    description,
  } = parsed.data;

  try {
    const result = await withUser(
      me.id,
      async (db) =>
        db.query(
          `
            update calendar_activities
            set
              activity_date = $2::date,
              title = $3,
              start_time = $4::time,
              end_time = $5::time,
              location = $6,
              description = $7
            where id = $1
          `,
          [
            id,
            date,
            title,
            startTime ?? null,
            endTime ?? null,
            location ?? null,
            description ?? null,
          ],
        ),
    );

    if (result.rowCount !== 1) {
      return {
        ok: false,
        message: "Activity not found.",
      };
    }

    revalidateCalendarActivities();

    return {
      ok: true,
      message: "Activity updated.",
      activityId: id,
    };
  } catch (error) {
    const friendly = toFriendlyError(error);

    return {
      ok: false,
      message: friendly.message,
    };
  }
}

export async function deleteCalendarActivityAction(
  _prevState: CalendarActivityActionState,
  formData: FormData,
): Promise<CalendarActivityActionState> {
  const { me, allowed } =
    await currentActivityManager();

  if (!allowed) {
    return {
      ok: false,
      message:
        "You do not have permission to delete calendar activities.",
    };
  }

  const parsed = deleteActivitySchema.safeParse({
    id: String(formData.get("id") ?? ""),
  });

  if (!parsed.success) {
    return firstIssue(parsed);
  }

  try {
    const result = await withUser(
      me.id,
      async (db) =>
        db.query(
          `
            delete from calendar_activities
            where id = $1
          `,
          [parsed.data.id],
        ),
    );

    if (result.rowCount !== 1) {
      return {
        ok: false,
        message: "Activity not found.",
      };
    }

    revalidateCalendarActivities();

    return {
      ok: true,
      message: "Activity deleted.",
    };
  } catch (error) {
    const friendly = toFriendlyError(error);

    return {
      ok: false,
      message: friendly.message,
    };
  }
}
