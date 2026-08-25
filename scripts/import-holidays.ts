/**
 * Imports Bank of Thailand holidays into the database.
 *
 * JSON:
 *   npm run holidays:import
 *   npm run holidays:import -- db/seed/holidays/th-2027.json
 *
 * BOT API:
 *   npm run holidays:import -- --bot 2027
 */

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { ownerPool } from "./_db";

type BotHoliday = {
  HolidayWeekDay: string;
  HolidayWeekDayThai: string;
  Date: string;
  DateThai: string;
  HolidayDescription: string;
  HolidayDescriptionThai: string;
};

async function importFromBot(year: number) {
  const token = process.env.BOT_API_KEY;

  if (!token) {
    throw new Error("BOT_API_KEY is missing.");
  }

  const url =
    `https://gateway.api.bot.or.th/financial-institutions-holidays/?year=${year}`;

  const res = await fetch(url, {
    headers: {
      Authorization: token,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `BOT API failed: ${res.status} ${res.statusText}\n${body.slice(0, 500)}`
    );
  }

  type BotResponse = {
  result?: {
    api?: string;
    timestamp?: string;
    data?: BotHoliday[];
  };
};

const response = (await res.json()) as BotResponse;
const data = response.result?.data;

if (!Array.isArray(data)) {
  throw new Error("Unexpected BOT API response: result.data is missing.");
}

  const pool = ownerPool();
  const db = await pool.connect();

  try {
    for (const h of data) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(h.Date)) {
        throw new Error(`Invalid BOT holiday date: ${h.Date}`);
      }

      const existing = await db.query<{ id: string }>(
  `select id
   from holidays
   where holiday_date = $1::date
     and source = 'BOT'
   order by created_at
   limit 1`,
  [h.Date],
);

if (existing.rows[0]) {
  const keepId = existing.rows[0].id;

  // Remove other BOT rows for the same date first,
  // otherwise updating the kept row's name may hit the unique constraint.
  await db.query(
    `delete from holidays
     where holiday_date = $1::date
       and source = 'BOT'
       and id <> $2::uuid`,
    [h.Date, keepId],
  );

  await db.query(
    `update holidays
     set name = $2,
         name_th = $3,
         type = 'public',
         source = 'BOT',
         note = $4,
         active = true,
         updated_at = now()
     where id = $1::uuid`,
    [
      keepId,
      h.HolidayDescription,
      h.HolidayDescriptionThai || null,
      `Imported from BOT API · ${h.HolidayWeekDay}`,
    ],
  );
} else {
  await db.query(
    `insert into holidays (
       holiday_date,
       name,
       name_th,
       type,
       source,
       note
     )
     values ($1::date, $2, $3, 'public', 'BOT', $4)`,
    [
      h.Date,
      h.HolidayDescription,
      h.HolidayDescriptionThai || null,
      `Imported from BOT API · ${h.HolidayWeekDay}`,
    ],
  );
}
    }

    console.log(`Imported ${data.length} BOT holidays for ${year}.`);
  } finally {
    db.release();
    await pool.end();
  }
}

async function importFromFiles(files: string[]) {
  const pool = ownerPool();
  const db = await pool.connect();

  try {
    for (const file of files) {
      if (!existsSync(file)) {
        throw new Error(`No such file: ${file}`);
      }

      const data = JSON.parse(readFileSync(file, "utf8"));

      if (!Array.isArray(data.holidays)) {
        throw new Error(`${file} has no "holidays" array.`);
      }

      for (const h of data.holidays) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(h.date) || !h.name) {
          throw new Error(`Bad entry in ${file}: ${JSON.stringify(h)}`);
        }

        await db.query(
          `insert into holidays (
             holiday_date,
             name,
             name_th,
             type,
             source,
             note
           )
           values ($1::date, $2, $3, 'public', $4, $5)
           on conflict (holiday_date, name)
           do update set
             name_th = excluded.name_th,
             source = excluded.source,
             note = excluded.note,
             active = true,
             updated_at = now()`,
          [
            h.date,
            h.name,
            h.nameTh ?? null,
            data.source ?? "BOT",
            h.note ?? null,
          ],
        );
      }

      console.log(`Imported ${data.holidays.length} holidays from ${file}`);
    }
  } finally {
    db.release();
    await pool.end();
  }
}

async function main() {
  const args = process.argv.slice(2);

  const botIndex = args.indexOf("--bot");

  if (botIndex !== -1) {
    const yearRaw = args[botIndex + 1];
    const year = Number(yearRaw);

    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      throw new Error("Usage: npm run holidays:import -- --bot 2027");
    }

    await importFromBot(year);
    return;
  }

  const fileArgs = args.filter((a) => !a.startsWith("--"));
  const dir = join(process.cwd(), "db", "seed", "holidays");

  const files = fileArgs.length
    ? fileArgs
    : readdirSync(dir)
        .filter((f) => f.endsWith(".json"))
        .map((f) => join(dir, f));

  await importFromFiles(files);
}

main().catch((e) => {
  console.error("\n" + e.message);
  process.exit(1);
});