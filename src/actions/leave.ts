"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { companyToday } from "@/lib/date";
import { withUser } from "@/lib/db";
import { calcLeaveDays } from "@/lib/queries";
import { toFriendlyError } from "@/lib/errors";
import type { LeaveCalculation } from "@/lib/types";

export type LeaveFormState = {
  ok: boolean;
  message?: string;
  field?: string;
} | null;

const requestSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a start date."),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose an end date."),
  reason: z.string().max(1000, "Please keep the note under 1000 characters.").optional(),
});

/**
 * Submit a leave request.
 *
 * Note what is NOT sent: the number of days. The client's arithmetic is
 * irrelevant — the database recomputes it in a BEFORE trigger and stores its
 * own answer, along with the full breakdown, as an immutable snapshot.
 */
export async function submitLeaveAction(_prev: LeaveFormState, formData: FormData): Promise<LeaveFormState> {
  const me = await requireUser();
  const parsed = requestSchema.safeParse({
  startDate: String(formData.get("startDate") ?? ""),
  endDate: String(formData.get("endDate") ?? ""),
  reason: String(formData.get("reason") ?? "").trim() || undefined,
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, message: issue.message, field: String(issue.path[0]) };
  }
  const { startDate, endDate, reason } = parsed.data;
  const leaveType = "annual"; 
  const today = companyToday();

const earliestStart = new Date(`${today}T00:00:00+07:00`);
earliestStart.setDate(earliestStart.getDate() + 7);

const earliestStartDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Bangkok",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(earliestStart);

if (startDate < earliestStartDate) {
  return {
    ok: false,
    message: `Leave must be requested at least 7 days in advance. For emergency leave, please contact an admin.`,
    field: "startDate",
  };
}

  try {
    await withUser(me.id, (db) => db.query(
      `insert into leave_requests (employee_id, leave_type, start_date, end_date, reason)
       values ($1, $2, $3::date, $4::date, $5)`,
      // employee_id is taken from the session, never from the form.
      [me.id, leaveType, startDate, endDate, reason ?? null]));
  } catch (e) {
    const f = toFriendlyError(e);
    return { ok: false, message: f.message, field: f.field };
  }

  revalidatePath("/dashboard");
  revalidatePath("/my-leave");
  revalidatePath("/calendar");
  return { ok: true, message: "Leave request submitted. You'll be notified once HR reviews it." };
}


/** Live breakdown for the request form — computed by the same SQL function. */
export async function previewLeaveAction(
  startDate: string, endDate: string,
): Promise<{ ok: true; calc: LeaveCalculation } | { ok: false; message: string }> {
  const me = await requireUser();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    return { ok: false, message: "Pick both a start and an end date." };
  }
  if (endDate < startDate) return { ok: false, message: "The end date must be on or after the start date." };
  try {
    return { ok: true, calc: await calcLeaveDays(me.id, startDate, endDate) };
  } catch (e) {
    return { ok: false, message: toFriendlyError(e).message };
  }
}

export async function markNotificationsReadAction(): Promise<void> {
  const me = await requireUser();
  await withUser(me.id, (db) =>
    db.query("update notifications set read_at = now() where user_id = $1 and read_at is null", [me.id]));
  revalidatePath("/dashboard");
}
