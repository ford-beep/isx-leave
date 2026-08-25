import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { rows } = await pool.query("select current_user, now() as at");
    return NextResponse.json({ ok: true, dbUser: rows[0].current_user, at: rows[0].at });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
