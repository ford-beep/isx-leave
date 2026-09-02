import type { ISODate } from "./date";

export type Role = "employee" | "admin";
export type LeaveStatus = "pending" | "approved" | "rejected" | "cancelled";
export type HolidayType = "public" | "company";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export interface UserRow extends SessionUser {
  active: boolean;
  jobTitle: string | null;
  birthday: ISODate | null;
  createdAt: string;
}

export interface LeaveType {
  code: string;
  label: string;
  description: string | null;
  deductsBalance: boolean;
}

export interface CalcDay {
  date: ISODate;
  officeDay: boolean;
  holiday: string | null;
  deducted: boolean;
}

export interface CalcHoliday {
  date: ISODate;
  name: string;
  type: HolidayType;
  source: string;
  wouldHaveBeenOfficeDay: boolean;
}

/** The full, explainable output of calculateLeaveDays() (§22). */
export interface LeaveCalculation {
  startDate: ISODate;
  endDate: ISODate;
  totalCalendarDays: number;
  officeDaysInRange: number;
  excludedNonOfficeDays: number;
  excludedHolidays: number;
  leaveDays: number;
  holidays: CalcHoliday[];
  days: CalcDay[];
}

export interface LeaveRequest {
  id: string;
  employeeId: string;
  employeeName?: string;
  employeeEmail?: string;
  leaveType: string;
  leaveTypeLabel: string;
  leaveSession:
  | "full_day"
  | "morning"
  | "afternoon"
  | "half_day";
  startDate: ISODate;
  endDate: ISODate;
  leaveDays: number;
  reason: string | null;
  status: LeaveStatus;
  rejectionReason: string | null;
  approvedAt: string | null;
  approvedByName?: string | null;
  createdAt: string;
  calcBreakdown?: LeaveCalculation;
}

export interface LeaveBalance {
  entitlement: number;
  approved: number;
  pending: number;
  /** entitlement − approved. The official balance shown to the employee. */
  remaining: number;
  /** entitlement − approved − pending. What may still be booked. */
  available: number;
}

export interface CompDayBalance {
  earned: number;
  approved: number;
  pending: number;
  remaining: number;
  available: number;
}

export interface CompDayCredit {
  id: string;
  employeeId: string;
  earnedDate: ISODate;
  note: string | null;
  createdBy: string;
  createdByName: string | null;
  createdAt: string;
}

export interface Holiday {
  id: string;
  date: ISODate;
  name: string;
  nameTh: string | null;
  type: HolidayType;
  source: string;
  year: number;
  active: boolean;
}

export interface OfficeDayConfig {
  weekdays: number[];
  effectiveFrom: ISODate;
}

export type WorkMode = "office" | "wfh";

export interface WorkScheduleDay {
  date: ISODate;
  mode: WorkMode;
  note: string | null;
}

export interface AuditEntry {
  id: string;
  actorName: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface Notification {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}
