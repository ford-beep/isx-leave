"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { withUser } from "@/lib/db";

export type ProfileFormState =
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

const updateProfileSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name is required.")
    .max(120, "Name is too long."),
});

export async function updateProfileAction(
  _prev: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const me = await requireUser();

  const parsed = updateProfileSchema.safeParse({
    name: String(formData.get("name") ?? ""),
  });

  if (!parsed.success) {
    return {
      ok: false,
      message:
        parsed.error.issues[0]?.message ??
        "Please check the form and try again.",
      field: "name",
    };
  }

  try {
    await withUser(me.id, (db) =>
      db.query(
        `select app.update_own_profile($1)`,
        [parsed.data.name],
      ),
    );
  } catch (error) {
    console.error("[profile] Could not update profile:", error);

    return {
      ok: false,
      message: "Could not update your profile. Please try again.",
    };
  }

  revalidatePath("/profile");
  revalidatePath("/dashboard");

  return {
    ok: true,
    message: "Profile updated.",
  };
}