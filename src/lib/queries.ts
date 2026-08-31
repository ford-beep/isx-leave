/**
 * Read-side data access.
 *
 * Every function takes the acting user's id and runs through `withUser`, so
 * the results are already filtered by RLS. Notice that none of these queries
 * contain an `employee_id = $me` clause "for safety" — that would imply the
 * safety came from here. It comes from the database. The queries are written
 * the way you would write them if you trusted the caller completely, and the
 * database makes that trust unnecessary.
 */
import "server-only";
import { withUser, queryAs, oneAs, type Db } from "./db";
import { companyToday } from "./date";
import type {
  AuditEntry, Holiday, LeaveBalance, LeaveRequest, LeaveType,
  Notification, OfficeDayConfig, UserRow, WorkScheduleDay,
} from "./types";
import type { LeaveCalculation } from "./types";

/* ------------------------------------------------------------------ shared */

const REQUEST_COLUMNS = `
  lr.id, lr.employee_id, lr.leave_type, lt.label as leave_type_label,
  lr.start_date::text as start_date, lr.end_date::text as end_date,
  lr.leave_days::float8 as leave_days, lr.reason, lr.status,
  lr.rejection_reason, lr.approved_at, lr.created_at, lr.calc_breakdown,
  u.name as employee_name, u.email as employee_email,
  approver.name as approved_by_name`;

const REQUEST_FROM = `
  from leave_requests lr
  join leave_types lt on lt.code = lr.leave_type
  join users u on u.id = lr.employee_id
  left join users approver on approver.id = lr.approved_by`;

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapRequest(r: any): LeaveRequest {
  return {
    id: r.id,
    employeeId: r.employee_id,
    employeeName: r.employee_name,
    employeeEmail: r.employee_email,
    leaveType: r.leave_type,
    leaveTypeLabel: r.leave_type_label,
    startDate: r.start_date,
    endDate: r.end_date,
    leaveDays: Number(r.leave_days),
    reason: r.reason,
    status: r.status,
    rejectionReason: r.rejection_reason,
    approvedAt: r.approved_at
  ? r.approved_at instanceof Date
    ? r.approved_at.toISOString()
    : String(r.approved_at)
  : null,
    approvedByName: r.approved_by_name,
    createdAt: r.created_at instanceof Date
  ? r.created_at.toISOString()
  : String(r.created_at),
    calcBreakdown: r.calc_breakdown as LeaveCalculation,
  };
}

/* ------------------------------------------------------- working calendar */

export async function getOfficeDays(me: string, onDate?: string): Promise<OfficeDayConfig> {
  const d = onDate ?? companyToday();
  const rows = await queryAs<{ weekday: number; effective_from: string }>(me,
    `select weekday, effective_from::text
       from office_days
      where is_office_day
        and effective_from <= $1::date
        and (effective_to is null or effective_to >= $1::date)
      order by weekday`, [d]);
  return {
    weekdays: rows.map((r) => r.weekday),
    effectiveFrom: rows[0]?.effective_from ?? d,
  };
}

export async function getWorkSchedule(
  me: string,
  year: number,
  month: number,
): Promise<WorkScheduleDay[]> {
 const start = `${year}-${String(month).padStart(2, "0")}-01`;

const rows = await queryAs<{
  work_date: string;
  mode: "office" | "wfh";
  note: string | null;
}>(
  me,
  `select
     work_date::text as work_date,
     mode,
     note
   from work_schedule
   where work_date >= ($1::date - interval '1 month')
     and work_date < ($1::date + interval '2 months')
   order by work_date`,
  [start],
);

  return rows.map((r) => ({
    date: r.work_date,
    mode: r.mode,
    note: r.note,
  }));
}


export async function getHolidays(me: string, year: number): Promise<Holiday[]> {
  const rows = await queryAs<Record<string, any>>(me,
    `select id, holiday_date::text as date, name, name_th, type, source, year, active
       from holidays where year = $1 order by holiday_date`, [year]);
  return rows.map((r) => ({
    id: r.id, date: r.date, name: r.name, nameTh: r.name_th,
    type: r.type, source: r.source, year: r.year, active: r.active,
  }));
}

export async function getHolidayYears(me: string): Promise<number[]> {
  const rows = await queryAs<{ year: number }>(me,
    "select distinct year from holidays order by year");
  return rows.map((r) => r.year);
}

/**
 * Server-side leave-day calculation. Delegates to the SAME SQL function the
 * insert trigger uses, so the preview shown in the form can never disagree
 * with what is ultimately stored.
 */
export async function calcLeaveDays(me: string, start: string, end: string): Promise<LeaveCalculation> {
  const row = await oneAs<{ calc: LeaveCalculation }>(me,
    "select app.calc_leave_days($1::date, $2::date) as calc", [start, end]);
  return row!.calc;
}

/* ------------------------------------------------------------ leave types */

export async function getLeaveTypes(me: string): Promise<LeaveType[]> {
  const rows = await queryAs<Record<string, any>>(me,
    `select code, label, description, deducts_balance
       from leave_types where active order by sort_order, label`);
  return rows.map((r) => ({
    code: r.code, label: r.label, description: r.description, deductsBalance: r.deducts_balance,
  }));
}

/* ---------------------------------------------------------------- balance */

export async function getBalance(me: string, employeeId: string, year: number): Promise<LeaveBalance> {
  const r = await oneAs<Record<string, any>>(me,
    `select entitlement::float8, approved::float8, pending::float8,
            remaining::float8, available::float8
       from app.leave_balance($1, $2)`, [employeeId, year]);
  return {
    entitlement: Number(r?.entitlement ?? 0),
    approved: Number(r?.approved ?? 0),
    pending: Number(r?.pending ?? 0),
    remaining: Number(r?.remaining ?? 0),
    available: Number(r?.available ?? 0),
  };
}

/* --------------------------------------------------------- leave requests */

export async function getMyRequests(me: string, limit?: number): Promise<LeaveRequest[]> {
  const rows = await queryAs<Record<string, any>>(me,
    `select ${REQUEST_COLUMNS} ${REQUEST_FROM}
      where lr.employee_id = $1
      order by lr.start_date desc
      ${limit ? "limit " + Number(limit) : ""}`, [me]);
  return rows.map(mapRequest);
}

export async function getNextUpcomingLeave(me: string, employeeId = me): Promise<LeaveRequest | null> {
  const rows = await queryAs<Record<string, any>>(me,
    `select ${REQUEST_COLUMNS} ${REQUEST_FROM}
      where lr.employee_id = $1 and lr.status = 'approved' and lr.end_date >= $2::date
      order by lr.start_date limit 1`, [employeeId, companyToday()]);
  return rows[0] ? mapRequest(rows[0]) : null;
}

/** Requests overlapping a month, for the calendar. RLS decides whose. */
export async function getRequestsInMonth(
  me: string, year: number, month1: number, employeeId?: string,
): Promise<LeaveRequest[]> {
  const params: unknown[] = [`${year}-${String(month1).padStart(2, "0")}-01`];
  let filter = "";
  if (employeeId) { params.push(employeeId); filter = "and lr.employee_id = $2"; }
  const rows = await queryAs<Record<string, any>>(me,
    `select ${REQUEST_COLUMNS} ${REQUEST_FROM}
      where lr.status in ('approved', 'pending')
        and daterange(lr.start_date, lr.end_date, '[]')
            && daterange($1::date, ($1::date + interval '1 month')::date, '[)')
        ${filter}
      order by lr.start_date`, params);
  return rows.map(mapRequest);
}


export async function getActiveAdminEmails(
  me: string,
): Promise<string[]> {
  const rows = await queryAs<{ email: string }>(
    me,
    `select email from app.active_admin_emails()`,
  );

  return rows
  .map((row) => row.email)
  .filter((email) => !email.endsWith("@demo.isx.local"));
}


/* ------------------------------------------------------------- admin side */

export async function getPendingRequests(me: string): Promise<LeaveRequest[]> {
  const rows = await queryAs<Record<string, any>>(me,
    `select ${REQUEST_COLUMNS} ${REQUEST_FROM}
      where lr.status = 'pending' order by lr.start_date`);
  return rows.map(mapRequest);
}

export async function getAllRequests(
  me: string, opts: { status?: string; employeeId?: string } = {},
): Promise<LeaveRequest[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (opts.status && opts.status !== "all") { params.push(opts.status); where.push(`lr.status = $${params.length}`); }
  if (opts.employeeId) { params.push(opts.employeeId); where.push(`lr.employee_id = $${params.length}`); }
  const rows = await queryAs<Record<string, any>>(me,
    `select ${REQUEST_COLUMNS} ${REQUEST_FROM}
     ${where.length ? "where " + where.join(" and ") : ""}
      order by case when lr.status = 'pending' then 0 else 1 end, lr.start_date desc
      limit 300`, params);
  return rows.map(mapRequest);
}

export async function getRequestById(me: string, id: string): Promise<LeaveRequest | null> {
  const rows = await queryAs<Record<string, any>>(me,
    `select ${REQUEST_COLUMNS} ${REQUEST_FROM} where lr.id = $1`, [id]);
  return rows[0] ? mapRequest(rows[0]) : null;
}

export async function getUser(me: string, id: string): Promise<UserRow | null> {
  const r = await oneAs<Record<string, any>>(me,
    `select id, name, email, role, active, job_title, created_at from users where id = $1`, [id]);
  return r ? {
    id: r.id, name: r.name, email: r.email, role: r.role,
    active: r.active,
    jobTitle: r.job_title,
    createdAt: r.created_at instanceof Date
  ? r.created_at.toISOString()
  : String(r.created_at), 
  } : null;
}

export interface EmployeeOverview extends UserRow {
  entitlement: number;
  used: number;
  pending: number;
  remaining: number;
}

/** Roster with balances. Employees see only themselves; admins see everyone. */
export async function getEmployeeOverview(me: string, year: number): Promise<EmployeeOverview[]> {
  const rows = await queryAs<Record<string, any>>(me,
    `select u.id, u.name, u.email, u.role, u.active, u.job_title, u.created_at,
            b.entitlement::float8, b.approved::float8, b.pending::float8, b.remaining::float8
       from users u, lateral app.leave_balance(u.id, $1) b
      order by u.active desc, u.name`, [year]);
  return rows.map((r) => ({
    id: r.id, name: r.name, email: r.email, role: r.role, active: r.active,
    jobTitle: r.job_title, createdAt: r.created_at,
    entitlement: Number(r.entitlement), used: Number(r.approved),
    pending: Number(r.pending), remaining: Number(r.remaining),
  }));
}

export interface AdminStats {
  totalEmployees: number;
  activeEmployees: number;
  pendingRequests: number;
  approvedThisMonth: number;
  totalDaysUsed: number;
}

export async function getAdminStats(me: string, year: number): Promise<AdminStats> {
  return withUser(me, async (db: Db) => {
    const { rows } = await db.query<Record<string, any>>(
      `select
         (select count(*) from users)                                        as total_employees,
         (select count(*) from users where active)                           as active_employees,
         (select count(*) from leave_requests where status = 'pending')      as pending_requests,
         (select count(*) from leave_requests
            where status = 'approved'
              and date_trunc('month', start_date) = date_trunc('month', current_date)) as approved_this_month,
         (select coalesce(sum(leave_days), 0) from leave_requests
            where status = 'approved' and leave_year = $1)                   as total_days_used`,
      [year]);
    const r = rows[0];
    return {
      totalEmployees: Number(r.total_employees),
      activeEmployees: Number(r.active_employees),
      pendingRequests: Number(r.pending_requests),
      approvedThisMonth: Number(r.approved_this_month),
      totalDaysUsed: Number(r.total_days_used),
    };
  });
}

export async function getUpcomingLeaveAll(me: string, days = 45): Promise<LeaveRequest[]> {
  const rows = await queryAs<Record<string, any>>(me,
    `select ${REQUEST_COLUMNS} ${REQUEST_FROM}
      where lr.status = 'approved'
        and lr.end_date >= current_date
        and lr.start_date <= current_date + ($1 || ' days')::interval
      order by lr.start_date limit 25`, [days]);
  return rows.map(mapRequest);
}

export async function getEntitlements(
  me: string, employeeId: string,
): Promise<Array<{ year: number; totalDays: number; note: string | null }>> {
  const rows = await queryAs<Record<string, any>>(me,
    `select year, total_days::float8 as total_days, note
       from leave_entitlements where employee_id = $1 order by year desc`, [employeeId]);
  return rows.map((r) => ({ year: r.year, totalDays: Number(r.total_days), note: r.note }));
}

/* ------------------------------------------------------------- audit log */

export async function getAuditLog(
  me: string, opts: { entityType?: string; limit?: number } = {},
): Promise<AuditEntry[]> {
  const params: unknown[] = [];
  let filter = "";
  if (opts.entityType && opts.entityType !== "all") {
    params.push(opts.entityType); filter = `where a.entity_type = $${params.length}`;
  }
  params.push(opts.limit ?? 150);
  const rows = await queryAs<Record<string, any>>(me,
    `select a.id, a.action, a.entity_type, a.entity_id, a.metadata, a.created_at,
            u.name as actor_name
       from audit_logs a left join users u on u.id = a.actor_id
       ${filter}
       order by a.created_at desc limit $${params.length}`, params);
  return rows.map((r) => ({
    id: r.id, actorName: r.actor_name, action: r.action, entityType: r.entity_type,
    entityId: r.entity_id, metadata: r.metadata ?? {}, createdAt: r.created_at,
  }));
}

/* ---------------------------------------------------------- notifications */

export async function getNotifications(me: string, limit = 12): Promise<Notification[]> {
  const rows = await queryAs<Record<string, any>>(me,
    `select id, title, body, link, read_at, created_at
       from notifications where user_id = $1 order by created_at desc limit $2`, [me, limit]);
  return rows.map((r) => ({
    id: r.id, title: r.title, body: r.body, link: r.link,
    readAt: r.read_at
  ? r.read_at instanceof Date
    ? r.read_at.toISOString()
    : String(r.read_at)
  : null,

createdAt: r.created_at instanceof Date
  ? r.created_at.toISOString()
  : String(r.created_at),
  }));
}

export async function getUnreadCount(me: string): Promise<number> {
  const r = await oneAs<{ n: string }>(me,
    "select count(*)::text as n from notifications where user_id = $1 and read_at is null", [me]);
  return Number(r?.n ?? 0);
}

export async function getSetting(me: string, key: string): Promise<unknown> {
  const r = await oneAs<{ value: unknown }>(me, "select value from app_settings where key = $1", [key]);
  return r?.value;
}
