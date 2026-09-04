"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { env } from "@/lib/env";
import { toFriendlyError } from "@/lib/errors";
import { getUser } from "@/lib/queries";

const grantSchema = z.object({
  employeeId: z.string().uuid("Choose an employee."),

  earnedDate: z
    .string()
    .regex(
      /^\d{4}-\d{2}-\d{2}$/,
      "Choose the worked date.",
    ),

  note: z
    .string()
    .max(
      1000,
      "Please keep the note under 1000 characters.",
    )
    .optional(),
});

export async function grantCompDayAction(
  _prevState: unknown,
  formData: FormData,
) {
  const me = await requireAdmin();

  const parsed = grantSchema.safeParse({
    employeeId: String(
      formData.get("employeeId") ?? "",
    ),

    earnedDate: String(
      formData.get("earnedDate") ?? "",
    ),

    note:
      String(
        formData.get("note") ?? "",
      ).trim() || undefined,
  });

  if (!parsed.success) {
    const first = parsed.error.issues[0];

    return {
      ok: false as const,

      message:
        first?.message ??
        "Please check the form.",

      field:
        typeof first?.path?.[0] === "string"
          ? first.path[0]
          : undefined,
    };
  }

  const {
    employeeId,
    earnedDate,
    note,
  } = parsed.data;

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
  } catch (error) {
    const friendly = toFriendlyError(error);

    return {
      ok: false as const,
      message: friendly.message,
    };
  }

  // Email notification is best-effort.
  // Granting the Comp Day must still succeed
  // even if email delivery fails.
  try {
    const employee = await getUser(
      me.id,
      employeeId,
    );

    if (employee?.email) {
      await sendEmail({
        to: employee.email,

        subject:
          "A Comp Day has been granted to you",

        html: `
          <h2>Comp Day granted</h2>

          <p>
            Hi ${employee.name},
          </p>

          <p>
            <strong>${me.name}</strong>
            granted you 1 Comp Day.
          </p>

          <p>
            <strong>Worked date:</strong>
            ${earnedDate}<br />

            ${
              note
                ? `<strong>Note:</strong> ${note}<br />`
                : ""
            }

            <strong>Credit:</strong>
            1 day
          </p>

          <p>
            The Comp Day is now available
            in your Comp Day balance,
            subject to the normal usage rules.
          </p>

          <p>
           <a href="${env.appUrl}/my-leave">
  View My Leave
</a>
          </p>
        `,
      });
    }
  } catch (emailError) {
    console.error(
      "[email] Failed to send Comp Day notification:",
      emailError,
    );
  }

  revalidatePath("/admin/comp-days");
  revalidatePath("/request");
  revalidatePath("/dashboard");
  revalidatePath("/my-leave");

  return {
    ok: true as const,
    message:
      "Comp Day granted successfully. The employee has been notified.",
  };
}