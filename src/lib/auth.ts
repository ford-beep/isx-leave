/**
 * Authentication entry points and route guards.
 *
 * `requireAdmin()` re-reads the role from the database rather than trusting the
 * session cookie, so a user demoted mid-session loses admin access on their
 * very next request.
 */
import "server-only";
import { redirect } from "next/navigation";
import { pool, withUser } from "./db";
import { verifyPassword } from "./password";
import { readSession, createSession, destroySession } from "./session";
import type { Role, SessionUser } from "./types";

export type LoginResult = { ok: true; user: SessionUser } | { ok: false; message: string };

/**
 * Verifies credentials. The lookup uses the SECURITY DEFINER function
 * `app.auth_lookup`, because before a session exists RLS would (correctly)
 * hide every row.
 */
export async function login(email: string, password: string): Promise<LoginResult> {
  const generic = { ok: false as const, message: "Incorrect email or password." };
  const clean = email.trim().toLowerCase();
  if (!clean || !password) return generic;

  const client = await pool.connect();
  try {
    const { rows } = await client.query<{
      id: string; name: string; email: string; role: Role; active: boolean; password_hash: string | null;
    }>("SELECT * FROM app.auth_lookup($1)", [clean]);

    const row = rows[0];
    // verifyPassword still runs when the user is missing, to keep timing flat.
    const ok = await verifyPassword(password, row?.password_hash ?? null);
    if (!row || !ok) return generic;
    if (!row.active) {
      return { ok: false, message: "This account has been deactivated. Please contact HR." };
    }

    const user: SessionUser = { id: row.id, name: row.name, email: row.email, role: row.role };
    await createSession(user);
    await withUser(user.id, (db) =>
      db.query("SELECT app.write_audit('auth.login', 'user', $1, '{}'::jsonb)", [user.id]));
    return { ok: true, user };
  } finally {
    client.release();
  }
}

export async function logout(): Promise<void> {
  await destroySession();
}

/** Session user, or null. Does not hit the database. */
export const getSessionUser = readSession;

/** Route guard for any signed-in page. */
export async function requireUser(): Promise<SessionUser> {
  const user = await readSession();
  if (!user) redirect("/login");

  // Confirm the account still exists and is active.
  const rows = await withUser(user.id, async (db) =>
    (await db.query<{ id: string; role: Role; name: string; active: boolean }>(
      "SELECT id, role, name, active FROM users WHERE id = $1", [user.id])).rows);

  if (!rows[0] || !rows[0].active) {
    await destroySession();
    redirect("/login?reason=inactive");
  }
  return { ...user, role: rows[0].role, name: rows[0].name };
}

/** Route guard for admin-only pages. Authoritative — reads the DB. */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/dashboard");
  return user;
}
