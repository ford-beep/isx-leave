"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { toFriendlyError } from "@/lib/errors";

const grantSchema = z.object({
  employeeId: z.string().uuid("Choose an employee."),
  earnedDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose the worked date."),
  note: z
    .string()
    .max(1000, "Please keep the note under 1000 characters.")
    .optional(),
});

export async function grantCompDayAction(
  _prevState: unknown,
  formData: FormData,
) {
  const me = await requireAdmin();

  const parsed = grantSchema.safeParse({
    employeeId: String(formData.get("employeeId") ?? ""),
    earnedDate: String(formData.get("earnedDate") ?? ""),
    note:
      String(formData.get("note") ?? "").trim() ||
      undefined,
  });

  if (!parsed.success) {
    const first = parsed.error.issues[0];

    return {
      ok: false as const,
      message: first?.message ?? "Please check the form.",
      field:
        typeof first?.path?.[0] === "string"
          ? first.path[0]
          : undefined,
    };
  }

  const { employeeId, earnedDate, note } = parsed.data;

  try {
    await withUser(me.id, async (db) => {
      await db.query(
        `
          insert into comp_day_credits (
            employee_id,
            earned_date,
            note,
            created_by
          )
          values ($1, $2::date, $3, $4)
        `,
        [
          employeeId,
          earnedDate,
          note ?? null,
          me.id,
        ],
      );
    });

    revalidatePath("/admin/comp-days");
    revalidatePath("/request");
    revalidatePath("/dashboard");

    return {
      ok: true as const,
      message: "Comp Day granted successfully.",
    };
  } catch (error) {
const friendly = toFriendlyError(error);

return {
  ok: false as const,
  message: friendly.message,
};
  }
}