"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { toFriendlyError } from "@/lib/errors";

export type WeeklyPlanActionState =
  | {
      ok: true;
      message: string;
    }
  | {
      ok: false;
      message: string;
      field?: string;
    }
  | null;

const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a valid date.");

const categorySchema = z.enum(["priority", "other"]);

const contentSchema = z
  .string()
  .trim()
  .min(1, "Task cannot be empty.")
  .max(1000, "Please keep the task under 1000 characters.");

const createWeeklyPlanItemSchema = z.object({
  weekStart: isoDateSchema,
  workDate: isoDateSchema,
  category: categorySchema,
  content: contentSchema,
});

const updateWeeklyPlanItemSchema = z.object({
  id: z.string().uuid("Invalid task."),
  content: contentSchema,
});

const deleteWeeklyPlanItemSchema = z.object({
  id: z.string().uuid("Invalid task."),
});

function firstIssue(parsed: {
  success: false;
  error: z.ZodError;
}): WeeklyPlanActionState {
  const issue = parsed.error.issues[0];

  return {
    ok: false,
    message: issue?.message ?? "Please check the task and try again.",
    field: typeof issue?.path?.[0] === "string" ? issue.path[0] : undefined,
  };
}

function revalidateWeeklyPlan() {
  revalidatePath("/weekly-plan");
  revalidatePath("/dashboard");
  revalidatePath("/admin/weekly-plans");
}

export async function createWeeklyPlanItemAction(
  _prevState: WeeklyPlanActionState,
  formData: FormData,
): Promise<WeeklyPlanActionState> {
  const me = await requireUser();

  const parsed = createWeeklyPlanItemSchema.safeParse({
    weekStart: String(formData.get("weekStart") ?? ""),
    workDate: String(formData.get("workDate") ?? ""),
    category: String(formData.get("category") ?? ""),
    content: String(formData.get("content") ?? ""),
  });

  if (!parsed.success) {
    return firstIssue(parsed);
  }

  const { weekStart, workDate, category, content } = parsed.data;

  try {
    await withUser(me.id, async (db) => {
      await db.query(
        `
          insert into weekly_plan_items (
            employee_id,
            week_start,
            work_date,
            category,
            content,
            sort_order
          )
          values (
            $1,
            $2::date,
            $3::date,
            $4,
            $5,
            coalesce(
              (
                select max(sort_order) + 1
                from weekly_plan_items
                where employee_id = $1
                  and work_date = $3::date
                  and category = $4
              ),
              0
            )
          )
        `,
        [me.id, weekStart, workDate, category, content],
      );
    });
  } catch (error) {
    const friendly = toFriendlyError(error);

    return {
      ok: false,
      message: friendly.message,
    };
  }

  revalidateWeeklyPlan();

  return {
    ok: true,
    message: "Task added.",
  };
}

export async function updateWeeklyPlanItemAction(
  _prevState: WeeklyPlanActionState,
  formData: FormData,
): Promise<WeeklyPlanActionState> {
  const me = await requireUser();

  const parsed = updateWeeklyPlanItemSchema.safeParse({
    id: String(formData.get("id") ?? ""),
    content: String(formData.get("content") ?? ""),
  });

  if (!parsed.success) {
    return firstIssue(parsed);
  }

  const { id, content } = parsed.data;

  try {
    const result = await withUser(me.id, async (db) =>
      db.query(
        `
          update weekly_plan_items
          set content = $2
          where id = $1
        `,
        [id, content],
      ),
    );

    if (result.rowCount !== 1) {
      return {
        ok: false,
        message: "Task not found.",
      };
    }
  } catch (error) {
    const friendly = toFriendlyError(error);

    return {
      ok: false,
      message: friendly.message,
    };
  }

  revalidateWeeklyPlan();

  return {
    ok: true,
    message: "Task updated.",
  };
}

export async function deleteWeeklyPlanItemAction(
  _prevState: WeeklyPlanActionState,
  formData: FormData,
): Promise<WeeklyPlanActionState> {
  const me = await requireUser();

  const parsed = deleteWeeklyPlanItemSchema.safeParse({
    id: String(formData.get("id") ?? ""),
  });

  if (!parsed.success) {
    return firstIssue(parsed);
  }

  try {
    const result = await withUser(me.id, async (db) =>
      db.query(
        `
          delete from weekly_plan_items
          where id = $1
        `,
        [parsed.data.id],
      ),
    );

    if (result.rowCount !== 1) {
      return {
        ok: false,
        message: "Task not found.",
      };
    }
  } catch (error) {
    const friendly = toFriendlyError(error);

    return {
      ok: false,
      message: friendly.message,
    };
  }

  revalidateWeeklyPlan();

  return {
    ok: true,
    message: "Task deleted.",
  };
}

const copyLastWeekSchema = z.object({
  weekStart: isoDateSchema,
});

export async function copyLastWeekAction(
  _prevState: WeeklyPlanActionState,
  formData: FormData,
): Promise<WeeklyPlanActionState> {
  const me = await requireUser();

  const parsed = copyLastWeekSchema.safeParse({
    weekStart: String(formData.get("weekStart") ?? ""),
  });

  if (!parsed.success) {
    return firstIssue(parsed);
  }

  const { weekStart } = parsed.data;

  try {
    const result = await withUser(me.id, async (db) =>
      db.query(
        `
          insert into weekly_plan_items (
            employee_id,
            week_start,
            work_date,
            category,
            content,
            sort_order
          )
          select
            previous.employee_id,
            $1::date,
            previous.work_date + 7,
            previous.category,
            previous.content,
            previous.sort_order
          from weekly_plan_items previous
          where previous.employee_id = $2
            and previous.week_start = ($1::date - 7)
            and not exists (
              select 1
              from weekly_plan_items current
              where current.employee_id = $2
                and current.week_start = $1::date
                and current.work_date = previous.work_date + 7
                and current.category = previous.category
                and btrim(current.content) = btrim(previous.content)
            )
          returning id
        `,
        [weekStart, me.id],
      ),
    );

    revalidateWeeklyPlan();

    const copied = result.rowCount ?? 0;

    return {
      ok: true,
      message:
        copied === 0
          ? "Nothing new to copy from last week."
          : `Copied ${copied} task${copied === 1 ? "" : "s"} from last week.`,
    };
  } catch (error) {
    const friendly = toFriendlyError(error);

    return {
      ok: false,
      message: friendly.message,
    };
  }
}
