/**
 * Loads demo data: BOT holidays from db/seed/holidays/*.json, then the
 * scripted employees and leave requests in db/seed/demo_seed.sql.
 *
 *   npm run db:seed
 *
 * Refuses to run in production — production gets `npm run admin:create`
 * plus `npm run holidays:import` instead.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { scryptSync, randomBytes } from "node:crypto";
import { ownerPool } from "./_db";

const DEMO_PASSWORD = "demo1234";

function hash(plain: string): string {
  const N = 16384, r = 8, p = 1;
  const salt = randomBytes(16);
  const key = scryptSync(plain.normalize("NFKC"), salt, 32, { N, r, p, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${N}$${r}$${p}$${salt.toString("hex")}$${key.toString("hex")}`;
}

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to seed demo data with NODE_ENV=production.");
  }

  const pool = ownerPool();
  const db = await pool.connect();
  try {
    // 1. Holidays — every JSON file in the holiday data layer.
    const holidayDir = join(process.cwd(), "db", "seed", "holidays");
    let holidayCount = 0;
    for (const file of readdirSync(holidayDir).filter((f) => f.endsWith(".json"))) {
      const data = JSON.parse(readFileSync(join(holidayDir, file), "utf8"));
      for (const h of data.holidays ?? []) {
        await db.query(
          `insert into holidays (holiday_date, name, name_th, type, source, note)
           values ($1::date, $2, $3, 'public', $4, $5)
           on conflict (holiday_date, name)
           do update set name_th = excluded.name_th, source = excluded.source,
                         note = excluded.note, active = true`,
          [h.date, h.name, h.nameTh ?? null, data.source ?? "BOT", h.note ?? null]);
        holidayCount++;
      }
      console.log(`  holidays  ${file} (${data.holidays?.length ?? 0})`);
    }

    // 2. Everything else. The SQL file inserts leave through the real
    //    validation trigger, so the demo data must satisfy the real rules.
    const sql = readFileSync(join(process.cwd(), "db", "seed", "demo_seed.sql"), "utf8")
      .replace(/\\set ON_ERROR_STOP on\n/g, "")
      .replace(/:'hash_admin'/g, `'${hash(DEMO_PASSWORD)}'`)
      .replace(/:'hash_emp'/g, `'${hash(DEMO_PASSWORD)}'`);
    await db.query(sql);

    console.log(`\nSeeded ${holidayCount} holidays and the demo employees.`);
    console.log(`Demo sign-in: admin@demo.isx.local / ${DEMO_PASSWORD}`);
    console.log(`              jane@demo.isx.local  / ${DEMO_PASSWORD}`);
  } finally {
    db.release();
    await pool.end();
  }
}

main().catch((e) => { console.error("\n" + e.message); process.exit(1); });
