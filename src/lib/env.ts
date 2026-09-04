/**
 * Central environment access. Throwing here (rather than deep inside a request)
 * means a misconfigured deployment fails loudly at boot.
 * Nothing in this module is ever imported by a client component.
 */
import "server-only";

function required(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === "") {
    throw new Error(
      `Missing required environment variable ${name}. Copy .env.example to .env.local and fill it in.`,
    );
  }
  return v;
}

function optional(name: string, fallback: string): string {
  const v = process.env[name];
  return v && v.trim() !== "" ? v : fallback;
}

export const env = {
  /** Runtime connection — RLS-enforced role, never the table owner. */
  databaseUrl: required("DATABASE_APP_URL"),
  authSecret: required("AUTH_SECRET"),
  sessionTtlSeconds: Number(optional("SESSION_TTL_SECONDS", "28800")),
  companyTimezone: optional("COMPANY_TIMEZONE", "Asia/Bangkok"),
  appUrl: optional("APP_URL", "http://localhost:3000"),
  defaultEntitlement: Number(optional("DEFAULT_ANNUAL_ENTITLEMENT", "15")),
  /** Enables the one-click demo logins on the sign-in screen. Must be off in prod. */
  demoMode: optional("DEMO_MODE", "false") === "true" && process.env.NODE_ENV !== "production",
  isProduction: process.env.NODE_ENV === "production",
};

if (env.authSecret.length < 32) {
  throw new Error("AUTH_SECRET must be at least 32 characters. Generate one with: openssl rand -base64 48");
}
