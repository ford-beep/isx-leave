/** Shared bootstrap for the CLI scripts. These connect as the OWNER role. */
import "dotenv/config";
import { Pool } from "pg";

export function ownerPool(): Pool {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set. Copy .env.example to .env and fill it in.");
    process.exit(1);
  }
  return new Pool({ connectionString: url, max: 4 });
}

export function appPool(): Pool {
  const url = process.env.DATABASE_APP_URL;
  if (!url) {
    console.error("DATABASE_APP_URL is not set.");
    process.exit(1);
  }
  return new Pool({ connectionString: url, max: 4 });
}
