/**
 * Secure admin bootstrap (§26).
 *
 * Credentials come from the environment — never from the repository, never
 * from the frontend. Safe to run repeatedly: an existing account is promoted
 * to admin and its password reset.
 *
 *   SETUP_ADMIN_EMAIL=hr@isx.co.th SETUP_ADMIN_PASSWORD='…' npm run admin:create
 */
import { scryptSync, randomBytes } from "node:crypto";
import { ownerPool } from "./_db";

function hash(plain: string): string {
  const N = 16384, r = 8, p = 1;
  const salt = randomBytes(16);
  const key = scryptSync(plain.normalize("NFKC"), salt, 32, { N, r, p, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${N}$${r}$${p}$${salt.toString("hex")}$${key.toString("hex")}`;
}

async function main() {
  const name = process.env.SETUP_ADMIN_NAME ?? "ISX Administrator";
  const email = (process.env.SETUP_ADMIN_EMAIL ?? "").trim().toLowerCase();
  const password = process.env.SETUP_ADMIN_PASSWORD ?? "";
  const entitlement = Number(process.env.DEFAULT_ANNUAL_ENTITLEMENT ?? 15);

  if (!email || !password) {
    throw new Error("Set SETUP_ADMIN_EMAIL and SETUP_ADMIN_PASSWORD before running this.");
  }
  if (password.length < 12) {
    throw new Error("Use an admin password of at least 12 characters.");
  }

  const pool = ownerPool();
  const db = await pool.connect();
  try {
    const { rows } = await db.query<{ id: string }>(
      `insert into users (name, email, role, password_hash)
       values ($1, $2, 'admin', $3)
       on conflict (email) do update
         set role = 'admin', active = true, password_hash = excluded.password_hash,
             name = excluded.name
       returning id`,
      [name, email, hash(password)]);

    await db.query(
      `insert into leave_entitlements (employee_id, year, total_days)
       values ($1, extract(year from current_date)::int, $2)
       on conflict (employee_id, year) do nothing`,
      [rows[0].id, entitlement]);

    await db.query(
      `insert into app_settings (key, value) values ('default_annual_entitlement', $1::jsonb)
       on conflict (key) do nothing`, [JSON.stringify(entitlement)]);

    console.log(`Admin ready: ${email}`);
    console.log("Sign in, then change the password from the Profile page.");
  } finally {
    db.release();
    await pool.end();
  }
}

main().catch((e) => { console.error("\n" + e.message); process.exit(1); });
