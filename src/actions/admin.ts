"use server";

/**
 * Admin server actions.
 *
 * Each one starts with `requireAdmin()`, which re-reads the role from the
 * database. That check is a courtesy so admins get a redirect instead of an
 * error — the actual enforcement is the RLS policy set, which would reject
 * these statements for a non-admin even if this guard were deleted.
 */
import { sendEmail } from "@/lib/email";
import { getRequestById } from "@/lib/queries";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { toFriendlyError } from "@/lib/errors";

export type AdminFormState = { ok: boolean; message?: string; field?: string } | null;

const ok = (message: string): AdminFormState => ({ ok: true, message });
const fail = (e: unknown): AdminFormState => ({ ok: false, ...toFriendlyError(e) });

function revalidateAdmin() {
  for (const p of ["/admin", "/admin/requests", "/admin/employees", "/admin/calendar",
                   "/admin/settings", "/admin/audit", "/dashboard", "/my-leave", "/calendar"]) {
    revalidatePath(p);
  }
}

/* ------------------------------------------------------- leave decisions */

export async function approveLeaveAction(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const me = await requireAdmin();
  const id = String(formData.get("id") ?? "");

  if (!id) {
    return { ok: false, message: "Missing request id." };
  }

  try {
    const res = await withUser(me.id, (db) =>
      db.query(
        "update leave_requests set status = 'approved' where id = $1 and status = 'pending'",
        [id],
      ),
    );

    if (res.rowCount === 0) {
      return { ok: false, message: "That request is no longer pending." };
    }
  } catch (e) {
    return fail(e);
  }

  try {
    const request = await getRequestById(me.id, id);

    if (
      request?.employeeEmail &&
      !request.employeeEmail.endsWith("@demo.isx.local")
    ) {
      await sendEmail({
        to: request.employeeEmail,
        subject: "Your leave request was approved",
        html: `
          <h2>Leave approved</h2>
          <p>Hi ${request.employeeName ?? "there"},</p>
          <p>Your leave request has been approved.</p>

          <p>
            <strong>Start:</strong> ${request.startDate}<br />
            <strong>End:</strong> ${request.endDate}<br />
            <strong>Days:</strong> ${request.leaveDays}
          </p>

          <p>You can view the request in ISX Leave.</p>
        `,
      });
    }
  } catch (error) {
    console.error("[leave email] Could not notify employee of approval:", error);
  }

  revalidateAdmin();
  return ok("Leave approved. The employee has been notified.");
}

const rejectSchema = z.object({
  id: z.string().uuid(),
  reason: z.string().trim().min(3, "Please provide a reason for rejecting this request.").max(1000),
});

export async function rejectLeaveAction(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const me = await requireAdmin();

  const parsed = rejectSchema.safeParse({
    id: String(formData.get("id") ?? ""),
    reason: String(formData.get("reason") ?? ""),
  });

  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      message: issue.message,
      field: String(issue.path[0]),
    };
  }

  try {
    const res = await withUser(me.id, (db) =>
      db.query(
        `update leave_requests
         set status = 'rejected',
             rejection_reason = $2
         where id = $1
           and status = 'pending'`,
        [parsed.data.id, parsed.data.reason],
      ),
    );

    if (res.rowCount === 0) {
      return {
        ok: false,
        message: "That request is no longer pending.",
      };
    }
  } catch (e) {
    return fail(e);
  }

  // Email notification is best-effort:
  // rejecting the leave must still succeed if email delivery fails.
  try {
    const request = await getRequestById(me.id, parsed.data.id);

    if (
      request?.employeeEmail &&
      !request.employeeEmail.endsWith("@demo.isx.local")
    ) {
      await sendEmail({
        to: request.employeeEmail,
        subject: "Your leave request was rejected",
        html: `
          <h2>Leave request rejected</h2>

          <p>Hi ${request.employeeName ?? "there"},</p>

          <p>Your leave request was not approved.</p>

          <p>
            <strong>Start:</strong> ${request.startDate}<br />
            <strong>End:</strong> ${request.endDate}<br />
            <strong>Days:</strong> ${request.leaveDays}<br />
            <strong>Reason:</strong> ${parsed.data.reason}
          </p>

          <p>You can view the request in ISX Leave.</p>
        `,
      });
    }
  } catch (error) {
    console.error(
      "[leave email] Could not notify employee of rejection:",
      error,
    );
  }

  revalidateAdmin();

  return ok(
    "Leave rejected. The employee has been notified with your reason.",
  );
}


/** Admin override — cancel an approved leave on an employee's behalf. */
export async function adminCancelLeaveAction(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const me = await requireAdmin();
  const id = String(formData.get("id") ?? "");

  if (!id) {
    return { ok: false, message: "Missing request id." };
  }

  try {
    const res = await withUser(me.id, (db) =>
      db.query(
        `update leave_requests
         set status = 'cancelled'
         where id = $1
           and status = 'approved'`,
        [id],
      ),
    );

    if (res.rowCount === 0) {
      return {
        ok: false,
        message: "Only approved leave can be cancelled.",
      };
    }
  } catch (e) {
    return fail(e);
  }

  // Email notification is best-effort.
  try {
    const request = await getRequestById(me.id, id);

    if (
      request?.employeeEmail &&
      !request.employeeEmail.endsWith("@demo.isx.local")
    ) {
      await sendEmail({
        to: request.employeeEmail,
        subject: "Your approved leave was cancelled",
        html: `
          <h2>Leave cancelled</h2>

          <p>Hi ${request.employeeName ?? "there"},</p>

          <p>Your previously approved leave has been cancelled by an administrator.</p>

          <p>
            <strong>Start:</strong> ${request.startDate}<br />
            <strong>End:</strong> ${request.endDate}<br />
            <strong>Days:</strong> ${request.leaveDays}
          </p>

          <p>The leave days are no longer counted against your annual leave balance.</p>

          <p>You can view the request in ISX Leave.</p>
        `,
      });
    }
  } catch (error) {
    console.error(
      "[leave email] Could not notify employee of cancellation:",
      error,
    );
  }

  revalidateAdmin();

  return ok(
    "Approved leave cancelled. The employee has been notified.",
  );
}

/* ------------------------------------------------------------- employees */

/* ------------------------------------------------------------- employees */
const emergencyLeaveSchema = z.object({
  employeeId: z.string().uuid(),
  startDate: z.string().regex(
    /^\d{4}-\d{2}-\d{2}$/,
    "Choose a start date.",
  ),
  endDate: z.string().regex(
    /^\d{4}-\d{2}-\d{2}$/,
    "Choose an end date.",
  ),
  reason: z.string()
    .trim()
    .min(3, "Please provide a reason for the emergency leave.")
    .max(1000),
});

export async function createEmergencyLeaveAction(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const me = await requireAdmin();

  const parsed = emergencyLeaveSchema.safeParse({
    employeeId: String(formData.get("employeeId") ?? ""),
    startDate: String(formData.get("startDate") ?? ""),
    endDate: String(formData.get("endDate") ?? ""),
    reason: String(formData.get("reason") ?? ""),
  });

  if (!parsed.success) {
    const issue = parsed.error.issues[0];

    return {
      ok: false,
      message: issue.message,
      field: String(issue.path[0]),
    };
  }

  const d = parsed.data;

  try {
    await withUser(me.id, (db) =>
      db.query(
        `insert into leave_requests (
           employee_id,
           leave_type,
           start_date,
           end_date,
           reason,
           status
         )
         values ($1, 'annual', $2::date, $3::date, $4, 'pending')`,
        [
          d.employeeId,
          d.startDate,
          d.endDate,
          d.reason,
        ],
      ),
    );
  } catch (e) {
    return fail(e);
  }

  revalidateAdmin();

  return ok("Emergency leave has been added and is waiting for approval.");
}

const employeeSchema = z.object({
  name: z.string().trim().min(2, "Enter the employee's full name.").max(120),
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  jobTitle: z.string().trim().max(120).optional(),
  role: z.enum(["employee", "admin"]),
  entitlement: z.coerce.number().min(0, "Entitlement can't be negative.").max(366),
  password: z.string().min(8, "Temporary password must be at least 8 characters."),
});

export async function createEmployeeAction(_prev: AdminFormState, formData: FormData): Promise<AdminFormState> {
  const me = await requireAdmin();
  const parsed = employeeSchema.safeParse({
    name: String(formData.get("name") ?? ""),
    email: String(formData.get("email") ?? ""),
    jobTitle: String(formData.get("jobTitle") ?? "").trim() || undefined,
    role: String(formData.get("role") ?? "employee"),
    entitlement: String(formData.get("entitlement") ?? "15"),
    password: String(formData.get("password") ?? ""),
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, message: issue.message, field: String(issue.path[0]) };
  }
  const d = parsed.data;
  try {
    const hash = await hashPassword(d.password);
    await withUser(me.id, async (db) => {
      const { rows } = await db.query<{ id: string }>(
        `insert into users (name, email, role, job_title, password_hash)
         values ($1, $2, $3, $4, $5) returning id`,
        [d.name, d.email, d.role, d.jobTitle ?? null, hash]);
      await db.query(
        `insert into leave_entitlements (employee_id, year, total_days)
         values ($1, extract(year from current_date)::int, $2)`,
        [rows[0].id, d.entitlement]);
    });
  } catch (e) { return fail(e); }
  revalidateAdmin();
  return ok(`${d.name} has been added.`);
}

const updateEmployeeSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(2).max(120),
  jobTitle: z.string().trim().max(120).optional(),
  role: z.enum(["employee", "admin"]),
  active: z.coerce.boolean(),
});

export async function updateEmployeeAction(_prev: AdminFormState, formData: FormData): Promise<AdminFormState> {
  const me = await requireAdmin();
  const parsed = updateEmployeeSchema.safeParse({
    id: String(formData.get("id") ?? ""),
    name: String(formData.get("name") ?? ""),
    jobTitle: String(formData.get("jobTitle") ?? "").trim() || undefined,
    role: String(formData.get("role") ?? "employee"),
    active: formData.get("active") === "on" || formData.get("active") === "true",
  });
  if (!parsed.success) return { ok: false, message: "Please check the form and try again." };
  const d = parsed.data;

  // Guard against an admin locking themselves out of the admin area.
  if (d.id === me.id && (d.role !== "admin" || !d.active)) {
    return { ok: false, message: "You can't remove your own admin access or deactivate yourself." };
  }
  try {
    await withUser(me.id, (db) => db.query(
      "update users set name = $2, job_title = $3, role = $4, active = $5 where id = $1",
      [d.id, d.name, d.jobTitle ?? null, d.role, d.active]));
  } catch (e) { return fail(e); }
  revalidateAdmin();
  revalidatePath(`/admin/employees/${d.id}`);
  return ok("Employee updated.");
}

export async function resetEmployeePasswordAction(_prev: AdminFormState, formData: FormData): Promise<AdminFormState> {
  const me = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const password = String(formData.get("password") ?? "");
  if (password.length < 8) return { ok: false, message: "Temporary password must be at least 8 characters.", field: "password" };
  try {
    const hash = await hashPassword(password);
    await withUser(me.id, (db) => db.query("update users set password_hash = $2 where id = $1", [id, hash]));
  } catch (e) { return fail(e); }
  return ok("Temporary password set. Ask the employee to change it after signing in.");
}

/* ---------------------------------------------------------- entitlements */

const entitlementSchema = z.object({
  employeeId: z.string().uuid(),
  year: z.coerce.number().int().min(2000).max(2100),
  totalDays: z.coerce.number().min(0).max(366),
  note: z.string().trim().max(200).optional(),
});

export async function setEntitlementAction(_prev: AdminFormState, formData: FormData): Promise<AdminFormState> {
  const me = await requireAdmin();
  const parsed = entitlementSchema.safeParse({
    employeeId: String(formData.get("employeeId") ?? ""),
    year: String(formData.get("year") ?? ""),
    totalDays: String(formData.get("totalDays") ?? ""),
    note: String(formData.get("note") ?? "").trim() || undefined,
  });
  if (!parsed.success) return { ok: false, message: "Enter a valid number of days.", field: "totalDays" };
  const d = parsed.data;
  try {
    await withUser(me.id, (db) => db.query(
      `insert into leave_entitlements (employee_id, year, total_days, note)
       values ($1, $2, $3, $4)
       on conflict (employee_id, year)
       do update set total_days = excluded.total_days, note = excluded.note`,
      [d.employeeId, d.year, d.totalDays, d.note ?? null]));
  } catch (e) { return fail(e); }
  revalidateAdmin();
  revalidatePath(`/admin/employees/${d.employeeId}`);
  return ok(`Entitlement for ${d.year} set to ${d.totalDays} days.`);
}

export async function setDefaultEntitlementAction(_prev: AdminFormState, formData: FormData): Promise<AdminFormState> {
  const me = await requireAdmin();
  const value = Number(formData.get("defaultEntitlement"));
  if (!Number.isFinite(value) || value < 0 || value > 366) {
    return { ok: false, message: "Enter a number between 0 and 366.", field: "defaultEntitlement" };
  }
  try {
    await withUser(me.id, (db) => db.query(
      `insert into app_settings (key, value) values ('default_annual_entitlement', $1::jsonb)
       on conflict (key) do update set value = excluded.value, updated_at = now()`,
      [JSON.stringify(value)]));
  } catch (e) { return fail(e); }
  revalidateAdmin();
  return ok(`Default annual entitlement is now ${value} days. Existing employees keep their own values.`);
}

/* ----------------------------------------------------------- office days */

export async function setOfficeDaysAction(_prev: AdminFormState, formData: FormData): Promise<AdminFormState> {
  const me = await requireAdmin();
  const weekdays = formData.getAll("weekday").map(Number).filter((n) => n >= 0 && n <= 6);
  const effectiveFrom = String(formData.get("effectiveFrom") ?? "");
  if (weekdays.length === 0) return { ok: false, message: "Select at least one office day." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) {
    return { ok: false, message: "Choose the date this change takes effect.", field: "effectiveFrom" };
  }
  try {
    // The RPC closes the previous generation rather than overwriting it, so
    // historical calculations remain explainable (§14).
    await withUser(me.id, (db) => db.query("select app.set_office_days($1::int[], $2::date)",
      [weekdays, effectiveFrom]));
  } catch (e) { return fail(e); }
  revalidateAdmin();
  return ok("Office days updated. Leave already approved keeps its original day count.");
}


export async function setWorkModeAction(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const me = await requireAdmin();

  const date = String(formData.get("date") ?? "");
  const mode = String(formData.get("mode") ?? "");

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { ok: false, message: "Invalid work date." };
  }

  if (mode !== "office" && mode !== "wfh") {
    return { ok: false, message: "Work mode must be Office or WFH." };
  }

  try {
    await withUser(me.id, (db) =>
      db.query(
        `insert into work_schedule (work_date, mode)
         values ($1::date, $2::work_mode)
         on conflict (work_date)
         do update set
           mode = excluded.mode,
           updated_at = now()`,
        [date, mode],
      ),
    );
  } catch (e) {
    return fail(e);
  }

  revalidateAdmin();

  return ok(
    `${date} changed to ${mode === "office" ? "Office" : "WFH"}.`,
  );
}

/* -------------------------------------------------------------- holidays */

const holidaySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date."),
  name: z.string().trim().min(2, "Give the holiday a name.").max(200),
  type: z.enum(["public", "company"]),
  source: z.string().trim().max(40).optional(),
});

export async function addHolidayAction(_prev: AdminFormState, formData: FormData): Promise<AdminFormState> {
  const me = await requireAdmin();
  const parsed = holidaySchema.safeParse({
    date: String(formData.get("date") ?? ""),
    name: String(formData.get("name") ?? ""),
    type: String(formData.get("type") ?? "company"),
    source: String(formData.get("source") ?? "").trim() || undefined,
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, message: issue.message, field: String(issue.path[0]) };
  }
  const d = parsed.data;
  try {
    await withUser(me.id, (db) => db.query(
      `insert into holidays (holiday_date, name, type, source)
       values ($1::date, $2, $3, $4)
       on conflict (holiday_date, name) do update set active = true, type = excluded.type`,
      [d.date, d.name, d.type, d.source ?? (d.type === "public" ? "BOT" : "ISX")]));
  } catch (e) { return fail(e); }
  revalidateAdmin();
  return ok(`${d.name} added to the holiday calendar.`);
}

export async function toggleHolidayAction(_prev: AdminFormState, formData: FormData): Promise<AdminFormState> {
  const me = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  try {
    await withUser(me.id, (db) => db.query("update holidays set active = not active where id = $1", [id]));
  } catch (e) { return fail(e); }
  revalidateAdmin();
  return ok("Holiday updated.");
}

/**
 * Import a year of holidays from a JSON payload in the BOT data-layer format
 * (see db/seed/holidays/*.json). This is how a new year is added — no code
 * change, no migration.
 */
export async function importHolidaysAction(_prev: AdminFormState, formData: FormData): Promise<AdminFormState> {
  const me = await requireAdmin();
  const raw = String(formData.get("payload") ?? "").trim();
  if (!raw) return { ok: false, message: "Paste the holiday JSON first.", field: "payload" };

  let parsed: { source?: string; holidays?: Array<{ date: string; name: string; nameTh?: string; note?: string }> };
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, message: "That isn't valid JSON. Check the file contents and try again.", field: "payload" };
  }
  const list = parsed.holidays ?? [];
  if (!Array.isArray(list) || list.length === 0) {
    return { ok: false, message: 'The JSON needs a "holidays" array.', field: "payload" };
  }
  for (const h of list) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(h?.date ?? "") || !h?.name) {
      return { ok: false, message: `Each holiday needs a "date" (YYYY-MM-DD) and a "name". Check: ${JSON.stringify(h).slice(0, 80)}`, field: "payload" };
    }
  }

  try {
    await withUser(me.id, async (db) => {
      for (const h of list) {
        await db.query(
          `insert into holidays (holiday_date, name, name_th, type, source, note)
           values ($1::date, $2, $3, 'public', $4, $5)
           on conflict (holiday_date, name)
           do update set name_th = excluded.name_th, source = excluded.source,
                         note = excluded.note, active = true`,
          [h.date, h.name, h.nameTh ?? null, parsed.source ?? "BOT", h.note ?? null]);
      }
    });
  } catch (e) { return fail(e); }
  revalidateAdmin();
  return ok(`Imported ${list.length} holidays.`);
}

type BotHoliday = {
  HolidayWeekDay: string;
  HolidayWeekDayThai: string;
  Date: string;
  DateThai: string;
  HolidayDescription: string;
  HolidayDescriptionThai: string;
};

type BotResponse = {
  result?: {
    api?: string;
    timestamp?: string;
    data?: BotHoliday[];
  };
};

type BotWebHoliday = {
  holidayDescription: string;
  date: string;
  month: string;
  year: string;
};

type BotWebResponse = {
  notFoundEventLabel?: string;
  holidayCalendarLists?: BotWebHoliday[];
};

const THAI_MONTHS: Record<string, number> = {
  มกราคม: 1,
  กุมภาพันธ์: 2,
  มีนาคม: 3,
  เมษายน: 4,
  พฤษภาคม: 5,
  มิถุนายน: 6,
  กรกฎาคม: 7,
  สิงหาคม: 8,
  กันยายน: 9,
  ตุลาคม: 10,
  พฤศจิกายน: 11,
  ธันวาคม: 12,
};

function parseBotWebDate(h: BotWebHoliday): string {
  const buddhistYear = Number(h.year);
  const gregorianYear = buddhistYear - 543;
  const month = THAI_MONTHS[h.month];

  const dayMatch = h.date.match(/(\d+)\s*$/);
  const day = dayMatch ? Number(dayMatch[1]) : NaN;

  if (
    !Number.isInteger(gregorianYear) ||
    !month ||
    !Number.isInteger(day)
  ) {
    throw new Error(
      `Invalid BOT web holiday date: ${JSON.stringify(h)}`
    );
  }

  return `${gregorianYear}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export async function syncBotHolidaysAction(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const me = await requireAdmin();

  const year = Number(formData.get("year"));

  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return { ok: false, message: "Choose a valid year." };
  }

  const token = process.env.BOT_API_KEY;

  if (!token) {
    return {
      ok: false,
      message: "BOT_API_KEY is not configured on the server.",
    };
  }

  

let data: BotHoliday[] = [];
let syncSource = "BOT API";

try {
  // Try the BOT Gateway API first.
  const response = await fetch(
    `https://gateway.api.bot.or.th/financial-institutions-holidays/?year=${year}`,
    {
      headers: {
        Authorization: token,
        Accept: "application/json",
      },
      cache: "no-store",
    },
  );

  if (response.ok) {
    const raw = await response.text();

    if (raw.trim()) {
      try {
        const body = JSON.parse(raw) as BotResponse;
        data = body.result?.data ?? [];
      } catch (error) {
        console.error("[BOT sync] invalid gateway JSON:", {
          year,
          status: response.status,
          bodyPreview: raw.slice(0, 300),
          error,
        });
      }
    }
  } else {
    console.warn(
      `[BOT sync] gateway returned ${response.status}; trying website fallback.`,
    );
  }
} catch (error) {
  console.error("[BOT sync] gateway fetch failed:", error);
}

// If the Gateway has no data, fall back to the JSON
// used by the official BOT holiday webpage.
if (data.length === 0) {
  const buddhistYear = year + 543;

  try {
    const fallbackResponse = await fetch(
      `https://www.bot.or.th/content/bot/th/financial-institutions-holiday/jcr:content/root/container/holidaycalendar_copy.model.${buddhistYear}.json`,
      {
        headers: {
          Accept: "application/json",
        },
        cache: "no-store",
      },
    );

    if (!fallbackResponse.ok) {
      return {
        ok: false,
        message: `Bank of Thailand website returned ${fallbackResponse.status}.`,
      };
    }

    const fallbackBody =
      (await fallbackResponse.json()) as BotWebResponse;

    const list = fallbackBody.holidayCalendarLists ?? [];

    if (!Array.isArray(list) || list.length === 0) {
      return {
        ok: false,
        message: `No Bank of Thailand holidays are available for ${year}.`,
      };
    }

    data = list.map((h) => ({
      HolidayWeekDay: h.date.replace(/\s+\d+\s*$/, ""),
      HolidayWeekDayThai: h.date.replace(/\s+\d+\s*$/, ""),
      Date: parseBotWebDate(h),
      DateThai: "",
      HolidayDescription: h.holidayDescription,
      HolidayDescriptionThai: h.holidayDescription,
    }));

    syncSource = "BOT website";
  } catch (error) {
    console.error("[BOT sync] website fallback failed:", error);

    return {
      ok: false,
      message: "Could not load holidays from the Bank of Thailand website.",
    };
  }
}

  try {
    await withUser(me.id, async (db) => {
      for (const h of data) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(h.Date)) continue;

        const existing = await db.query<{ id: string }>(
          `select id
           from holidays
           where holiday_date = $1::date
             and source = 'BOT'
           order by created_at
           limit 1`,
          [h.Date],
        );

        if (existing.rows[0]) {
          const keepId = existing.rows[0].id;

          await db.query(
            `delete from holidays
             where holiday_date = $1::date
               and source = 'BOT'
               and id <> $2::uuid`,
            [h.Date, keepId],
          );

          await db.query(
            `update holidays
             set name = $2,
                 name_th = $3,
                 type = 'public',
                 source = 'BOT',
                 note = $4,
                 active = true,
                 updated_at = now()
             where id = $1::uuid`,
            [
              keepId,
              h.HolidayDescription,
              h.HolidayDescriptionThai || null,
              `Synced from ${syncSource} · ${h.HolidayWeekDay}`,
            ],
          );
        } else {
          await db.query(
            `insert into holidays (
               holiday_date,
               name,
               name_th,
               type,
               source,
               note
             )
             values ($1::date, $2, $3, 'public', 'BOT', $4)`,
            [
              h.Date,
              h.HolidayDescription,
              h.HolidayDescriptionThai || null,
              `Synced from BOT API · ${h.HolidayWeekDay}`,
            ],
          );
        }
      }
    });
  } catch (e) {
    return fail(e);
  }

  revalidateAdmin();
  revalidatePath("/calendar");
  revalidatePath("/dashboard");

  return ok(`Synced ${data.length} BOT holidays for ${year}.`);
}
