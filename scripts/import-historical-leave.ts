import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { Pool, PoolClient } from "pg";

type LeaveType = "annual" | "comp_day";
type LeaveSession = "full_day" | "morning" | "afternoon" | "half_day";

interface HistoricalLeave {
  employeeName: string;
  email: string;
  startDate: string;
  endDate: string;
  leaveSession: LeaveSession;
  leaveDays: number;
  leaveType: LeaveType;
  reason: string | null;
  status: "approved";
}

interface HistoricalCompCredit {
  employeeName: string;
  email: string;
  earnedDate: string;
  sourceStatus: string;
  usedLeaveDate: string | null;
  note: string | null;
}

interface ImportData {
  meta: {
    sourceFile: string;
    year: number;
    leaveHistoryRows: number;
    weekendWorkRows: number;
    notes: string[];
  };
  leaveHistory: HistoricalLeave[];
  compDayCredits: HistoricalCompCredit[];
}

interface DbUser {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
}

const DATA_FILE = path.join(
  process.cwd(),
  "data",
  "historical-leave-2026.json",
);

const APPLY = process.argv.includes("--apply");

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function isISODate(value: string | null): boolean {
  if (value === null) return true;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00Z`);

  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  );
}

function dateRangesOverlap(
  startA: string,
  endA: string,
  startB: string,
  endB: string,
): boolean {
  return startA <= endB && startB <= endA;
}

function fail(message: string): never {
  console.error(`\n❌ ${message}`);
  process.exit(1);
}

function nearlyEqual(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.000001;
}

async function setCurrentUser(
  client: PoolClient,
  userId: string,
): Promise<void> {
  await client.query(
    "select set_config('app.current_user_id', $1, true)",
    [userId],
  );
}

async function main() {
  console.log(
    APPLY
      ? "\nISX Leave — Historical Import APPLY"
      : "\nISX Leave — Historical Import Dry Run",
  );

  console.log(
    APPLY
      ? "====================================\n"
      : "=====================================\n",
  );

  const databaseUrl = process.env.DATABASE_APP_URL;

  if (!databaseUrl) {
    fail("DATABASE_APP_URL is not configured.");
  }

  if (!fs.existsSync(DATA_FILE)) {
    fail(`Data file not found: ${DATA_FILE}`);
  }

  const data = JSON.parse(
    fs.readFileSync(DATA_FILE, "utf8"),
  ) as ImportData;

  console.log(`Mode: ${APPLY ? "APPLY — WRITES ENABLED" : "DRY RUN"}`);
  console.log(`Source: ${data.meta.sourceFile}`);
  console.log(`Year: ${data.meta.year}`);
  console.log(`Leave rows: ${data.leaveHistory.length}`);
  console.log(`Comp credit rows: ${data.compDayCredits.length}`);
  console.log("");

  const errors: string[] = [];
  const warnings: string[] = [];

  // -------------------------------------------------------------------------
  // 1. Source validation
  // -------------------------------------------------------------------------

  if (data.leaveHistory.length !== data.meta.leaveHistoryRows) {
    errors.push(
      `Leave row count mismatch: meta=${data.meta.leaveHistoryRows}, actual=${data.leaveHistory.length}`,
    );
  }

  if (data.compDayCredits.length !== data.meta.weekendWorkRows) {
    errors.push(
      `Comp credit count mismatch: meta=${data.meta.weekendWorkRows}, actual=${data.compDayCredits.length}`,
    );
  }

  for (const [index, leave] of data.leaveHistory.entries()) {
    const row = index + 2;

    if (!leave.email) {
      errors.push(`Leave row ${row}: missing email`);
    }

    if (
      !isISODate(leave.startDate) ||
      !isISODate(leave.endDate)
    ) {
      errors.push(
        `Leave row ${row}: invalid ISO date (${leave.startDate}..${leave.endDate})`,
      );
      continue;
    }

    if (leave.endDate < leave.startDate) {
      errors.push(
        `Leave row ${row}: end date is before start date (${leave.email})`,
      );
    }

    if (
      Number(leave.startDate.slice(0, 4)) !== data.meta.year ||
      Number(leave.endDate.slice(0, 4)) !== data.meta.year
    ) {
      errors.push(
        `Leave row ${row}: date is outside ${data.meta.year}`,
      );
    }

    if (!["annual", "comp_day"].includes(leave.leaveType)) {
      errors.push(
        `Leave row ${row}: invalid leave type ${leave.leaveType}`,
      );
    }

    if (
      ![
        "full_day",
        "morning",
        "afternoon",
        "half_day",
      ].includes(leave.leaveSession)
    ) {
      errors.push(
        `Leave row ${row}: invalid leave session ${leave.leaveSession}`,
      );
    }

    if (leave.leaveDays <= 0) {
      errors.push(
        `Leave row ${row}: invalid leaveDays=${leave.leaveDays}`,
      );
    }

    if (
      leave.leaveSession !== "full_day" &&
      leave.startDate !== leave.endDate
    ) {
      errors.push(
        `Leave row ${row}: half-day leave spans multiple dates`,
      );
    }

    if (
      leave.leaveSession !== "full_day" &&
      !nearlyEqual(leave.leaveDays, 0.5)
    ) {
      errors.push(
        `Leave row ${row}: ${leave.leaveSession} must equal 0.5 day`,
      );
    }

    if (
      leave.leaveType === "comp_day" &&
      leave.startDate !== leave.endDate
    ) {
      errors.push(
        `Leave row ${row}: Comp Day must be a single date`,
      );
    }

    if (
      leave.leaveType === "comp_day" &&
      leave.leaveSession === "full_day" &&
      !nearlyEqual(leave.leaveDays, 1)
    ) {
      errors.push(
        `Leave row ${row}: full Comp Day must equal 1 day`,
      );
    }
  }

  // -------------------------------------------------------------------------
  // 2. Comp credit validation
  // -------------------------------------------------------------------------

  const creditKeys = new Set<string>();

  for (const [index, credit] of data.compDayCredits.entries()) {
    const row = index + 2;

    if (!credit.email) {
      errors.push(`Weekend Work row ${row}: missing email`);
    }

    if (!isISODate(credit.earnedDate)) {
      errors.push(
        `Weekend Work row ${row}: invalid earned date ${credit.earnedDate}`,
      );
      continue;
    }

    if (
      Number(credit.earnedDate.slice(0, 4)) !== data.meta.year
    ) {
      errors.push(
        `Weekend Work row ${row}: earned date outside ${data.meta.year}`,
      );
    }

    if (
      credit.usedLeaveDate !== null &&
      !isISODate(credit.usedLeaveDate)
    ) {
      errors.push(
        `Weekend Work row ${row}: invalid used leave date ${credit.usedLeaveDate}`,
      );
    }

    const key =
      `${normalizeEmail(credit.email)}|${credit.earnedDate}`;

    if (creditKeys.has(key)) {
      errors.push(
        `Weekend Work row ${row}: duplicate Comp Day credit ${key}`,
      );
    }

    creditKeys.add(key);
  }

  // -------------------------------------------------------------------------
  // 3. Historical source overlaps
  // -------------------------------------------------------------------------

  const leavesByEmployee =
    new Map<string, HistoricalLeave[]>();

  for (const leave of data.leaveHistory) {
    const email = normalizeEmail(leave.email);
    const list = leavesByEmployee.get(email) ?? [];

    list.push(leave);
    leavesByEmployee.set(email, list);
  }

  for (const [email, leaves] of leavesByEmployee) {
    for (let i = 0; i < leaves.length; i++) {
      for (let j = i + 1; j < leaves.length; j++) {
        const a = leaves[i];
        const b = leaves[j];

        if (
          dateRangesOverlap(
            a.startDate,
            a.endDate,
            b.startDate,
            b.endDate,
          )
        ) {
          errors.push(
            `Overlapping leave: ${email} — ` +
              `${a.startDate}..${a.endDate} overlaps ` +
              `${b.startDate}..${b.endDate}`,
          );
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // 4. Connect
  // -------------------------------------------------------------------------

  const pool = new Pool({
    connectionString: databaseUrl,
    max: 1,
  });

  try {
    const result = await pool.query<DbUser>(`
      select
        id,
        name,
        lower(email) as email,
        role,
        active
      from public.users
      order by email
    `);

    const usersByEmail = new Map(
      result.rows.map((user) => [
        normalizeEmail(user.email),
        user,
      ]),
    );

    const sourceEmails = new Set<string>();

    for (const leave of data.leaveHistory) {
      sourceEmails.add(normalizeEmail(leave.email));
    }

    for (const credit of data.compDayCredits) {
      sourceEmails.add(normalizeEmail(credit.email));
    }

    console.log("Employee matching");
    console.log("-----------------\n");

    for (const email of [...sourceEmails].sort()) {
      const user = usersByEmail.get(email);

      if (!user) {
        console.log(`❌ ${email} — NOT FOUND`);
        errors.push(`Employee not found in DB: ${email}`);
        continue;
      }

      if (!user.active) {
        console.log(`⚠️  ${email} — ${user.name} — inactive`);
        warnings.push(`Employee is inactive: ${email}`);
        continue;
      }

      console.log(`✓ ${email} — ${user.name}`);
    }

    // -----------------------------------------------------------------------
    // 5. Existing DB leave overlap
    // -----------------------------------------------------------------------

    for (const leave of data.leaveHistory) {
      const user = usersByEmail.get(
        normalizeEmail(leave.email),
      );

      if (!user) continue;

      const existing = await pool.query<{
        id: string;
        start_date: string;
        end_date: string;
        status: string;
      }>(
        `
          select
            id,
            start_date::text,
            end_date::text,
            status::text
          from public.leave_requests
          where employee_id = $1
            and status in ('pending', 'approved')
            and daterange(start_date, end_date, '[]')
                && daterange($2::date, $3::date, '[]')
        `,
        [
          user.id,
          leave.startDate,
          leave.endDate,
        ],
      );

      if (existing.rowCount && existing.rowCount > 0) {
        errors.push(
          `Existing DB leave overlaps import: ` +
            `${leave.email} ${leave.startDate}..${leave.endDate}`,
        );
      }
    }

    // -----------------------------------------------------------------------
    // 6. Existing Comp credits
    // -----------------------------------------------------------------------

    for (const credit of data.compDayCredits) {
      const user = usersByEmail.get(
        normalizeEmail(credit.email),
      );

      if (!user) continue;

      const existing = await pool.query(
        `
          select id
          from public.comp_day_credits
          where employee_id = $1
            and earned_date = $2::date
        `,
        [user.id, credit.earnedDate],
      );

      if (existing.rowCount && existing.rowCount > 0) {
        errors.push(
          `Comp credit already exists in DB: ` +
            `${credit.email} ${credit.earnedDate}`,
        );
      }
    }

    // -----------------------------------------------------------------------
    // 7. Source reconciliation
    // -----------------------------------------------------------------------

    console.log("\nReconciliation");
    console.log("--------------\n");

    const expectedByEmail = new Map<
      string,
      {
        annualUsed: number;
        compUsed: number;
        compEarned: number;
      }
    >();

    for (const email of [...sourceEmails].sort()) {
      const annualUsed = data.leaveHistory
        .filter(
          (x) =>
            normalizeEmail(x.email) === email &&
            x.leaveType === "annual",
        )
        .reduce((sum, x) => sum + x.leaveDays, 0);

      const compUsed = data.leaveHistory
        .filter(
          (x) =>
            normalizeEmail(x.email) === email &&
            x.leaveType === "comp_day",
        )
        .reduce((sum, x) => sum + x.leaveDays, 0);

      const compEarned = data.compDayCredits.filter(
        (x) => normalizeEmail(x.email) === email,
      ).length;

      expectedByEmail.set(email, {
        annualUsed,
        compUsed,
        compEarned,
      });

      console.log(email);
      console.log(
        `  Annual: used ${annualUsed} / 15 — remaining ${15 - annualUsed}`,
      );
      console.log(
        `  Comp: earned ${compEarned} — used ${compUsed} — remaining ${
          compEarned - compUsed
        }`,
      );

      if (compUsed > compEarned) {
        errors.push(
          `Comp Day overused: ${email} used=${compUsed}, earned=${compEarned}`,
        );
      }
    }

    // -----------------------------------------------------------------------
    // Stop here for failed validation
    // -----------------------------------------------------------------------

    if (warnings.length > 0) {
      console.log(`\n⚠️  WARNINGS (${warnings.length})`);

      for (const warning of warnings) {
        console.log(`- ${warning}`);
      }
    }

    if (errors.length > 0) {
      console.log(
        `\n❌ ${APPLY ? "IMPORT" : "DRY RUN"} FAILED (${errors.length} issue(s))`,
      );

      for (const error of errors) {
        console.log(`- ${error}`);
      }

      process.exitCode = 1;
      return;
    }

    if (!APPLY) {
      console.log("\n=====================================");
      console.log("\n✅ DRY RUN PASSED");
      console.log("No database changes were made.");
      console.log(
        `${data.leaveHistory.length} leave records and ` +
          `${data.compDayCredits.length} Comp Day credits are ready.`,
      );

      return;
    }

    // =======================================================================
    // APPLY
    // =======================================================================

    console.log("\n=====================================");
    console.log("\n⚠️  APPLY MODE");
    console.log(
      "All writes will occur inside one database transaction.",
    );

    const client = await pool.connect();

    try {
      await client.query("begin");

      // ---------------------------------------------------------------------
      // Choose importer Admin
      // ---------------------------------------------------------------------

      let admin: DbUser | undefined;

      const explicitAdminEmail =
        process.env.HISTORICAL_IMPORT_ADMIN_EMAIL?.trim()
          .toLowerCase();

      if (explicitAdminEmail) {
        admin = result.rows.find(
          (user) =>
            normalizeEmail(user.email) === explicitAdminEmail &&
            user.role === "admin" &&
            user.active,
        );

        if (!admin) {
          throw new Error(
            `HISTORICAL_IMPORT_ADMIN_EMAIL is not an active Admin: ${explicitAdminEmail}`,
          );
        }
      } else {
        const activeAdmins = result.rows.filter(
          (user) => user.role === "admin" && user.active,
        );

        if (activeAdmins.length !== 1) {
          throw new Error(
            `Expected exactly 1 active Admin but found ${activeAdmins.length}. ` +
              `Set HISTORICAL_IMPORT_ADMIN_EMAIL.`,
          );
        }

        admin = activeAdmins[0];
      }

      console.log(
        `Importer Admin: ${admin.name} <${admin.email}>`,
      );

      await setCurrentUser(client, admin.id);

      // ---------------------------------------------------------------------
      // Confirm migration/function exists
      // ---------------------------------------------------------------------

      const functionCheck = await client.query<{
        exists: boolean;
      }>(`
        select to_regprocedure(
          'app.import_historical_leave(uuid,text,date,date,text,numeric,text,text)'
        ) is not null as exists
      `);

      if (!functionCheck.rows[0]?.exists) {
        throw new Error(
          "app.import_historical_leave() is not installed. Apply migration 0013 first.",
        );
      }

      // ---------------------------------------------------------------------
      // Comp Day credits FIRST
      //
      // Historical leave balance after import depends on these credits.
      // ---------------------------------------------------------------------

      console.log("\nImporting Comp Day credits...");

      let importedCredits = 0;

      for (const credit of data.compDayCredits) {
        const user = usersByEmail.get(
          normalizeEmail(credit.email),
        );

        if (!user) {
          throw new Error(
            `Employee disappeared during import: ${credit.email}`,
          );
        }

        await client.query(
          `
            insert into public.comp_day_credits (
              employee_id,
              earned_date,
              note,
              created_by
            )
            values (
              $1,
              $2::date,
              $3,
              $4
            )
          `,
          [
            user.id,
            credit.earnedDate,
            credit.note,
            admin.id,
          ],
        );

        importedCredits += 1;
      }

      console.log(
        `✓ Imported ${importedCredits} Comp Day credits`,
      );

      // ---------------------------------------------------------------------
      // Historical approved leave
      // ---------------------------------------------------------------------

      console.log("\nImporting historical leave...");

      let importedLeaves = 0;

      for (const leave of data.leaveHistory) {
        const user = usersByEmail.get(
          normalizeEmail(leave.email),
        );

        if (!user) {
          throw new Error(
            `Employee disappeared during import: ${leave.email}`,
          );
        }

        await client.query(
          `
            select app.import_historical_leave(
              $1::uuid,
              $2::text,
              $3::date,
              $4::date,
              $5::text,
              $6::numeric,
              $7::text,
              $8::text
            )
          `,
          [
            user.id,
            leave.leaveType,
            leave.startDate,
            leave.endDate,
            leave.leaveSession,
            leave.leaveDays,
            leave.reason,
            data.meta.sourceFile,
          ],
        );

        importedLeaves += 1;
      }

      console.log(
        `✓ Imported ${importedLeaves} historical leave records`,
      );

      // ---------------------------------------------------------------------
      // Post-import reconciliation BEFORE COMMIT
      // ---------------------------------------------------------------------

      console.log("\nPost-import reconciliation");
      console.log("--------------------------\n");

      const reconciliationErrors: string[] = [];

      for (const email of [...sourceEmails].sort()) {
        const user = usersByEmail.get(email);

        if (!user) {
          reconciliationErrors.push(
            `Missing employee during reconciliation: ${email}`,
          );
          continue;
        }

        const expected = expectedByEmail.get(email);

        if (!expected) {
          reconciliationErrors.push(
            `Missing expected reconciliation data: ${email}`,
          );
          continue;
        }

        const leaveTotals = await client.query<{
          annual_used: string;
          comp_used: string;
        }>(
          `
            select
              coalesce(
                sum(leave_days)
                  filter (
                    where leave_type = 'annual'
                      and status = 'approved'
                      and leave_year = $2
                  ),
                0
              )::text as annual_used,

              coalesce(
                sum(leave_days)
                  filter (
                    where leave_type = 'comp_day'
                      and status = 'approved'
                      and leave_year = $2
                  ),
                0
              )::text as comp_used

            from public.leave_requests
            where employee_id = $1
          `,
          [user.id, data.meta.year],
        );

        const creditTotal = await client.query<{
          earned: string;
        }>(
          `
            select count(*)::text as earned
            from public.comp_day_credits
            where employee_id = $1
              and earned_year = $2
          `,
          [user.id, data.meta.year],
        );

        const actualAnnual =
          Number(leaveTotals.rows[0]?.annual_used ?? 0);

        const actualCompUsed =
          Number(leaveTotals.rows[0]?.comp_used ?? 0);

        const actualCompEarned =
          Number(creditTotal.rows[0]?.earned ?? 0);

        console.log(email);
        console.log(
          `  Annual used: ${actualAnnual} (expected ${expected.annualUsed})`,
        );
        console.log(
          `  Comp earned: ${actualCompEarned} (expected ${expected.compEarned})`,
        );
        console.log(
          `  Comp used: ${actualCompUsed} (expected ${expected.compUsed})`,
        );

        if (
          !nearlyEqual(
            actualAnnual,
            expected.annualUsed,
          )
        ) {
          reconciliationErrors.push(
            `${email}: Annual used actual=${actualAnnual}, expected=${expected.annualUsed}`,
          );
        }

        if (
          !nearlyEqual(
            actualCompUsed,
            expected.compUsed,
          )
        ) {
          reconciliationErrors.push(
            `${email}: Comp used actual=${actualCompUsed}, expected=${expected.compUsed}`,
          );
        }

        if (
          !nearlyEqual(
            actualCompEarned,
            expected.compEarned,
          )
        ) {
          reconciliationErrors.push(
            `${email}: Comp earned actual=${actualCompEarned}, expected=${expected.compEarned}`,
          );
        }
      }

      if (
        importedLeaves !== data.leaveHistory.length ||
        importedCredits !== data.compDayCredits.length
      ) {
        reconciliationErrors.push(
          `Imported row counts mismatch: leave=${importedLeaves}/${data.leaveHistory.length}, ` +
            `credits=${importedCredits}/${data.compDayCredits.length}`,
        );
      }

      if (reconciliationErrors.length > 0) {
        console.error(
          `\n❌ Reconciliation failed (${reconciliationErrors.length} issue(s))`,
        );

        for (const error of reconciliationErrors) {
          console.error(`- ${error}`);
        }

        throw new Error(
          "Post-import reconciliation failed. Transaction will be rolled back.",
        );
      }

      await client.query("commit");

      console.log("\n=====================================");
      console.log("\n✅ HISTORICAL IMPORT COMMITTED");
      console.log(
        `${importedLeaves} leave records imported.`,
      );
      console.log(
        `${importedCredits} Comp Day credits imported.`,
      );
      console.log(
        "Post-import reconciliation passed.",
      );
    } catch (error) {
      try {
        await client.query("rollback");
      } catch {
        // Ignore rollback failure and preserve original error.
      }

      console.error("\n❌ IMPORT ROLLED BACK");
      throw error;
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(
    `\n❌ Historical import ${APPLY ? "failed" : "dry run crashed"}:`,
  );
  console.error(error);
  process.exit(1);
});