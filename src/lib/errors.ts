/**
 * Translates database/business error identifiers into messages that are safe
 * and useful for an end user (§29 — never leak SQL, constraint names or
 * stack traces to the UI).
 */

export type FriendlyError = {
  message: string;
  field?:
    | "startDate"
    | "endDate"
    | "leaveType"
    | "reason"
    | "employeeId"
    | "earnedDate"
    | "note";
};

const MAP: Array<
  [RegExp, (m: RegExpMatchArray) => FriendlyError]
> = [
  // ---------------------------------------------------------
  // General leave request validation
  // ---------------------------------------------------------

  [
    /LEAVE_END_BEFORE_START|leave_requests_date_order/,
    () => ({
      message:
        "The end date must be on or after the start date.",
      field: "endDate",
    }),
  ],

  [
    /LEAVE_SPANS_TWO_YEARS/,
    () => ({
      message:
        "A single request can't span two calendar years. Please submit one request per year.",
      field: "endDate",
    }),
  ],

  [
    /LEAVE_REQUIRES_7_DAYS_NOTICE|LEAVE_REQUIRES_7_DAY_ADVANCE/,
    () => ({
      message:
        "Leave requests must be submitted at least 7 calendar days before the leave date.",
      field: "startDate",
    }),
  ],

  [
    /LEAVE_NO_WORKING_DAYS/,
    () => ({
      message:
        "That range doesn't contain any office working days, so there's nothing to deduct. Pick dates that include at least one office day.",
      field: "startDate",
    }),
  ],

  [
    /leave_requests_no_overlap/,
    () => ({
      message:
        "You already have a pending or approved request covering some of those dates.",
      field: "startDate",
    }),
  ],

  // ---------------------------------------------------------
  // Annual Leave balance
  // ---------------------------------------------------------

  [
    /LEAVE_INSUFFICIENT_BALANCE_ON_APPROVE:(-?[\d.]+):([\d.]+)/,
    (m) => ({
      message: `This employee only has ${fmt(
        m[1],
      )} day(s) left for the year but the request is for ${fmt(
        m[2],
      )}. Adjust their entitlement first, or reject the request.`,
    }),
  ],

  [
    /LEAVE_INSUFFICIENT_BALANCE:(-?[\d.]+):([\d.]+)/,
    (m) => ({
      message: `You have ${fmt(
        m[1],
      )} day(s) available but this request needs ${fmt(
        m[2],
      )}.`,
      field: "endDate",
    }),
  ],

  // ---------------------------------------------------------
  // Comp Day — grant / credit
  // ---------------------------------------------------------

  [
    /COMP_DAY_ADMIN_ONLY/,
    () => ({
      message:
        "Only an administrator can grant or manage Comp Days.",
    }),
  ],

  [
    /COMP_DAY_SOURCE_NOT_WEEKEND_OR_HOLIDAY/,
    () => ({
      message:
        "Comp Days can only be granted for work performed on a weekend or company holiday.",
      field: "earnedDate",
    }),
  ],

  [
    /COMP_DAY_INVALID_CREATED_BY/,
    () => ({
      message:
        "The Comp Day could not be granted by this account. Please sign in again and retry.",
    }),
  ],

  [
    /comp_day_credits_employee_id_earned_date_key|duplicate key value.*comp_day_credits/i,
    () => ({
      message:
        "This employee has already received a Comp Day for that worked date.",
      field: "earnedDate",
    }),
  ],

    // ---------------------------------------------------------
  // Comp Day — employee request
  // ---------------------------------------------------------

  [
    /COMP_DAY_SINGLE_DAY_ONLY/,
    () => ({
      message:
        "Half Day Compensatory Leave must be for a single date.",
      field: "endDate",
    }),
  ],

  [
    /COMP_DAY_NO_ELIGIBLE_WFH_DAYS/,
    () => ({
      message:
        "This range doesn't contain any eligible WFH days. Office days, weekends, and company holidays are skipped.",
      field: "startDate",
    }),
  ],

  [
    /COMP_DAY_ELIGIBILITY_CHANGED/,
    () => ({
      message:
        "The work schedule or holiday settings changed after this request was submitted. Please reject or cancel this request and submit a new one.",
    }),
  ],

  [
    /COMP_DAY_WEEKDAY_ONLY/,
    () => ({
      message:
        "Compensatory Leave can't be used on a weekend.",
      field: "startDate",
    }),
  ],

  [
    /COMP_DAY_NOT_ON_HOLIDAY/,
    () => ({
      message:
        "Compensatory Leave can't be used on a company holiday.",
      field: "startDate",
    }),
  ],

  [
    /COMP_DAY_WFH_ONLY/,
    () => ({
      message:
        "Compensatory Leave can only be used on an eligible WFH day.",
      field: "startDate",
    }),
  ],

  [
    /COMP_DAY_INSUFFICIENT_BALANCE_ON_APPROVE/,
    () => ({
      message:
        "This employee no longer has enough available Comp Days to approve this request.",
    }),
  ],

  [
    /COMP_DAY_INSUFFICIENT_BALANCE/,
    () => ({
      message:
        "You don't have enough available Comp Days for this request.",
      field: "endDate",
    }),
  ],

  // ---------------------------------------------------------
  // Request status / approval
  // ---------------------------------------------------------

  [
    /LEAVE_REJECTION_REASON_REQUIRED/,
    () => ({
      message:
        "Please provide a reason for rejecting this request.",
      field: "reason",
    }),
  ],

  [
    /LEAVE_ALREADY_DECIDED/,
    () => ({
      message:
        "That request has already been decided and can no longer be changed.",
    }),
  ],

  [
    /LEAVE_INVALID_TRANSITION|FORBIDDEN_EMPLOYEE_MISMATCH|LEAVE_MUST_START_PENDING/,
    () => ({
      message:
        "You're not allowed to make that change.",
    }),
  ],

  [
    /LEAVE_IMMUTABLE_AFTER_SUBMIT/,
    () => ({
      message:
        "Submitted requests can't be edited. Cancel it and file a new one instead.",
    }),
  ],

  // ---------------------------------------------------------
  // Permissions
  // ---------------------------------------------------------

  [
    /FORBIDDEN_ADMIN_ONLY/,
    () => ({
      message:
        "That action is restricted to administrators.",
    }),
  ],

  [
    /row-level security|permission denied/i,
    () => ({
      message:
        "You don't have access to that record.",
    }),
  ],

  // ---------------------------------------------------------
  // Employees / entitlements
  // ---------------------------------------------------------

  [
    /users_email_key|duplicate key value.*users/i,
    () => ({
      message:
        "An employee with that email address already exists.",
    }),
  ],

  [
    /leave_entitlements_employee_id_year_key/,
    () => ({
      message:
        "That employee already has an entitlement recorded for this year.",
    }),
  ],
];

function fmt(n: string) {
  const v = Number(n);

  return Number.isInteger(v)
    ? String(v)
    : v.toFixed(2).replace(/0$/, "");
}

export function toFriendlyError(
  err: unknown,
): FriendlyError {
  const raw =
    typeof err === "string"
      ? err
      : err instanceof Error
        ? `${err.message}`
        : "";

  for (const [re, build] of MAP) {
    const m = raw.match(re);

    if (m) {
      return build(m);
    }
  }

  // Anything unrecognised is logged server-side and generalised for the user.
  if (raw) {
    console.error(
      "[isx-leave] unhandled error:",
      raw,
    );
  }

  return {
    message:
      "Something went wrong. Please try again — if it keeps happening, contact HR.",
  };
}