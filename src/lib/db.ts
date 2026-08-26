/**
 * Database access layer.
 *
 * ---------------------------------------------------------------------------
 * THE SECURITY MODEL IN ONE PLACE
 * ---------------------------------------------------------------------------
 * Every query the application runs goes through `withUser()`. That helper:
 *
 *   1. takes a connection from the pool,
 *   2. opens a transaction,
 *   3. sets `app.current_user_id` LOCAL to that transaction,
 *   4. runs the caller's queries,
 *   5. commits (or rolls back) and returns the connection.
 *
 * Because the setting is transaction-local it cannot leak to the next request
 * that borrows the same pooled connection. Because the pool authenticates as
 * `isx_app` — a role with no BYPASSRLS and no ownership of any table — the
 * policies in db/migrations/0003_rls.sql are applied to every statement.
 *
 * There is deliberately NO "admin client" or service-role escape hatch in this
 * file. Admin capability comes from the signed-in user's role in the database,
 * evaluated by `app.is_admin()`, not from a privileged connection.
 * ---------------------------------------------------------------------------
 */
import "server-only";
import { Pool, type PoolClient } from "pg";
import { env } from "./env";

declare global {
  // eslint-disable-next-line no-var
  var __isxPool: Pool | undefined;
}

function makePool() {
  const pool = new Pool({
    connectionString: env.databaseUrl,
    max: 3,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 5_000,
    application_name: "isx-leave-dashboard",
  });
  pool.on("error", (e) => console.error("[isx-leave] idle pg client error:", e.message));
  return pool;
}

// Reuse the pool across warm server instances and development hot reloads.
export const pool: Pool = global.__isxPool ?? makePool();

global.__isxPool = pool;

export type Db = PoolClient;

/**
 * Run `fn` inside a transaction bound to `userId`.
 * Pass `null` for an unauthenticated context — RLS will then expose nothing.
 */
export async function withUser<T>(
  userId: string | null,
  fn: (db: Db) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // set_config(..., is_local => true) scopes this to the transaction only.
    await client.query("SELECT set_config('app.current_user_id', $1, true)", [userId ?? ""]);
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch { /* connection already gone */ }
    throw err;
  } finally {
    client.release();
  }
}

/** Convenience: single query as `userId`. */
export async function queryAs<T extends Record<string, unknown>>(
  userId: string | null, sql: string, params: unknown[] = [],
): Promise<T[]> {
  return withUser(userId, async (db) => (await db.query<T>(sql, params)).rows);
}

export async function oneAs<T extends Record<string, unknown>>(
  userId: string | null, sql: string, params: unknown[] = [],
): Promise<T | null> {
  const rows = await queryAs<T>(userId, sql, params);
  return rows[0] ?? null;
}
