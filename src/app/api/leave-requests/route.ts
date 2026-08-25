import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { queryAs } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Read-only JSON endpoint, included mainly so the privacy guarantee can be
 * probed over HTTP as well as over SQL (§36).
 *
 * Note the deliberate design: it accepts an `employeeId` query parameter and
 * passes it STRAIGHT into the WHERE clause with no ownership check in this
 * file. Ask for a colleague's id and you get an empty array — because the
 * database refuses to return their rows, not because this handler filtered
 * them out.
 */
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const employeeId = new URL(request.url).searchParams.get("employeeId") ?? user.id;
  if (!/^[0-9a-f-]{36}$/i.test(employeeId)) {
    return NextResponse.json({ error: "Invalid employeeId" }, { status: 400 });
  }

  const rows = await queryAs(user.id,
    `select lr.id, lr.employee_id, lr.leave_type,
            lr.start_date::text as start_date, lr.end_date::text as end_date,
            lr.leave_days::float8 as leave_days, lr.status, lr.reason
       from leave_requests lr
      where lr.employee_id = $1
      order by lr.start_date desc`, [employeeId]);

  return NextResponse.json({ count: rows.length, requests: rows });
}
