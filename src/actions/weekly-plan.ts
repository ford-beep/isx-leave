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
      copiedIds?: string[];
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

const weeklyPlanDragLayoutItemSchema = z.object({
  id: z.string().uuid("Invalid task."),
  workDate: isoDateSchema,
  sortOrder: z.number().int().min(0),
});

const weeklyPlanDragSchema = z.object({
  weekStart: isoDateSchema,
  category: categorySchema,
  sourceId: z.string().uuid("Invalid task."),
  mode: z.enum(["move", "copy"]),
  layout: z.array(weeklyPlanDragLayoutItemSchema).max(500),
  copyWorkDate: isoDateSchema.optional(),
  copySortOrder: z.number().int().min(0).optional(),
});

function addDaysISO(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function isDateInsideWeek(date: string, weekStart: string) {
  const weekEnd = addDaysISO(weekStart, 6);

  return date >= weekStart && date <= weekEnd;
}

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

export async function applyWeeklyPlanDragAction(
  _prevState: WeeklyPlanActionState,
  formData: FormData,
): Promise<WeeklyPlanActionState> {
  const me = await requireUser();

  let layout: unknown;

  try {
    layout = JSON.parse(
      String(formData.get("layout") ?? "[]"),
    );
  } catch {
    return {
      ok: false,
      message: "Invalid task layout.",
    };
  }

  const copyWorkDateRaw =
    String(formData.get("copyWorkDate") ?? "").trim();

  const copySortOrderRaw =
    String(formData.get("copySortOrder") ?? "").trim();

  const parsed = weeklyPlanDragSchema.safeParse({
    weekStart: String(
      formData.get("weekStart") ?? "",
    ),

    category: String(
      formData.get("category") ?? "",
    ),

    sourceId: String(
      formData.get("sourceId") ?? "",
    ),

    mode: String(
      formData.get("mode") ?? "",
    ),

    layout,

    copyWorkDate:
      copyWorkDateRaw || undefined,

    copySortOrder:
      copySortOrderRaw
        ? Number(copySortOrderRaw)
        : undefined,
  });

  if (!parsed.success) {
    return firstIssue(parsed);
  }

  const {
    weekStart,
    category,
    sourceId,
    mode,
    copyWorkDate,
    copySortOrder,
  } = parsed.data;

  if (
    parsed.data.layout.some(
      (item) =>
        !isDateInsideWeek(
          item.workDate,
          weekStart,
        ),
    )
  ) {
    return {
      ok: false,
      message:
        "Tasks can only be moved within the selected week.",
    };
  }

  if (mode === "copy") {
    if (
      copyWorkDate === undefined ||
      copySortOrder === undefined
    ) {
      return {
        ok: false,
        message:
          "Choose where the copied task should be placed.",
      };
    }

    if (
      !isDateInsideWeek(
        copyWorkDate,
        weekStart,
      )
    ) {
      return {
        ok: false,
        message:
          "Tasks can only be copied within the selected week.",
      };
    }
  }

  const layoutForDb =
    parsed.data.layout.map((item) => ({
      id: item.id,
      work_date: item.workDate,
      sort_order: item.sortOrder,
    }));

  try {
    const result = await withUser(
      me.id,
      async (db) =>
        db.query<{
          updated_count: number;
          copied_count: number;
        }>(
          `
            with source as (
              select
                id,
                employee_id,
                week_start,
                category,
                content
              from weekly_plan_items
              where id = $1
                and employee_id = $2
                and week_start = $3::date
                and category = $4
            ),

            copied as (
              insert into weekly_plan_items (
                employee_id,
                week_start,
                work_date,
                category,
                content,
                sort_order
              )
              select
                source.employee_id,
                source.week_start,
                $7::date,
                source.category,
                source.content,
                $8::int
              from source
              where $5::boolean = true
              returning id
            ),

            layout as (
              select *
              from jsonb_to_recordset(
                $6::jsonb
              ) as x(
                id uuid,
                work_date text,
                sort_order integer
              )
            ),

            updated as (
              update weekly_plan_items item
              set
                work_date =
                  layout.work_date::date,
                sort_order =
                  layout.sort_order
              from layout
              where item.id = layout.id
                and item.employee_id = $2
                and item.week_start = $3::date
                and item.category = $4
              returning item.id
            )

            select
              (
                select count(*)::int
                from updated
              ) as updated_count,

              (
                select count(*)::int
                from copied
              ) as copied_count
          `,
          [
            sourceId,
            me.id,
            weekStart,
            category,
            mode === "copy",
            JSON.stringify(layoutForDb),
            copyWorkDate ?? null,
            copySortOrder ?? null,
          ],
        ),
    );

    const row = result.rows[0];

    if (
      mode === "copy" &&
      row?.copied_count !== 1
    ) {
      return {
        ok: false,
        message: "Task could not be copied.",
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
    message:
      mode === "copy"
        ? "Task copied."
        : "Task moved.",
  };
}

const copyLastWeekSchema = z.discriminatedUnion("intent", [
  z.object({
    intent: z.literal("copy"),
    weekStart: isoDateSchema,
  }),

  z.object({
    intent: z.literal("undo"),
    weekStart: isoDateSchema,
    copiedIds: z
      .array(z.string().uuid("Invalid copied task."))
      .min(1)
      .max(500),
  }),
]);

export async function copyLastWeekAction(
  _prevState: WeeklyPlanActionState,
  formData: FormData,
): Promise<WeeklyPlanActionState> {
  const me = await requireUser();

  const intent = String(
    formData.get("intent") ?? "copy",
  );

  let copiedIds: unknown = undefined;

  if (intent === "undo") {
    try {
      copiedIds = JSON.parse(
        String(formData.get("copiedIds") ?? "[]"),
      );
    } catch {
      return {
        ok: false,
        message: "Invalid undo data.",
      };
    }
  }

  const parsed = copyLastWeekSchema.safeParse({
    intent,
    weekStart: String(
      formData.get("weekStart") ?? "",
    ),
    copiedIds,
  });

  if (!parsed.success) {
    return firstIssue(parsed);
  }

  const { weekStart } = parsed.data;

  /*
   * Undo the most recent "Copy last week".
   *
   * Only the IDs returned by that copy operation are removed.
   * Employee and week checks prevent touching another
   * person's Weekly Plan or another week.
   */
  if (parsed.data.intent === "undo") {
    const undoCopiedIds = parsed.data.copiedIds;

    try {
      const result = await withUser(
        me.id,
        async (db) =>
          db.query(
            `
              delete from weekly_plan_items
              where employee_id = $1
                and week_start = $2::date
                and id = any($3::uuid[])
              returning id
            `,
            [
              me.id,
              weekStart,
              undoCopiedIds,
            ],
          ),
      );

      revalidateWeeklyPlan();

      const removed =
        result.rowCount ?? 0;

      return {
        ok: true,
        message:
          removed === 0
            ? "Nothing to undo."
            : `Undo complete. Removed ${removed} copied task${
                removed === 1
                  ? ""
                  : "s"
              }.`,
      };
    } catch (error) {
      const friendly =
        toFriendlyError(error);

      return {
        ok: false,
        message: friendly.message,
      };
    }
  }

  /*
   * Copy last week's tasks.
   *
   * Important:
   * - Existing tasks are never replaced.
   * - Copied tasks are appended AFTER existing tasks
   *   for the same day + category.
   * - The relative order from last week is preserved.
   */
  try {
    const result = await withUser(
      me.id,
      async (db) =>
        db.query<{ id: string }>(
          `
            with source as (
              select
                previous.employee_id,
                previous.work_date + 7
                  as target_work_date,
                previous.category,
                previous.content,

                row_number() over (
                  partition by
                    previous.work_date,
                    previous.category
                  order by
                    previous.sort_order,
                    previous.created_at,
                    previous.id
                ) - 1
                  as copy_offset

              from weekly_plan_items previous

              where previous.employee_id = $2
                and previous.week_start =
                  ($1::date - 7)

                and not exists (
                  select 1
                  from weekly_plan_items current
                  where current.employee_id = $2
                    and current.week_start =
                      $1::date
                    and current.work_date =
                      previous.work_date + 7
                    and current.category =
                      previous.category
                    and btrim(current.content) =
                      btrim(previous.content)
                )
            ),

            prepared as (
              select
                source.*,

                coalesce(
                  (
                    select
                      max(current.sort_order) + 1
                    from weekly_plan_items current
                    where
                      current.employee_id = $2
                      and current.week_start =
                        $1::date
                      and current.work_date =
                        source.target_work_date
                      and current.category =
                        source.category
                  ),
                  0
                ) as base_sort_order

              from source
            )

            insert into weekly_plan_items (
              employee_id,
              week_start,
              work_date,
              category,
              content,
              sort_order
            )

            select
              employee_id,
              $1::date,
              target_work_date,
              category,
              content,
              base_sort_order +
                copy_offset::int

            from prepared

            order by
              target_work_date,
              category,
              copy_offset

            returning id
          `,
          [weekStart, me.id],
        ),
    );

    revalidateWeeklyPlan();

    const ids = result.rows.map(
      (row) => row.id,
    );

    const copied = ids.length;

    return {
      ok: true,
      message:
        copied === 0
          ? "Nothing new to copy from last week."
          : `Copied ${copied} task${
              copied === 1 ? "" : "s"
            } from last week.`,
      copiedIds:
        copied > 0
          ? ids
          : undefined,
    };
  } catch (error) {
    const friendly =
      toFriendlyError(error);

    return {
      ok: false,
      message: friendly.message,
    };
  }
}
