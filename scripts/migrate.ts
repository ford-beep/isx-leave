/**
 * Applies db/migrations/*.sql in filename order, recording each in
 * `schema_migrations` so re-running is safe.
 *
 *   npm run db:migrate
 *   npm run db:migrate -- --reset     (drops and recreates everything)
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ownerPool } from "./_db";

const DIR = join(process.cwd(), "db", "migrations");

async function main() {
  const reset = process.argv.includes("--reset");
  const pool = ownerPool();
  const db = await pool.connect();

  try {
    if (reset) {
      if (process.env.NODE_ENV === "production") {
        throw new Error("Refusing to --reset with NODE_ENV=production.");
      }
      console.log("Dropping schemas public and app…");
      await db.query("drop schema if exists public cascade; drop schema if exists app cascade;");
      await db.query("create schema public;");
      await db.query("grant usage on schema public to public;");
    }

    await db.query(`
      create table if not exists schema_migrations (
        filename text primary key,
        applied_at timestamptz not null default now()
      )`);

    const applied = new Set(
      (await db.query<{ filename: string }>("select filename from schema_migrations")).rows
        .map((r) => r.filename));

    const files = readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();
    let count = 0;

    for (const file of files) {
      if (applied.has(file)) { console.log(`  skip  ${file}`); continue; }
      const sql = readFileSync(join(DIR, file), "utf8");
      await db.query("BEGIN");
      try {
        await db.query(sql);
        await db.query("insert into schema_migrations (filename) values ($1)", [file]);
        await db.query("COMMIT");
        console.log(`  applied  ${file}`);
        count++;
      } catch (e) {
        await db.query("ROLLBACK");
        throw new Error(`Migration ${file} failed: ${(e as Error).message}`);
      }
    }
    console.log(count ? `\n${count} migration(s) applied.` : "\nDatabase already up to date.");
  } finally {
    db.release();
    await pool.end();
  }
}

main().catch((e) => { console.error("\n" + e.message); process.exit(1); });
